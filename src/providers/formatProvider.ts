import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';

export class ChineseNovelFormatProvider implements vscode.DocumentFormattingEditProvider {
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): vscode.TextEdit[] {
        const edits: vscode.TextEdit[] = [];
        const text = document.getText();
        const lines = text.split('\n');

        // 优先使用 novel.json 配置，回退到 VSCode 设置
        const configService = ConfigService.getInstance();
        let quoteStyle = configService.getChineseQuoteStyle();

        if (!quoteStyle || quoteStyle === '「」') {
            const config = vscode.workspace.getConfiguration('noveler');
            quoteStyle = config.get('chineseQuoteStyle', '「」');
        }

        let formattedLines: string[] = [];
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

        const formattedText = formattedLines.join('\n');

        if (formattedText !== text) {
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            );
            edits.push(vscode.TextEdit.replace(fullRange, formattedText));
        }

        return edits;
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
