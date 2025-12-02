/**
 * Webview 统计面板 - 显示写作统计的可视化仪表板
 */

import * as vscode from 'vscode';
import { ProjectStatsService } from '../services/projectStatsService';

export class StatsWebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;
    private statsService: ProjectStatsService;

    constructor(
        private context: vscode.ExtensionContext,
        statsService: ProjectStatsService
    ) {
        this.statsService = statsService;
    }

    /**
     * 显示统计面板
     */
    public async show() {
        const columnToShowIn = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (StatsWebviewProvider.currentPanel) {
            // 如果面板已存在，显示它
            StatsWebviewProvider.currentPanel.reveal(columnToShowIn);
        } else {
            // 创建新面板
            StatsWebviewProvider.currentPanel = vscode.window.createWebviewPanel(
                'novelerStats',
                '📊 写作统计',
                columnToShowIn || vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );

            // 设置 HTML 内容
            await this.updateContent();

            // 监听面板关闭
            StatsWebviewProvider.currentPanel.onDidDispose(
                () => {
                    StatsWebviewProvider.currentPanel = undefined;
                },
                null,
                this.context.subscriptions
            );

            // 监听来自 Webview 的消息
            StatsWebviewProvider.currentPanel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'refresh':
                            await this.updateContent();
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );
        }
    }

    /**
     * 更新面板内容
     */
    private async updateContent() {
        if (!StatsWebviewProvider.currentPanel) {
            return;
        }

        const stats = await this.statsService.getStats();
        if (stats) {
            StatsWebviewProvider.currentPanel.webview.html = this.getHtmlContent(stats);
        }
    }

    /**
     * 生成 HTML 内容
     */
    private getHtmlContent(stats: any): string {
        const completionRate = stats.completionRate || 0;
        const totalWords = stats.totalWords || 0;
        const chapterCount = stats.chapterCount || 0;
        const completedChapters = stats.completedChapters || 0;
        const characterCount = stats.characterCount || 0;

        // 计算平均章节字数
        const avgWordsPerChapter = chapterCount > 0 ? Math.round(totalWords / chapterCount) : 0;

        return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>写作统计</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid var(--vscode-panel-border);
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header p {
            color: var(--vscode-descriptionForeground);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            padding: 20px;
            transition: transform 0.2s;
        }
        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        .stat-card .icon {
            font-size: 32px;
            margin-bottom: 10px;
        }
        .stat-card .label {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
        }
        .stat-card .value {
            font-size: 32px;
            font-weight: bold;
            color: var(--vscode-charts-blue);
        }
        .stat-card .sub-value {
            font-size: 14px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        .progress-section {
            margin-bottom: 30px;
        }
        .progress-section h2 {
            font-size: 20px;
            margin-bottom: 15px;
        }
        .progress-bar {
            width: 100%;
            height: 40px;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 20px;
            overflow: hidden;
            position: relative;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg,
                var(--vscode-charts-blue),
                var(--vscode-charts-green));
            transition: width 0.5s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-weight: bold;
        }
        .action-buttons {
            display: flex;
            gap: 10px;
            justify-content: center;
            margin-top: 20px;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            transition: background 0.2s;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .chart-placeholder {
            margin-top: 30px;
            padding: 40px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px dashed var(--vscode-panel-border);
            border-radius: 8px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 写作统计仪表板</h1>
        <p>实时查看您的写作进度</p>
    </div>

    <div class="stats-grid">
        <div class="stat-card">
            <div class="icon">📝</div>
            <div class="label">总字数</div>
            <div class="value">${totalWords.toLocaleString()}</div>
            <div class="sub-value">平均每章 ${avgWordsPerChapter.toLocaleString()} 字</div>
        </div>

        <div class="stat-card">
            <div class="icon">📚</div>
            <div class="label">章节数</div>
            <div class="value">${chapterCount}</div>
            <div class="sub-value">已完成 ${completedChapters} 章</div>
        </div>

        <div class="stat-card">
            <div class="icon">👥</div>
            <div class="label">人物数</div>
            <div class="value">${characterCount}</div>
            <div class="sub-value">已创建的人物角色</div>
        </div>

        <div class="stat-card">
            <div class="icon">✅</div>
            <div class="label">完成进度</div>
            <div class="value">${completionRate}%</div>
            <div class="sub-value">${completedChapters}/${chapterCount} 章节</div>
        </div>
    </div>

    <div class="progress-section">
        <h2>章节完成进度</h2>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${completionRate}%">
                ${completionRate}%
            </div>
        </div>
    </div>

    <div class="chart-placeholder">
        <h3>📈 未来功能预告</h3>
        <p>即将支持：每日字数趋势图、写作速度分析、章节字数分布等</p>
    </div>

    <div class="action-buttons">
        <button onclick="refresh()">🔄 刷新数据</button>
        <button onclick="close()">❌ 关闭</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function refresh() {
            vscode.postMessage({ command: 'refresh' });
        }

        function close() {
            window.close();
        }
    </script>
</body>
</html>`;
    }
}
