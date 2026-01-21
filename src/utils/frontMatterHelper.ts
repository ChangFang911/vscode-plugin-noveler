/**
 * Front Matter 处理助手
 */

import * as vscode from 'vscode';
import { parseFrontMatter, stringifyFrontMatter } from './frontMatterParser';
import { formatDateTime } from './dateFormatter';
import { ChapterFrontMatter, CharacterFrontMatter, GenericFrontMatter } from '../types/frontMatter';
import { Logger } from './logger';

/**
 * 更新文档的 Front Matter
 * @param document 文档对象
 * @param wordCount 新的字数
 * @returns 编辑数组
 */
export function updateFrontMatter(
    document: vscode.TextDocument,
    wordCount: number
): vscode.TextEdit[] {
    const edits: vscode.TextEdit[] = [];
    const text = document.getText();

    try {
        // 解析文档
        const parsed = parseFrontMatter(text);

        // 如果没有 Front Matter，不处理
        if (parsed.isEmpty || Object.keys(parsed.data).length === 0) {
            return edits;
        }

        // 更新字段
        let hasChanges = false;
        const data = parsed.data as Record<string, unknown>;

        if (data.wordCount !== undefined) {
            data.wordCount = wordCount;
            hasChanges = true;
        }

        if (data.modified !== undefined) {
            data.modified = formatDateTime(new Date());
            hasChanges = true;
        }

        // 如果有变化，重新序列化
        if (hasChanges) {
            const updatedContent = stringifyFrontMatter(parsed.content, data);

            // 替换整个文档
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            edits.push(vscode.TextEdit.replace(fullRange, updatedContent));
        }

        return edits;
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        Logger.error('Front Matter 更新失败', error);
        vscode.window.showWarningMessage(`Noveler: 无法更新文档元数据 - ${errorMsg}`);
        return edits;
    }
}

/**
 * 从文档中提取 Front Matter 数据
 * @param document 文档对象
 * @returns Front Matter 数据对象
 */
export function extractFrontMatter(document: vscode.TextDocument): GenericFrontMatter {
    try {
        const text = document.getText();
        const parsed = parseFrontMatter(text);
        return (parsed.data || {}) as GenericFrontMatter;
    } catch (error) {
        Logger.error('Front Matter 解析失败', error);
        return {};
    }
}

/**
 * 从文档中提取章节 Front Matter
 * @param document 文档对象
 * @returns 章节 Front Matter 数据对象（部分属性）
 */
export function extractChapterFrontMatter(document: vscode.TextDocument): Partial<ChapterFrontMatter> {
    return extractFrontMatter(document) as Partial<ChapterFrontMatter>;
}

/**
 * 从文档中提取人物 Front Matter
 * @param document 文档对象
 * @returns 人物 Front Matter 数据对象（部分属性）
 */
export function extractCharacterFrontMatter(document: vscode.TextDocument): Partial<CharacterFrontMatter> {
    return extractFrontMatter(document) as Partial<CharacterFrontMatter>;
}

/**
 * 获取文档正文内容（不包括 Front Matter）
 * @param document 文档对象
 * @returns 正文内容
 */
export function getContentWithoutFrontMatter(document: vscode.TextDocument): string {
    try {
        const text = document.getText();
        const parsed = parseFrontMatter(text);
        return parsed.content || text;
    } catch (error) {
        Logger.error('Front Matter 解析失败', error);
        return document.getText();
    }
}

/**
 * 提取不包含 frontmatter 的正文内容（用于文本匹配）
 *
 * 此函数不依赖 gray-matter，直接解析 YAML front matter 标记，
 * 用于需要获取偏移量的场景（如高亮、敏感词检测）
 *
 * @param text 完整文档文本
 * @returns 包含正文内容和偏移量的对象
 *
 * @example
 * ```typescript
 * const text = `---
 * title: Hello
 * ---
 *
 * Content here`;
 *
 * const { text: content, offset } = extractContentWithoutFrontmatterForMatching(text);
 * // content: "Content here"
 * // offset: 文档中正文开始的字符位置
 * ```
 */
export function extractContentWithoutFrontmatterForMatching(text: string): { text: string; offset: number } {
    // 检测是否有 frontmatter (以 --- 开头)
    if (!text.startsWith('---')) {
        return { text, offset: 0 };
    }

    // 查找第二个 --- 的位置
    const secondDelimiterIndex = text.indexOf('\n---', 3);

    if (secondDelimiterIndex === -1) {
        // 没有找到结束的 ---，说明 frontmatter 格式不完整
        return { text, offset: 0 };
    }

    // frontmatter 结束位置（包含换行符）
    const frontmatterEnd = secondDelimiterIndex + 4; // "\n---".length = 4

    // 跳过 frontmatter 后的换行符
    let contentStart = frontmatterEnd;
    while (contentStart < text.length && (text[contentStart] === '\n' || text[contentStart] === '\r')) {
        contentStart++;
    }

    // 返回正文内容和偏移量
    return {
        text: text.substring(contentStart),
        offset: contentStart
    };
}

/**
 * 获取 frontmatter 结束位置的偏移量（用于跳过 frontmatter 区域）
 *
 * @param text 文档文本
 * @returns frontmatter 结束位置，如果没有 frontmatter 则返回 0
 *
 * @example
 * ```typescript
 * const text = `---
 * title: Hello
 * ---
 *
 * Content`;
 *
 * const offset = getFrontmatterEndOffsetForMatching(text);
 * // offset: 正文开始的字符位置
 * ```
 */
export function getFrontmatterEndOffsetForMatching(text: string): number {
    const { offset } = extractContentWithoutFrontmatterForMatching(text);
    return offset;
}
