/**
 * 错误处理辅助函数
 */

import * as vscode from 'vscode';
import { Logger } from './logger';

/**
 * 自定义错误类型
 */
export class NovelerError extends Error {
    constructor(
        message: string,
        public readonly code: string,
        public readonly cause?: unknown
    ) {
        super(message);
        this.name = 'NovelerError';
    }
}

/**
 * 用户取消操作错误
 */
export class UserCancelledError extends NovelerError {
    constructor(message = '用户取消了操作') {
        super(message, 'USER_CANCELLED');
        this.name = 'UserCancelledError';
    }
}

/**
 * 配置错误
 */
export class ConfigError extends NovelerError {
    constructor(message: string, cause?: unknown) {
        super(message, 'CONFIG_ERROR', cause);
        this.name = 'ConfigError';
    }
}

/**
 * 文件操作错误
 */
export class FileError extends NovelerError {
    constructor(
        message: string,
        public readonly filePath: string,
        cause?: unknown
    ) {
        super(message, 'FILE_ERROR', cause);
        this.name = 'FileError';
    }
}

/**
 * 验证错误
 */
export class ValidationError extends NovelerError {
    constructor(message: string, public readonly field?: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

/**
 * 处理错误并显示给用户
 * @param error 错误对象
 * @param context 错误上下文描述
 */
export async function handleError(error: unknown, context?: string): Promise<void> {
    // 用户取消操作不显示错误
    if (error instanceof UserCancelledError) {
        Logger.debug(`用户取消操作: ${context || ''}`);
        return;
    }

    let message: string;

    if (error instanceof NovelerError) {
        message = error.message;
        Logger.error(`[${error.code}] ${context || '操作失败'}`, error.cause || error);
    } else if (error instanceof Error) {
        message = error.message;
        Logger.error(context || '操作失败', error);
    } else {
        message = String(error);
        Logger.error(context || '操作失败', error);
    }

    // 构建完整的错误消息
    const fullMessage = context ? `${context}: ${message}` : message;

    await vscode.window.showErrorMessage(fullMessage);
}

/**
 * 包装异步操作，统一处理错误
 * @param operation 要执行的操作
 * @param context 错误上下文
 */
export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    context: string
): Promise<T | undefined> {
    try {
        return await operation();
    } catch (error) {
        await handleError(error, context);
        return undefined;
    }
}

/**
 * 确保值不为 null/undefined，否则抛出错误
 * @param value 要检查的值
 * @param errorMessage 错误消息
 */
export function assertDefined<T>(value: T | null | undefined, errorMessage: string): asserts value is T {
    if (value === null || value === undefined) {
        throw new ValidationError(errorMessage);
    }
}

/**
 * 安全地解析 JSON，失败时返回默认值
 * @param json JSON 字符串
 * @param defaultValue 默认值
 */
export function safeParseJSON<T>(json: string, defaultValue: T): T {
    try {
        return JSON.parse(json) as T;
    } catch (error) {
        Logger.warn('JSON 解析失败，使用默认值', error);
        return defaultValue;
    }
}

/**
 * 重试操作
 * @param operation 要重试的操作
 * @param maxRetries 最大重试次数
 * @param delayMs 重试延迟（毫秒）
 */
export async function retry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000
): Promise<T> {
    let lastError: unknown;

    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            Logger.debug(`操作失败，重试 ${i + 1}/${maxRetries}`, error);

            if (i < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    throw lastError;
}

/**
 * 检查字符串是否为空（null, undefined 或纯空白）
 */
export function isEmptyString(str: unknown): boolean {
    return str === null ||
           str === undefined ||
           (typeof str === 'string' && str.trim() === '');
}

/**
 * 验证字符串不为空
 * @param value 要验证的值
 * @param fieldName 字段名称
 */
export function validateNonEmpty(value: unknown, fieldName: string): asserts value is string {
    if (isEmptyString(value)) {
        throw new ValidationError(`${fieldName}不能为空`);
    }
}
