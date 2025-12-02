/**
 * 输入验证和清理工具
 */

import { MAX_CHARACTER_NAME_LENGTH, MAX_CHAPTER_NAME_LENGTH } from '../constants';

/**
 * 清理文件名中的非法字符
 * @param name 原始文件名
 * @returns 清理后的文件名
 */
export function sanitizeFileName(name: string): string {
    // 移除文件系统不允许的字符: / \ : * ? " < > |
    let sanitized = name.replace(/[/\\:*?"<>|]/g, '');

    // 移除前后空格
    sanitized = sanitized.trim();

    // 如果清理后为空，返回默认值
    if (sanitized.length === 0) {
        return '未命名';
    }

    // 限制文件名长度（大多数文件系统限制为 255 字符，减去扩展名和编号前缀）
    if (sanitized.length > MAX_CHAPTER_NAME_LENGTH) {
        sanitized = sanitized.substring(0, MAX_CHAPTER_NAME_LENGTH);
    }

    return sanitized;
}

/**
 * 验证并清理章节名称
 * @param chapterName 原始章节名称
 * @returns 清理后的章节名称，如果无效返回 null
 */
export function validateChapterName(chapterName: string | undefined): string | null {
    if (!chapterName) {
        return null;
    }

    const sanitized = sanitizeFileName(chapterName);

    // 如果清理后是默认值且原始输入不为空，说明输入全是非法字符
    if (sanitized === '未命名' && chapterName.trim().length > 0) {
        return null;
    }

    return sanitized;
}

/**
 * 验证并清理人物名称
 * @param characterName 原始人物名称
 * @returns 清理后的人物名称，如果无效返回 null
 */
export function validateCharacterName(characterName: string | undefined): string | null {
    if (!characterName) {
        return null;
    }

    const sanitized = sanitizeFileName(characterName);

    // 人物名称不应该太长
    if (sanitized.length > MAX_CHARACTER_NAME_LENGTH) {
        return null;
    }

    // 如果清理后是默认值且原始输入不为空，说明输入全是非法字符
    if (sanitized === '未命名' && characterName.trim().length > 0) {
        return null;
    }

    return sanitized;
}
