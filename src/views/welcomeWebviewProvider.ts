/**
 * 新手欢迎页面 - Webview 实现
 * 首次安装或首次打开工作区时显示
 */

import * as vscode from 'vscode';

const WELCOME_STATE_KEY = 'noveler.welcomeShown';

export class WelcomeWebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

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
    public async show(autoShow = false): Promise<void> {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WelcomeWebviewProvider.currentPanel) {
            WelcomeWebviewProvider.currentPanel.reveal(columnToShowIn);
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
            autoShow
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
    private getHtmlContent(webview: vscode.Webview, showDontShowAgain: boolean): string {
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">📖</div>
            <h1>欢迎使用 Noveler</h1>
            <p class="subtitle">专为中文小说创作设计的 VS Code 插件</p>
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
                <p>自动高亮对话内容和人物名称，让阅读和编辑更加清晰</p>
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
                🚀 创建示例项目
            </button>
            <button class="btn btn-secondary" onclick="openExistingProject()">
                📂 打开现有项目
            </button>
        </div>
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
        <div class="version">Noveler v0.7.1</div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

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
