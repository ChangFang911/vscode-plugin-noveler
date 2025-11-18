import * as vscode from 'vscode';

export interface WordCountStats {
    totalChars: number;      // 总字符数（含标点）
    chineseChars: number;    // 中文字符数（含中文标点）
    words: number;           // 英文单词数
    paragraphs: number;      // 段落数
    lines: number;           // 行数
}

export class WordCountService {
    getWordCount(document: vscode.TextDocument): WordCountStats {
        const text = this.getContentWithoutFrontMatter(document.getText());

        // 移除 HTML 注释
        const textWithoutComments = text.replace(/<!--[\s\S]*?-->/g, '');

        // 移除 Markdown 标题标记
        const textWithoutHeaders = textWithoutComments.replace(/^#+\s+/gm, '');

        // 计算中文字符数（包括中文标点）
        // 中文字符范围：\u4e00-\u9fa5
        // 中文标点范围：\u3000-\u303f（CJK符号和标点）\uff00-\uffef（全角ASCII、标点）
        const chineseChars = (textWithoutHeaders.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || []).length;

        // 计算总字符数（排除空白字符：空格、制表符、换行）
        const totalChars = textWithoutHeaders.replace(/[\s]/g, '').length;

        // 计算英文单词数
        const words = (textWithoutHeaders.match(/\b[a-zA-Z]+\b/g) || []).length;

        // 计算段落数（非空行）
        const paragraphs = textWithoutHeaders
            .split('\n')
            .filter(line => line.trim().length > 0).length;

        // 计算行数
        const lines = document.lineCount;

        return {
            totalChars,
            chineseChars,
            words,
            paragraphs,
            lines
        };
    }

    private getContentWithoutFrontMatter(text: string): string {
        // 移除 Front Matter
        const frontMatterRegex = /^---\s*\n[\s\S]*?\n---\s*\n/;
        return text.replace(frontMatterRegex, '');
    }

    // 获取选中文本的字数
    getSelectionWordCount(selection: string): WordCountStats {
        const chineseChars = (selection.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || []).length;
        const totalChars = selection.replace(/[\s]/g, '').length;
        const words = (selection.match(/\b[a-zA-Z]+\b/g) || []).length;
        const paragraphs = selection.split('\n').filter(line => line.trim().length > 0).length;
        const lines = selection.split('\n').length;

        return {
            totalChars,
            chineseChars,
            words,
            paragraphs,
            lines
        };
    }
}
