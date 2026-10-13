/**
 * 疑问标记服务
 * 扫描并管理 markdown 文件中的 <!--? --> 和 <!--✓ --> 标记
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface DoubtMark {
    id: string;
    fileUri: vscode.Uri;
    fileName: string;     // 显示名（不含 .md）
    lineNumber: number;   // 0-indexed
    startCharacter?: number;
    endCharacter?: number;
    documentVersion?: number;
    lineText?: string;
    content: string;      // 标记内容
    resolved: boolean;
}

export interface MarkPosition {
    lineNumber: number;
    startCharacter: number;
    endCharacter: number;
    content: string;
    resolved: boolean;
}

/** 从文本中提取所有标记位置（用于编辑器装饰和 CodeLens） */
export function findMarksInText(text: string): MarkPosition[] {
    const lines = text.split(/\r?\n/);
    const result: MarkPosition[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (const match of line.matchAll(/<!--([?✓])\s*(.*?)\s*-->/g)) {
            result.push({ lineNumber: i, startCharacter: match.index!, endCharacter: match.index! + match[0].length,
                content: match[2] ?? '', resolved: match[1] === '✓' });
        }
    }
    return result;
}

export class DoubtMarkService {
    private static instance: DoubtMarkService | undefined;

    private marks: Map<string, DoubtMark[]>;  // key: uri.toString()
    private watcher: vscode.FileSystemWatcher | undefined;
    private documentListener: vscode.Disposable | undefined;
    private listeners: Array<() => void> = [];
    private scanTimers = new Map<string, NodeJS.Timeout>();
    private initialized = false;
    private editQueue: Promise<void> = Promise.resolve();

    private constructor() {
        this.marks = new Map();
    }

    static getInstance(): DoubtMarkService {
        if (!DoubtMarkService.instance) {
            DoubtMarkService.instance = new DoubtMarkService();
        }
        return DoubtMarkService.instance;
    }

    async initialize(): Promise<void> {
        if (this.initialized) { return; }
        this.initialized = true;
        await this.scanAll();
        this.setupWatcher();
    }

    // ── 扫描 ────────────────────────────────────────────────────────────────

    private async scanAll(): Promise<void> {
        try {
            const uris = await vscode.workspace.findFiles(
                '**/*.md',
                '{**/node_modules/**,**/out/**,**/.git/**,**/.noveler/backups/**}'
            );
            await Promise.all(uris.map(u => this.scanFile(u)));
        } catch (error) {
            Logger.error('[DoubtMark] 全量扫描失败', error);
        }
    }

    private async scanFile(uri: vscode.Uri): Promise<void> {
        if (uri.path.includes('/.noveler/backups/')) { return; }
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === uri.toString());
            const text = document?.getText() ?? Buffer.from(bytes).toString('utf8');
            const fileMarks = this.extractMarksFromText(text, uri, document?.version);
            if (fileMarks.length > 0) {
                this.marks.set(uri.toString(), fileMarks);
            } else {
                this.marks.delete(uri.toString());
            }
        } catch {
            this.marks.delete(uri.toString());
        }
    }

    private extractMarksFromText(text: string, uri: vscode.Uri, documentVersion?: number): DoubtMark[] {
        const positions = findMarksInText(text);
        const lines = text.split(/\r?\n/);
        const fileName = uri.fsPath.split('/').pop()?.replace(/\.md$/, '') ?? uri.fsPath;
        return positions.map(p => ({
            id: `${uri.toString()}:${p.lineNumber}:${p.startCharacter}`,
            fileUri: uri,
            fileName,
            lineNumber: p.lineNumber,
            startCharacter: p.startCharacter,
            endCharacter: p.endCharacter,
            documentVersion,
            lineText: lines[p.lineNumber],
            content: p.content || '（未填写内容）',
            resolved: p.resolved,
        }));
    }

    private setupWatcher(): void {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*.md');
        this.documentListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document.languageId !== 'markdown' || event.document.uri.path.includes('/.noveler/backups/')) { return; }
            const marks = this.extractMarksFromText(event.document.getText(), event.document.uri, event.document.version);
            const previous = this.marks.get(event.document.uri.toString()) ?? [];
            if (previous.length === marks.length && previous.every((mark, index) =>
                mark.lineNumber === marks[index].lineNumber && mark.startCharacter === marks[index].startCharacter
                && mark.endCharacter === marks[index].endCharacter && mark.lineText === marks[index].lineText
                && mark.content === marks[index].content && mark.resolved === marks[index].resolved
            )) { return; }
            if (marks.length) {
                this.marks.set(event.document.uri.toString(), marks);
            } else {
                this.marks.delete(event.document.uri.toString());
            }
            this.fireChange();
        });

        this.watcher.onDidChange(uri => this.debounceFileScan(uri));
        this.watcher.onDidCreate(async uri => {
            await this.scanFile(uri);
            this.fireChange();
        });
        this.watcher.onDidDelete(uri => {
            this.marks.delete(uri.toString());
            this.fireChange();
        });
    }

    private debounceFileScan(uri: vscode.Uri): void {
        const key = uri.toString();
        const existing = this.scanTimers.get(key);
        if (existing) { clearTimeout(existing); }
        const timer = setTimeout(async () => {
            this.scanTimers.delete(key);
            await this.scanFile(uri);
            this.fireChange();
        }, 400);
        this.scanTimers.set(key, timer);
    }

    // ── 查询 ────────────────────────────────────────────────────────────────

    getAllMarks(): DoubtMark[] {
        const all: DoubtMark[] = [];
        for (const marks of this.marks.values()) {
            all.push(...marks);
        }
        // 按文件名 + 行号排序
        return all.sort((a, b) => {
            const fileCompare = a.fileName.localeCompare(b.fileName);
            return fileCompare !== 0 ? fileCompare : a.lineNumber - b.lineNumber
                || (a.startCharacter ?? 0) - (b.startCharacter ?? 0);
        });
    }

    getMarksByFile(): Map<string, DoubtMark[]> {
        return this.marks;
    }

    getUnresolvedCount(): number {
        return this.getAllMarks().filter(m => !m.resolved).length;
    }

    getTotalCount(): number {
        return this.getAllMarks().length;
    }

    onChange(listener: () => void): vscode.Disposable {
        this.listeners.push(listener);
        return new vscode.Disposable(() => {
            this.listeners = this.listeners.filter(l => l !== listener);
        });
    }

    private fireChange(): void {
        for (const l of this.listeners) { l(); }
    }

    // ── 修改操作（全部使用 WorkspaceEdit，支持撤销，兼容未保存的文件）────────

    async resolveMark(mark: DoubtMark): Promise<void> {
        await this.applyMarkEdits([mark], 'resolve');
    }

    async reopenMark(mark: DoubtMark): Promise<void> {
        await this.applyMarkEdits([mark], 'reopen');
    }

    async deleteMark(mark: DoubtMark): Promise<void> {
        await this.applyMarkEdits([mark], 'delete');
    }

    private applyMarkEdits(marks: DoubtMark[], action: 'resolve' | 'reopen' | 'delete'): Promise<void> {
        const operation = this.editQueue.then(() => this.performMarkEdits(marks, action));
        this.editQueue = operation.catch(() => undefined);
        return operation;
    }

    private async performMarkEdits(marks: DoubtMark[], action: 'resolve' | 'reopen' | 'delete'): Promise<void> {
        if (!marks.length) { return; }
        try {
            const edit = new vscode.WorkspaceEdit();
            const snapshots: Array<{ document: vscode.TextDocument; version: number }> = [];
            const byFile = new Map<string, DoubtMark[]>();
            for (const mark of marks) {
                const key = mark.fileUri.toString();
                if (!byFile.has(key)) { byFile.set(key, []); }
                byFile.get(key)!.push(mark);
            }
            for (const fileMarks of byFile.values()) {
                const uri = fileMarks[0].fileUri;
                const doc = await vscode.workspace.openTextDocument(uri);
                snapshots.push({ document: doc, version: doc.version });
                const byLine = new Map<number, DoubtMark[]>();
                for (const mark of fileMarks) {
                    if (mark.lineNumber < 0 || mark.lineNumber >= doc.lineCount) {
                        throw new Error('待办位置已变化，请刷新后重试');
                    }
                    if (!byLine.has(mark.lineNumber)) { byLine.set(mark.lineNumber, []); }
                    byLine.get(mark.lineNumber)!.push(mark);
                }
                for (const [lineNumber, lineMarks] of [...byLine].sort((a, b) => b[0] - a[0])) {
                    const lineObj = doc.lineAt(lineNumber);
                    const positions = findMarksInText(lineObj.text);
                    const targets = lineMarks.map(mark => {
                        const normalizeStates = (text: string) => text.replace(/<!--[?✓]/g, '<!--?');
                        if (mark.lineText !== undefined && normalizeStates(mark.lineText) !== normalizeStates(lineObj.text)) {
                            throw new Error('待办位置已变化，请刷新后重试');
                        }
                        const candidates = positions.filter(position => (action !== 'delete' || position.resolved === mark.resolved)
                            && (position.content || '（未填写内容）') === (mark.content || '（未填写内容）')
                            && (mark.startCharacter === undefined || position.startCharacter === mark.startCharacter)
                            && (mark.endCharacter === undefined || position.endCharacter === mark.endCharacter));
                        if (candidates.length !== 1) { throw new Error('待办位置已变化，请刷新后重试'); }
                        return candidates[0];
                    }).sort((a, b) => b.startCharacter - a.startCharacter);
                    let newText = lineObj.text;
                    for (const target of targets) {
                        if (action === 'delete') {
                            newText = newText.slice(0, target.startCharacter).replace(/[\t ]+$/, '')
                                + newText.slice(target.endCharacter);
                        } else {
                            const position = target.startCharacter + 4;
                            newText = newText.slice(0, position) + (action === 'resolve' ? '✓' : '?') + newText.slice(position + 1);
                        }
                    }
                    if (action === 'delete') { newText = newText.trimEnd(); }
                    if (newText === lineObj.text) { continue; }
                    if (newText.trim() === '') {
                        const deleteEnd = lineNumber < doc.lineCount - 1
                            ? new vscode.Position(lineNumber + 1, 0) : lineObj.range.end;
                        edit.delete(uri, new vscode.Range(new vscode.Position(lineNumber, 0), deleteEnd));
                    } else {
                        edit.replace(uri, lineObj.range, newText);
                    }
                }
            }
            if (snapshots.some(snapshot => snapshot.document.version !== snapshot.version)) {
                throw new Error('待办位置已变化，请刷新后重试');
            }
            if (!edit.entries().length) { return; }
            if (!await vscode.workspace.applyEdit(edit)) {
                throw new Error('待办修改未完成，请重试');
            }
        } catch (error) {
            Logger.error('[DoubtMark] 修改标记失败', error);
            throw error;
        }
    }

    async deleteAllResolved(): Promise<void> {
        await this.applyMarkEdits(this.getAllMarks().filter(mark => mark.resolved), 'delete');
    }

    async resolveAll(deleteOnResolve = false): Promise<void> {
        await this.applyMarkEdits(this.getAllMarks().filter(mark => !mark.resolved), deleteOnResolve ? 'delete' : 'resolve');
    }

    dispose(): void {
        this.watcher?.dispose();
        this.documentListener?.dispose();
        for (const t of this.scanTimers.values()) { clearTimeout(t); }
        this.scanTimers.clear();
        this.listeners = [];
        this.initialized = false;
        DoubtMarkService.instance = undefined;
    }
}
