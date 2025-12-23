import * as vscode from 'vscode';
import * as path from 'path';
import * as jsoncParser from 'jsonc-parser';
import { TrieTree } from '../utils/trieTree';
import {
    SensitiveWordConfig,
    SensitiveLevel,
    SensitiveMatch,
    WordLibraryFile,
    WordLibraryMetadata,
    CustomWordLibrary
} from '../types/sensitiveWord';
import { Logger } from '../utils/logger';
import { ConfigService } from './configService';
import { extractContentWithoutFrontmatterForMatching } from '../utils/frontMatterHelper';

/**
 * 敏感词检测服务
 * 负责加载词库、检测文档中的敏感词
 *
 * @example
 * ```typescript
 * const service = SensitiveWordService.initialize(context);
 * const matches = service.detect(document);
 * ```
 */
export class SensitiveWordService {
    private static instance: SensitiveWordService | null = null;
    private trie: TrieTree = new TrieTree();
    private whitelist: Set<string> = new Set();
    private config!: SensitiveWordConfig;
    private context!: vscode.ExtensionContext;

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    private constructor() {}

    /**
     * 初始化服务（单例）
     * @param context 扩展上下文
     * @returns 服务实例
     */
    public static async initialize(context: vscode.ExtensionContext): Promise<SensitiveWordService> {
        if (!SensitiveWordService.instance) {
            SensitiveWordService.instance = new SensitiveWordService();
        }
        SensitiveWordService.instance.context = context;
        SensitiveWordService.instance.loadConfig();
        await SensitiveWordService.instance.initializeAsync();  // 等待初始化完成
        return SensitiveWordService.instance;
    }

    /**
     * 获取服务实例
     * @returns 服务实例
     */
    public static getInstance(): SensitiveWordService {
        if (!SensitiveWordService.instance) {
            throw new Error('SensitiveWordService not initialized. Call initialize() first.');
        }
        return SensitiveWordService.instance;
    }

    /**
     * 异步初始化(加载词库)
     */
    private async initializeAsync(): Promise<void> {
        if (!this.config.enabled) {
            Logger.info('敏感词检测已禁用');
            return;
        }

        try {
            // 清空现有数据
            this.trie.clear();
            this.whitelist.clear();

            // 1. 加载内置词库
            if (this.config.builtInLibrary?.enabled) {
                await this.loadBuiltinLibrary();
            }

            // 2. 加载自定义敏感词库
            if (this.config.customLibrary?.enabled) {
                await this.loadCustomSensitiveLibrary();
            }

            // 3. 加载白名单
            if (this.config.whitelist?.enabled) {
                await this.loadWhitelist();
            }

            // 兼容旧版配置：如果使用了 customWords 配置
            if (this.config.customWords?.enabled) {
                await this.loadCustomLibrary();
            }

            Logger.info(`敏感词检测服务初始化完成，共加载 ${this.trie.getWordCount()} 个敏感词`);
        } catch (error) {
            Logger.error('敏感词检测服务初始化失败', error);
        }
    }

    /**
     * 加载配置
     */
    private loadConfig(): void {
        const configService = ConfigService.getInstance();
        const projectConfig = configService.getConfig();

        // 默认配置
        const defaultConfig: SensitiveWordConfig = {
            enabled: true,
            builtInLibrary: {
                enabled: true,
                levels: {
                    high: true,
                    medium: false,
                    low: false
                }
            },
            customLibrary: {
                enabled: true,
                path: '.noveler/sensitive-words/custom-words.jsonc'
            },
            whitelist: {
                enabled: true,
                path: '.noveler/sensitive-words/whitelist.jsonc'
            },
            checkOnType: true,
            checkOnSave: true,
            display: {
                severity: 'Warning',
                showInProblems: true,
                showWordCount: true
            }
        };

        // 合并项目配置（仅使用 novel.json 中的配置）
        const userConfig = projectConfig.sensitiveWords;

        // 处理新旧配置兼容
        let builtInLibrary = defaultConfig.builtInLibrary;
        if (userConfig?.builtInLibrary) {
            builtInLibrary = {
                ...defaultConfig.builtInLibrary,
                ...userConfig.builtInLibrary,
                levels: {
                    ...defaultConfig.builtInLibrary!.levels,
                    ...userConfig.builtInLibrary.levels
                }
            };
        } else if (userConfig?.levels) {
            // 兼容旧版配置：levels 直接配置的情况
            builtInLibrary = {
                enabled: true,
                levels: {
                    ...defaultConfig.builtInLibrary!.levels,
                    ...userConfig.levels
                }
            };
        }

        this.config = {
            enabled: userConfig?.enabled !== undefined ? userConfig.enabled : defaultConfig.enabled,
            builtInLibrary,
            customLibrary: {
                enabled: userConfig?.customLibrary?.enabled !== undefined ? userConfig.customLibrary.enabled : defaultConfig.customLibrary!.enabled,
                path: userConfig?.customLibrary?.path || defaultConfig.customLibrary!.path
            },
            whitelist: {
                enabled: userConfig?.whitelist?.enabled !== undefined ? userConfig.whitelist.enabled : defaultConfig.whitelist!.enabled,
                path: userConfig?.whitelist?.path || defaultConfig.whitelist!.path
            },
            checkOnType: userConfig?.checkOnType !== undefined ? userConfig.checkOnType : defaultConfig.checkOnType,
            checkOnSave: userConfig?.checkOnSave !== undefined ? userConfig.checkOnSave : defaultConfig.checkOnSave,
            // 兼容旧版配置
            customWords: userConfig?.customWords ? {
                enabled: userConfig.customWords.enabled,
                blacklistPath: userConfig.customWords.blacklistPath,
                whitelistPath: userConfig.customWords.whitelistPath
            } : undefined,
            display: {
                severity: userConfig?.display?.severity || defaultConfig.display!.severity,
                showInProblems: userConfig?.display?.showInProblems !== undefined ? userConfig.display.showInProblems : defaultConfig.display!.showInProblems,
                showWordCount: userConfig?.display?.showWordCount !== undefined ? userConfig.display.showWordCount : defaultConfig.display!.showWordCount
            }
        };

        Logger.info('[SensitiveWord] 加载配置完成:', {
            enabled: this.config.enabled,
            builtInLibrary: this.config.builtInLibrary,
            customLibrary: this.config.customLibrary,
            checkOnType: this.config.checkOnType
        });
    }

    /**
     * 加载内置词库
     */
    private async loadBuiltinLibrary(): Promise<void> {
        const libPath = path.join(this.context.extensionPath, 'templates', 'sensitive-words');

        // 读取元数据
        const metadataPath = path.join(libPath, 'metadata.json');
        const metadataUri = vscode.Uri.file(metadataPath);

        try {
            const metadataBytes = await vscode.workspace.fs.readFile(metadataUri);
            const metadataContent = Buffer.from(metadataBytes).toString('utf8');
            const metadata: WordLibraryMetadata = JSON.parse(metadataContent);
            Logger.info(`加载内置词库 v${metadata.version}，共 ${metadata.totalWords} 个词`);
        } catch {
            // 元数据文件不存在，继续加载词库
        }

        // 根据配置加载各级别词库
        const levels: SensitiveLevel[] = ['high', 'medium', 'low'];
        for (const level of levels) {
            if (this.config.builtInLibrary?.levels[level]) {
                await this.loadLevelWords(libPath, level);
            }
        }
    }

    /**
     * 加载某个级别的词库
     * @param libPath 词库目录路径
     * @param level 级别
     */
    private async loadLevelWords(libPath: string, level: SensitiveLevel): Promise<void> {
        const filePath = path.join(libPath, `level-${level}.json`);
        const fileUri = vscode.Uri.file(filePath);

        try {
            const contentBytes = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const data: WordLibraryFile = JSON.parse(content);

            this.trie.insertBatch(data.words, level);
            Logger.info(`加载 ${level} 级别词库，共 ${data.words.length} 个词`);
        } catch (error) {
            Logger.warn(`词库文件不存在或加载失败: ${filePath}`);
        }
    }

    /**
     * 加载自定义敏感词库（用户完全自定义的敏感词列表）
     */
    private async loadCustomSensitiveLibrary(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return;
        }

        const customPath = path.join(workspaceRoot, this.config.customLibrary!.path);
        const customUri = vscode.Uri.file(customPath);

        try {
            const contentBytes = await vscode.workspace.fs.readFile(customUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const data: CustomWordLibrary = jsoncParser.parse(content);

            if (data.words && Array.isArray(data.words)) {
                // 简化版：所有自定义敏感词都视为 high 级别
                this.trie.insertBatch(data.words, 'high');
                Logger.info(`加载自定义敏感词库，共 ${data.words.length} 个词`);
            }
        } catch (error) {
            Logger.info(`自定义敏感词库文件不存在: ${customPath}`);
        }
    }

    /**
     * 加载白名单
     */
    private async loadWhitelist(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return;
        }

        const whitelistPath = path.join(workspaceRoot, this.config.whitelist!.path);
        const whitelistUri = vscode.Uri.file(whitelistPath);

        try {
            const contentBytes = await vscode.workspace.fs.readFile(whitelistUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const data: CustomWordLibrary = jsoncParser.parse(content);

            if (data.words && Array.isArray(data.words)) {
                this.whitelist = new Set(data.words);
                Logger.info(`加载白名单，共 ${this.whitelist.size} 个词`);
            }
        } catch (error) {
            Logger.info(`白名单文件不存在: ${whitelistPath}`);
        }
    }

    /**
     * 加载黑名单/白名单（用于微调内置词库）
     */
    private async loadCustomLibrary(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return;
        }

        // 加载黑名单
        const blacklistPath = path.join(workspaceRoot, this.config.customWords!.blacklistPath);
        const blacklistUri = vscode.Uri.file(blacklistPath);

        try {
            const contentBytes = await vscode.workspace.fs.readFile(blacklistUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const data: CustomWordLibrary = jsoncParser.parse(content);
            this.trie.insertBatch(data.words, 'high'); // 自定义黑名单视为高危
            Logger.info(`加载自定义黑名单，共 ${data.words.length} 个词`);
        } catch (error) {
            // 黑名单文件不存在，跳过
        }

        // 加载白名单
        const whitelistPath = path.join(workspaceRoot, this.config.customWords!.whitelistPath);
        const whitelistUri = vscode.Uri.file(whitelistPath);

        try {
            const contentBytes = await vscode.workspace.fs.readFile(whitelistUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const data: CustomWordLibrary = jsoncParser.parse(content);
            this.whitelist = new Set(data.words);
            Logger.info(`加载自定义白名单，共 ${this.whitelist.size} 个词`);
        } catch (error) {
            // 白名单文件不存在，跳过
        }
    }

    /**
     * 检测文档中的敏感词
     * @param document VSCode 文档
     * @returns 匹配结果数组
     */
    public detect(document: vscode.TextDocument): SensitiveMatch[] {
        if (!this.config.enabled || document.languageId !== 'markdown') {
            return [];
        }

        const fullText = document.getText();
        if (!fullText || fullText.length === 0) {
            return [];
        }

        // 排除 frontmatter 区域，只检测正文内容
        const { text, offset } = extractContentWithoutFrontmatterForMatching(fullText);

        if (!text || text.length === 0) {
            return [];
        }

        // 使用 Trie 树检测
        let matches = this.trie.search(text);

        // 过滤白名单
        matches = matches.filter(m => !this.whitelist.has(m.word));

        // 调整匹配位置（加上 frontmatter 的偏移量）
        matches = matches.map(m => ({
            ...m,
            start: m.start + offset,
            end: m.end + offset
        }));

        // 标记白名单状态
        matches.forEach(m => {
            m.inWhitelist = this.whitelist.has(m.word);
        });

        return matches;
    }

    /**
     * 重新加载配置和词库
     */
    public async reload(): Promise<void> {
        Logger.info('重新加载敏感词检测服务...');
        this.loadConfig();
        await this.initializeAsync();
    }

    /**
     * 获取配置
     * @returns 当前配置
     */
    public getConfig(): SensitiveWordConfig {
        return { ...this.config };
    }

    /**
     * 获取统计信息
     * @returns 统计信息
     */
    public getStatistics(): { totalWords: number; whitelistSize: number } {
        return {
            totalWords: this.trie.getWordCount(),
            whitelistSize: this.whitelist.size
        };
    }
}
