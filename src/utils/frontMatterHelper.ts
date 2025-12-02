/**
 * Front Matter 处理助手
 */

import * as vscode from 'vscode';
import matter from 'gray-matter';
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
        // 使用 gray-matter 解析文档
        const parsed = matter(text);

        // 如果没有 Front Matter，不处理
        if (!parsed.data || Object.keys(parsed.data).length === 0) {
            return edits;
        }

        // 更新字段
        let hasChanges = false;

        if (parsed.data.wordCount !== undefined) {
            parsed.data.wordCount = wordCount;
            hasChanges = true;
        }

        if (parsed.data.modified !== undefined) {
            parsed.data.modified = formatDateTime(new Date());
            hasChanges = true;
        }

        // 如果有变化，使用 gray-matter 重新序列化
        if (hasChanges) {
            // 将 Front Matter 中的空字符串转为引号包裹的空字符串
            const cleanedData = { ...parsed.data };
            for (const key in cleanedData) {
                if (cleanedData[key] === "" || cleanedData[key] === null) {
                    cleanedData[key] = "";
                }
            }

            const updatedContent = matter.stringify(parsed.content, cleanedData);

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
        const parsed = matter(text);
        return parsed.data || {};
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
        const parsed = matter(text);
        return parsed.content || text;
    } catch (error) {
        Logger.error('Front Matter 解析失败', error);
        return document.getText();
    }
}
