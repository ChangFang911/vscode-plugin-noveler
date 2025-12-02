/**
 * Code Lens Provider - 在章节标题上方显示快捷操作
 */

import * as vscode from 'vscode';
import { getContentWithoutFrontMatter, extractFrontMatter } from '../utils/frontMatterHelper';
import { WordCountService } from '../services/wordCountService';

export class ChapterCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(private wordCountService: WordCountService) {}

    /**
     * 刷新 Code Lens
     */
    public refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    /**
     * 提供 Code Lens
     */
    public provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        const codeLenses: vscode.CodeLens[] = [];

        // 只在 chapters 目录下的 Markdown 文件中显示
        if (document.languageId !== 'markdown' || !document.uri.fsPath.includes('/chapters/')) {
            return codeLenses;
        }

        const text = document.getText();
        const lines = text.split('\n');

        // 查找章节标题（# 开头的行）
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^#\s+(.+)$/);

            if (match) {
                const range = new vscode.Range(i, 0, i, line.length);

                // 获取字数统计
                const contentWithoutFM = getContentWithoutFrontMatter(document);
                const stats = WordCountService.getDetailedStats(contentWithoutFM, true);
                const totalWords = stats.content + stats.punctuation;

                // 获取 Front Matter 中的状态和目标字数
                const frontMatter = extractFrontMatter(document);
                const status = frontMatter?.status || '草稿';
                const targetWords = frontMatter?.targetWords || 0;
                const progress = targetWords > 0 ? Math.round((totalWords / targetWords) * 100) : 0;

                // 字数统计 Code Lens
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `📊 ${totalWords.toLocaleString()} 字`,
                    tooltip: `正文: ${stats.content.toLocaleString()} | 标点: ${stats.punctuation.toLocaleString()}`,
                    command: ''
                }));

                // 目标进度 Code Lens（如果设置了目标字数）
                if (targetWords > 0) {
                    const progressIcon = progress >= 100 ? '✅' : progress >= 50 ? '��' : '📋';
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: `${progressIcon} ${progress}% (目标: ${targetWords.toLocaleString()})`,
                        tooltip: `当前进度: ${totalWords.toLocaleString()} / ${targetWords.toLocaleString()} 字`,
                        command: ''
                    }));
                }

                // 状态 Code Lens
                const statusEmoji = this.getStatusEmoji(status);
                codeLenses.push(new vscode.CodeLens(range, {
                    title: `${statusEmoji} ${status}`,
                    command: 'noveler.updateChapterStatus',
                    arguments: [document.uri]
                }));

                // 格式化 Code Lens
                codeLenses.push(new vscode.CodeLens(range, {
                    title: '🎨 格式化',
                    tooltip: '修正标点和格式',
                    command: 'noveler.formatDocument'
                }));

                // 只处理第一个标题
                break;
            }
        }

        return codeLenses;
    }

    /**
     * 获取状态对应的 emoji
     */
    private getStatusEmoji(status: string): string {
        const emojiMap: Record<string, string> = {
            '草稿': '📝',
            '初稿': '✏️',
            '修改中': '🔧',
            '已完成': '✅'
        };
        return emojiMap[status] || '📝';
    }
}
