/**
 * Front Matter 处理助手
 */

import * as vscode from 'vscode';
import matter = require('gray-matter');
import { formatDateTime } from './dateFormatter';

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
            const updatedContent = matter.stringify(parsed.content, parsed.data);

            // 替换整个文档
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            edits.push(vscode.TextEdit.replace(fullRange, updatedContent));
        }

        return edits;
    } catch (error) {
        console.error('Noveler: Front Matter 更新失败', error);
        return edits;
    }
}

/**
 * 从文档中提取 Front Matter 数据
 * @param document 文档对象
 * @returns Front Matter 数据对象
 */
export function extractFrontMatter(document: vscode.TextDocument): any {
    try {
        const text = document.getText();
        const parsed = matter(text);
        return parsed.data || {};
    } catch (error) {
        console.error('Noveler: Front Matter 解析失败', error);
        return {};
    }
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
        console.error('Noveler: Front Matter 解析失败', error);
        return document.getText();
    }
}
