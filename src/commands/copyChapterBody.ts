import * as vscode from 'vscode';
import { TextDecoder } from 'util';
import { documentIO, fileExists } from '../utils/documentOperations';
import { markdownToText, parseChapterSource } from '../utils/manuscriptText';
import { isChapterFile } from '../utils/volumeHelper';
import { handleError } from '../utils/errorHandler';

export const chapterCopyIO = {
    writeClipboard: (text: string): Thenable<void> => vscode.env.clipboard.writeText(text)
};

export async function copyChapterBody(target?: vscode.Uri | { resourceUri?: vscode.Uri }): Promise<void> {
    const uri = target instanceof vscode.Uri ? target : target ? target.resourceUri : vscode.window.activeTextEditor?.document.uri;
    const root = documentIO.workspaceFolder()?.uri;
    const prefix = root && vscode.Uri.joinPath(root, 'chapters').toString() + '/';
    if (!root || !uri || uri.scheme !== 'file' || !prefix || !uri.toString().startsWith(prefix)
        || !isChapterFile(uri.path.split('/').pop() || '')) {
        await vscode.window.showWarningMessage('请从小说章节的操作行或右键菜单复制正文');
        return;
    }
    try {
        if (!await fileExists(vscode.Uri.joinPath(root, 'novel.jsonc'))) {
            throw new Error('未找到小说项目配置 novel.jsonc');
        }
        const stat = await documentIO.stat(uri);
        if (stat.type !== vscode.FileType.File) { throw new Error('章节不是普通文件'); }
        const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === uri.toString());
        let text: string;
        if (document?.isDirty) {
            text = document.getText();
        } else {
            const bytes = await documentIO.readFile(uri);
            try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
            catch { throw new Error('章节不是有效的 UTF-8 文本，请检查文件编码'); }
        }
        const converted = markdownToText(parseChapterSource(text).body, true);
        if (!converted.body.trim()) {
            await vscode.window.showWarningMessage('章节正文为空，未更改剪贴板');
            return;
        }
        await chapterCopyIO.writeClipboard(converted.body);
        const notes = converted.warnings.map(warning => warning.replace(/导出/g, '复制').replace(/TXT/g, '纯文本'));
        void vscode.window.showInformationMessage(`正文已复制${notes.length ? `。${notes.join('；')}` : ''}`);
    } catch (error) {
        handleError('复制正文失败', error);
    }
}
