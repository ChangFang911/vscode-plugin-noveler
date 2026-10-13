import { getCharacterAliases } from '../utils/characterAliases';
/**
 * Code Lens Provider - 在章节标题上方显示快捷操作
 */

import * as vscode from 'vscode';
import { getContentWithoutFrontMatter, extractChapterFrontMatter } from '../utils/frontMatterHelper';
import { WordCountService } from '../services/wordCountService';
import { getStatusDisplayName } from '../utils/statusHelper';

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

        const documentPath = document.uri.fsPath.replace(/\\/g, '/');
        const isChapter = documentPath.includes('/chapters/');
        const isCharacter = documentPath.includes('/characters/');
        const fileName = documentPath.split('/').pop()?.toLowerCase();
        const isSupportingDocument = isChapter && ['outline.md', 'readme.md', 'volume.md'].includes(fileName ?? '')
            || documentPath.endsWith('/drafts/大纲.md');
        if (document.languageId !== 'markdown' || (!isChapter && !isCharacter && !isSupportingDocument)) {
            return codeLenses;
        }

        const text = document.getText();
        const frontMatter = text.match(/^\uFEFF?---[^\S\r\n]*\r?\n(?:[\s\S]*?\r?\n)?---[^\S\r\n]*(?:\r?\n|$)/);
        if (!frontMatter && /^\uFEFF?---[^\S\r\n]*(?:\r?\n|$)/.test(text)) {
            return codeLenses;
        }
        const frontMatterEnd = frontMatter?.[0].length || 0;
        const mask = (value: string) => value.replace(/[^\r\n]/g, ' ');
        const visibleText = mask(text.slice(0, frontMatterEnd))
            + text.slice(frontMatterEnd).replace(/<!--[\s\S]*?(?:-->|$)/g, mask);
        const lines = visibleText.split(/\r?\n/);

        // 查找章节标题（# 开头的行）
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^#\s+(.+)$/);

            if (match && match[1].trim()) {
                const range = new vscode.Range(i, 0, i, line.length);

                if (isCharacter || isSupportingDocument) {
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: '格式化',
                        tooltip: isCharacter ? '格式化当前人物档案' : '格式化当前文档',
                        command: 'noveler.formatDocument',
                        arguments: [document.uri]
                    }));
                    if (isCharacter) {
                        const aliases = getCharacterAliases(text);
                        codeLenses.push(new vscode.CodeLens(range, {
                            title: aliases.length ? `管理别名（${aliases.length}）` : '管理别名',
                            tooltip: aliases.length ? aliases.join('、') : '添加、修改或删除人物别名',
                            command: 'noveler.manageCharacterAliases',
                            arguments: [document.uri]
                        }));
                    }
                    break;
                }

                // 获取字数统计
                const contentWithoutFM = getContentWithoutFrontMatter(document);
                const stats = WordCountService.getDetailedStats(contentWithoutFM, true);
                const totalWords = stats.content + stats.punctuation;

                // 获取 Front Matter 中的状态和目标字数
                const frontMatter = extractChapterFrontMatter(document);
                const statusValue = frontMatter?.status || 'draft';
                const status = getStatusDisplayName(statusValue); // 转换为中文显示
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
                    const progressIcon = progress >= 100 ? '✅' : progress >= 50 ? '📝' : '📋';
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
                    command: 'noveler.formatDocument',
                    arguments: [document.uri]
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
