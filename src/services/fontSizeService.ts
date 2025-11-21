import * as vscode from 'vscode';
import { ConfigService } from './configService';

/**
 * 字号管理服务
 * 根据配置自动调整 Markdown 文件的字号
 */
export class FontSizeService implements vscode.Disposable {
    private configService: ConfigService;
    private disposables: vscode.Disposable[] = [];
    private originalFontSize: number | undefined;
    private isMarkdownActive = false;

    constructor(configService: ConfigService) {
        this.configService = configService;
        this.initialize();
    }

    private initialize() {
        // 监听活动编辑器变化
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                this.handleEditorChange(editor);
            })
        );

        // 初始应用
        this.handleEditorChange(vscode.window.activeTextEditor);
    }

    private handleEditorChange(editor: vscode.TextEditor | undefined) {
        if (!editor) {
            return;
        }

        const isMarkdown = editor.document.languageId === 'markdown';

        // 如果从 Markdown 切换到非 Markdown
        if (this.isMarkdownActive && !isMarkdown) {
            this.restoreOriginalFontSize();
            this.isMarkdownActive = false;
        }
        // 如果切换到 Markdown
        else if (!this.isMarkdownActive && isMarkdown) {
            this.applyMarkdownFontSize();
            this.isMarkdownActive = true;
        }
    }

    private applyMarkdownFontSize() {
        const config = vscode.workspace.getConfiguration('editor');
        const currentFontSize = config.get<number>('fontSize', 14);

        // 保存原始字号（仅在第一次切换到 Markdown 时保存）
        if (this.originalFontSize === undefined) {
            this.originalFontSize = currentFontSize;
        }

        // 获取配置的 Markdown 字号（优先从 novel.json，然后是 VSCode 设置）
        const markdownFontSize = this.configService.getMarkdownFontSize();

        // 如果配置了字号且与当前不同，则应用
        if (markdownFontSize && markdownFontSize !== currentFontSize) {
            config.update('fontSize', markdownFontSize, vscode.ConfigurationTarget.Global);
        }
    }

    private restoreOriginalFontSize() {
        // 恢复原始字号
        if (this.originalFontSize !== undefined) {
            const config = vscode.workspace.getConfiguration('editor');
            const currentFontSize = config.get<number>('fontSize', 14);

            // 只有在当前字号是我们设置的 Markdown 字号时才恢复
            const markdownFontSize = this.configService.getMarkdownFontSize();

            if (markdownFontSize && currentFontSize === markdownFontSize) {
                config.update('fontSize', this.originalFontSize, vscode.ConfigurationTarget.Global);
            }
        }
    }

    /**
     * 重置字号为默认值
     */
    public resetFontSize() {
        const config = vscode.workspace.getConfiguration('editor');
        config.update('fontSize', undefined, vscode.ConfigurationTarget.Global);
        this.originalFontSize = undefined;
        vscode.window.showInformationMessage('Noveler: 已重置字号为默认值');
    }

    public dispose() {
        // 清理时恢复原始字号
        if (this.isMarkdownActive) {
            this.restoreOriginalFontSize();
        }

        this.disposables.forEach(d => d.dispose());
    }
}
