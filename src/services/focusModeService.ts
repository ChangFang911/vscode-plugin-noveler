import * as vscode from 'vscode';

export class FocusModeService implements vscode.Disposable {
    /**
     * 切换专注模式（直接使用 VSCode 的 Zen Mode）
     */
    public async toggle(): Promise<void> {
        // 直接切换 Zen Mode，纯粹、干净
        await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    }

    public dispose() {
        // 不需要特殊清理
    }
}
