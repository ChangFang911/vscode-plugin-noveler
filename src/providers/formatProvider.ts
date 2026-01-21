import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { PARAGRAPH_INDENT } from '../constants';

export class ChineseNovelFormatProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        _options: vscode.FormattingOptions,
        _token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const edits: vscode.TextEdit[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // 从 novel.json 配置获取引号样式
        const configService = ConfigService.getInstance();
        const quoteStyle = configService.getChineseQuoteStyle();

        const formattedLines: string[] = [];
        let inFrontMatter = false;
        let frontMatterCount = 0;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];

            // 处理 Front Matter
            if (line.trim() === '---') {
                frontMatterCount++;
                if (frontMatterCount === 1) {
                    inFrontMatter = true;
                } else if (frontMatterCount === 2) {
                    inFrontMatter = false;
                }
                formattedLines.push(line);
                continue;
            }

            // Front Matter 内部不处理
            if (inFrontMatter) {
                formattedLines.push(line);
                continue;
            }

            // HTML 注释不处理
            if (line.trim().startsWith('<!--')) {
                formattedLines.push(line);
                continue;
            }

            // 标题不处理
            if (line.trim().startsWith('#')) {
                formattedLines.push(line);
                continue;
            }

            // 格式化正文
            line = this.formatLine(line, quoteStyle);
            formattedLines.push(line);
        }

        let formattedText = formattedLines.join('\n');

        // 根据 autoEmptyLine 配置处理段落间空行
        formattedText = this.formatParagraphSpacing(formattedText, configService);

        if (formattedText !== text) {
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            edits.push(vscode.TextEdit.replace(fullRange, formattedText));
        }

        return edits;
    }

    /**
     * 根据 autoEmptyLine 配置格式化段落间空行
     *
     * @param text 文档文本
     * @param configService 配置服务实例
     * @returns 格式化后的文本
     */
    private formatParagraphSpacing(text: string, configService: ConfigService): string {
        const shouldAutoEmptyLine = configService.shouldAutoEmptyLine();
        const shouldParagraphIndent = configService.shouldParagraphIndent();
        const lines = text.split('\n');
        const result: string[] = [];

        let inFrontMatter = false;
        let frontMatterCount = 0;

        for (let i = 0; i < lines.length; i++) {
            const currentLine = lines[i];

            // 使用 result 数组来判断前一行，而不是 lines 数组
            // 这样可以正确处理刚插入的空行
            const prevLine = result.length > 0 ? result[result.length - 1] : null;
            const nextLine = i < lines.length - 1 ? lines[i + 1] : null;

            // 跟踪 Front Matter 区域
            if (currentLine.trim() === '---') {
                frontMatterCount++;
                if (frontMatterCount === 1) {
                    inFrontMatter = true;
                } else if (frontMatterCount === 2) {
                    inFrontMatter = false;
                }
                result.push(currentLine);
                continue;
            }

            // Front Matter 内部不处理
            if (inFrontMatter) {
                result.push(currentLine);
                continue;
            }

            const isCurrentEmpty = currentLine.trim() === '';
            const isPrevEmpty = prevLine === null || prevLine.trim() === '';
            const isNextEmpty = nextLine === null || nextLine.trim() === '';

            // 判断是否是特殊行（标题、HTML注释）
            const isCurrentSpecial = currentLine.trim().startsWith('#') || currentLine.trim().startsWith('<!--');
            const isPrevSpecial = prevLine !== null && (prevLine.trim().startsWith('#') || prevLine.trim().startsWith('<!--'));
            const isNextSpecial = nextLine !== null && (nextLine.trim().startsWith('#') || nextLine.trim().startsWith('<!--'));

            if (shouldAutoEmptyLine) {
                // 配置为空一行：确保段落之间有且仅有一个空行
                if (isCurrentEmpty) {
                    // 当前行是空行
                    // 只在"非空内容行 - 空行 - 非空内容行"的模式下保留
                    if (!isPrevEmpty && !isNextEmpty && !isPrevSpecial && !isNextSpecial) {
                        result.push(currentLine);
                    }
                    // 其他情况的空行都跳过（去除多余空行）
                } else {
                    // 当前行不是空行
                    let lineToAdd = currentLine;

                    // 如果启用段落缩进
                    if (shouldParagraphIndent && !isCurrentSpecial) {
                        const isParagraphStart = isPrevEmpty || isPrevSpecial || prevLine === null || (prevLine !== null && prevLine.trim() === '---' && frontMatterCount === 2);

                        if (isParagraphStart) {
                            // 统一处理：移除所有前导空格（全角、半角、tab），重新添加标准缩进
                            // eslint-disable-next-line no-irregular-whitespace
                            const trimmed = lineToAdd.replace(/^[\s　]+/, '');
                            lineToAdd = PARAGRAPH_INDENT + trimmed;
                        }
                    }

                    result.push(lineToAdd);

                    // 如果下一行也是非空内容行，且都不是特殊行，需要在中间插入空行
                    if (!isCurrentSpecial && !isNextEmpty && !isNextSpecial && nextLine !== null) {
                        // 插入空行
                        result.push('');
                    }
                }
            } else {
                // 配置为不空行：移除所有段落间空行
                if (isCurrentEmpty) {
                    // 只保留特殊位置的空行
                    if ((prevLine !== null && prevLine.trim() === '---' && frontMatterCount === 2) || isPrevSpecial) {
                        result.push(currentLine);
                    }
                    // 其他空行跳过
                } else {
                    // 非空行保留
                    let lineToAdd = currentLine;

                    // 如果启用段落缩进
                    if (shouldParagraphIndent && !isCurrentSpecial) {
                        const isParagraphStart = isPrevEmpty || isPrevSpecial || prevLine === null || (prevLine !== null && prevLine.trim() === '---' && frontMatterCount === 2);

                        if (isParagraphStart) {
                            // 统一处理：移除所有前导空格（全角、半角、tab），重新添加标准缩进
                            // eslint-disable-next-line no-irregular-whitespace
                            const trimmed = lineToAdd.replace(/^[\s　]+/, '');
                            lineToAdd = PARAGRAPH_INDENT + trimmed;
                        }
                    }

                    result.push(lineToAdd);
                }
            }
        }

        return result.join('\n');
    }

    private formatLine(line: string, quoteStyle: string): string {
        if (!line.trim()) {
            return line;
        }

        let formatted = line;
        const configService = ConfigService.getInstance();

        // 1. 统一引号样式（如果启用了转换）
        if (configService.shouldConvertQuotes()) {
            if (quoteStyle === '「」') {
                // 将英文引号转为中文引号
                formatted = formatted.replace(/"([^"]*)"/g, '「$1」');
            } else {
                // 将中文引号转为英文引号
                formatted = formatted.replace(/「([^」]*)」/g, '"$1"');
            }
        }

        // 2. 标点符号规范化
        // 将中文前后的英文标点转为中文标点
        // 中文后面跟英文标点
        formatted = formatted.replace(/([\u4e00-\u9fa5]),/g, '$1，');
        formatted = formatted.replace(/([\u4e00-\u9fa5])\./g, '$1。');
        formatted = formatted.replace(/([\u4e00-\u9fa5])!/g, '$1！');
        formatted = formatted.replace(/([\u4e00-\u9fa5])\?/g, '$1？');
        // 英文标点后面跟中文
        formatted = formatted.replace(/,(?=[\u4e00-\u9fa5])/g, '，');
        formatted = formatted.replace(/\.(?=[\u4e00-\u9fa5])/g, '。');
        formatted = formatted.replace(/!(?=[\u4e00-\u9fa5])/g, '！');
        formatted = formatted.replace(/\?(?=[\u4e00-\u9fa5])/g, '？');

        // 3. 删除多余空格（中文之间的空格）
        formatted = formatted.replace(/([\u4e00-\u9fa5])\s+([\u4e00-\u9fa5])/g, '$1$2');

        // 4. 统一省略号
        formatted = formatted.replace(/\.{3,}/g, '…');

        // 5. 统一破折号
        formatted = formatted.replace(/--+/g, '——');

        return formatted;
    }
}
