/**
 * 统一错误处理工具
 */

import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
    /** 静默失败 - 仅记录到控制台，不显示给用户 */
    Silent = 'silent',
    /** 警告 - 显示警告消息 */
    Warning = 'warning',
    /** 错误 - 显示错误消息 */
    Error = 'error'
}

/**
 * 统一处理错误
 * @param operation 操作描述（如：创建章节失败、保存文档失败）
 * @param error 错误对象
 * @param severity 错误严重程度，默认为 Error
 */
export function handleError(
    operation: string,
    error: unknown,
    severity: ErrorSeverity = ErrorSeverity.Error
): void {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const fullMessage = `Noveler: ${operation}`;

    // 根据严重程度记录和显示
    switch (severity) {
        case ErrorSeverity.Error:
            Logger.error(fullMessage, error);
            vscode.window.showErrorMessage(`${fullMessage} - ${errorMsg}`);
            break;
        case ErrorSeverity.Warning:
            Logger.warn(fullMessage, error);
            vscode.window.showWarningMessage(`${fullMessage} - ${errorMsg}`);
            break;
        case ErrorSeverity.Silent:
            Logger.debug(fullMessage, error);
            break;
    }
}

/**
 * 处理成功操作（可选的成功提示）
 * @param message 成功消息
 * @param silent 是否静默（不显示提示），默认为 false
 */
export function handleSuccess(message: string, silent = false): void {
    Logger.info(message);
    if (!silent) {
        vscode.window.showInformationMessage(`Noveler: ${message}`);
    }
}
