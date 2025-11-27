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
    /**
     * 静态方法：简单字数统计（仅计算中文字符 + 英文单词）
     * 用于 ProjectStatsService 和 NovelerViewProvider
     * @param text 要统计的文本（应该已经移除 Front Matter 和 HTML 注释）
     * @returns 字数
     */
    public static getSimpleWordCount(text: string): number {
        // 移除 HTML 注释
        text = text.replace(HTML_COMMENT_REGEX, '');

        // 统计中文字符
        const chineseChars = text.match(CHINESE_CHARS_REGEX);
        const chineseCount = chineseChars ? chineseChars.length : 0;

        // 统计英文单词
        const englishWords = text.match(ENGLISH_WORD_REGEX);
        const englishCount = englishWords ? englishWords.length : 0;

        return chineseCount + englishCount;
    }

    /**
     * 核心字数统计逻辑（私有方法）
     * 避免在 getWordCount 和 getSelectionWordCount 中重复代码
     */
    private calculateStats(text: string, lineCount: number): WordCountStats {
        // 移除 HTML 注释
        const textWithoutComments = text.replace(HTML_COMMENT_REGEX, '');

        // 移除 Markdown 标题行（整行，包括标题标记和标题文字）
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
        const totalChars = textWithoutHeaders.replace(/[\s]/g, '').length;

        // 计算英文单词数
        const words = (textWithoutHeaders.match(ENGLISH_WORD_REGEX) || []).length;

        // 计算段落数（非空行）
        const paragraphs = textWithoutHeaders
            .split('\n')
            .filter(line => line.trim().length > 0).length;

        return {
            totalChars,
            chineseChars,
            words,
            paragraphs,
            lines: lineCount
        };
    }

    getWordCount(document: vscode.TextDocument): WordCountStats {
        // 使用统一的 Front Matter 处理函数
        const text = getContentWithoutFrontMatter(document);
        return this.calculateStats(text, document.lineCount);
    }

    // 获取选中文本的字数
    getSelectionWordCount(selection: string): WordCountStats {
        const selectionLines = selection.split('\n').length;
        return this.calculateStats(selection, selectionLines);
    }
}
