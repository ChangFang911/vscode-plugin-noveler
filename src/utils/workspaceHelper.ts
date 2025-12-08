/**
 * 工作区辅助函数
 */

import * as vscode from 'vscode';

/**
 * 获取当前工作区文件夹
 * @throws Error 如果没有打开工作区
 */
export function getWorkspaceFolder(): vscode.WorkspaceFolder {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('未打开工作区。请先打开一个文件夹。');
    }
    return workspaceFolder;
}

/**
 * 获取当前工作区路径
 * @throws Error 如果没有打开工作区
 */
export function getWorkspacePath(): string {
    return getWorkspaceFolder().uri.fsPath;
}

/**
 * 尝试获取当前工作区文件夹，失败时返回 null
 */
export function tryGetWorkspaceFolder(): vscode.WorkspaceFolder | null {
    return vscode.workspace.workspaceFolders?.[0] ?? null;
}

/**
 * 尝试获取当前工作区路径，失败时返回 null
 */
export function tryGetWorkspacePath(): string | null {
    const folder = tryGetWorkspaceFolder();
    return folder?.uri.fsPath ?? null;
}

/**
 * 检查是否有打开的工作区
 */
export function hasWorkspace(): boolean {
    return vscode.workspace.workspaceFolders !== undefined &&
           vscode.workspace.workspaceFolders.length > 0;
}

/**
 * 如果没有工作区，显示错误消息并返回 false
 */
export async function ensureWorkspace(): Promise<boolean> {
    if (!hasWorkspace()) {
        await vscode.window.showErrorMessage('此操作需要打开一个工作区文件夹。');
        return false;
    }
    return true;
}
