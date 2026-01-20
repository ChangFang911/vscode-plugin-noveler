import * as vscode from 'vscode';
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import { CONFIG_FILE_NAME } from '../constants';
import * as jsoncParser from 'jsonc-parser';
import { validateConfig, fixConfig } from '../utils/configValidator';
import { Logger } from '../utils/logger';
import { SensitiveWordConfig } from '../types/sensitiveWord';
import { VolumesConfig } from '../types/volume';

/**
 * 高亮样式配置接口
 */
export interface HighlightStyle {
    /** 文字颜色 */
    color?: string;
    /** 背景颜色 */
    backgroundColor?: string;
    /** 字体样式（normal, italic 等） */
    fontStyle?: string;
    /** 字体粗细（normal, bold 等） */
    fontWeight?: string;
}

/**
 * 小说配置接口
 * 对应 novel.jsonc 中的 noveler 配置项
 */
export interface NovelConfig {
    /** 目标字数配置 */
    targetWords?: {
        /** 每章默认目标字数 */
        default?: number;
    };
    /** 高亮配置 */
    highlight?: {
        /** 对话高亮样式 */
        dialogue?: HighlightStyle;
        /** 人物名高亮样式 */
        character?: HighlightStyle;
    };
    /** 格式化配置 */
    format?: {
        /** 中文引号样式（「」或""） */
        chineseQuoteStyle?: string;
        /** 是否自动格式化 */
        autoFormat?: boolean;
        /** 是否转换引号 */
        convertQuotes?: boolean;
    };
    /** 字数统计配置 */
    wordCount?: {
        /** 是否在状态栏显示字数统计 */
        showInStatusBar?: boolean;
        /** 是否包含标点符号 */
        includePunctuation?: boolean;
    };
    /** README 自动更新配置 */
    autoUpdateReadmeOnCreate?: {
        /** 更新模式：'always' | 'ask' | 'never' */
        value?: string;
    };
    /** 自动空行配置 */
    autoEmptyLine?: {
        /** 是否启用自动空行 */
        value?: boolean;
    };
    /** 段落缩进配置 */
    paragraphIndent?: {
        /** 是否启用段落首行缩进（两个全角空格） */
        value?: boolean;
    };
    /** 人物配置 */
    characters?: {
        /** 人物名称列表 */
        list?: string[];
    };
    /** 敏感词检测配置 */
    sensitiveWords?: SensitiveWordConfig;
    /** 分卷功能配置 */
    volumes?: VolumesConfig;
}

/**
 * 配置服务类
 * 管理小说项目的配置，包括加载、验证、监听配置文件变更
 * 使用单例模式，确保全局只有一个配置实例
 *
 * @example
 * ```typescript
 * // 在 extension.ts 中初始化
 * const configService = ConfigService.initialize();
 *
 * // 在其他地方获取实例
 * const config = ConfigService.getInstance();
 * const targetWords = config.getTargetWords();
 * ```
 */
export class ConfigService {
    private static instance?: ConfigService;
    private config: NovelConfig = {};
    private fileWatcher?: vscode.FileSystemWatcher;
    private configLoadPromise?: Promise<void>; // 配置加载的 Promise，避免竞态条件

    // 配置变更事件发射器
    private _onDidChangeConfig = new vscode.EventEmitter<NovelConfig>();
    public readonly onDidChangeConfig = this._onDidChangeConfig.event;

    private constructor() {
        // 先设置默认配置，确保立即可用
        this.setDefaultConfig();
        // 然后异步加载实际配置
        this.configLoadPromise = this.loadConfig();
        this.watchConfig();
    }

    /**
     * 初始化 ConfigService（仅在 extension.ts 中调用一次）
     * @returns ConfigService 实例
     */
    public static initialize(): ConfigService {
        if (ConfigService.instance) {
            Logger.warn('ConfigService 已经初始化，忽略重复初始化');
            return ConfigService.instance;
        }
        ConfigService.instance = new ConfigService();
        Logger.debug('ConfigService 初始化完成');
        return ConfigService.instance;
    }

    /**
     * 获取 ConfigService 单例实例
     * @returns ConfigService 实例
     * @throws 如果 ConfigService 尚未初始化
     */
    public static getInstance(): ConfigService {
        if (!ConfigService.instance) {
            throw new Error('ConfigService not initialized. Call ConfigService.initialize() first in extension.ts');
        }
        return ConfigService.instance;
    }

    /**
     * 等待配置加载完成
     */
    public async waitForConfig(): Promise<void> {
        if (this.configLoadPromise) {
            await this.configLoadPromise;
        }
    }

    private async loadConfig() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const configUri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);

        try {
            const fileData = await vscode.workspace.fs.readFile(configUri);
            const configText = Buffer.from(fileData).toString('utf8');

            let fullConfig;
            try {
                // 使用 jsonc-parser 解析 JSONC（支持注释）
                fullConfig = jsoncParser.parse(configText);
            } catch (parseError) {
                handleError('novel.jsonc 解析失败，请检查 JSON 格式', parseError, ErrorSeverity.Warning);
                return;
            }

            // 提取 noveler 配置部分
            if (fullConfig.noveler) {
                // 验证配置
                const errors = validateConfig(fullConfig.noveler);
                if (errors.length > 0) {
                    const errorMessages = errors.filter(e => e.severity === 'error');
                    const warningMessages = errors.filter(e => e.severity === 'warning');

                    if (errorMessages.length > 0) {
                        const msg = errorMessages.map(e => `${e.field}: ${e.message}`).join('\n');
                        handleError(`配置验证失败:\n${msg}`, new Error('Configuration validation failed'), ErrorSeverity.Error);
                        // 尝试修复配置
                        this.config = fixConfig(fullConfig.noveler);
                    } else {
                        this.config = fullConfig.noveler;
                    }

                    // 显示警告
                    if (warningMessages.length > 0) {
                        const msg = warningMessages.map(e => `${e.field}: ${e.message}`).join('\n');
                        vscode.window.showWarningMessage(`配置警告:\n${msg}`);
                    }
                } else {
                    this.config = fullConfig.noveler;
                }

                // 触发配置变更事件
                this._onDidChangeConfig.fire(this.config);
                // 配置加载完成，触发重新加载高亮
                vscode.commands.executeCommand('noveler.reloadHighlights');
            }
        } catch (error) {
            // 配置文件不存在，使用默认配置（不是错误）
            Logger.debug('novel.jsonc 不存在，使用默认配置');
        }
    }

    /**
     * 设置默认配置
     * 注意：这些值应与 templates/default-config.jsonc 保持一致
     */
    private setDefaultConfig() {
        this.config = {
            targetWords: {
                default: 2500
            },
            highlight: {
                dialogue: {
                    color: "#ce9178",
                    backgroundColor: "rgba(206, 145, 120, 0.15)",
                    fontStyle: "normal"
                },
                character: {
                    color: "#4ec9b0",
                    backgroundColor: "rgba(78, 201, 176, 0.15)",
                    fontWeight: "bold"
                }
            },
            format: {
                chineseQuoteStyle: "「」",
                autoFormat: true,
                convertQuotes: true
            },
            wordCount: {
                showInStatusBar: true,
                includePunctuation: true
            },
            autoUpdateReadmeOnCreate: {
                value: "always"
            },
            autoEmptyLine: {
                value: true
            },
            paragraphIndent: {
                value: true  // 默认开启，与文档和模板保持一致
            },
            characters: {
                list: []
            }
        };
    }

    private watchConfig() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const pattern = new vscode.RelativePattern(workspaceFolder, CONFIG_FILE_NAME);
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidChange(() => {
            this.configLoadPromise = this.loadConfig();
            // 触发重新加载高亮
            vscode.commands.executeCommand('noveler.reloadHighlights');
        });

        this.fileWatcher.onDidCreate(() => {
            this.configLoadPromise = this.loadConfig();
        });
    }

    /**
     * 获取完整的配置对象
     * @returns 当前的配置对象
     */
    public getConfig(): NovelConfig {
        return this.config;
    }

    /**
     * 获取指定类型的高亮样式
     * @param type 高亮类型：'dialogue'（对话）, 'character'（人物名）
     * @returns 对应的高亮样式配置
     */
    public getHighlightStyle(type: 'dialogue' | 'character'): HighlightStyle {
        return this.config.highlight?.[type] || {};
    }

    /**
     * 获取中文引号样式
     * @returns 引号样式，默认为 "「」"
     */
    public getChineseQuoteStyle(): string {
        return this.config.format?.chineseQuoteStyle || "「」";
    }

    /**
     * 是否在状态栏显示字数统计
     * @returns true 表示显示，false 表示隐藏，默认为 true
     */
    public shouldShowWordCountInStatusBar(): boolean {
        return this.config.wordCount?.showInStatusBar !== false;
    }

    /**
     * 是否启用自动格式化
     * @returns true 表示启用，false 表示禁用，默认为 true
     */
    public shouldAutoFormat(): boolean {
        return this.config.format?.autoFormat !== false;
    }

    /**
     * 获取人物名称列表
     * @returns 人物名称数组，用于高亮显示
     */
    public getCharacters(): string[] {
        return this.config.characters?.list || [];
    }

    /**
     * 是否自动转换引号
     * @returns true 表示启用，false 表示禁用，默认为 true
     */
    public shouldConvertQuotes(): boolean {
        return this.config.format?.convertQuotes !== false;
    }

    /**
     * 是否启用自动空行功能
     * 在 chapters 目录下编辑时，按回车会自动插入空行
     * @returns true 表示启用，false 表示禁用，默认为 true
     */
    public shouldAutoEmptyLine(): boolean {
        return this.config.autoEmptyLine?.value !== false;
    }

    /**
     * 是否启用段落首行缩进功能
     * 在 chapters 目录下编辑时，新段落会自动添加两个全角空格缩进
     * @returns true 表示启用，false 表示禁用，默认为 false
     */
    public shouldParagraphIndent(): boolean {
        return this.config.paragraphIndent?.value === true;
    }

    /**
     * 获取 README 自动更新配置
     * @returns 'always'（总是更新）, 'ask'（询问用户）, 'never'（从不更新），默认为 'always'
     */
    public getReadmeAutoUpdateMode(): string {
        return this.config.autoUpdateReadmeOnCreate?.value || 'always';
    }

    /**
     * 获取章节目标字数
     * @returns 默认目标字数，默认为 2500
     */
    public getTargetWords(): number {
        return this.config.targetWords?.default || 2500;
    }

    /**
     * 获取分卷功能配置
     * @returns 分卷配置对象
     */
    public getVolumesConfig(): VolumesConfig {
        return this.config.volumes || {
            enabled: false,
            folderStructure: 'flat',
            numberFormat: 'arabic',
            chapterNumbering: 'global'
        };
    }

    /**
     * 是否启用分卷功能
     * @returns true 表示启用，false 表示禁用，默认为 false
     */
    public isVolumesEnabled(): boolean {
        return this.config.volumes?.enabled === true;
    }

    /**
     * 释放资源
     * 清理文件监听器和事件发射器
     */
    public dispose() {
        this.fileWatcher?.dispose();
        this._onDidChangeConfig.dispose();
    }
}
