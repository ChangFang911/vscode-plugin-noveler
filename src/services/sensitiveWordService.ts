import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
     * 异步初始化（加载词库）
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
            await this.loadBuiltinLibrary();

            // 2. 加载自定义词库
            if (this.config.customWords.enabled) {
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
        const rawConfig = configService.getConfig();

        // 默认配置
        const defaultConfig: SensitiveWordConfig = {
            enabled: true,
            levels: {
                high: true,
                medium: true,
                low: false
            },
            checkOnType: true,
            checkOnSave: true,
            customWords: {
                enabled: true,
                blacklistPath: '.noveler/sensitive-words/blacklist.json',
                whitelistPath: '.noveler/sensitive-words/whitelist.json'
            },
            display: {
                severity: 'Warning',
                showInProblems: true,
                showWordCount: true
            }
        };

        // 合并用户配置
        this.config = {
            ...defaultConfig,
            ...rawConfig.sensitiveWords
        };

        Logger.info('[SensitiveWord] 加载配置:', {
            enabled: this.config.enabled,
            levels: this.config.levels,
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
        if (fs.existsSync(metadataPath)) {
            const metadata: WordLibraryMetadata = JSON.parse(
                fs.readFileSync(metadataPath, 'utf-8')
            );
            Logger.info(`加载内置词库 v${metadata.version}，共 ${metadata.totalWords} 个词`);
        }

        // 根据配置加载各级别词库
        const levels: SensitiveLevel[] = ['high', 'medium', 'low'];
        for (const level of levels) {
            if (this.config.levels[level]) {
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

        if (!fs.existsSync(filePath)) {
            Logger.warn(`词库文件不存在: ${filePath}`);
            return;
        }

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data: WordLibraryFile = JSON.parse(content);

            this.trie.insertBatch(data.words, level);
            Logger.info(`加载 ${level} 级别词库，共 ${data.words.length} 个词`);
        } catch (error) {
            Logger.error(`加载词库失败: ${filePath}`, error);
        }
    }

    /**
     * 加载自定义词库
     */
    private async loadCustomLibrary(): Promise<void> {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            return;
        }

        // 加载黑名单
        const blacklistPath = path.join(workspaceRoot, this.config.customWords.blacklistPath);
        if (fs.existsSync(blacklistPath)) {
            try {
                const content = fs.readFileSync(blacklistPath, 'utf-8');
                const data: CustomWordLibrary = JSON.parse(content);
                this.trie.insertBatch(data.words, 'high'); // 自定义黑名单视为高危
                Logger.info(`加载自定义黑名单，共 ${data.words.length} 个词`);
            } catch (error) {
                Logger.warn('加载自定义黑名单失败', error);
            }
        }

        // 加载白名单
        const whitelistPath = path.join(workspaceRoot, this.config.customWords.whitelistPath);
        if (fs.existsSync(whitelistPath)) {
            try {
                const content = fs.readFileSync(whitelistPath, 'utf-8');
                const data: CustomWordLibrary = JSON.parse(content);
                this.whitelist = new Set(data.words);
                Logger.info(`加载自定义白名单，共 ${this.whitelist.size} 个词`);
            } catch (error) {
                Logger.warn('加载自定义白名单失败', error);
            }
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

        const text = document.getText();
        if (!text || text.length === 0) {
            return [];
        }

        // 使用 Trie 树检测
        let matches = this.trie.search(text);

        // 过滤白名单
        matches = matches.filter(m => !this.whitelist.has(m.word));

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
