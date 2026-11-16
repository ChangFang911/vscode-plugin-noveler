import * as vscode from 'vscode';
import { handleError } from '../utils/errorHandler';

function validateMarkContent(content: string): string | undefined {
    return /[\r\n]|<!--|-->/.test(content) ? '待办内容不能包含换行或 HTML 注释分隔符' : undefined;
}

function bodyStart(text: string): number {
    const header = /^\uFEFF?---[^\S\r\n]*\r?\n[\s\S]*?^---[^\S\r\n]*(?:\r?\n|$)/m.exec(text);
    return header?.index === 0 ? header[0].length : 0;
}

export async function addDoubtMark(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'markdown') {
        void vscode.window.showWarningMessage('请在 Markdown 文件中使用此功能');
        return;
    }
    if (editor.selections.length !== 1) {
        void vscode.window.showWarningMessage('请保留一个光标或连续选区后添加待办');
        return;
    }
    const document = editor.document;
    const original = document.getText();
    const originalBodyStart = bodyStart(original);
    const position = editor.selection.end;
    const offset = document.offsetAt(position);
    for (const comment of original.matchAll(/<!--[\s\S]*?(?:-->|$)/g)) {
        const end = comment.index! + comment[0].length;
        if (comment.index! < offset && (offset < end || (offset === end && !comment[0].endsWith('-->')))) {
            void vscode.window.showWarningMessage('请将插入位置移到现有注释之外再添加待办');
            return;
        }
    }
    try {
        const content = await vscode.window.showInputBox({
            prompt: '请输入待办内容，将插入光标处或选区末尾，保留原文',
            placeHolder: '例如：这里与第三章的设定矛盾',
            ignoreFocusOut: true,
            validateInput: validateMarkContent,
        });
        if (content === undefined) { return; }
        const invalid = validateMarkContent(content);
        if (invalid) { void vscode.window.showWarningMessage(invalid); return; }
        const currentEditor = vscode.window.activeTextEditor;
        if (!currentEditor || currentEditor.document !== document || document.isClosed) {
            void vscode.window.showWarningMessage('编辑窗口已切换或文档已关闭，请回到原文档重新添加待办');
            return;
        }
        let insertion = position;
        const latest = document.getText();
        if (latest !== original) {
            const latestBodyStart = bodyStart(latest);
            const originalBody = original.slice(originalBodyStart);
            const latestBody = latest.slice(latestBodyStart);
            const stripFinalNewlines = (text: string) => text.replace(/(?:\r?\n)+$/, '');
            if (offset < originalBodyStart || offset - originalBodyStart > latestBody.length
                || stripFinalNewlines(originalBody) !== stripFinalNewlines(latestBody)) {
                void vscode.window.showWarningMessage('正文已变化，请重新选择位置后添加待办');
                return;
            }
            // 保存只更新章头或末尾换行时，按正文相对偏移恢复插入点。
            insertion = document.positionAt(latestBodyStart + offset - originalBodyStart);
        }
        const marker = `<!--? ${content} -->`;
        if (!await currentEditor.edit(edit => edit.insert(insertion, marker), { undoStopBefore: true, undoStopAfter: true })) {
            throw new Error('待办未插入，请检查文档是否只读或已变化');
        }
        if (vscode.window.activeTextEditor === currentEditor) {
            const after = insertion.translate(0, marker.length);
            currentEditor.selection = new vscode.Selection(after, after);
        }
    } catch (error) {
        handleError('添加待办失败', error);
    }
}
