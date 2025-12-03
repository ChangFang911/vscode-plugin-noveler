import * as vscode from 'vscode';
import { SensitiveWordService } from '../services/sensitiveWordService';
import { SensitiveMatch } from '../types/sensitiveWord';
import { Logger } from '../utils/logger';

/**
 * 敏感词诊断提供器
 * 负责在 VSCode 中显示敏感词检测结果
 */
export class SensitiveWordDiagnosticProvider {
    private diagnosticCollection: vscode.DiagnosticCollection;
    private service: SensitiveWordService;
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_DELAY = 500; // 500ms 防抖
    private statusBarItem: vscode.StatusBarItem | null = null;

    constructor(service: SensitiveWordService) {
        this.service = service;
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('noveler-sensitive');
    }

    /**
     * 注册事件监听
     * @param context 扩展上下文
     */
    public register(context: vscode.ExtensionContext): void {
        const config = this.service.getConfig();

        // 创建状态栏项
        if (config.display.showWordCount) {
            this.statusBarItem = vscode.window.createStatusBarItem(
                vscode.StatusBarAlignment.Right,
                99 // 优先级，数字越大越靠左
            );
            this.statusBarItem.command = 'noveler.showSensitiveWordDetails';
            context.subscriptions.push(this.statusBarItem);
        }

        // 打开文档时检测
        context.subscriptions.push(
            vscode.workspace.onDidOpenTextDocument((document) => {
                this.updateDiagnostics(document);
            })
        );

        // 切换活动编辑器时更新状态栏
        context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor((editor) => {
                if (editor) {
                    this.updateDiagnostics(editor.document);
                } else {
                    this.updateStatusBar(0);
                }
            })
        );

        // 输入时检测（防抖）
        if (config.checkOnType) {
            context.subscriptions.push(
                vscode.workspace.onDidChangeTextDocument((event) => {
                    this.onDidChangeTextDocument(event);
                })
            );
        }

        // 保存时检测
        if (config.checkOnSave) {
            context.subscriptions.push(
                vscode.workspace.onDidSaveTextDocument((document) => {
                    this.updateDiagnostics(document);
                })
            );
        }

        // 关闭文档时清除诊断
        context.subscriptions.push(
            vscode.workspace.onDidCloseTextDocument((document) => {
                this.diagnosticCollection.delete(document.uri);
            })
        );

        // 检测当前活动编辑器
        if (vscode.window.activeTextEditor) {
            this.updateDiagnostics(vscode.window.activeTextEditor.document);
        }

        Logger.info('敏感词诊断提供器已注册');
    }

    /**
     * 文档内容变化时的处理（防抖）
     * @param event 文档变化事件
     */
    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        // 清除旧定时器
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // 设置新定时器
        this.debounceTimer = setTimeout(() => {
            this.updateDiagnostics(event.document);
        }, this.DEBOUNCE_DELAY);
    }

    /**
     * 更新诊断信息
     * @param document VSCode 文档
     */
    public updateDiagnostics(document: vscode.TextDocument): void {
        if (document.languageId !== 'markdown') {
            this.updateStatusBar(0);
            return;
        }

        try {
            const matches = this.service.detect(document);
            const diagnostics: vscode.Diagnostic[] = [];

            for (const match of matches) {
                const diagnostic = this.createDiagnostic(document, match);
                diagnostics.push(diagnostic);
            }

            this.diagnosticCollection.set(document.uri, diagnostics);

            // 更新状态栏
            this.updateStatusBar(matches.length);
        } catch (error) {
            Logger.error('更新敏感词诊断失败', error);
            this.updateStatusBar(0);
        }
    }

    /**
     * 创建诊断对象
     * @param document VSCode 文档
     * @param match 匹配结果
     * @returns 诊断对象
     */
    private createDiagnostic(document: vscode.TextDocument, match: SensitiveMatch): vscode.Diagnostic {
        const range = new vscode.Range(
            document.positionAt(match.start),
            document.positionAt(match.end)
        );

        const config = this.service.getConfig();
        const severity = this.mapSeverity(config.display.severity);
        const levelText = this.getLevelText(match.level);

        const diagnostic = new vscode.Diagnostic(
            range,
            `检测到${levelText}敏感词: "${match.word}"`,
            severity
        );

        diagnostic.source = 'Noveler';
        diagnostic.code = 'sensitive-word';
        diagnostic.tags = [vscode.DiagnosticTag.Unnecessary];

        return diagnostic;
    }

    /**
     * 映射严重程度
     * @param severity 配置中的严重程度
     * @returns VSCode 诊断严重程度
     */
    private mapSeverity(severity: 'Error' | 'Warning' | 'Information'): vscode.DiagnosticSeverity {
        switch (severity) {
            case 'Error':
                return vscode.DiagnosticSeverity.Error;
            case 'Warning':
                return vscode.DiagnosticSeverity.Warning;
            case 'Information':
                return vscode.DiagnosticSeverity.Information;
            default:
                return vscode.DiagnosticSeverity.Warning;
        }
    }

    /**
     * 获取级别文本
     * @param level 敏感词级别
     * @returns 级别文本
     */
    private getLevelText(level: string): string {
        switch (level) {
            case 'high':
                return '高危';
            case 'medium':
                return '中危';
            case 'low':
                return '低危';
            default:
                return '';
        }
    }

    /**
     * 更新状态栏显示
     * @param count 敏感词数量
     */
    private updateStatusBar(count: number): void {
        if (!this.statusBarItem) {
            return;
        }

        if (count === 0) {
            this.statusBarItem.hide();
        } else {
            this.statusBarItem.text = `$(warning) 敏感词: ${count}`;
            this.statusBarItem.tooltip = `检测到 ${count} 个敏感词，点击查看详情`;
            this.statusBarItem.show();
        }
    }

    /**
     * 清除所有诊断
     */
    public clearAll(): void {
        this.diagnosticCollection.clear();
        this.updateStatusBar(0);
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.diagnosticCollection.dispose();
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        if (this.statusBarItem) {
            this.statusBarItem.dispose();
        }
    }
}
