import * as vscode from 'vscode';

/**
 * 敏感词快速修复提供器
 * 提供敏感词的快速修复建议
 */
export class SensitiveWordCodeActionProvider implements vscode.CodeActionProvider {
    public static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    /**
     * 提供代码操作
     * @param document 文档
     * @param range 范围
     * @param context 上下文
     * @returns 代码操作数组
     */
    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range | vscode.Selection,
        context: vscode.CodeActionContext,
        _token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const actions: vscode.CodeAction[] = [];

        // 只处理敏感词相关的诊断
        const sensitiveWordDiagnostics = context.diagnostics.filter(
            diag => diag.source === 'Noveler' && diag.code === 'sensitive-word'
        );

        for (const diagnostic of sensitiveWordDiagnostics) {
            // 1. 添加到白名单
            const addToWhitelistAction = this.createAddToWhitelistAction(document, diagnostic);
            if (addToWhitelistAction) {
                actions.push(addToWhitelistAction);
            }

            // 2. 删除此词
            const deleteWordAction = this.createDeleteWordAction(document, diagnostic);
            if (deleteWordAction) {
                actions.push(deleteWordAction);
            }

            // 3. 用星号替换
            const replaceWithAsterisksAction = this.createReplaceWithAsterisksAction(document, diagnostic);
            if (replaceWithAsterisksAction) {
                actions.push(replaceWithAsterisksAction);
            }

            // 4. 忽略此问题
            const ignoreAction = this.createIgnoreAction(document, diagnostic);
            if (ignoreAction) {
                actions.push(ignoreAction);
            }
        }

        return actions;
    }

    /**
     * 创建"添加到白名单"操作
     */
    private createAddToWhitelistAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | null {
        const word = document.getText(diagnostic.range);
        if (!word) return null;

        const action = new vscode.CodeAction(
            `将 "${word}" 添加到白名单`,
            vscode.CodeActionKind.QuickFix
        );

        action.command = {
            command: 'noveler.addToWhitelist',
            title: '添加到白名单',
            arguments: [word]
        };

        action.diagnostics = [diagnostic];
        action.isPreferred = true; // 设为首选操作

        return action;
    }

    /**
     * 创建"删除此词"操作
     */
    private createDeleteWordAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | null {
        const word = document.getText(diagnostic.range);
        if (!word) return null;

        const action = new vscode.CodeAction(
            `删除 "${word}"`,
            vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();
        action.edit.delete(document.uri, diagnostic.range);
        action.diagnostics = [diagnostic];

        return action;
    }

    /**
     * 创建"用星号替换"操作
     */
    private createReplaceWithAsterisksAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | null {
        const word = document.getText(diagnostic.range);
        if (!word) return null;

        const asterisks = '*'.repeat(word.length);

        const action = new vscode.CodeAction(
            `替换为 "${asterisks}"`,
            vscode.CodeActionKind.QuickFix
        );

        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(document.uri, diagnostic.range, asterisks);
        action.diagnostics = [diagnostic];

        return action;
    }

    /**
     * 创建"忽略此问题"操作
     */
    private createIgnoreAction(
        document: vscode.TextDocument,
        diagnostic: vscode.Diagnostic
    ): vscode.CodeAction | null {
        const word = document.getText(diagnostic.range);
        if (!word) return null;

        const action = new vscode.CodeAction(
            `忽略本文件中的 "${word}"`,
            vscode.CodeActionKind.QuickFix
        );

        action.command = {
            command: 'noveler.ignoreSensitiveWord',
            title: '忽略本文件',
            arguments: [document.uri.toString(), word]
        };

        action.diagnostics = [diagnostic];

        return action;
    }
}
