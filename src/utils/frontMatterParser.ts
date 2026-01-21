/**
 * Front Matter 解析器
 * 轻量级替代 gray-matter 库
 */

import YAML from 'yaml';

/**
 * 解析结果类型
 */
export interface ParsedFrontMatter<T = Record<string, unknown>> {
    /** Front Matter 数据 */
    data: T;
    /** 正文内容 */
    content: string;
    /** 原始 Front Matter 字符串 */
    matter: string;
    /** 是否为空（无 Front Matter） */
    isEmpty: boolean;
}

/**
 * 解析带 Front Matter 的文本
 *
 * @param text 包含 Front Matter 的文本
 * @returns 解析结果，包含 data（YAML 数据）和 content（正文）
 *
 * @example
 * ```typescript
 * const result = parseFrontMatter(`---
 * title: Hello
 * count: 100
 * ---
 *
 * Content here`);
 *
 * console.log(result.data);    // { title: 'Hello', count: 100 }
 * console.log(result.content); // '\nContent here'
 * ```
 */
export function parseFrontMatter<T = Record<string, unknown>>(text: string): ParsedFrontMatter<T> {
    const defaultResult: ParsedFrontMatter<T> = {
        data: {} as T,
        content: text,
        matter: '',
        isEmpty: true
    };

    // 检查是否以 --- 开头
    if (!text.startsWith('---')) {
        return defaultResult;
    }

    // 查找第二个 --- 的位置
    const secondDelimiterIndex = text.indexOf('\n---', 3);
    if (secondDelimiterIndex === -1) {
        return defaultResult;
    }

    // 提取 Front Matter 字符串（不包含分隔符）
    const matterString = text.slice(4, secondDelimiterIndex);

    // 计算正文开始位置
    let contentStart = secondDelimiterIndex + 4; // '\n---'.length = 4

    // 跳过紧随其后的换行符
    if (text[contentStart] === '\n') {
        contentStart++;
    } else if (text[contentStart] === '\r' && text[contentStart + 1] === '\n') {
        contentStart += 2;
    }

    // 解析 YAML
    let data: T;
    try {
        data = (YAML.parse(matterString) || {}) as T;
    } catch {
        // YAML 解析失败，返回空数据
        return defaultResult;
    }

    return {
        data,
        content: text.slice(contentStart),
        matter: matterString,
        isEmpty: false
    };
}

/**
 * 将数据和正文序列化为带 Front Matter 的文本
 *
 * @param content 正文内容
 * @param data Front Matter 数据
 * @returns 带 Front Matter 的完整文本
 *
 * @example
 * ```typescript
 * const text = stringifyFrontMatter('Hello World', { title: 'Test', count: 100 });
 * // ---
 * // title: Test
 * // count: 100
 * // ---
 * // Hello World
 * ```
 */
export function stringifyFrontMatter(content: string, data: Record<string, unknown>): string {
    // 处理空值，将 null 和空字符串保持为空字符串
    const cleanedData: Record<string, unknown> = {};
    for (const key in data) {
        const value = data[key];
        if (value === null || value === undefined) {
            cleanedData[key] = '';
        } else {
            cleanedData[key] = value;
        }
    }

    // 序列化 YAML
    const yamlString = YAML.stringify(cleanedData, {
        lineWidth: 0, // 不自动换行
        nullStr: '""' // null 显示为空字符串
    }).trim();

    // 组合结果
    return `---\n${yamlString}\n---\n${content}`;
}
