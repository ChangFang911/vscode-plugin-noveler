import * as vscode from 'vscode';
import * as path from 'path';
import { mkdtemp, realpath } from 'fs/promises';
import { ExportFile } from '../types/manuscript';
import { documentIO, fileExists } from '../utils/documentOperations';
import { exportFileName, validateExportFolderName } from '../utils/manuscriptText';
import { checkExportCancelled } from './manuscriptService';

export const exportIO = {
    temporaryDirectory: (parent: string): Promise<string> => mkdtemp(path.join(parent, '.noveler-export-')),
    rename: (source: vscode.Uri, target: vscode.Uri): Thenable<void> => vscode.workspace.fs.rename(source, target, { overwrite: false })
};

export async function validateExportParent(project: vscode.Uri, parent: vscode.Uri): Promise<void> {
    if (project.scheme !== 'file' || parent.scheme !== 'file') { throw new Error('当前导出仅支持本机文件夹'); }
    const relative = path.relative(await realpath(project.fsPath), await realpath(parent.fsPath));
    if (!relative || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))) {
        throw new Error('请选择小说项目之外的保存位置，避免导出文件混入原稿');
    }
    if ((await vscode.workspace.fs.stat(parent)).type !== vscode.FileType.Directory) { throw new Error('保存位置不是文件夹'); }
}

export async function suggestExportFolder(parent: vscode.Uri, title: string): Promise<string> {
    const letters = Array.from(exportFileName(title)).slice(0, 50);
    while (Buffer.byteLength(letters.join(''), 'utf8') > 150) { letters.pop(); }
    const base = `${letters.join('')}-导出`;
    let name = base;
    for (let index = 2; await fileExists(vscode.Uri.joinPath(parent, name)); index++) { name = `${base}-${index}`; }
    return name;
}

export async function writeManuscriptExport(project: vscode.Uri, parent: vscode.Uri, name: string, files: ExportFile[],
    assertUnchanged: () => Promise<void>, token?: vscode.CancellationToken): Promise<vscode.Uri> {
    const invalid = validateExportFolderName(name);
    if (invalid) { throw new Error(invalid); }
    if (!files.length || new Set(files.map(file => file.name)).size !== files.length) { throw new Error('导出文件为空或重名'); }
    await validateExportParent(project, parent);
    checkExportCancelled(token);
    const target = vscode.Uri.joinPath(parent, name);
    if (await fileExists(target)) { throw new Error('导出文件夹已存在，请重新导出并使用新名称'); }
    let temporary: vscode.Uri | undefined;
    try {
        temporary = vscode.Uri.file(await exportIO.temporaryDirectory(parent.fsPath));
        for (const file of files) {
            checkExportCancelled(token);
            if (!file.name || path.basename(file.name) !== file.name || file.name === '.' || file.name === '..') {
                throw new Error('导出文件名无效');
            }
            const uri = vscode.Uri.joinPath(temporary, file.name);
            const content = typeof file.content === 'string' ? Buffer.from(file.content, 'utf8') : Buffer.from(file.content);
            await documentIO.writeFile(uri, content);
            if (!Buffer.from(await vscode.workspace.fs.readFile(uri)).equals(content)) { throw new Error('导出文件校验失败'); }
        }
        await assertUnchanged();
        checkExportCancelled(token);
        await validateExportParent(project, parent);
        await exportIO.rename(temporary, target);
        temporary = undefined;
        return target;
    } catch (error) {
        if (temporary) {
            try { await vscode.workspace.fs.delete(temporary, { recursive: true, useTrash: false }); }
            catch { throw new Error(`导出未完成，临时目录未能清理，请检查：${temporary.fsPath}`); }
        }
        throw error;
    }
}
