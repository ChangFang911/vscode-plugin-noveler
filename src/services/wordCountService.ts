import * as vscode from 'vscode';
import { getContentWithoutFrontMatter } from '../utils/frontMatterHelper';
import {
    HTML_COMMENT_REGEX,
    ENGLISH_WORD_REGEX
} from '../constants';

/**
 * 字数统计结果接口
 * 包含文档的完整统计信息
 */
export interface WordCountStats {
    /** 总字符数（正文 + 标点符号） */
    totalChars: number;
    /** 正文字数（中文汉字 + 英文字母，不含标点） */
    contentChars: number;
    /** 中文汉字数（不含中文标点符号） */
    chineseChars: number;
    /** 标点符号数（中文标点 + 英文标点） */
    punctuation: number;
    /** 英文单词数 */
    words: number;
    /** 段落数（非空行） */
    paragraphs: number;
    /** 总行数 */
    lines: number;
}

/**
 * 字数统计服务类
 * 提供多种字数统计功能，支持缓存机制提升性能
 *
 * 统计规则：
 * - 自动移除 Front Matter 和 HTML 注释
 * - 可选择是否排除 Markdown 标题
 * - 区分正文（中文汉字+英文字母）和标点符号
 * - 支持全文统计和选中文本统计
 *
 * @example
 * ```typescript
 * const service = new WordCountService();
 * const stats = service.getWordCount(document);
 * console.log(`总字数: ${stats.totalChars}`);
 * ```
 */
export class WordCountService {
    // 缓存：存储文档 URI 到统计结果的映射
    private cache = new Map<string, { stats: WordCountStats; version: number }>();

    // 预编译的正则表达式（静态成员，所有实例共享）
    private static readonly HEADER_REGEX = /^#+\s+/;
    private static readonly SPACE_REGEX = /[\s\u3000]/g;
    private static readonly CHINESE_CHARS_REGEX = /[\u4e00-\u9fa5]/g;
    private static readonly CHINESE_PUNCTUATION_REGEX = /[\u3000-\u303f\uff00-\uffef\u2000-\u206f]/g;
    private static readonly ENGLISH_CHARS_REGEX = /[a-zA-Z0-9]/g;
    private static readonly ENGLISH_PUNCTUATION_REGEX = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g;

    /**
     * 静态方法：简单字数统计（返回总字数 = 正文 + 标点）
     * 用于 ProjectStatsService 和 NovelerViewProvider
     *
     * @param text 要统计的文本（应该已经移除 Front Matter 和 HTML 注释）
     * @param excludeHeaders 是否排除 Markdown 标题（默认 true）
     * @returns 总字数（正文 + 标点符号）
     *
     * @example
     * ```typescript
     * const text = "这是一段测试文本。";
     * const wordCount = WordCountService.getSimpleWordCount(text);
     * console.log(wordCount); // 输出: 9
     * ```
     */
    public static getSimpleWordCount(text: string, excludeHeaders = true): number {
        const stats = WordCountService.getDetailedStats(text, excludeHeaders);
        return stats.content + stats.punctuation;
    }

    /**
     * 静态方法：详细字数统计（返回正文和标点的详细信息）
     * 用于 NovelerViewProvider 的 hover tooltip
     *
     * @param text 要统计的文本（应该已经移除 Front Matter 和 HTML 注释）
     * @param excludeHeaders 是否排除 Markdown 标题（默认 true）
     * @returns 包含正文字数和标点数的对象
     *
     * @example
     * ```typescript
     * const text = "这是一段测试文本。";
     * const stats = WordCountService.getDetailedStats(text);
     * console.log(stats); // { content: 8, punctuation: 1 }
     * ```
     */
    public static getDetailedStats(text: string, excludeHeaders = true): { content: number; punctuation: number } {
        // 移除 HTML 注释
        let processedText = text.replace(HTML_COMMENT_REGEX, '');

        // 根据参数决定是否移除 Markdown 标题行
        if (excludeHeaders) {
            const textLines = processedText.split('\n');
            const contentLines = textLines.filter(line => !line.trim().match(WordCountService.HEADER_REGEX));
            processedText = contentLines.join('\n');
        }

        // 移除所有空格（包括全角空格和半角空格）
        const textWithoutSpaces = processedText.replace(WordCountService.SPACE_REGEX, '');

        // 统计中文汉字（不含标点）
        const chineseCharsOnly = (textWithoutSpaces.match(WordCountService.CHINESE_CHARS_REGEX) || []).length;

        // 统计中文标点符号（包含通用标点符号区）
        const chinesePunctuation = (textWithoutSpaces.match(WordCountService.CHINESE_PUNCTUATION_REGEX) || []).length;

        // 统计英文字母和数字（不含标点）
        const englishChars = (textWithoutSpaces.match(WordCountService.ENGLISH_CHARS_REGEX) || []).length;

        // 统计英文标点符号
        const englishPunctuation = (textWithoutSpaces.match(WordCountService.ENGLISH_PUNCTUATION_REGEX) || []).length;

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
    private calculateStats(text: string, lineCount: number, excludeHeaders = true): WordCountStats {
        // 复用 getDetailedStats 获取基础统计
        const detailedStats = WordCountService.getDetailedStats(text, excludeHeaders);

        // 处理文本用于额外的统计（段落数、英文单词数）
        let processedText = text.replace(HTML_COMMENT_REGEX, '');
        if (excludeHeaders) {
            const textLines = processedText.split('\n');
            const contentLines = textLines.filter(line => !line.trim().match(WordCountService.HEADER_REGEX));
            processedText = contentLines.join('\n');
        }

        // 统计英文单词数
        const words = (processedText.match(ENGLISH_WORD_REGEX) || []).length;

        // 计算段落数（非空行）
        const paragraphs = processedText
            .split('\n')
            .filter(line => line.trim().length > 0).length;

        // 统计中文汉字数（用于 chineseChars 字段）
        const textWithoutSpaces = processedText.replace(WordCountService.SPACE_REGEX, '');
        const chineseCharsOnly = (textWithoutSpaces.match(WordCountService.CHINESE_CHARS_REGEX) || []).length;

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

    /**
     * 获取文档的完整字数统计
     * 自动使用缓存机制，如果文档版本未变化则返回缓存结果
     *
     * @param document VSCode 文档对象
     * @returns 完整的字数统计结果
     *
     * @example
     * ```typescript
     * const service = new WordCountService();
     * const stats = service.getWordCount(editor.document);
     * vscode.window.showInformationMessage(
     *     `总字数: ${stats.totalChars}, 正文: ${stats.contentChars}`
     * );
     * ```
     */
    getWordCount(document: vscode.TextDocument): WordCountStats {
        const uri = document.uri.toString();
        const cached = this.cache.get(uri);

        // 如果文档版本未变化，返回缓存
        if (cached && cached.version === document.version) {
            return cached.stats;
        }

        // 使用统一的 Front Matter 处理函数
        const text = getContentWithoutFrontMatter(document);
        // 文档统计：排除标题，仅统计正文
        const stats = this.calculateStats(text, document.lineCount, true);

        // 更新缓存
        this.cache.set(uri, { stats, version: document.version });

        return stats;
    }

    /**
     * 获取选中文本的字数统计
     * 注意：选中文本统计不排除标题，统计所有选中内容
     *
     * @param selection 选中的文本内容
     * @returns 选中文本的完整统计结果
     *
     * @example
     * ```typescript
     * const service = new WordCountService();
     * const selectedText = editor.document.getText(editor.selection);
     * const stats = service.getSelectionWordCount(selectedText);
     * console.log(`选中文本: ${stats.totalChars} 字`);
     * ```
     */
    getSelectionWordCount(selection: string): WordCountStats {
        const selectionLines = selection.split('\n').length;
        // 选中文本统计：不排除标题，统计所有选中内容
        return this.calculateStats(selection, selectionLines, false);
    }

    /**
     * 清除指定文档的缓存
     * 当文档内容发生变化但版本号未更新时使用
     *
     * @param document 要清除缓存的文档
     *
     * @example
     * ```typescript
     * service.clearCache(document);
     * ```
     */
    clearCache(document: vscode.TextDocument): void {
        const uri = document.uri.toString();
        this.cache.delete(uri);
    }

    /**
     * 清除所有缓存
     * 在内存压力大或需要强制重新计算时使用
     *
     * @example
     * ```typescript
     * service.clearAllCache();
     * ```
     */
    clearAllCache(): void {
        this.cache.clear();
    }
}
