import * as vscode from 'vscode';
import { createHash, randomBytes } from 'crypto';
import { applyEdits, modify, parse, ParseError } from 'jsonc-parser';
import { applyDocumentChange, documentIO, fileExists } from './documentOperations';
import { Logger } from './logger';

export interface ChapterMove {
    source: vscode.Uri;
    target: vscode.Uri;
}

export interface MigrationFile {
    uri: vscode.Uri;
    content: string;
}

let running = false;

export async function saveMigrationDocuments(root: vscode.Uri): Promise<void> {
    const chapters = vscode.Uri.joinPath(root, 'chapters').toString() + '/';
    const config = vscode.Uri.joinPath(root, 'novel.jsonc').toString();
    for (const document of vscode.workspace.textDocuments) {
        const uri = document.uri.toString();
        if (document.isDirty && (uri.startsWith(chapters) || uri === config)) {
            if (!await documentIO.save(document) || document.isDirty) {
                throw new Error(`文档未保存，迁移已停止：${document.uri.fsPath}`);
            }
        }
    }
}

function updatedConfig(text: string, structure: 'flat' | 'nested'): string {
    const errors: ParseError[] = [];
    const config = parse(text, errors, { allowTrailingComma: true });
    if (errors.length || !config || typeof config !== 'object' || Array.isArray(config)
        || !config.noveler || typeof config.noveler !== 'object' || Array.isArray(config.noveler)) {
        throw new Error('novel.jsonc 格式无效，迁移已停止');
    }
    let result = text;
    for (const [key, value] of Object.entries({ enabled: structure === 'nested', folderStructure: structure })) {
        result = applyEdits(result, modify(result, ['noveler', 'volumes', key], value, {
            formattingOptions: { tabSize: 2, insertSpaces: true, eol: text.includes('\r\n') ? '\r\n' : '\n' }
        }));
    }
    return result;
}

function isDirty(uri: vscode.Uri): boolean {
    return vscode.workspace.textDocuments.some(document => document.uri.toString() === uri.toString() && document.isDirty);
}

async function rename(source: vscode.Uri, target: vscode.Uri): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.renameFile(source, target, { overwrite: false });
    if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error(`无法移动章节：${source.fsPath}`);
    }
}

export async function migrateChapters(
    root: vscode.Uri,
    moves: ChapterMove[],
    files: MigrationFile[],
    structure: 'flat' | 'nested',
    progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    if (running) { throw new Error('已有迁移正在进行，请等待完成'); }
    running = true;
    const configUri = vscode.Uri.joinPath(root, 'novel.jsonc');
    const backup = vscode.Uri.joinPath(root, '.noveler', 'backups', `${Date.now()}-${randomBytes(4).toString('hex')}`);
    const snapshots = new Map<string, Uint8Array>();
    const moved: ChapterMove[] = [];
    const created: MigrationFile[] = [];
    const directories: vscode.Uri[] = [];
    let originalConfig: Uint8Array | undefined;
    let newConfig = '';
    let configAttempted = false;
    let backupComplete = false;
    let committed = false;
    let preserveBackup = false;
    try {
        await saveMigrationDocuments(root);
        originalConfig = await vscode.workspace.fs.readFile(configUri);
        newConfig = updatedConfig(Buffer.from(originalConfig).toString('utf8'), structure);
        const targets = new Set<string>();
        const chapters = vscode.Uri.joinPath(root, 'chapters').toString() + '/';
        const sources = new Set<string>();
        for (const move of moves) {
            if (!move.source.toString().startsWith(chapters) || !move.target.toString().startsWith(chapters)
                || move.source.toString() === move.target.toString() || sources.has(move.source.toString())
                || targets.has(move.target.toString())) {
                throw new Error('迁移计划存在重复章节或非法路径');
            }
            sources.add(move.source.toString());
            targets.add(move.target.toString());
            const sourceStat = await vscode.workspace.fs.stat(move.source);
            if (sourceStat.type !== vscode.FileType.File) { throw new Error(`源章节不是普通文件：${move.source.fsPath}`); }
            if (await fileExists(move.target)) { throw new Error(`目标章节已存在，迁移已停止：${move.target.fsPath}`); }
            snapshots.set(move.source.toString(), await vscode.workspace.fs.readFile(move.source));
        }
        const missingFiles: MigrationFile[] = [];
        for (const file of files) {
            if (!file.uri.toString().startsWith(chapters) || targets.has(file.uri.toString())) {
                throw new Error('迁移资料路径与章节冲突');
            }
            if (!await fileExists(file.uri)) { missingFiles.push(file); }
        }
        for (const uri of [...moves.map(move => move.target), ...missingFiles.map(file => file.uri)]) {
            const parent = vscode.Uri.joinPath(uri, '..');
            if (await fileExists(parent)) {
                if ((await vscode.workspace.fs.stat(parent)).type !== vscode.FileType.Directory) {
                    throw new Error(`目标卷路径不是目录：${parent.fsPath}`);
                }
            }
        }

        await vscode.workspace.fs.createDirectory(backup);
        const entries = [...snapshots.entries(), [configUri.toString(), originalConfig] as [string, Uint8Array]];
        for (let i = 0; i < entries.length; i++) {
            const bytes = entries[i][1];
            const backupFile = vscode.Uri.joinPath(backup, `file-${i}`);
            await documentIO.writeFile(backupFile, bytes);
            if (!Buffer.from(await vscode.workspace.fs.readFile(backupFile)).equals(Buffer.from(bytes))) {
                throw new Error('备份校验失败，未开始迁移');
            }
        }
        const manifest = {
            structure,
            files: entries.map(([uri, bytes], index) => ({ uri, backupFile: `file-${index}`, sha256: createHash('sha256').update(bytes).digest('hex') })),
            moves: moves.map(move => ({ source: move.source.toString(), target: move.target.toString() })),
            createdFiles: missingFiles.map(file => file.uri.toString())
        };
        await documentIO.writeFile(vscode.Uri.joinPath(backup, 'manifest.json'), Buffer.from(JSON.stringify(manifest, null, 2)));
        backupComplete = true;

        for (const uri of [...moves.map(move => move.target), ...missingFiles.map(file => file.uri)]) {
            const parent = vscode.Uri.joinPath(uri, '..');
            if (!await fileExists(parent)) {
                await vscode.workspace.fs.createDirectory(parent);
                directories.push(parent);
            }
        }
        for (const file of missingFiles) {
            const edit = new vscode.WorkspaceEdit();
            edit.createFile(file.uri, { overwrite: false });
            edit.insert(file.uri, new vscode.Position(0, 0), file.content);
            // 混合文件编辑可能部分完成，先记录以便失败时检查和清理。
            created.push(file);
            if (!await vscode.workspace.applyEdit(edit)) { throw new Error(`无法创建卷资料：${file.uri.fsPath}`); }
            const document = await vscode.workspace.openTextDocument(file.uri);
            if (!await documentIO.save(document) || document.isDirty) { throw new Error(`卷资料未保存：${file.uri.fsPath}`); }
        }
        for (let i = 0; i < moves.length; i++) {
            const move = moves[i];
            if (isDirty(move.source) || !Buffer.from(await vscode.workspace.fs.readFile(move.source)).equals(Buffer.from(snapshots.get(move.source.toString())!))) {
                throw new Error(`章节在迁移期间被修改，迁移已停止：${move.source.fsPath}`);
            }
            moved.push(move);
            await rename(move.source, move.target);
            progress?.report({ message: `移动章节 ${i + 1}/${moves.length}`, increment: 100 / Math.max(moves.length, 1) });
        }
        configAttempted = true;
        await applyDocumentChange(configUri, text => {
            if (text !== Buffer.from(originalConfig!).toString('utf8')) { throw new Error('配置在迁移期间被修改'); }
            return newConfig;
        });
        const configDocument = await vscode.workspace.openTextDocument(configUri);
        if (!await documentIO.save(configDocument) || configDocument.isDirty) { throw new Error('迁移配置未保存'); }
        for (const move of moves) {
            if (await fileExists(move.source) || isDirty(move.target)
                || !Buffer.from(await vscode.workspace.fs.readFile(move.target)).equals(Buffer.from(snapshots.get(move.source.toString())!))) {
                throw new Error(`迁移结果校验失败：${move.target.fsPath}`);
            }
        }
        if (!Buffer.from(await vscode.workspace.fs.readFile(configUri)).equals(Buffer.from(newConfig))) {
            throw new Error('迁移配置校验失败');
        }
        committed = true;
    } catch (error) {
        let restored = true;
        if (backupComplete) {
            for (const move of [...moved].reverse()) {
                try {
                    if (await fileExists(move.source)) {
                        if (await fileExists(move.target)) { restored = false; }
                        continue;
                    }
                    if (isDirty(move.target) || !Buffer.from(await vscode.workspace.fs.readFile(move.target)).equals(Buffer.from(snapshots.get(move.source.toString())!))) {
                        throw new Error('目标章节已修改，保留现场');
                    }
                    await rename(move.target, move.source);
                } catch { restored = false; }
            }
            if (configAttempted) {
                try {
                    const document = await vscode.workspace.openTextDocument(configUri);
                    const current = document.getText();
                    const original = Buffer.from(originalConfig!).toString('utf8');
                    if (current !== original) {
                        if (current !== newConfig) { throw new Error('配置已修改，保留现场'); }
                        await applyDocumentChange(configUri, () => original);
                        if (!await documentIO.save(document) || document.isDirty) { throw new Error('恢复配置未保存'); }
                    }
                    if (!Buffer.from(await vscode.workspace.fs.readFile(configUri)).equals(Buffer.from(originalConfig!))) {
                        throw new Error('配置恢复校验失败');
                    }
                } catch { restored = false; }
            }
            for (const file of [...created].reverse()) {
                try {
                    if (!await fileExists(file.uri)) { continue; }
                    const document = await vscode.workspace.openTextDocument(file.uri);
                    if (document.isDirty || document.getText() !== file.content) { throw new Error('卷资料已修改，保留现场'); }
                    const edit = new vscode.WorkspaceEdit();
                    edit.deleteFile(file.uri);
                    if (!await vscode.workspace.applyEdit(edit)) { throw new Error('清理卷资料失败'); }
                } catch { restored = false; }
            }
            for (const directory of [...directories].reverse()) {
                try {
                    if ((await vscode.workspace.fs.readDirectory(directory)).length === 0) {
                        await vscode.workspace.fs.delete(directory);
                    }
                } catch { restored = false; }
            }
        }
        preserveBackup = backupComplete && !restored;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(preserveBackup ? `${message}\n恢复未完成，备份保留在：${backup.fsPath}` : `${message}\n未执行的操作已停止，已完成的改动已恢复。`);
    } finally {
        if (!preserveBackup) {
            try {
                if (await fileExists(backup)) { await vscode.workspace.fs.delete(backup, { recursive: true }); }
            } catch (error) {
                Logger.warn('临时备份清理失败', error);
                vscode.window.showWarningMessage(`${committed ? '迁移已完成。' : ''}临时备份未能清理，可手动删除：${backup.fsPath}`);
            }
        }
        running = false;
    }
}
