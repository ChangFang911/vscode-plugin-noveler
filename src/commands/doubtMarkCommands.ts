/**
 * 疑问标记命令
 */

import * as vscode from 'vscode';
import { DoubtMarkService, DoubtMark } from '../services/doubtMarkService';
import { DoubtMarkTreeItem, DoubtMarkNodesProvider } from '../views/nodes/doubtMarkNodes';
import { handleError } from '../utils/errorHandler';
import { ConfigService } from '../services/configService';

export function registerDoubtMarkCommands(
    context: vscode.ExtensionContext,
    nodesProvider: DoubtMarkNodesProvider,
    refreshTreeView: () => void,
): void {
    const svc = DoubtMarkService.getInstance();

    // 添加疑问标记
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.addDoubtMark', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('请在 Markdown 文件中使用此功能');
                return;
            }

            const content = await vscode.window.showInputBox({
                prompt: '请输入待办内容',
                placeHolder: '例如：这里与第三章的设定矛盾',
                ignoreFocusOut: true,
            });
            if (content === undefined) { return; } // 用户取消

            const line = editor.selection.active.line;
            const lineObj = editor.document.lineAt(line);
            const lineText = lineObj.text;
            const marker = `<!--? ${content} -->`;

            const edit = new vscode.WorkspaceEdit();
            if (lineText.trimEnd() === '') {
                // 空行：直接写入本行
                edit.replace(editor.document.uri, lineObj.range, marker);
            } else {
                // 有内容：追加到行尾
                edit.insert(editor.document.uri,
                    lineObj.range.end, `  ${marker}`);
            }
            await vscode.workspace.applyEdit(edit);
        })
    );

    // 标记为已解决
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.resolveDoubtMark',
            async (itemOrMark: DoubtMarkTreeItem | DoubtMark) => {
                const mark = extractMark(itemOrMark);
                if (!mark) { return; }
                try {
                    await svc.resolveMark(mark);
                    const deleteOnResolve = getDeleteOnResolve();
                    if (deleteOnResolve) {
                        await svc.deleteMark({ ...mark, resolved: true });
                    }
                } catch (error) {
                    handleError('标记为已完成失败', error);
                }
            }
        )
    );

    // 重新打开
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.reopenDoubtMark',
            async (itemOrMark: DoubtMarkTreeItem | DoubtMark) => {
                const mark = extractMark(itemOrMark);
                if (!mark) { return; }
                try {
                    await svc.reopenMark(mark);
                } catch (error) {
                    handleError('重新打开标记失败', error);
                }
            }
        )
    );

    // 删除标记
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.deleteDoubtMark',
            async (itemOrMark: DoubtMarkTreeItem | DoubtMark) => {
                const mark = extractMark(itemOrMark);
                if (!mark) { return; }
                const confirm = await vscode.window.showWarningMessage(
                    `确定要删除这条写作待办吗？\n"${mark.content}"`,
                    { modal: true }, '删除'
                );
                if (confirm !== '删除') { return; }
                try {
                    await svc.deleteMark(mark);
                } catch (error) {
                    handleError('删除标记失败', error);
                }
            }
        )
    );

    // 跳转到标记处
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.jumpToDoubtMark',
            async (itemOrMark: DoubtMarkTreeItem | DoubtMark) => {
                const mark = extractMark(itemOrMark);
                if (!mark) { return; }
                try {
                    const doc = await vscode.workspace.openTextDocument(mark.fileUri);
                    const editor = await vscode.window.showTextDocument(doc);
                    const pos = new vscode.Position(mark.lineNumber, 0);
                    editor.selection = new vscode.Selection(pos, pos);
                    editor.revealRange(
                        new vscode.Range(pos, pos),
                        vscode.TextEditorRevealType.InCenterIfOutsideViewport
                    );
                } catch (error) {
                    handleError('跳转失败', error);
                }
            }
        )
    );

    // 切换筛选模式（根节点右键）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.setDoubtMarkFilterAll', () => {
            nodesProvider.setFilter(false);
            refreshTreeView();
        })
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.setDoubtMarkFilterUnresolved', () => {
            nodesProvider.setFilter(true);
            refreshTreeView();
        })
    );

    // 全部标为已解决
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.resolveAllDoubtMarks', async () => {
            const count = svc.getUnresolvedCount();
            if (count === 0) {
                vscode.window.showInformationMessage('没有待处理的写作待办');
                return;
            }
            const confirm = await vscode.window.showWarningMessage(
                `确定要将全部 ${count} 条待处理项标为已完成吗？`,
                { modal: true }, '确定'
            );
            if (confirm !== '确定') { return; }
            try {
                await svc.resolveAll();
            } catch (error) {
                handleError('批量完成待办失败', error);
            }
        })
    );

    // 删除所有已解决标记
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.deleteResolvedDoubtMarks', async () => {
            const resolved = svc.getAllMarks().filter(m => m.resolved).length;
            if (resolved === 0) {
                vscode.window.showInformationMessage('没有已完成的写作待办');
                return;
            }
            const confirm = await vscode.window.showWarningMessage(
                `确定要永久删除全部 ${resolved} 条已完成待办吗？`,
                { modal: true }, '删除'
            );
            if (confirm !== '删除') { return; }
            try {
                await svc.deleteAllResolved();
            } catch (error) {
                handleError('删除已完成待办失败', error);
            }
        })
    );
}

function extractMark(itemOrMark: DoubtMarkTreeItem | DoubtMark): DoubtMark | undefined {
    if (itemOrMark instanceof DoubtMarkTreeItem) {
        return itemOrMark.mark;
    }
    // 直接传入的 DoubtMark 对象（来自 CodeLens）
    if (itemOrMark && typeof (itemOrMark as DoubtMark).lineNumber === 'number') {
        return itemOrMark as DoubtMark;
    }
    return undefined;
}

function getDeleteOnResolve(): boolean {
    try {
        const config = ConfigService.getInstance().getConfig() as Record<string, unknown>;
        const noveler = config?.noveler as Record<string, unknown> | undefined;
        const doubtMark = noveler?.doubtMark as Record<string, unknown> | undefined;
        return Boolean(doubtMark?.deleteOnResolve ?? false);
    } catch {
        return false;
    }
}
