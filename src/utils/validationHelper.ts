/**
 * 输入验证辅助函数
 */

import { ValidationError } from './errorHelper';

/**
 * 验证规则接口
 */
export interface ValidationRule<T> {
    validate: (value: T) => boolean;
    message: string;
}

/**
 * 字符串验证器
 */
export class StringValidator {
    private rules: ValidationRule<string>[] = [];

    /**
     * 要求非空
     */
    required(message = '此字段不能为空'): this {
        this.rules.push({
            validate: (value) => value !== null && value !== undefined && value.trim() !== '',
            message
        });
        return this;
    }

    /**
     * 最小长度
     */
    minLength(min: number, message?: string): this {
        this.rules.push({
            validate: (value) => value.length >= min,
            message: message || `长度不能少于 ${min} 个字符`
        });
        return this;
    }

    /**
     * 最大长度
     */
    maxLength(max: number, message?: string): this {
        this.rules.push({
            validate: (value) => value.length <= max,
            message: message || `长度不能超过 ${max} 个字符`
        });
        return this;
    }

    /**
     * 匹配正则表达式
     */
    pattern(regex: RegExp, message: string): this {
        this.rules.push({
            validate: (value) => regex.test(value),
            message
        });
        return this;
    }

    /**
     * 自定义验证规则
     */
    custom(validate: (value: string) => boolean, message: string): this {
        this.rules.push({ validate, message });
        return this;
    }

    /**
     * 执行验证
     */
    validate(value: string, fieldName = '输入'): void {
        for (const rule of this.rules) {
            if (!rule.validate(value)) {
                throw new ValidationError(`${fieldName}: ${rule.message}`, fieldName);
            }
        }
    }
}

/**
 * 数字验证器
 */
export class NumberValidator {
    private rules: ValidationRule<number>[] = [];

    /**
     * 最小值
     */
    min(min: number, message?: string): this {
        this.rules.push({
            validate: (value) => value >= min,
            message: message || `值不能小于 ${min}`
        });
        return this;
    }

    /**
     * 最大值
     */
    max(max: number, message?: string): this {
        this.rules.push({
            validate: (value) => value <= max,
            message: message || `值不能大于 ${max}`
        });
        return this;
    }

    /**
     * 必须是整数
     */
    integer(message = '必须是整数'): this {
        this.rules.push({
            validate: (value) => Number.isInteger(value),
            message
        });
        return this;
    }

    /**
     * 必须是正数
     */
    positive(message = '必须是正数'): this {
        this.rules.push({
            validate: (value) => value > 0,
            message
        });
        return this;
    }

    /**
     * 自定义验证规则
     */
    custom(validate: (value: number) => boolean, message: string): this {
        this.rules.push({ validate, message });
        return this;
    }

    /**
     * 执行验证
     */
    validate(value: number, fieldName = '数字'): void {
        for (const rule of this.rules) {
            if (!rule.validate(value)) {
                throw new ValidationError(`${fieldName}: ${rule.message}`, fieldName);
            }
        }
    }
}

/**
 * 章节标题验证器
 */
export function validateChapterTitle(title: string): void {
    new StringValidator()
        .required('章节标题不能为空')
        .minLength(1, '章节标题至少需要 1 个字符')
        .maxLength(100, '章节标题不能超过 100 个字符')
        .pattern(/^[^\\/:\*\?"<>\|]+$/, '章节标题不能包含特殊字符 \\ / : * ? " < > |')
        .validate(title, '章节标题');
}

/**
 * 卷标题验证器
 */
export function validateVolumeTitle(title: string): void {
    new StringValidator()
        .required('卷标题不能为空')
        .minLength(1, '卷标题至少需要 1 个字符')
        .maxLength(50, '卷标题不能超过 50 个字符')
        .pattern(/^[^\\/:\*\?"<>\|]+$/, '卷标题不能包含特殊字符 \\ / : * ? " < > |')
        .validate(title, '卷标题');
}

/**
 * 章节编号验证器
 */
export function validateChapterNumber(num: number): void {
    new NumberValidator()
        .integer('章节编号必须是整数')
        .positive('章节编号必须是正数')
        .validate(num, '章节编号');
}

/**
 * 目标字数验证器
 */
export function validateTargetWords(words: number): void {
    new NumberValidator()
        .integer('目标字数必须是整数')
        .min(0, '目标字数不能为负数')
        .max(100000, '目标字数不能超过 100000')
        .validate(words, '目标字数');
}

/**
 * 安全的文件名（移除非法字符）
 */
export function sanitizeFileName(name: string): string {
    return name
        .replace(/[\\/:*?"<>|]/g, '') // 移除非法字符
        .replace(/\s+/g, ' ')          // 规范化空白
        .trim();
}

/**
 * 验证文件路径格式
 */
export function validateFilePath(filePath: string): void {
    new StringValidator()
        .required('文件路径不能为空')
        .custom(
            (path) => !path.includes('..'),
            '文件路径不能包含 ..'
        )
        .validate(filePath, '文件路径');
}
