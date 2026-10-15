/**
 * 新手欢迎页面 - Webview 实现
 * 首次安装或首次打开工作区时显示
 */

import * as vscode from 'vscode';
import { CONFIG_FILE_NAME } from '../constants';
import { documentIO } from '../utils/documentOperations';
import { Logger } from '../utils/logger';
import { compareVersions, getReleaseUpdates, parseReleaseNotes, ReleaseNotes, renderReleaseNotes, escapeReleaseText } from '../utils/releaseNotes';

const WELCOME_STATE_KEY = 'noveler.welcomeShown';
const UPDATE_VERSION_KEY = 'noveler.lastNotifiedVersion';

export class WelcomeWebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;

    private updatesChecked = false;

    constructor(private context: vscode.ExtensionContext) {}

    private get version(): string {
        return String(this.context.extension?.packageJSON?.version ?? '未知版本');
    }

    private async readReleaseNotes(): Promise<ReleaseNotes[]> {
        let data: Uint8Array;
        try {
            data = await documentIO.readFile(vscode.Uri.joinPath(this.context.extensionUri, 'CHANGELOG.md'));
        } catch (error) {
            if ((error as { code?: string }).code !== 'FileNotFound') { throw error; }
            data = await documentIO.readFile(vscode.Uri.joinPath(this.context.extensionUri, 'changelog.md'));
        }
        return parseReleaseNotes(Buffer.from(data).toString('utf8'));
    }

    public async checkForUpdates(firstUse: boolean): Promise<void> {
        if (this.updatesChecked || compareVersions(this.version, this.version) === undefined) { return; }
        if (firstUse) {
            await this.context.globalState.update(UPDATE_VERSION_KEY, this.version);
            this.updatesChecked = true;
            return;
        }
        const folder = documentIO.workspaceFolder();
        if (!folder) { return; }
        try { await documentIO.stat(vscode.Uri.joinPath(folder.uri, CONFIG_FILE_NAME)); }
        catch (error) {
            if ((error as { code?: string }).code !== 'FileNotFound') { Logger.warn('检查更新提醒的项目状态失败', error); }
            return;
        }
        const previous = this.context.globalState.get<string>(UPDATE_VERSION_KEY);
        const difference = previous ? compareVersions(this.version, previous) : undefined;
        if (difference !== undefined && difference <= 0) { return; }
        const updates = getReleaseUpdates(await this.readReleaseNotes(), previous, this.version);
        await this.context.globalState.update(UPDATE_VERSION_KEY, this.version);
        this.updatesChecked = true;
        if (!updates.length) { return; }
        const summary = [...new Set(updates.flatMap(release => release.changes.map(change => change.title)))].join('、');
        const selected = await vscode.window.showInformationMessage(
            `Noveler 已更新至 v${this.version}，包含${summary}。`, '查看更新', '稍后'
        );
        if (selected === '查看更新') { await this.show(false, updates); }
    }

    /**
     * 检查是否应该显示欢迎页面
     */
    public shouldShowWelcome(): boolean {
        // 检查是否已经显示过
        const hasShown = this.context.globalState.get<boolean>(WELCOME_STATE_KEY, false);
        return !hasShown;
    }

    /**
     * 标记欢迎页面已显示
     */
    public async markWelcomeShown(): Promise<void> {
        await this.context.globalState.update(WELCOME_STATE_KEY, true);
    }

    /**
     * 重置欢迎页面状态（用于测试）
     */
    public async resetWelcomeState(): Promise<void> {
        await this.context.globalState.update(WELCOME_STATE_KEY, false);
    }

    /**
     * 显示欢迎页面
     */
    public async show(autoShow = false, updates?: ReleaseNotes[]): Promise<void> {
        let releaseNotes = '';
        try {
            const releases = updates ?? (await this.readReleaseNotes()).filter(release =>
                release.version === 'Unreleased'
                    ? this.context.extensionMode === vscode.ExtensionMode?.Development
                    : (compareVersions(release.version, this.version) ?? 1) <= 0);
            releaseNotes = renderReleaseNotes(releases, updates ? '本次更新' : '版本更新');
        } catch (error) {
            Logger.warn('读取更新日志失败', error);
            releaseNotes = '<section class="release-notes"><h2>版本更新</h2><p>更新日志暂时无法读取，请重新打开使用指南。</p></section>';
        }
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WelcomeWebviewProvider.currentPanel) {
            WelcomeWebviewProvider.currentPanel.webview.html = this.getHtmlContent(
                WelcomeWebviewProvider.currentPanel.webview, autoShow, releaseNotes, updates !== undefined
            );
            WelcomeWebviewProvider.currentPanel.reveal(columnToShowIn);
            if (autoShow) { await this.markWelcomeShown(); }
            return;
        }

        // 创建新面板
        WelcomeWebviewProvider.currentPanel = vscode.window.createWebviewPanel(
            'novelerWelcome',
            '欢迎使用 Noveler',
            columnToShowIn || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: false,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.context.extensionUri, 'images')
                ]
            }
        );

        // 设置 HTML 内容
        WelcomeWebviewProvider.currentPanel.webview.html = this.getHtmlContent(
            WelcomeWebviewProvider.currentPanel.webview,
            autoShow, releaseNotes, updates !== undefined
        );

        // 监听面板关闭
        WelcomeWebviewProvider.currentPanel.onDidDispose(
            () => {
                WelcomeWebviewProvider.currentPanel = undefined;
            },
            null,
            this.context.subscriptions
        );

        // 监听来自 Webview 的消息
        WelcomeWebviewProvider.currentPanel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'createSampleProject':
                        await this.markWelcomeShown();
                        WelcomeWebviewProvider.currentPanel?.dispose();
                        await vscode.commands.executeCommand('noveler.initProject');
                        break;
                    case 'openExistingProject':
                        await this.markWelcomeShown();
                        WelcomeWebviewProvider.currentPanel?.dispose();
                        await vscode.commands.executeCommand('workbench.action.files.openFolder');
                        break;
                    case 'dontShowAgain':
                        await this.markWelcomeShown();
                        break;
                    case 'close':
                        WelcomeWebviewProvider.currentPanel?.dispose();
                        break;
                    case 'openDocs':
                        vscode.env.openExternal(vscode.Uri.parse('https://github.com/ChangFang911/vscode-plugin-noveler'));
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // 如果是自动显示，���记已显示
        if (autoShow) {
            await this.markWelcomeShown();
        }
    }

    /**
     * 生成 HTML 内容
     */
    private getHtmlContent(webview: vscode.Webview, showDontShowAgain: boolean, releaseNotes: string, updatesMode: boolean): string {
        // 获取图片资源路径
        const imagesUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'images')
        );

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>欢迎使用 Noveler</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            padding: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
            padding: 40px 20px;
            flex: 1;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
        }
        .logo {
            font-size: 64px;
            margin-bottom: 16px;
        }
        .header h1 {
            font-size: 32px;
            margin-bottom: 8px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .header .subtitle {
            font-size: 18px;
            color: var(--vscode-descriptionForeground);
        }

        /* 功能预览区 */
        .preview-section {
            margin-bottom: 40px;
            text-align: center;
        }
        .preview-image {
            width: 100%;
            max-width: 900px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            border: 1px solid var(--vscode-panel-border);
        }

        /* 核心功能卡片 */
        .features {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 16px;
            margin-bottom: 40px;
        }
        @media (max-width: 600px) {
            .features {
                grid-template-columns: 1fr;
            }
        }
        .feature-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            padding: 20px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .feature-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
        }
        .feature-card .icon {
            font-size: 28px;
            margin-bottom: 12px;
        }
        .feature-card h3 {
            font-size: 16px;
            margin-bottom: 8px;
            color: var(--vscode-editor-foreground);
        }
        .feature-card p {
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.5;
        }

        /* 操作按钮区 */
        .actions {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-bottom: 30px;
            flex-wrap: wrap;
        }
        .btn {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 14px 28px;
            border: none;
            border-radius: 8px;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-primary {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .btn-primary:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-panel-border);
        }
        .btn-secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }

        /* 底部选项 */
        .footer {
            text-align: center;
            padding: 20px;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .footer-links {
            display: flex;
            gap: 24px;
            justify-content: center;
            margin-bottom: 16px;
        }
        .footer-links a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            font-size: 14px;
            cursor: pointer;
        }
        .footer-links a:hover {
            text-decoration: underline;
        }
        .dont-show {
            display: ${showDontShowAgain ? 'flex' : 'none'};
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-top: 12px;
            font-size: 13px;
            color: var(--vscode-descriptionForeground);
        }
        .dont-show input {
            cursor: pointer;
        }
        .dont-show label {
            cursor: pointer;
        }

        /* 版本信息 */
        .version {
            text-align: center;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 16px;
        }
        .release-notes { margin: 24px 0; text-align: left; }
        .release-notes h2 { font-size: 22px; margin-bottom: 16px; }
        .release-notes details { padding: 16px; margin-bottom: 12px; border: 1px solid var(--vscode-panel-border); border-radius: 8px; }
        .release-notes summary { cursor: pointer; font-weight: bold; }
        .release-notes h3 { margin: 16px 0 8px; font-size: 16px; }
        .release-notes ul { padding-left: 24px; }
        .release-notes li { margin-bottom: 8px; line-height: 1.6; }
        .release-notes code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; }
        .release-notes .release-details { border: 0; padding: 0; margin-top: 12px; }
        .release-details > summary { color: var(--vscode-textLink-foreground); font-weight: normal; }
        .release-notes .change-details { color: var(--vscode-descriptionForeground); margin-top: 6px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">📖</div>
            <h1>欢迎使用 Noveler</h1>
            <p class="subtitle">专为中文小说创作设计的 VS Code 插件</p>
            <a href="#release-notes">查看版本更新</a>
        </div>

        <!-- 功能预览区 -->
        <div class="preview-section">
            <img class="preview-image" src="${imagesUri}/preview-main.png" alt="Noveler 功能预览" />
        </div>

        <!-- 核心功能卡片 -->
        <div class="features">
            <div class="feature-card">
                <div class="icon">📊</div>
                <h3>实时字数统计</h3>
                <p>符合网文平台标准的字数统计，自动更新到 Front Matter，状态栏实时显示</p>
            </div>
            <div class="feature-card">
                <div class="icon">🚨</div>
                <h3>敏感词自动检测</h3>
                <p>三级内置词库 + 自定义词库，边写边检测，一键添加白名单</p>
            </div>
            <div class="feature-card">
                <div class="icon">🎨</div>
                <h3>对话和人物高亮</h3>
                <p>高亮对话和人物称呼，侧栏按定位整理人物</p>
            </div>
            <div class="feature-card">
                <div class="icon">✨</div>
                <h3>智能格式化</h3>
                <p>一键统一引号样式、修正标点符号，保持全文格式一致</p>
            </div>
            <div class="feature-card">
                <div class="icon">📚</div>
                <h3>分卷管理</h3>
                <p>支持多卷结构，按卷组织章节，适合长篇小说创作</p>
            </div>
            <div class="feature-card">
                <div class="icon">🎲</div>
                <h3>随机起名</h3>
                <p>7 种风格姓名生成器，快速为角色起名，支持一键插入</p>
            </div>
        </div>

        <!-- 操作按钮 -->
        <div class="actions">
            <button class="btn btn-primary" onclick="createSampleProject()">
                🚀 新建小说项目
            </button>
            <button class="btn btn-secondary" onclick="openExistingProject()">
                📂 打开现有项目
            </button>
        </div>
        ${releaseNotes}
    </div>

    <div class="footer">
        <div class="footer-links">
            <a onclick="openDocs()">📖 使用文档</a>
            <a onclick="openDocs()">💬 问题反馈</a>
            <a onclick="closePanel()">关闭</a>
        </div>
        <div class="dont-show">
            <input type="checkbox" id="dontShowAgain" onchange="handleDontShowAgain(this.checked)" />
            <label for="dontShowAgain">不再显示此页面</label>
        </div>
        <div class="version">Noveler v${escapeReleaseText(this.version)}</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        ${updatesMode ? "document.getElementById('release-notes')?.scrollIntoView();" : ''}

        function createSampleProject() {
            vscode.postMessage({ command: 'createSampleProject' });
        }

        function openExistingProject() {
            vscode.postMessage({ command: 'openExistingProject' });
        }

        function openDocs() {
            vscode.postMessage({ command: 'openDocs' });
        }

        function closePanel() {
            vscode.postMessage({ command: 'close' });
        }

        function handleDontShowAgain(checked) {
            if (checked) {
                vscode.postMessage({ command: 'dontShowAgain' });
            }
        }
    </script>
</body>
</html>`;
    }
}
