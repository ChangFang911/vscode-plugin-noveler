import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { parseFrontMatter } from '../utils/frontMatterParser';
import {
    DIALOGUE_REGEX,
    HTML_COMMENT_REGEX,
    CHARACTERS_FOLDER
} from '../constants';
import { Logger } from '../utils/logger';
import { getFrontmatterEndOffsetForMatching } from '../utils/frontMatterHelper';
import { SimpleTrieTree } from '../utils/simpleTrieTree';

/**
 * 小说高亮提供器
 * 为 Markdown 文档中的对话和人物名称提供语法高亮
 *
 * 功能：
 * - 高亮显示对话（引号内的文字）
 * - 高亮显示人物名称（从 characters/ 目录读取）
 * - 自动监听 characters/ 目录变化，更新人物名称缓存
 * - 支持自定义高亮样式（通过 novel.jsonc 配置）
 *
 * @example
 * ```typescript
 * const provider = new NovelHighlightProvider();
 * provider.updateHighlights(editor);
 * ```
 */
export class NovelHighlightProvider {
    private dialogueDecorationType!: vscode.TextEditorDecorationType;
    private characterDecorationType!: vscode.TextEditorDecorationType;
    private configService: ConfigService;
    private characterNamesCache: string[] = [];
    private lastCacheUpdate = 0;

    // Trie 树缓存（替代正则）
    private cachedCharacterTrie: SimpleTrieTree | null = null;
    private cachedCharacterNamesCacheKey = '';

    // 文件系统监视器，用于自动更新人物缓存
    private characterFolderWatcher?: vscode.FileSystemWatcher;

    constructor() {
        this.configService = ConfigService.getInstance();
        this.createDecorationTypes();
        this.loadCharacterNames(); // 初始化时加载人物名称
        this.watchCharactersFolder(); // 监视 characters/ 目录变化
    }

    private createDecorationTypes() {
        // 从配置读取样式
        const dialogueStyle = this.configService.getHighlightStyle('dialogue');
        const characterStyle = this.configService.getHighlightStyle('character');

        // 对话高亮
        this.dialogueDecorationType = vscode.window.createTextEditorDecorationType({
            color: dialogueStyle.color,
            backgroundColor: dialogueStyle.backgroundColor,
            fontStyle: dialogueStyle.fontStyle as 'normal' | 'italic' | 'oblique' | undefined
        });

        // 人物名称高亮
        this.characterDecorationType = vscode.window.createTextEditorDecorationType({
            color: characterStyle.color,
            backgroundColor: characterStyle.backgroundColor,
            fontWeight: characterStyle.fontWeight as 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | undefined
        });
    }

    /**
     * 重新加载装饰类型
     * 当配置文件更改时调用，更新高亮样式
     *
     * @example
     * ```typescript
     * provider.reloadDecorations();
     * ```
     */
    public reloadDecorations() {
        // 释放旧的装饰类型
        this.dialogueDecorationType.dispose();
        this.characterDecorationType.dispose();

        // 重新创建装饰类型
        this.createDecorationTypes();
    }

    // 从 characters/ 目录加载所有人物名称
    private async loadCharacterNames() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const charactersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, CHARACTERS_FOLDER);

        try {
            // 检查目录是否存在
            await vscode.workspace.fs.stat(charactersFolderUri);

            // 读取目录中的所有文件
            const files = await vscode.workspace.fs.readDirectory(charactersFolderUri);
            const mdFiles = files.filter(([name, type]) =>
                type === vscode.FileType.File && name.endsWith('.md')
            );

            const names: string[] = [];

            // 遍历所有人物文件，提取 name 字段
            for (const [fileName] of mdFiles) {
                try {
                    const fileUri = vscode.Uri.joinPath(charactersFolderUri, fileName);
                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                    const fileContent = Buffer.from(fileData).toString('utf8');

                    // 解析 Front Matter
                    const parsed = parseFrontMatter(fileContent);
                    const data = parsed.data as Record<string, unknown>;
                    if (data && data.name) {
                        // 确保 name 是字符串类型
                        const nameStr = typeof data.name === 'string'
                            ? data.name
                            : String(data.name);
                        names.push(nameStr);
                    }
                } catch (error) {
                    Logger.warn(`无法读取人物文件 ${fileName}`, error);
                }
            }

            this.characterNamesCache = names;
            this.lastCacheUpdate = Date.now();
            Logger.debug(`从 characters/ 目录加载了 ${names.length} 个人物名称`, names);
        } catch (error) {
            // characters 目录不存在或为空
            Logger.debug('characters 目录不存在');
        }
    }

    // 监视 characters/ 目录变化
    private watchCharactersFolder() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const pattern = new vscode.RelativePattern(workspaceFolder, `${CHARACTERS_FOLDER}/*.md`);
        this.characterFolderWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        // 文件创建、修改、删除时重新加载人物名称并刷新高亮
        this.characterFolderWatcher.onDidCreate(async () => {
            await this.loadCharacterNames();
            this.refreshCurrentEditorHighlights();
        });
        this.characterFolderWatcher.onDidChange(async () => {
            await this.loadCharacterNames();
            this.refreshCurrentEditorHighlights();
        });
        this.characterFolderWatcher.onDidDelete(async () => {
            await this.loadCharacterNames();
            this.refreshCurrentEditorHighlights();
        });
    }

    /**
     * 刷新当前活动编辑器的高亮
     * 在人物列表变化时调用
     */
    private refreshCurrentEditorHighlights() {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document.languageId === 'markdown') {
            Logger.debug('人物列表已更新，刷新编辑器高亮');
            this.updateHighlights(editor);
        }
    }

    // 获取人物名称列表（使用缓存）
    private async getCharacterNames(): Promise<string[]> {
        // 如果缓存为空，加载一次
        if (this.characterNamesCache.length === 0 && this.lastCacheUpdate === 0) {
            await this.loadCharacterNames();
        }
        return this.characterNamesCache;
    }

    // 获取或创建人物名称 Trie 树（带缓存）
    private getCharacterTrie(characterNames: string[]): SimpleTrieTree | null {
        if (characterNames.length === 0) {
            return null;
        }

        // 过滤并确保所有名称都是字符串
        const validNames = characterNames.filter(name => typeof name === 'string' && name.length > 0);
        if (validNames.length === 0) {
            return null;
        }

        // 生成缓存键（排序后的名称列表）
        const cacheKey = [...validNames].sort().join('|');

        // 如果缓存命中，直接返回
        if (this.cachedCharacterTrie && this.cachedCharacterNamesCacheKey === cacheKey) {
            return this.cachedCharacterTrie;
        }

        // 构建新的 Trie 树并缓存
        this.cachedCharacterTrie = new SimpleTrieTree();
        this.cachedCharacterTrie.insertBatch(validNames);
        this.cachedCharacterNamesCacheKey = cacheKey;

        Logger.debug(`人物名 Trie 树已构建，共 ${validNames.length} 个名称`);

        return this.cachedCharacterTrie;
    }

    /**
     * 更新编辑器中的高亮显示
     * 为对话和人物名称应用装饰效果
     *
     * @param editor VSCode 文本编辑器实例
     *
     * @example
     * ```typescript
     * vscode.window.onDidChangeActiveTextEditor(editor => {
     *     if (editor) {
     *         provider.updateHighlights(editor);
     *     }
     * });
     * ```
     */
    public async updateHighlights(editor: vscode.TextEditor) {
        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        try {
            const text = editor.document.getText();
            const dialogueRanges: vscode.Range[] = [];
            const characterRanges: vscode.Range[] = [];

            // 获取 frontmatter 结束位置，用于排除该区域
            const frontmatterEndOffset = getFrontmatterEndOffsetForMatching(text);

            // 从 characters/ 目录获取人物名称
            const characterNamesFromFiles = await this.getCharacterNames();

            // 从配置文件获取人物名称
            const characterNamesFromConfig = this.configService.getCharacters();

            // 合并两个来源的人物名称，去重
            const allCharacterNames = [...new Set([...characterNamesFromFiles, ...characterNamesFromConfig])];
            const characterNames = allCharacterNames;

            // 匹配对话（所有常见引号格式）
            let match;
            const dialogueRegex = new RegExp(DIALOGUE_REGEX.source, 'g');
            while ((match = dialogueRegex.exec(text)) !== null) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                dialogueRanges.push(new vscode.Range(startPos, endPos));
            }

            // 匹配 HTML 注释（用于排除范围）
            const htmlCommentRanges: vscode.Range[] = [];
            const commentRegex = new RegExp(HTML_COMMENT_REGEX.source, 'g');
            while ((match = commentRegex.exec(text)) !== null) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                htmlCommentRanges.push(new vscode.Range(startPos, endPos));
            }

            // 使用 Trie 树匹配人物名（排除对话、注释和 frontmatter 范围）
            const characterTrie = this.getCharacterTrie(characterNames);
            if (characterTrie) {
                const matches = characterTrie.search(text);
                for (const match of matches) {
                    // 跳过 frontmatter 区域的匹配
                    if (match.start < frontmatterEndOffset) {
                        continue;
                    }

                    const startPos = editor.document.positionAt(match.start);
                    const endPos = editor.document.positionAt(match.end);
                    const range = new vscode.Range(startPos, endPos);

                    // 排除对话和注释范围
                    if (!this.isRangeInExcludedAreas(range, dialogueRanges, htmlCommentRanges)) {
                        characterRanges.push(range);
                    }
                }
            }

            // 应用装饰
            editor.setDecorations(this.dialogueDecorationType, dialogueRanges);
            editor.setDecorations(this.characterDecorationType, characterRanges);
        } catch (error) {
            Logger.error('更新高亮时发生错误', error);
        }
    }

    /**
     * 检查范围是否在排除区域内（对话或注释）
     * 优化版本：使用独立方法提高代码可读性和性能
     */
    private isRangeInExcludedAreas(
        range: vscode.Range,
        dialogueRanges: vscode.Range[],
        commentRanges: vscode.Range[]
    ): boolean {
        // 检查是否在对话范围内
        for (const excludedRange of dialogueRanges) {
            if (excludedRange.contains(range)) {
                return true;
            }
        }
        // 检查是否在注释范围内
        for (const excludedRange of commentRanges) {
            if (excludedRange.contains(range)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 释放资源
     * 清理装饰类型和文件监听器
     */
    public dispose() {
        this.dialogueDecorationType.dispose();
        this.characterDecorationType.dispose();
        this.characterFolderWatcher?.dispose();
    }
}
