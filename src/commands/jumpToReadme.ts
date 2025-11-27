/**
 * 跳转到 README 指定章节
 */

import * as vscode from 'vscode';
import { handleError, ErrorSeverity } from '../utils/errorHandler';

/**
 * 跳转到 README 的指定章节
 * @param sectionName 章节名称（例如："项目统计"、"章节列表"、"人物设定"）
 */
export async function jumpToReadmeSection(sectionName: string): Promise<void> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('未找到工作区文件夹');
            return;
        }

        const readmePath = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');

        // 打开 README 文件
        const document = await vscode.workspace.openTextDocument(readmePath);
        const editor = await vscode.window.showTextDocument(document);

        // 查找目标章节标题
        const text = document.getText();
        const lines = text.split('\n');

        // 定义章节名称到正则的映射
        const sectionPatterns: Record<string, RegExp> = {
            '写作进度': /^#{1,3}\s*写作进度/,
            '人物设定': /^#{1,3}\s*人物设定/
        };

        const pattern = sectionPatterns[sectionName];
        if (!pattern) {
            vscode.window.showWarningMessage(`未知的章节：${sectionName}`);
            return;
        }

        // 查找目标行号
        let targetLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
                targetLine = i;
                break;
            }
        }

        if (targetLine === -1) {
            // 即使没找到章节，也打开 README 文件并跳转到开头
            const position = new vscode.Position(0, 0);
            const range = new vscode.Range(position, position);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            editor.selection = new vscode.Selection(position, position);

            vscode.window.showInformationMessage(
                `README 中未找到"${sectionName}"章节，已打开 README 文件`,
                '知道了'
            );
            return;
        }

        // 跳转到目标位置
        const position = new vscode.Position(targetLine, 0);
        const range = new vscode.Range(position, position);

        // 使用 revealRange 将目标行滚���到视图中央
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

        // 移动光标到目标行
        editor.selection = new vscode.Selection(position, position);
    } catch (error) {
        handleError('跳转到 README 失败', error, ErrorSeverity.Warning);
    }
}
