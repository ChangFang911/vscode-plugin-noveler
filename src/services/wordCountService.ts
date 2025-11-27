import * as vscode from 'vscode';
import { getContentWithoutFrontMatter } from '../utils/frontMatterHelper';
import {
    HTML_COMMENT_REGEX,
    ENGLISH_WORD_REGEX
} from '../constants';

export interface WordCountStats {
    totalChars: number;      // 总字符数（正文 + 标点）
    contentChars: number;    // 正文字数（中文汉字 + 英文字母，不含标点）
    chineseChars: number;    // 中文汉字数（不含中文标点）
    punctuation: number;     // 标点符号数（中文标点 + 英文标点）
    words: number;           // 英文单词数
    paragraphs: number;      // 段落数
    lines: number;           // 行数
}

export class WordCountService {
    /**
     * 静态方法：简单字数统计（返回总字数 = 正文 + 标点）
     * 用于 ProjectStatsService 和 NovelerViewProvider
     * @param text 要统计的文本（应该已经移除 Front Matter 和 HTML 注释）
     * @param excludeHeaders 是否排除 Markdown 标题（默认 true）
     * @returns 总字数
     */
    public static getSimpleWordCount(text: string, excludeHeaders: boolean = true): number {
        const stats = WordCountService.getDetailedStats(text, excludeHeaders);
        return stats.content + stats.punctuation;
    }

    /**
     * 静态方法：详细字数统计（返回正文和标点的详细信息）
     * 用于 NovelerViewProvider 的 hover tooltip
     * @param text 要统计的文本（应该已经移除 Front Matter 和 HTML 注释）
     * @param excludeHeaders 是否排除 Markdown 标题（默认 true）
     * @returns { content: 正文字数, punctuation: 标点数 }
     */
    public static getDetailedStats(text: string, excludeHeaders: boolean = true): { content: number; punctuation: number } {
        // 移除 HTML 注释
        let processedText = text.replace(HTML_COMMENT_REGEX, '');

        // 根据参数决定是否移除 Markdown 标题行
        if (excludeHeaders) {
            const textLines = processedText.split('\n');
            const contentLines = textLines.filter(line => !line.trim().match(/^#+\s+/));
            processedText = contentLines.join('\n');
        }

        // 移除所有空格（包括全角空格和半角空格）
        const textWithoutSpaces = processedText.replace(/[\s\u3000]/g, '');

        // 统计中文汉字（不含标点）
        const chineseCharsOnly = (textWithoutSpaces.match(/[\u4e00-\u9fa5]/g) || []).length;

        // 统计中文标点符号（包含通用标点符号区）
        const chinesePunctuation = (textWithoutSpaces.match(/[\u3000-\u303f\uff00-\uffef\u2000-\u206f]/g) || []).length;

        // 统计英文字母和数字（不含标点）
        const englishChars = (textWithoutSpaces.match(/[a-zA-Z0-9]/g) || []).length;

        // 统计英文标点符号
        const englishPunctuation = (textWithoutSpaces.match(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g) || []).length;

        // 正文字数 = 中文汉字 + 英文字母和数字
        const content = chineseCharsOnly + englishChars;

        // 标点符号数 = 中文标点 + 英文标点
        const punctuation = chinesePunctuation + englishPunctuation;

        return { content, punctuation };
    }

    /**
     * 核心字数统计逻辑（私有方法）
     * @param text 要统计的文本
     * @param lineCount 行数
     * @param excludeHeaders 是否排除 Markdown 标题（true: 仅统计正文，false: 统计所有内容）
     */
    private calculateStats(text: string, lineCount: number, excludeHeaders: boolean = true): WordCountStats {
        // 复用 getDetailedStats 获取基础统计
        const detailedStats = WordCountService.getDetailedStats(text, excludeHeaders);

        // 处理文本用于额外的统计（段落数、英文单词数）
        let processedText = text.replace(HTML_COMMENT_REGEX, '');
        if (excludeHeaders) {
            const textLines = processedText.split('\n');
            const contentLines = textLines.filter(line => !line.trim().match(/^#+\s+/));
            processedText = contentLines.join('\n');
        }

        // 统计英文单词数
        const words = (processedText.match(ENGLISH_WORD_REGEX) || []).length;

        // 计算段落数（非空行）
        const paragraphs = processedText
            .split('\n')
            .filter(line => line.trim().length > 0).length;

        // 统计中文汉字数（用于 chineseChars 字段）
        const textWithoutSpaces = processedText.replace(/[\s\u3000]/g, '');
        const chineseCharsOnly = (textWithoutSpaces.match(/[\u4e00-\u9fa5]/g) || []).length;

        return {
            totalChars: detailedStats.content + detailedStats.punctuation,
            contentChars: detailedStats.content,
            chineseChars: chineseCharsOnly,
            punctuation: detailedStats.punctuation,
            words,
            paragraphs,
            lines: lineCount
        };
    }

    getWordCount(document: vscode.TextDocument): WordCountStats {
        // 使用统一的 Front Matter 处理函数
        const text = getContentWithoutFrontMatter(document);
        // 文档统计：排除标题，仅统计正文
        return this.calculateStats(text, document.lineCount, true);
    }

    // 获取选中文本的字数
    getSelectionWordCount(selection: string): WordCountStats {
        const selectionLines = selection.split('\n').length;
        // 选中文本统计：不排除标题，统计所有选中内容
        return this.calculateStats(selection, selectionLines, false);
    }
}
