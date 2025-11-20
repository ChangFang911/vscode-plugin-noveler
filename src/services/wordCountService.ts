import * as vscode from 'vscode';
import { getContentWithoutFrontMatter } from '../utils/frontMatterHelper';
import {
    HTML_COMMENT_REGEX,
    CHINESE_CHARS_REGEX,
    ENGLISH_WORD_REGEX
} from '../constants';

export interface WordCountStats {
    totalChars: number;      // 总字符数（含标点）
    chineseChars: number;    // 中文字符数（含中文标点）
    words: number;           // 英文单词数
    paragraphs: number;      // 段落数
    lines: number;           // 行数
}

export class WordCountService {
    getWordCount(document: vscode.TextDocument): WordCountStats {
        // 使用统一的 Front Matter 处理函数
        const text = getContentWithoutFrontMatter(document);

        // 移除 HTML 注释
        const textWithoutComments = text.replace(HTML_COMMENT_REGEX, '');

        // 移除 Markdown 标题行（整行，包括标题标记和标题文字）
        // 这样标题文字就不会被计入字数
        const textLines = textWithoutComments.split('\n');
        const contentLines = textLines.filter(line => !line.trim().match(/^#+\s+/));
        const textWithoutHeaders = contentLines.join('\n');

        // 按照网文字数计数标准：
        // 1. 中文字符（包括中文标点）：每个算 1 字
        // 2. 英文字母、数字、英文标点：每个算 1 字
        // 3. 空格、换行、制表符：不算

        // 计算中文字符数（包括中文标点）
        const chineseChars = (textWithoutHeaders.match(CHINESE_CHARS_REGEX) || []).length;

        // 计算总字符数（网文标准）= 排除空白字符后的所有字符
        // 这包括：中文字符、中文标点、英文字母、数字、英文标点等
        const totalChars = textWithoutHeaders.replace(/[\s]/g, '').length;

        // 计算英文单词数
        const words = (textWithoutHeaders.match(ENGLISH_WORD_REGEX) || []).length;

        // 计算段落数（非空行）
        const paragraphs = textWithoutHeaders
            .split('\n')
            .filter(line => line.trim().length > 0).length;

        // 计算行数（原始文档）
        const lineCount = document.lineCount;

        return {
            totalChars,
            chineseChars,
            words,
            paragraphs,
            lines: lineCount
        };
    }

    // 获取选中文本的字数
    getSelectionWordCount(selection: string): WordCountStats {
        // 移除 HTML 注释
        const textWithoutComments = selection.replace(HTML_COMMENT_REGEX, '');

        // 移除 Markdown 标题行（整行，包括标题标记和标题文字）
        const textLines = textWithoutComments.split('\n');
        const contentLines = textLines.filter(line => !line.trim().match(/^#+\s+/));
        const textWithoutHeaders = contentLines.join('\n');

        // 计算字数（与 getWordCount 逻辑一致）
        const chineseChars = (textWithoutHeaders.match(CHINESE_CHARS_REGEX) || []).length;
        const totalChars = textWithoutHeaders.replace(/[\s]/g, '').length;
        const words = (textWithoutHeaders.match(ENGLISH_WORD_REGEX) || []).length;
        const paragraphs = textWithoutHeaders.split('\n').filter(line => line.trim().length > 0).length;
        const selectionLines = selection.split('\n').length;

        return {
            totalChars,
            chineseChars,
            words,
            paragraphs,
            lines: selectionLines
        };
    }
}
