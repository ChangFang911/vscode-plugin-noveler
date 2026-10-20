import * as vscode from 'vscode';
import { documentIO, fileExists } from '../utils/documentOperations';
import { renderManuscriptTxt, validateExportFolderName } from '../utils/manuscriptText';
import { ManuscriptError } from '../types/manuscript';
import { checkExportCancelled, readManuscript } from '../services/manuscriptService';
import { suggestExportFolder, validateExportParent, writeManuscriptExport } from '../services/manuscriptWriter';
import { Logger } from '../utils/logger';

let exporting = false;

export async function exportNovel(): Promise<void> {
    const root = documentIO.workspaceFolder()?.uri;
    if (!root) { await vscode.window.showWarningMessage('请先打开小说项目'); return; }
    if (exporting) { await vscode.window.showInformationMessage('小说正在导出，请等待完成或取消本次导出'); return; }
    exporting = true;
    let result: { folder: vscode.Uri; file: vscode.Uri; chapters: number } | undefined;
    let failure: { error: unknown } | undefined;
    try {
        result = await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification, title: '导出小说为 TXT', cancellable: true
        }, async (progress, token) => {
            progress.report({ message: '检查章节和编号…' });
            let snapshot = await readManuscript(root, token, message => progress.report({ message }));
            let output = renderManuscriptTxt(snapshot.book);
            let approvedWarnings = '';
            const confirmWarnings = async (warnings: string[]) => {
                const signature = JSON.stringify(warnings);
                if (!warnings.length || signature === approvedWarnings) { return true; }
                const more = warnings.length > 6 ? `\n另有 ${warnings.length - 6} 项提示。` : '';
                const answer = await vscode.window.showWarningMessage(
                    `${warnings.slice(0, 6).join('\n')}${more}\n\n继续导出会保留所有章节，隐藏注释及待办标记。`,
                    { modal: true }, '继续导出');
                if (answer !== '继续导出') { return false; }
                approvedWarnings = signature;
                return true;
            };
            if (!await confirmWarnings(output.warnings)) { return undefined; }
            checkExportCancelled(token);
            const selected = await vscode.window.showOpenDialog({
                title: '选择导出保存位置（小说项目之外）', openLabel: '保存到这里',
                defaultUri: vscode.Uri.joinPath(root, '..'),
                canSelectFiles: false, canSelectFolders: true, canSelectMany: false
            });
            if (!selected?.[0]) { return undefined; }
            const parent = selected[0];
            await validateExportParent(root, parent);
            const name = await vscode.window.showInputBox({
                title: '导出文件夹名称', prompt: '将创建新文件夹，包含全书 TXT；不会覆盖已有导出',
                value: await suggestExportFolder(parent, snapshot.book.title), ignoreFocusOut: true,
                validateInput: async value => validateExportFolderName(value)
                    || (await fileExists(vscode.Uri.joinPath(parent, value)) ? '此文件夹已存在，请使用新名称' : undefined)
            });
            if (name === undefined) { return undefined; }
            snapshot = await readManuscript(root, token, message => progress.report({ message }));
            output = renderManuscriptTxt(snapshot.book);
            if (!await confirmWarnings(output.warnings)) { return undefined; }
            progress.report({ message: '生成文件并核验原稿…' });
            const folder = await writeManuscriptExport(root, parent, name, output.files, snapshot.assertUnchanged, token);
            return { folder, file: vscode.Uri.joinPath(folder, output.files[0].name),
                chapters: snapshot.book.volumes.reduce((count, volume) => count + volume.chapters.length, 0) };
        });
    } catch (error) { failure = { error }; }
    finally { exporting = false; }
    if (result) {
        const answer = await vscode.window.showInformationMessage(`小说导出成功，共 ${result.chapters} 章：${result.folder.fsPath}`, '打开文件', '打开文件夹');
        if (answer === '打开文件') { await vscode.commands.executeCommand('vscode.open', result.file); }
        if (answer === '打开文件夹') { await vscode.commands.executeCommand('revealFileInOS', result.file); }
    }
    if (failure) {
        const error = failure.error;
        if (error instanceof vscode.CancellationError) { return; }
        Logger.error('小说导出失败', error);
        const source = error instanceof ManuscriptError ? error.source : undefined;
        const message = `导出未完成：${error instanceof Error ? error.message : String(error)}`;
        const answer = source ? await vscode.window.showErrorMessage(message, '打开问题文件')
            : await vscode.window.showErrorMessage(message);
        if (source && answer === '打开问题文件') { await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(source)); }
    }
}
