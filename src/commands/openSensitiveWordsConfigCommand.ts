/**
 * 打开敏感词配置命令
 */

import * as vscode from 'vscode';
import * as path from 'path';

/**
 * 打开敏感词配置文件
 * 显示选项菜单，让用户选择要打开的配置
 */
export async function openSensitiveWordsConfig(): Promise<void> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            vscode.window.showWarningMessage('请先打开一个 Noveler 项目');
            return;
        }

        const projectPath = workspaceFolders[0].uri.fsPath;

        // 显示选项菜单
        const options = [
            {
                label: '⚙️ 配置检测级别',
                description: '调整内置词库的检测级别（高危/中危/低危）',
                action: 'config'
            },
            {
                label: '➕ 管理自定义敏感词',
                description: '添加您想要检测的敏感词汇',
                action: 'custom'
            },
            {
                label: '➖ 管理白名单',
                description: '排除误报的词汇（人物名、地名等）',
                action: 'whitelist'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: '请选择要打开的配置'
        });

        if (!selected) {
            return;
        }

        if (selected.action === 'config') {
            // 打开 novel.jsonc 并跳转到 sensitiveWords 配置
            const novelConfigPath = path.join(projectPath, 'novel.jsonc');
            const doc = await vscode.workspace.openTextDocument(novelConfigPath);
            const editor = await vscode.window.showTextDocument(doc);

            // 跳转到 sensitiveWords 配置位置
            const text = doc.getText();
            const sensitiveWordsIndex = text.indexOf('"sensitiveWords"');

            if (sensitiveWordsIndex !== -1) {
                const position = doc.positionAt(sensitiveWordsIndex);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            } else {
                vscode.window.showWarningMessage('未找到敏感词配置部分，请检查 novel.jsonc 文件格式');
            }
        } else if (selected.action === 'custom') {
            // 打开自定义敏感词文件
            const customWordsPath = path.join(projectPath, '.noveler', 'sensitive-words', 'custom-words.jsonc');
            try {
                const doc = await vscode.workspace.openTextDocument(customWordsPath);
                await vscode.window.showTextDocument(doc);
            } catch (error) {
                vscode.window.showWarningMessage('自定义敏感词文件不存在。请先初始化项目��手动创建 .noveler/sensitive-words/custom-words.jsonc');
            }
        } else if (selected.action === 'whitelist') {
            // 打开白名单文件
            const whitelistPath = path.join(projectPath, '.noveler', 'sensitive-words', 'whitelist.jsonc');
            try {
                const doc = await vscode.workspace.openTextDocument(whitelistPath);
                await vscode.window.showTextDocument(doc);
            } catch (error) {
                vscode.window.showWarningMessage('白名单文件不存在。请先初始化项目或手动创建 .noveler/sensitive-words/whitelist.jsonc');
            }
        }

        console.log('[Noveler] 已打开敏感词配置');
    } catch (error) {
        console.error('[Noveler] 打开敏感词配置失败', error);
        vscode.window.showErrorMessage('打开敏感词配置失败');
    }
}
