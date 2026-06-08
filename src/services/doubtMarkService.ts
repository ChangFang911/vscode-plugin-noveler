/**
 * 疑问标记服务
 * 扫描并管理 markdown 文件中的 <!--? --> 和 <!--✓ --> 标记
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export interface DoubtMark {
    id: string;           // `${uri.toString()}:${lineNumber}`
    fileUri: vscode.Uri;
    fileName: string;     // 显示名（不含 .md）
    lineNumber: number;   // 0-indexed
    content: string;      // 标记内容
    resolved: boolean;
}

export interface MarkPosition {
    lineNumber: number;
    content: string;
    resolved: boolean;
}

/** 从文本中提取所有标记位置（用于编辑器装饰和 CodeLens） */
export function findMarksInText(text: string): MarkPosition[] {
    const lines = text.split('\n');
    const result: MarkPosition[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const unresolvedMatch = /<!--\?\s*(.*?)\s*-->/.exec(line);
        if (unresolvedMatch) {
            result.push({ lineNumber: i, content: unresolvedMatch[1] ?? '', resolved: false });
            continue;
        }
        const resolvedMatch = /<!--✓\s*(.*?)\s*-->/.exec(line);
        if (resolvedMatch) {
            result.push({ lineNumber: i, content: resolvedMatch[1] ?? '', resolved: true });
        }
    }
    return result;
}

export class DoubtMarkService {
    private static instance: DoubtMarkService | undefined;

    private marks = new Map<string, DoubtMark[]>();  // key: uri.toString()
    private watcher: vscode.FileSystemWatcher | undefined;
    private listeners: Array<() => void> = [];
    private scanTimers = new Map<string, NodeJS.Timeout>();
    private initialized = false;

    private constructor() {}

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
                '{**/node_modules/**,**/out/**,.git/**}'
            );
            await Promise.all(uris.map(u => this.scanFile(u)));
        } catch (error) {
            Logger.error('[DoubtMark] 全量扫描失败', error);
        }
    }

    private async scanFile(uri: vscode.Uri): Promise<void> {
        try {
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(bytes).toString('utf8');
            const fileMarks = this.extractMarksFromText(text, uri);
            if (fileMarks.length > 0) {
                this.marks.set(uri.toString(), fileMarks);
            } else {
                this.marks.delete(uri.toString());
            }
        } catch {
            this.marks.delete(uri.toString());
        }
    }

    private extractMarksFromText(text: string, uri: vscode.Uri): DoubtMark[] {
        const positions = findMarksInText(text);
        const fileName = uri.fsPath.split('/').pop()?.replace(/\.md$/, '') ?? uri.fsPath;
        return positions.map(p => ({
            id: `${uri.toString()}:${p.lineNumber}`,
            fileUri: uri,
            fileName,
            lineNumber: p.lineNumber,
            content: p.content || '（未填写内容）',
            resolved: p.resolved,
        }));
    }

    private setupWatcher(): void {
        this.watcher = vscode.workspace.createFileSystemWatcher('**/*.md');

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
            return fileCompare !== 0 ? fileCompare : a.lineNumber - b.lineNumber;
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
        await this.applyLineEdit(mark, line =>
            line.replace(/<!--\?\s*(.*?)\s*-->/, (_, c: string) => `<!--✓ ${c} -->`)
        );
    }

    async reopenMark(mark: DoubtMark): Promise<void> {
        await this.applyLineEdit(mark, line =>
            line.replace(/<!--✓\s*(.*?)\s*-->/, (_, c: string) => `<!--? ${c} -->`)
        );
    }

    async deleteMark(mark: DoubtMark): Promise<void> {
        await this.applyLineEdit(mark, line => {
            const cleaned = line.replace(/\s*<!--[?✓]\s*.*?\s*-->/, '').trimEnd();
            return cleaned; // 空字符串触发整行删除
        });
    }

    private async applyLineEdit(
        mark: DoubtMark,
        transform: (line: string) => string
    ): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument(mark.fileUri);
            if (mark.lineNumber >= doc.lineCount) { return; }

            const lineObj = doc.lineAt(mark.lineNumber);
            const newText = transform(lineObj.text);

            const edit = new vscode.WorkspaceEdit();

            if (newText.trim() === '') {
                // 删除整行（含换行符）
                const deleteEnd = mark.lineNumber < doc.lineCount - 1
                    ? new vscode.Position(mark.lineNumber + 1, 0)
                    : lineObj.range.end;
                edit.delete(mark.fileUri, new vscode.Range(
                    new vscode.Position(mark.lineNumber, 0), deleteEnd
                ));
            } else {
                edit.replace(mark.fileUri, lineObj.range, newText);
            }

            await vscode.workspace.applyEdit(edit);
        } catch (error) {
            Logger.error('[DoubtMark] 修改标记失败', error);
            throw error;
        }
    }

    async deleteAllResolved(): Promise<void> {
        // 按文件分组，每个文件一次 WorkspaceEdit（从下到上删除，保持行号正确）
        const byFile = new Map<string, DoubtMark[]>();
        for (const mark of this.getAllMarks().filter(m => m.resolved)) {
            const key = mark.fileUri.toString();
            if (!byFile.has(key)) { byFile.set(key, []); }
            byFile.get(key)!.push(mark);
        }

        for (const [, fileMarks] of byFile) {
            try {
                const doc = await vscode.workspace.openTextDocument(fileMarks[0].fileUri);
                const edit = new vscode.WorkspaceEdit();
                const sorted = [...fileMarks].sort((a, b) => b.lineNumber - a.lineNumber);

                for (const mark of sorted) {
                    if (mark.lineNumber >= doc.lineCount) { continue; }
                    const lineObj = doc.lineAt(mark.lineNumber);
                    const newText = lineObj.text
                        .replace(/\s*<!--[?✓]\s*.*?\s*-->/, '').trimEnd();

                    if (newText.trim() === '') {
                        const deleteEnd = mark.lineNumber < doc.lineCount - 1
                            ? new vscode.Position(mark.lineNumber + 1, 0)
                            : lineObj.range.end;
                        edit.delete(mark.fileUri, new vscode.Range(
                            new vscode.Position(mark.lineNumber, 0), deleteEnd
                        ));
                    } else {
                        edit.replace(mark.fileUri, lineObj.range, newText);
                    }
                }
                await vscode.workspace.applyEdit(edit);
            } catch (error) {
                Logger.error('[DoubtMark] 批量删除已解决标记失败', error);
            }
        }
    }

    async resolveAll(): Promise<void> {
        const unresolved = this.getAllMarks().filter(m => !m.resolved);
        for (const mark of unresolved) {
            await this.resolveMark(mark);
        }
    }

    dispose(): void {
        this.watcher?.dispose();
        for (const t of this.scanTimers.values()) { clearTimeout(t); }
        this.scanTimers.clear();
        this.listeners = [];
        this.initialized = false;
        DoubtMarkService.instance = undefined;
    }
}
