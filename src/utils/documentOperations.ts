import * as vscode from 'vscode';
import YAML from 'yaml';

export const documentIO = {
    workspaceFolder: (): vscode.WorkspaceFolder | undefined => vscode.workspace.workspaceFolders?.[0],
    stat: (uri: vscode.Uri): Thenable<vscode.FileStat> => vscode.workspace.fs.stat(uri),
    writeFile: (uri: vscode.Uri, content: Uint8Array): Thenable<void> => vscode.workspace.fs.writeFile(uri, content),
    save: (document: vscode.TextDocument): Thenable<boolean> => document.save(),
    delete: (uri: vscode.Uri, options: { recursive?: boolean; useTrash?: boolean }): Thenable<void> => vscode.workspace.fs.delete(uri, options)
};

export function patchFrontMatter(text: string, fields: Record<string, unknown>): string {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const match = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(^---[^\S\r\n]*(?:\r?\n|$))/m.exec(text);
    if (match && match.index === 0) {
        const yaml = YAML.parseDocument(match[2]);
        if (yaml.errors.length || (yaml.contents !== null && !YAML.isMap(yaml.contents))) {
            throw new Error('Front Matter 格式无效，请先修复元数据');
        }
        for (const [key, value] of Object.entries(fields)) {
            yaml.set(key, value);
        }
        return match[1] + yaml.toString().replace(/\r?\n/g, eol) + match[3] + text.slice(match[0].length);
    }
    if (/^\uFEFF?---[^\S\r\n]*(?:\r?\n|$)/.test(text)) {
        throw new Error('Front Matter 未闭合，请先修复元数据');
    }
    return `---${eol}${YAML.stringify(fields).replace(/\r?\n/g, eol)}---${eol}${text}`;
}

export async function fileExists(uri: vscode.Uri): Promise<boolean> {
    try {
        await documentIO.stat(uri);
        return true;
    } catch (error) {
        if ((error as { code?: string }).code === 'FileNotFound') {
            return false;
        }
        throw error;
    }
}

export async function createDocument(uri: vscode.Uri, text: string): Promise<void> {
    if (await fileExists(uri)) {
        throw new Error(`文件已存在，未覆盖：${uri.fsPath}`);
    }
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(uri, { overwrite: false });
    edit.insert(uri, new vscode.Position(0, 0), text);
    if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error(`文件创建未完成：${uri.fsPath}`);
    }
    const document = await vscode.workspace.openTextDocument(uri);
    if (!await documentIO.save(document) || document.isDirty) {
        throw new Error(`文件未保存，请检查编辑器：${uri.fsPath}`);
    }
}

export async function saveDocumentsUnder(folder: vscode.Uri): Promise<void> {
    const prefix = folder.toString() + '/';
    for (const document of vscode.workspace.textDocuments) {
        if (document.isDirty && document.uri.toString().startsWith(prefix)) {
            if (!await documentIO.save(document) || document.isDirty) {
                throw new Error(`文档未保存，操作已停止：${document.uri.fsPath}`);
            }
        }
    }
}

export async function applyDocumentChange(
    uri: vscode.Uri,
    transform: (text: string) => string,
    target?: vscode.Uri
): Promise<void> {
    const rename = target && target.toString() !== uri.toString();
    if (rename && await fileExists(target)) {
        throw new Error(`目标文件已存在，未覆盖：${target.fsPath}`);
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const text = document.getText();
    const updated = transform(text);
    const edit = new vscode.WorkspaceEdit();
    if (updated !== text) {
        edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), updated);
    }
    if (rename) {
        edit.renameFile(uri, target, { overwrite: false });
    }
    if ((rename || updated !== text) && !await vscode.workspace.applyEdit(edit)) {
        throw new Error('文件编辑未完成，源文件未主动删除，请检查编辑器内容');
    }
}

export async function copyDocument(
    uri: vscode.Uri,
    target: vscode.Uri,
    transform: (text: string) => string
): Promise<void> {
    if (await fileExists(target)) {
        throw new Error(`目标文件已存在，未覆盖：${target.fsPath}`);
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const updated = transform(document.getText());
    const edit = new vscode.WorkspaceEdit();
    edit.createFile(target, { overwrite: false });
    edit.insert(target, new vscode.Position(0, 0), updated);
    if (!await vscode.workspace.applyEdit(edit)) {
        throw new Error('复制未完成，请检查目标文件；源文件未修改');
    }
    const copy = await vscode.workspace.openTextDocument(target);
    if (!await documentIO.save(copy) || copy.isDirty) {
        throw new Error(`副本未保存，请检查目标文档：${target.fsPath}`);
    }
}
