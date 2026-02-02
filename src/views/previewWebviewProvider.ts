/**
 * 手机阅读预览面板
 * 模拟手机屏幕显示小说内容，支持实时同步、主题切换、字体调整
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

/**
 * 预览设置接口
 */
interface PreviewSettings {
    /** 主题：light | dark | sepia | eyecare */
    theme: 'light' | 'dark' | 'sepia' | 'eyecare';
    /** 字体大小 (14-24) */
    fontSize: number;
    /** 行高 (1.5-2.5) */
    lineHeight: number;
    /** 字体类型 */
    fontFamily: 'system' | 'serif' | 'sans-serif';
}

/**
 * 预览面板提供者
 */
export class PreviewWebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private settings: PreviewSettings;
    private updateTimeout: NodeJS.Timeout | undefined;

    // 缓存上次的内容，用于设置变更时更新
    private lastTitle = '未命名章节';
    private lastBody = '';

    private static readonly SETTINGS_KEY = 'noveler.previewSettings';
    private static readonly UPDATE_DEBOUNCE = 300;

    constructor(private context: vscode.ExtensionContext) {
        // 从存储中恢复设置
        this.settings = this.loadSettings();
    }

    /**
     * 显示预览面板
     */
    public async show(): Promise<void> {
        const editor = vscode.window.activeTextEditor;

        // 检查是否有打开的 Markdown 文件
        if (!editor || editor.document.languageId !== 'markdown') {
            vscode.window.showWarningMessage('请先打开一个 Markdown 章节文件');
            return;
        }

        const column = vscode.ViewColumn.Beside;

        // 如果面板已存在，显示它
        if (PreviewWebviewProvider.currentPanel) {
            PreviewWebviewProvider.currentPanel.reveal(column);
            this.updatePreview();
            return;
        }

        // 创建新面板
        const panel = vscode.window.createWebviewPanel(
            'novelerPreview',
            '📱 手机预览',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.context.extensionUri]
            }
        );

        PreviewWebviewProvider.currentPanel = panel;

        // 设置初始内容（首次需要完整渲染 HTML）
        this.initPreview();

        // 监听消息
        panel.webview.onDidReceiveMessage(
            message => this.handleMessage(message),
            undefined,
            this.disposables
        );

        // 监听面板关闭
        panel.onDidDispose(
            () => this.dispose(),
            undefined,
            this.disposables
        );

        // 设置事件监听
        this.setupEventListeners();

        Logger.info('[Noveler] 手机预览面板已打开');
    }

    /**
     * 设置事件监听器
     */
    private setupEventListeners(): void {
        // 监听文档内容变化（防抖）
        const changeDisposable = vscode.workspace.onDidChangeTextDocument(e => {
            const activeEditor = vscode.window.activeTextEditor;
            if (activeEditor && e.document === activeEditor.document) {
                this.debouncedUpdate();
            }
        });

        // 监听编辑器切换
        const editorDisposable = vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor?.document.languageId === 'markdown') {
                this.updatePreview();
            }
        });

        // 监听光标位置变化
        const selectionDisposable = vscode.window.onDidChangeTextEditorSelection(e => {
            if (e.textEditor.document.languageId === 'markdown') {
                this.updateCursorPosition(e.textEditor);
            }
        });

        this.disposables.push(changeDisposable, editorDisposable, selectionDisposable);
    }

    /**
     * 更新光标位置对应的段落
     */
    private updateCursorPosition(editor: vscode.TextEditor): void {
        if (!PreviewWebviewProvider.currentPanel) {
            return;
        }

        const cursorLine = editor.selection.active.line;
        const content = editor.document.getText();

        // 计算光标所在的段落索引
        const paragraphIndex = this.getParagraphIndexFromLine(content, cursorLine);

        PreviewWebviewProvider.currentPanel.webview.postMessage({
            command: 'highlightParagraph',
            index: paragraphIndex
        });
    }

    /**
     * 根据行号计算段落索引
     */
    private getParagraphIndexFromLine(content: string, line: number): number {
        const lines = content.split('\n');

        // 跳过 Front Matter
        let startLine = 0;
        if (lines[0] === '---') {
            for (let i = 1; i < lines.length; i++) {
                if (lines[i] === '---') {
                    startLine = i + 1;
                    break;
                }
            }
        }

        // 如果光标在 Front Matter 内，返回 -1
        if (line < startLine) {
            return -1;
        }

        // 计算段落索引
        let paragraphIndex = -1;
        let inParagraph = false;

        for (let i = startLine; i <= line && i < lines.length; i++) {
            const trimmedLine = lines[i].trim();

            // 跳过标题行
            if (trimmedLine.startsWith('#')) {
                continue;
            }

            // 空行表示段落结束
            if (trimmedLine === '') {
                inParagraph = false;
                continue;
            }

            // 非空行，如果不在段落中，开始新段落
            if (!inParagraph) {
                paragraphIndex++;
                inParagraph = true;
            }
        }

        return paragraphIndex;
    }

    /**
     * 防抖更新
     */
    private debouncedUpdate(): void {
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }
        this.updateTimeout = setTimeout(() => {
            this.updatePreview();
        }, PreviewWebviewProvider.UPDATE_DEBOUNCE);
    }

    /**
     * 更新预览内容
     */
    private updatePreview(): void {
        if (!PreviewWebviewProvider.currentPanel) {
            return;
        }

        const editor = vscode.window.activeTextEditor;

        // 如果有活动的 markdown 编辑器，更新缓存
        if (editor && editor.document.languageId === 'markdown') {
            const content = editor.document.getText();
            const { title, body } = this.parseContent(content);
            this.lastTitle = title;
            this.lastBody = body;
        }

        // 通过 postMessage 更新内容，保持滚动位置
        PreviewWebviewProvider.currentPanel.webview.postMessage({
            command: 'updateContent',
            title: this.escapeHtml(this.lastTitle),
            body: this.lastBody
        });
    }

    /**
     * 初始化预览内容（仅在创建面板时调用）
     */
    private initPreview(): void {
        if (!PreviewWebviewProvider.currentPanel) {
            return;
        }

        const editor = vscode.window.activeTextEditor;

        if (editor && editor.document.languageId === 'markdown') {
            const content = editor.document.getText();
            const { title, body } = this.parseContent(content);
            this.lastTitle = title;
            this.lastBody = body;
        }

        PreviewWebviewProvider.currentPanel.webview.html = this.getHtmlContent(this.lastTitle, this.lastBody);
    }

    /**
     * 解析文档内容，提取标题和正文
     */
    private parseContent(content: string): { title: string; body: string } {
        let title = '未命名章节';
        let body = content;

        // 解析 Front Matter
        const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (frontMatterMatch) {
            const frontMatter = frontMatterMatch[1];
            body = frontMatterMatch[2];

            // 提取标题
            const titleMatch = frontMatter.match(/title:\s*["']?([^"'\n]+)["']?/);
            if (titleMatch) {
                title = titleMatch[1].trim();
            }
        }

        // 移除 Markdown 标题（# 开头的行）
        body = body.replace(/^#.*$/gm, '').trim();

        // 处理段落
        body = this.formatBody(body);

        return { title, body };
    }

    /**
     * 格式化正文内容
     */
    private formatBody(body: string): string {
        // 分割段落
        const paragraphs = body.split(/\n\s*\n/);

        // 处理每个段落
        const formattedParagraphs = paragraphs
            .map(p => p.trim())
            .filter(p => p.length > 0)
            .map(p => {
                // 先转义 HTML，防止 XSS
                p = this.escapeHtml(p);
                // 处理对话（引号内容）
                p = p.replace(/([「"'"])(.*?)([」"'"])/g, '<span class="dialogue">$1$2$3</span>');
                return `<p>${p}</p>`;
            });

        return formattedParagraphs.join('\n');
    }

    /**
     * 处理来自 Webview 的消息
     */
    private handleMessage(message: { command: string; value?: unknown }): void {
        switch (message.command) {
            case 'setTheme':
                this.settings.theme = message.value as PreviewSettings['theme'];
                this.saveSettings();
                // 发送消息让 webview 动态更新样式，而不是重新渲染
                this.sendSettingsUpdate();
                break;
            case 'setFontSize':
                this.settings.fontSize = message.value as number;
                this.saveSettings();
                this.sendSettingsUpdate();
                break;
            case 'setLineHeight':
                this.settings.lineHeight = message.value as number;
                this.saveSettings();
                this.sendSettingsUpdate();
                break;
            case 'setFontFamily':
                this.settings.fontFamily = message.value as PreviewSettings['fontFamily'];
                this.saveSettings();
                this.sendSettingsUpdate();
                break;
        }
    }

    /**
     * 发送设置更新到 Webview（不重新渲染）
     */
    private sendSettingsUpdate(): void {
        if (PreviewWebviewProvider.currentPanel) {
            PreviewWebviewProvider.currentPanel.webview.postMessage({
                command: 'updateSettings',
                settings: this.settings
            });
        }
    }

    /**
     * 加载设置
     */
    private loadSettings(): PreviewSettings {
        const saved = this.context.globalState.get<PreviewSettings>(PreviewWebviewProvider.SETTINGS_KEY);
        return saved || {
            theme: 'light',
            fontSize: 18,
            lineHeight: 1.8,
            fontFamily: 'system'
        };
    }

    /**
     * 保存设置
     */
    private saveSettings(): void {
        this.context.globalState.update(PreviewWebviewProvider.SETTINGS_KEY, this.settings);
    }

    /**
     * 生成 HTML 内容
     */
    private getHtmlContent(title: string, body: string): string {
        const { theme, fontSize, lineHeight, fontFamily } = this.settings;

        const fontFamilyMap = {
            'system': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'serif': '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
            'sans-serif': '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif'
        };

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>手机预览</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: var(--vscode-editor-background);
            padding: 20px;
            font-family: ${fontFamilyMap[fontFamily]};
            overflow: hidden;
        }

        /* 隐藏外层滚动条 */
        html::-webkit-scrollbar,
        body::-webkit-scrollbar {
            display: none;
        }

        html, body {
            scrollbar-width: none;
            -ms-overflow-style: none;
        }

        .phone-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 16px;
        }

        /* 手机外壳 */
        .phone-shell {
            position: relative;
            padding: 12px;
            background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 50%, #2a2a2a 100%);
            border-radius: 54px;
            box-shadow:
                0 0 0 1px rgba(255,255,255,0.1),
                0 30px 60px rgba(0,0,0,0.4),
                0 10px 20px rgba(0,0,0,0.3),
                inset 0 1px 0 rgba(255,255,255,0.1);
        }

        /* 侧边按钮 - 静音键 */
        .phone-shell::before {
            content: '';
            position: absolute;
            left: -3px;
            top: 100px;
            width: 4px;
            height: 28px;
            background: linear-gradient(90deg, #1a1a1a, #333);
            border-radius: 2px 0 0 2px;
        }

        /* 侧边按钮 - 音量键 */
        .phone-shell::after {
            content: '';
            position: absolute;
            left: -3px;
            top: 145px;
            width: 4px;
            height: 56px;
            background: linear-gradient(90deg, #1a1a1a, #333);
            border-radius: 2px 0 0 2px;
        }

        /* 电源键 */
        .power-btn {
            position: absolute;
            right: -3px;
            top: 140px;
            width: 4px;
            height: 40px;
            background: linear-gradient(270deg, #1a1a1a, #333);
            border-radius: 0 2px 2px 0;
        }

        /* 手机屏幕 - iPhone 15/16 Pro 比例 */
        .phone-frame {
            width: 393px;
            height: 852px;
            border-radius: 55px;
            background: var(--bg-color);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            position: relative;
        }

        /* 灵动岛 */
        .dynamic-island {
            position: absolute;
            top: 12px;
            left: 50%;
            transform: translateX(-50%);
            width: 126px;
            height: 36px;
            background: #000;
            border-radius: 20px;
            z-index: 100;
            display: flex;
            align-items: center;
            justify-content: flex-end;
            padding-right: 12px;
        }

        .dynamic-island::before {
            content: '';
            position: absolute;
            right: 12px;
            width: 12px;
            height: 12px;
            background: radial-gradient(circle, #1a3a1a 0%, #0a1a0a 100%);
            border-radius: 50%;
            box-shadow: inset 0 0 2px rgba(0,255,0,0.3);
        }

        /* 主题样式 */
        .theme-light {
            --bg-color: #ffffff;
            --text-color: #333333;
            --title-color: #1a1a1a;
            --dialogue-color: #8b4513;
            --toolbar-bg: #f5f5f5;
            --toolbar-border: #e0e0e0;
            --btn-bg: #ffffff;
            --btn-hover: #f0f0f0;
            --btn-active: #e8e8e8;
        }

        .theme-dark {
            --bg-color: #1a1a1a;
            --text-color: #e0e0e0;
            --title-color: #ffffff;
            --dialogue-color: #ffa07a;
            --toolbar-bg: #2a2a2a;
            --toolbar-border: #3a3a3a;
            --btn-bg: #3a3a3a;
            --btn-hover: #4a4a4a;
            --btn-active: #5a5a5a;
        }

        .theme-sepia {
            --bg-color: #f4ecd8;
            --text-color: #5b4636;
            --title-color: #3d2914;
            --dialogue-color: #8b4513;
            --toolbar-bg: #e8dcc8;
            --toolbar-border: #d4c4a8;
            --btn-bg: #f4ecd8;
            --btn-hover: #e8dcc8;
            --btn-active: #d4c4a8;
        }

        .theme-eyecare {
            --bg-color: #cce8cf;
            --text-color: #2d3830;
            --title-color: #1a2a1c;
            --dialogue-color: #5a4a30;
            --toolbar-bg: #b8d8bc;
            --toolbar-border: #a8c8ac;
            --btn-bg: #cce8cf;
            --btn-hover: #b8d8bc;
            --btn-active: #a8c8ac;
        }

        /* 状态栏 */
        .status-bar {
            height: 54px;
            padding: 14px 24px 0;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            font-size: 15px;
            font-weight: 600;
            color: var(--text-color);
            background: var(--bg-color);
            flex-shrink: 0;
        }

        .status-bar .time {
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.5px;
        }

        .status-bar .icons {
            display: flex;
            gap: 5px;
            align-items: center;
        }

        .signal-bars {
            display: flex;
            gap: 1px;
            align-items: flex-end;
            height: 12px;
        }

        .signal-bar {
            width: 3px;
            background: var(--text-color);
            border-radius: 1px;
        }

        .signal-bar:nth-child(1) { height: 4px; }
        .signal-bar:nth-child(2) { height: 6px; }
        .signal-bar:nth-child(3) { height: 8px; }
        .signal-bar:nth-child(4) { height: 11px; }

        .battery {
            display: flex;
            align-items: center;
            gap: 2px;
        }

        .battery-body {
            width: 25px;
            height: 12px;
            border: 1.5px solid var(--text-color);
            border-radius: 3px;
            position: relative;
            display: flex;
            align-items: center;
            padding: 2px;
        }

        .battery-level {
            height: 100%;
            width: 80%;
            background: var(--text-color);
            border-radius: 1px;
        }

        .battery-cap {
            width: 2px;
            height: 5px;
            background: var(--text-color);
            border-radius: 0 1px 1px 0;
            opacity: 0.5;
        }

        /* 内容区域 */
        .content-area {
            flex: 1;
            overflow-y: auto;
            padding: 16px 20px;
            background: var(--bg-color);
            /* iOS 风格滚动条 - 隐藏不占空间 */
            scrollbar-width: none; /* Firefox */
            -ms-overflow-style: none; /* IE/Edge */
        }

        .content-area::-webkit-scrollbar {
            width: 0;
            background: transparent;
        }

        .chapter-title {
            font-size: 20px;
            font-weight: bold;
            color: var(--title-color);
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--toolbar-border);
        }

        .chapter-content {
            font-size: ${fontSize}px;
            line-height: ${lineHeight};
            color: var(--text-color);
            text-align: justify;
        }

        .chapter-content p {
            text-indent: 2em;
            margin-bottom: 1em;
            padding: 4px 0;
            border-radius: 4px;
            transition: background-color 0.3s ease;
        }

        /* 当前光标所在段落高亮 */
        .chapter-content p.current-paragraph {
            background-color: rgba(0, 122, 204, 0.15);
        }

        /* 底部留白，让最后一行不贴底 */
        .chapter-content::after {
            content: '';
            display: block;
            height: 200px;
        }

        .chapter-content .dialogue {
            color: var(--dialogue-color);
        }

        /* 底部工具栏 */
        .toolbar {
            height: 56px;
            padding: 8px 16px;
            padding-bottom: 12px;
            display: flex;
            justify-content: space-around;
            align-items: center;
            background: var(--toolbar-bg);
            border-top: 1px solid var(--toolbar-border);
            flex-shrink: 0;
        }

        .toolbar-btn {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            padding: 6px 14px;
            border: none;
            background: transparent;
            border-radius: 10px;
            cursor: pointer;
            color: var(--text-color);
            font-size: 10px;
            transition: all 0.2s;
        }

        .toolbar-btn:hover {
            background: var(--btn-hover);
        }

        .toolbar-btn:active {
            background: var(--btn-active);
            transform: scale(0.95);
        }

        .toolbar-btn .icon {
            font-size: 20px;
        }

        .toolbar-btn.active {
            background: var(--btn-active);
        }

        /* Home Indicator */
        .home-indicator {
            width: 134px;
            height: 5px;
            background: var(--text-color);
            opacity: 0.3;
            border-radius: 3px;
            margin: 8px auto;
        }

        /* 设置面板 */
        .settings-panel {
            position: absolute;
            bottom: 78px;
            left: 0;
            right: 0;
            background: var(--toolbar-bg);
            border-top: 1px solid var(--toolbar-border);
            padding: 16px;
            display: none;
            flex-direction: column;
            gap: 16px;
            z-index: 50;
        }

        .settings-panel.show {
            display: flex;
        }

        .settings-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
        }

        .settings-label {
            font-size: 14px;
            color: var(--text-color);
        }

        .theme-buttons {
            display: flex;
            gap: 8px;
        }

        .theme-btn {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: 2px solid transparent;
            cursor: pointer;
            transition: border-color 0.2s;
        }

        .theme-btn:hover {
            opacity: 0.8;
        }

        .theme-btn.active {
            border-color: #007acc;
        }

        .theme-btn.light { background: #ffffff; border: 2px solid #e0e0e0; }
        .theme-btn.dark { background: #1a1a1a; }
        .theme-btn.sepia { background: #f4ecd8; }
        .theme-btn.eyecare { background: #cce8cf; }

        .font-controls {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .font-family-buttons {
            display: flex;
            gap: 6px;
        }

        .font-family-btn {
            padding: 6px 12px;
            border-radius: 6px;
            border: 1px solid var(--toolbar-border);
            background: var(--btn-bg);
            color: var(--text-color);
            cursor: pointer;
            font-size: 12px;
            transition: all 0.2s;
        }

        .font-family-btn:hover {
            background: var(--btn-hover);
        }

        .font-family-btn.active {
            background: var(--btn-active);
            border-color: #007acc;
        }

        .font-btn {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            border: 1px solid var(--toolbar-border);
            background: var(--btn-bg);
            color: var(--text-color);
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .font-btn:hover {
            background: var(--btn-hover);
        }

        .font-value {
            font-size: 14px;
            color: var(--text-color);
            min-width: 40px;
            text-align: center;
        }

        /* 空内容提示 */
        .empty-content {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--text-color);
            opacity: 0.5;
            text-align: center;
            padding: 20px;
        }

        .empty-content .icon {
            font-size: 48px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <div class="phone-container">
        <div class="phone-shell">
            <div class="power-btn"></div>
            <div class="phone-frame theme-${theme}">
                <div class="dynamic-island"></div>

                <div class="status-bar">
                    <span class="time" id="time">12:00</span>
                    <div class="icons">
                        <div class="signal-bars">
                            <div class="signal-bar"></div>
                            <div class="signal-bar"></div>
                            <div class="signal-bar"></div>
                            <div class="signal-bar"></div>
                        </div>
                        <div class="battery">
                            <div class="battery-body">
                                <div class="battery-level"></div>
                            </div>
                            <div class="battery-cap"></div>
                        </div>
                    </div>
                </div>

                <div class="content-area">
                    ${body ? `
                    <h1 class="chapter-title">${this.escapeHtml(title)}</h1>
                    <div class="chapter-content">
                        ${body}
                    </div>
                    ` : `
                    <div class="empty-content">
                        <div class="icon">📖</div>
                        <div>暂无内容</div>
                        <div style="font-size: 12px; margin-top: 8px;">请在编辑器中输入小说内容</div>
                    </div>
                    `}
                </div>

                <div class="settings-panel" id="settingsPanel">
                    <div class="settings-row">
                        <span class="settings-label">主题</span>
                        <div class="theme-buttons">
                            <button class="theme-btn light ${theme === 'light' ? 'active' : ''}" onclick="setTheme('light')" title="日间"></button>
                            <button class="theme-btn dark ${theme === 'dark' ? 'active' : ''}" onclick="setTheme('dark')" title="夜间"></button>
                            <button class="theme-btn sepia ${theme === 'sepia' ? 'active' : ''}" onclick="setTheme('sepia')" title="羊皮纸"></button>
                            <button class="theme-btn eyecare ${theme === 'eyecare' ? 'active' : ''}" onclick="setTheme('eyecare')" title="护眼"></button>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">字号</span>
                        <div class="font-controls">
                            <button class="font-btn" onclick="changeFontSize(-1)">−</button>
                            <span class="font-value">${fontSize}</span>
                            <button class="font-btn" onclick="changeFontSize(1)">+</button>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">行距</span>
                        <div class="font-controls">
                            <button class="font-btn" onclick="changeLineHeight(-0.1)">−</button>
                            <span class="font-value">${lineHeight.toFixed(1)}</span>
                            <button class="font-btn" onclick="changeLineHeight(0.1)">+</button>
                        </div>
                    </div>
                    <div class="settings-row">
                        <span class="settings-label">字体</span>
                        <div class="font-family-buttons">
                            <button class="font-family-btn ${fontFamily === 'system' ? 'active' : ''}" onclick="setFontFamily('system')">系统</button>
                            <button class="font-family-btn ${fontFamily === 'serif' ? 'active' : ''}" onclick="setFontFamily('serif')">宋体</button>
                            <button class="font-family-btn ${fontFamily === 'sans-serif' ? 'active' : ''}" onclick="setFontFamily('sans-serif')">黑体</button>
                        </div>
                    </div>
                </div>

                <div class="toolbar">
                    <button class="toolbar-btn" onclick="toggleSettings()">
                        <span class="icon">⚙️</span>
                        <span>设置</span>
                    </button>
                    <button class="toolbar-btn" onclick="scrollToTop()">
                        <span class="icon">⬆️</span>
                        <span>顶部</span>
                    </button>
                    <button class="toolbar-btn" onclick="scrollToBottom()">
                        <span class="icon">⬇️</span>
                        <span>底部</span>
                    </button>
                </div>

                <div class="home-indicator"></div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        // 更新时间
        function updateTime() {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            document.getElementById('time').textContent = hours + ':' + minutes;
        }
        updateTime();
        setInterval(updateTime, 60000);

        // 切换设置面板
        function toggleSettings() {
            const panel = document.getElementById('settingsPanel');
            panel.classList.toggle('show');
        }

        // 设置主题
        function setTheme(theme) {
            vscode.postMessage({ command: 'setTheme', value: theme });
        }

        // 调整字体大小
        let currentFontSize = ${fontSize};
        function changeFontSize(delta) {
            currentFontSize = Math.max(14, Math.min(24, currentFontSize + delta));
            vscode.postMessage({ command: 'setFontSize', value: currentFontSize });
        }

        // 调整行高
        let currentLineHeight = ${lineHeight};
        function changeLineHeight(delta) {
            currentLineHeight = Math.max(1.5, Math.min(2.5, currentLineHeight + delta));
            currentLineHeight = Math.round(currentLineHeight * 10) / 10;
            vscode.postMessage({ command: 'setLineHeight', value: currentLineHeight });
        }

        // 设置字体
        function setFontFamily(family) {
            vscode.postMessage({ command: 'setFontFamily', value: family });
        }

        // 滚动到顶部
        function scrollToTop() {
            document.querySelector('.content-area').scrollTo({ top: 0, behavior: 'smooth' });
        }

        // 滚动到底部
        function scrollToBottom() {
            const content = document.querySelector('.content-area');
            content.scrollTo({ top: content.scrollHeight, behavior: 'smooth' });
        }

        // 点击内容区域关闭设置面板
        document.querySelector('.content-area').addEventListener('click', () => {
            const panel = document.getElementById('settingsPanel');
            if (panel.classList.contains('show')) {
                panel.classList.remove('show');
            }
        });

        // 字体映射
        const fontFamilyMap = {
            'system': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            'serif': '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
            'sans-serif': '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", sans-serif'
        };

        // 监听来自扩展的消息
        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'updateSettings') {
                const settings = message.settings;

                // 更新主题
                const phoneFrame = document.querySelector('.phone-frame');
                phoneFrame.className = 'phone-frame theme-' + settings.theme;

                // 更新主题按钮状态
                document.querySelectorAll('.theme-btn').forEach(btn => {
                    btn.classList.remove('active');
                    if (btn.classList.contains(settings.theme)) {
                        btn.classList.add('active');
                    }
                });

                // 更新字体大小（检查元素是否存在）
                currentFontSize = settings.fontSize;
                const chapterContent = document.querySelector('.chapter-content');
                if (chapterContent) {
                    chapterContent.style.fontSize = settings.fontSize + 'px';
                    chapterContent.style.lineHeight = settings.lineHeight;
                }
                document.querySelectorAll('.font-value')[0].textContent = settings.fontSize;

                // 更新行高
                currentLineHeight = settings.lineHeight;
                document.querySelectorAll('.font-value')[1].textContent = settings.lineHeight.toFixed(1);

                // 更新字体
                document.body.style.fontFamily = fontFamilyMap[settings.fontFamily];

                // 更新字体按钮状态
                document.querySelectorAll('.font-family-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                const fontFamilyBtns = document.querySelectorAll('.font-family-btn');
                if (settings.fontFamily === 'system') fontFamilyBtns[0].classList.add('active');
                else if (settings.fontFamily === 'serif') fontFamilyBtns[1].classList.add('active');
                else if (settings.fontFamily === 'sans-serif') fontFamilyBtns[2].classList.add('active');

                // 更新按钮禁用状态
                updateButtonStates();
            } else if (message.command === 'updateContent') {
                // 更新内容
                const contentArea = document.querySelector('.content-area');

                // 检查是否在底部附近（距离底部 100px 以内视为在底部）
                const isNearBottom = contentArea.scrollHeight - contentArea.scrollTop - contentArea.clientHeight < 100;

                if (message.body) {
                    contentArea.innerHTML = \`
                        <h1 class="chapter-title">\${message.title}</h1>
                        <div class="chapter-content">
                            \${message.body}
                        </div>
                    \`;
                    // 应用当前的字号和行距设置
                    const chapterContent = document.querySelector('.chapter-content');
                    if (chapterContent) {
                        chapterContent.style.fontSize = currentFontSize + 'px';
                        chapterContent.style.lineHeight = currentLineHeight;
                    }
                } else {
                    contentArea.innerHTML = \`
                        <div class="empty-content">
                            <div class="icon">📖</div>
                            <div>暂无内容</div>
                            <div style="font-size: 12px; margin-top: 8px;">请在编辑器中输入小说内容</div>
                        </div>
                    \`;
                }

                // 如果之前在底部附近，更新后自动滚动到底部
                if (isNearBottom) {
                    contentArea.scrollTop = contentArea.scrollHeight;
                }
            } else if (message.command === 'highlightParagraph') {
                // 高亮当前段落
                const paragraphs = document.querySelectorAll('.chapter-content p');

                // 移除之前的高亮
                paragraphs.forEach(p => p.classList.remove('current-paragraph'));

                // 添加新的高亮
                if (message.index >= 0 && message.index < paragraphs.length) {
                    const currentP = paragraphs[message.index];
                    currentP.classList.add('current-paragraph');

                    // 滚动到视窗中上部（1/3 位置）
                    const contentArea = document.querySelector('.content-area');
                    const pRect = currentP.getBoundingClientRect();
                    const contentRect = contentArea.getBoundingClientRect();
                    const targetScrollTop = contentArea.scrollTop + pRect.top - contentRect.top - contentRect.height / 3;

                    contentArea.scrollTo({
                        top: Math.max(0, targetScrollTop),
                        behavior: 'smooth'
                    });
                }
            }
        });

        // 更新按钮禁用状态
        function updateButtonStates() {
            const fontBtns = document.querySelectorAll('.font-controls');
            // 字号按钮
            const fontSizeDecBtn = fontBtns[0].querySelectorAll('.font-btn')[0];
            const fontSizeIncBtn = fontBtns[0].querySelectorAll('.font-btn')[1];
            fontSizeDecBtn.style.opacity = currentFontSize <= 14 ? '0.3' : '1';
            fontSizeIncBtn.style.opacity = currentFontSize >= 24 ? '0.3' : '1';
            // 行距按钮
            const lineHeightDecBtn = fontBtns[1].querySelectorAll('.font-btn')[0];
            const lineHeightIncBtn = fontBtns[1].querySelectorAll('.font-btn')[1];
            lineHeightDecBtn.style.opacity = currentLineHeight <= 1.5 ? '0.3' : '1';
            lineHeightIncBtn.style.opacity = currentLineHeight >= 2.5 ? '0.3' : '1';
        }

        // 初始化按钮状态
        updateButtonStates();
    </script>
</body>
</html>`;
    }

    /**
     * HTML 转义
     */
    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * 释放资源
     */
    private dispose(): void {
        PreviewWebviewProvider.currentPanel = undefined;

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
        }

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }

        Logger.info('[Noveler] 手机预览面板已关闭');
    }
}
