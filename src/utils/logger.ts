/**
 * 统一日志系统
 */

import * as vscode from 'vscode';

export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3
}

export class Logger {
    private static outputChannel: vscode.OutputChannel | null = null;
    private static level: LogLevel = LogLevel.Info;

    /**
     * 初始化日志系统
     * @param context VSCode 扩展上下文
     * @param level 日志级别，默认为 Info
     */
    public static initialize(context: vscode.ExtensionContext, level: LogLevel = LogLevel.Info): void {
        this.level = level;
        this.outputChannel = vscode.window.createOutputChannel('Noveler');
        context.subscriptions.push(this.outputChannel);
    }

    /**
     * 设置日志级别
     * @param level 日志级别
     */
    public static setLevel(level: LogLevel): void {
        this.level = level;
    }

    /**
     * 调试日志
     * @param message 日志消息
     * @param data 额外数据
     */
    public static debug(message: string, ...data: any[]): void {
        if (this.level <= LogLevel.Debug) {
            const timestamp = this.getTimestamp();
            console.log(`[Noveler DEBUG ${timestamp}] ${message}`, ...data);
            this.outputChannel?.appendLine(`[DEBUG ${timestamp}] ${message} ${this.formatData(data)}`);
        }
    }

    /**
     * 信息日志
     * @param message 日志消息
     * @param data 额外数据
     */
    public static info(message: string, ...data: any[]): void {
        if (this.level <= LogLevel.Info) {
            const timestamp = this.getTimestamp();
            console.log(`[Noveler INFO ${timestamp}] ${message}`, ...data);
            this.outputChannel?.appendLine(`[INFO ${timestamp}] ${message} ${this.formatData(data)}`);
        }
    }

    /**
     * 警告日志
     * @param message 日志消息
     * @param data 额外数据
     */
    public static warn(message: string, ...data: any[]): void {
        if (this.level <= LogLevel.Warn) {
            const timestamp = this.getTimestamp();
            console.warn(`[Noveler WARN ${timestamp}] ${message}`, ...data);
            this.outputChannel?.appendLine(`[WARN ${timestamp}] ${message} ${this.formatData(data)}`);
        }
    }

    /**
     * 错误日志
     * @param message 日志消息
     * @param error 错误对象
     * @param data 额外数据
     */
    public static error(message: string, error?: Error | unknown, ...data: any[]): void {
        const timestamp = this.getTimestamp();
        console.error(`[Noveler ERROR ${timestamp}] ${message}`, error, ...data);

        let errorMsg = '';
        if (error instanceof Error) {
            errorMsg = `\n  Error: ${error.message}\n  Stack: ${error.stack}`;
        } else if (error) {
            errorMsg = `\n  Error: ${String(error)}`;
        }

        this.outputChannel?.appendLine(
            `[ERROR ${timestamp}] ${message}${errorMsg} ${this.formatData(data)}`
        );

        // 错误日志显示输出面板
        this.outputChannel?.show(true);
    }

    /**
     * 显示输出面板
     */
    public static show(): void {
        this.outputChannel?.show();
    }

    /**
     * 清除输出面板
     */
    public static clear(): void {
        this.outputChannel?.clear();
    }

    /**
     * 获取时间戳
     */
    private static getTimestamp(): string {
        const now = new Date();
        return now.toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }

    /**
     * 格式化额外数据
     */
    private static formatData(data: any[]): string {
        if (data.length === 0) {
            return '';
        }
        try {
            return JSON.stringify(data, null, 2);
        } catch {
            return String(data);
        }
    }

    /**
     * 性能测量：记录开始时间
     * @param label 测量标签
     */
    public static timeStart(label: string): void {
        if (this.level <= LogLevel.Debug) {
            console.time(`[Noveler] ${label}`);
        }
    }

    /**
     * 性能测量：记录结束时间并输出
     * @param label 测量标签
     */
    public static timeEnd(label: string): void {
        if (this.level <= LogLevel.Debug) {
            console.timeEnd(`[Noveler] ${label}`);
        }
    }
}
