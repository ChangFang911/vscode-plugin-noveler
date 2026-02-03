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
    /** 护眼模式配置 */
    eyeCareMode?: {
        /** 是否启用 */
        enabled?: boolean;
        /** 背景颜色 */
        backgroundColor?: string;
        /** 用户之前使用的主题（禁用时恢复） */
        previousTheme?: string;
    };
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
     * 是否启用分卷功能（嵌套结构）
     * 只有当 enabled=true 且 folderStructure=nested 时才返回 true
     * @returns true 表示启用嵌套分卷模式，false 表示使用扁平结构
     */
    public isVolumesEnabled(): boolean {
        const volumes = this.config.volumes;
        return volumes?.enabled === true && volumes?.folderStructure === 'nested';
    }

    /**
     * 获取护眼模式配置
     * @returns 护眼模式配置对象
     */
    public getEyeCareMode(): { enabled: boolean; backgroundColor: string } {
        return {
            enabled: this.config.eyeCareMode?.enabled ?? false,
            backgroundColor: this.config.eyeCareMode?.backgroundColor ?? '#C7EDCC'  // 豆沙绿
        };
    }

    /**
     * 是否启用护眼模式
     * @returns true 表示启用，false 表示禁用
     */
    public isEyeCareModeEnabled(): boolean {
        return this.config.eyeCareMode?.enabled === true;
    }

    /** 护眼主题名称 */
    private static readonly EYE_CARE_THEME_NAME = 'Noveler 护眼模式';

    /**
     * 切换护眼模式
     * 通过切换 VSCode 主题实现
     * - 启用时：保存当前主题到配置，设置护眼主题
     * - 禁用时：恢复之前保存的主题
     * @param forceState 强制设置状态，不传则切换
     */
    public async toggleEyeCareMode(forceState?: boolean): Promise<boolean> {
        const currentEnabled = this.isEyeCareModeEnabled();
        const newEnabled = forceState !== undefined ? forceState : !currentEnabled;

        const workbenchConfig = vscode.workspace.getConfiguration('workbench');
        const inspected = workbenchConfig.inspect<string>('colorTheme');
        const currentWorkspaceTheme = inspected?.workspaceValue;

        if (newEnabled) {
            // 启用护眼模式：保存当前主题，然后切换到护眼主题
            // 获取当前实际使用的主题（工作区设置 > 全局设置）
            const currentTheme = currentWorkspaceTheme || inspected?.globalValue || 'Default Dark+';
            if (currentTheme !== ConfigService.EYE_CARE_THEME_NAME) {
                // 保存当前主题到 novel.jsonc
                await this.updateConfig((draft) => {
                    if (!draft.noveler) {
                        draft.noveler = {};
                    }
                    if (!draft.noveler.eyeCareMode) {
                        draft.noveler.eyeCareMode = {};
                    }
                    draft.noveler.eyeCareMode.previousTheme = currentTheme;
                });
            }

            // 设置护眼主题
            await workbenchConfig.update('colorTheme', ConfigService.EYE_CARE_THEME_NAME, vscode.ConfigurationTarget.Workspace);
        } else {
            // 禁用护眼模式：恢复之前的主题
            const previousTheme = this.config.eyeCareMode?.previousTheme;

            if (previousTheme) {
                // 恢复之前保存的主题
                await workbenchConfig.update('colorTheme', previousTheme, vscode.ConfigurationTarget.Workspace);
            } else {
                // 没有保存的主题，清除工作区设置
                await workbenchConfig.update('colorTheme', undefined, vscode.ConfigurationTarget.Workspace);
            }

            // 清除 colorCustomizations（如果之前有残留）
            await workbenchConfig.update('colorCustomizations', undefined, vscode.ConfigurationTarget.Workspace);
        }

        // 更新 novel.jsonc 配置中的 enabled 状态
        await this.updateConfig((draft) => {
            if (!draft.noveler) {
                draft.noveler = {};
            }
            if (!draft.noveler.eyeCareMode) {
                draft.noveler.eyeCareMode = {};
            }
            draft.noveler.eyeCareMode.enabled = newEnabled;
        });

        Logger.info(`[Noveler] 护眼模式已${newEnabled ? '启用' : '禁用'}`);
        return newEnabled;
    }

    /**
     * 更新配置文件
     * 使用回调函数修改配置，保留 JSONC 注释
     * @param updater 配置更新回调，接收当前配置的副本进行修改
     */
    public async updateConfig(updater: (draft: { noveler?: NovelConfig }) => void): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('未找到工作区文件夹');
        }

        const configUri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);

        // 读取当前配置文件
        let configText: string;
        try {
            const fileData = await vscode.workspace.fs.readFile(configUri);
            configText = Buffer.from(fileData).toString('utf8');
        } catch {
            throw new Error('无法读取配置文件 novel.jsonc');
        }

        // 解析当前配置
        const currentConfig = jsoncParser.parse(configText) || {};

        // 创建副本并应用更新
        const draft = JSON.parse(JSON.stringify(currentConfig));
        updater(draft);

        // 计算需要修改的路径和值
        const edits: jsoncParser.EditResult = [];

        // 比较并生成编辑操作
        const generateEdits = (path: (string | number)[], oldObj: unknown, newObj: unknown) => {
            if (typeof newObj !== 'object' || newObj === null) {
                // 原始值，直接设置
                if (oldObj !== newObj) {
                    edits.push(...jsoncParser.modify(configText, path, newObj, {
                        formattingOptions: { tabSize: 2, insertSpaces: true }
                    }));
                }
            } else if (Array.isArray(newObj)) {
                // 数组，直接替换
                if (JSON.stringify(oldObj) !== JSON.stringify(newObj)) {
                    edits.push(...jsoncParser.modify(configText, path, newObj, {
                        formattingOptions: { tabSize: 2, insertSpaces: true }
                    }));
                }
            } else {
                // 对象，递归处理
                const oldRecord = (oldObj as Record<string, unknown>) || {};
                const newRecord = newObj as Record<string, unknown>;
                for (const key of Object.keys(newRecord)) {
                    generateEdits([...path, key], oldRecord[key], newRecord[key]);
                }
            }
        };

        generateEdits([], currentConfig, draft);

        // 应用编辑
        if (edits.length > 0) {
            const newText = jsoncParser.applyEdits(configText, edits);
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(configUri, encoder.encode(newText));

            // 重新加载配置
            await this.loadConfig();
            Logger.info('配置已更新');
        }
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
