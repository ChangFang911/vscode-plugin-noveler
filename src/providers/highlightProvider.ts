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
import { AhoCorasick } from '../utils/ahoCorasick';
import { MatchSelectionService } from '../services/matchSelectionService';

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

    // Trie 树缓存（使用 AC 自动机替代 Trie）
    private cachedCharacterTrie: AhoCorasick | null = null;
    private cachedCharacterNamesCacheKey = '';

    private readonly matchSelectionService: MatchSelectionService;

    // 文件系统监视器，用于自动更新人物缓存
    private characterFolderWatcher?: vscode.FileSystemWatcher;

    constructor() {
        this.configService = ConfigService.getInstance();
        this.matchSelectionService = MatchSelectionService.getInstance();
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

    // 获取或创建人物名称 AC 自动机（带缓存）
    private getCharacterTrie(characterNames: string[]): AhoCorasick | null {
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

        // 构建新的 AC 自动机并缓存
        this.cachedCharacterTrie = new AhoCorasick();
        this.cachedCharacterTrie.insertBatch(validNames);
        this.cachedCharacterNamesCacheKey = cacheKey;

        Logger.debug(`人物名 AC 自动机已构建，共 ${validNames.length} 个名称`);

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

            // 使用 AC 自动机匹配人物名（排除对话、注释和 frontmatter 范围）
            const characterTrie = this.getCharacterTrie(characterNames);
            if (characterTrie) {
                const matches = characterTrie.search(text);
                const filteredMatches: Array<{ word: string; start: number; end: number }> = [];

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
                        filteredMatches.push(match);
                    }
                }

                // 先应用手动选择策略，再做默认冲突处理。
                // 关键：如果先“最长优先”再过滤，会导致用户手选的短词（如“张三”）
                // 在冲突解析阶段被提前丢弃，后续无法恢复高亮。
                const selectedMatches = this.matchSelectionService.filterMatches(
                    editor.document.uri.toString(),
                    filteredMatches,
                    'character'
                );

                // 对未被手选覆盖的位置，仍按默认最长优先处理重叠
                const resolvedMatches = this.resolveOverlappingCharacterMatches(
                    selectedMatches
                );

                for (const resolved of resolvedMatches) {
                    const startPos = editor.document.positionAt(resolved.start);
                    const endPos = editor.document.positionAt(resolved.end);
                    characterRanges.push(new vscode.Range(startPos, endPos));
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
     * 在光标所在冲突位置手动选择匹配项（仅影响当前位置）
     */
    public async chooseCharacterMatchAtCursor(editor?: vscode.TextEditor): Promise<void> {
        const targetEditor = editor ?? vscode.window.activeTextEditor;
        if (!targetEditor || targetEditor.document.languageId !== 'markdown') {
            vscode.window.showInformationMessage('请先在 Markdown 文档中使用该命令');
            return;
        }

        const text = targetEditor.document.getText();
        const cursorOffset = targetEditor.document.offsetAt(targetEditor.selection.active);
        const frontmatterEndOffset = getFrontmatterEndOffsetForMatching(text);

        // 对话与注释范围
        const dialogueRanges: vscode.Range[] = [];
        const htmlCommentRanges: vscode.Range[] = [];
        let regexMatch: RegExpExecArray | null;

        const dialogueRegex = new RegExp(DIALOGUE_REGEX.source, 'g');
        while ((regexMatch = dialogueRegex.exec(text)) !== null) {
            dialogueRanges.push(
                new vscode.Range(
                    targetEditor.document.positionAt(regexMatch.index),
                    targetEditor.document.positionAt(regexMatch.index + regexMatch[0].length)
                )
            );
        }

        const commentRegex = new RegExp(HTML_COMMENT_REGEX.source, 'g');
        while ((regexMatch = commentRegex.exec(text)) !== null) {
            htmlCommentRanges.push(
                new vscode.Range(
                    targetEditor.document.positionAt(regexMatch.index),
                    targetEditor.document.positionAt(regexMatch.index + regexMatch[0].length)
                )
            );
        }

        const overlapCluster = await this.getCharacterOverlapClusterAtOffset(targetEditor, cursorOffset, {
            frontmatterEndOffset,
            dialogueRanges,
            htmlCommentRanges,
            text
        });
        if (!overlapCluster || overlapCluster.matches.length < 2) {
            vscode.window.showInformationMessage('光标位置没有可选择的覆盖匹配项');
            return;
        }

        const picked = await vscode.window.showQuickPick(
            overlapCluster.matches
                .sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)
                .map(m => ({
                    label: m.word,
                    description: `[${m.start}, ${m.end})`,
                    detail: targetEditor.document.getText(new vscode.Range(
                        targetEditor.document.positionAt(m.start),
                        targetEditor.document.positionAt(m.end)
                    )),
                    match: m
                })),
            {
                placeHolder: '选择该冲突位置应采用的人物名匹配（仅影响该位置）'
            }
        );

        if (!picked) return;

        this.matchSelectionService.setSelection(
            targetEditor.document.uri.toString(),
            cursorOffset,
            {
                kind: 'character',
                word: picked.match.word,
                start: picked.match.start,
                end: picked.match.end
            }
        );

        await this.updateHighlights(targetEditor);
        vscode.window.showInformationMessage(`已在当前位置采用匹配：${picked.match.word}`);
    }

    /**
     * 获取指定光标位置的人物名冲突簇（供跨类型匹配选择复用）
     */
    public async getCharacterMatchesAtOffset(
        editor: vscode.TextEditor,
        offset: number
    ): Promise<Array<{ word: string; start: number; end: number }>> {
        if (!editor || editor.document.languageId !== 'markdown') {
            return [];
        }

        const text = editor.document.getText();
        const frontmatterEndOffset = getFrontmatterEndOffsetForMatching(text);

        const dialogueRanges: vscode.Range[] = [];
        const htmlCommentRanges: vscode.Range[] = [];
        let regexMatch: RegExpExecArray | null;

        const dialogueRegex = new RegExp(DIALOGUE_REGEX.source, 'g');
        while ((regexMatch = dialogueRegex.exec(text)) !== null) {
            dialogueRanges.push(
                new vscode.Range(
                    editor.document.positionAt(regexMatch.index),
                    editor.document.positionAt(regexMatch.index + regexMatch[0].length)
                )
            );
        }

        const commentRegex = new RegExp(HTML_COMMENT_REGEX.source, 'g');
        while ((regexMatch = commentRegex.exec(text)) !== null) {
            htmlCommentRanges.push(
                new vscode.Range(
                    editor.document.positionAt(regexMatch.index),
                    editor.document.positionAt(regexMatch.index + regexMatch[0].length)
                )
            );
        }

        const overlapCluster = await this.getCharacterOverlapClusterAtOffset(editor, offset, {
            frontmatterEndOffset,
            dialogueRanges,
            htmlCommentRanges,
            text
        });

        return overlapCluster?.matches ?? [];
    }

    private async getCharacterOverlapClusterAtOffset(
        editor: vscode.TextEditor,
        offset: number,
        context: {
            frontmatterEndOffset: number;
            dialogueRanges: vscode.Range[];
            htmlCommentRanges: vscode.Range[];
            text: string;
        }
    ): Promise<{ start: number; end: number; matches: Array<{ word: string; start: number; end: number }> } | null> {
        const characterNamesFromFiles = await this.getCharacterNames();
        const characterNamesFromConfig = this.configService.getCharacters();
        const characterNames = [...new Set([...characterNamesFromFiles, ...characterNamesFromConfig])];

        const characterTrie = this.getCharacterTrie(characterNames);
        if (!characterTrie) {
            vscode.window.showInformationMessage('未检测到可用人物名匹配');
            return null;
        }

        const matches = characterTrie.search(context.text);
        const filteredMatches: Array<{ word: string; start: number; end: number }> = [];
        for (const match of matches) {
            if (match.start < context.frontmatterEndOffset) continue;

            const range = new vscode.Range(
                editor.document.positionAt(match.start),
                editor.document.positionAt(match.end)
            );
            if (!this.isRangeInExcludedAreas(range, context.dialogueRanges, context.htmlCommentRanges)) {
                filteredMatches.push(match);
            }
        }

        return this.getOverlapClusterAtOffset(filteredMatches, offset);
    }

    /**
     * 解析重叠匹配：默认最长匹配，若用户在该冲突簇手动选择则优先用户选择
     */
    private resolveOverlappingCharacterMatches(
        matches: Array<{ word: string; start: number; end: number }>
    ): Array<{ word: string; start: number; end: number }> {
        if (matches.length <= 1) return matches;

        const sorted = [...matches].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
        const result: Array<{ word: string; start: number; end: number }> = [];

        let cluster: Array<{ word: string; start: number; end: number }> = [];
        let clusterStart = -1;
        let clusterEnd = -1;

        const flushCluster = () => {
            if (cluster.length === 0) return;
            if (cluster.length === 1) {
                result.push(cluster[0]);
                return;
            }

            // 默认策略：最长优先，起点更靠前优先
            const best = [...cluster].sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)[0];
            result.push(best);
        };

        for (const m of sorted) {
            if (cluster.length === 0) {
                cluster = [m];
                clusterStart = m.start;
                clusterEnd = m.end;
                continue;
            }

            if (m.start < clusterEnd) {
                cluster.push(m);
                clusterStart = Math.min(clusterStart, m.start);
                clusterEnd = Math.max(clusterEnd, m.end);
            } else {
                flushCluster();
                cluster = [m];
                clusterStart = m.start;
                clusterEnd = m.end;
            }
        }

        flushCluster();
        return result;
    }

    /**
     * 获取光标所在位置的重叠冲突簇
     */
    private getOverlapClusterAtOffset(
        matches: Array<{ word: string; start: number; end: number }>,
        offset: number
    ): { start: number; end: number; matches: Array<{ word: string; start: number; end: number }> } | null {
        const atPoint = matches.filter(m => m.start <= offset && offset < m.end);
        if (atPoint.length === 0) return null;

        let clusterStart = Math.min(...atPoint.map(m => m.start));
        let clusterEnd = Math.max(...atPoint.map(m => m.end));

        let changed = true;
        while (changed) {
            changed = false;
            for (const m of matches) {
                const overlaps = m.start < clusterEnd && m.end > clusterStart;
                if (!overlaps) continue;

                const nextStart = Math.min(clusterStart, m.start);
                const nextEnd = Math.max(clusterEnd, m.end);
                if (nextStart !== clusterStart || nextEnd !== clusterEnd) {
                    clusterStart = nextStart;
                    clusterEnd = nextEnd;
                    changed = true;
                }
            }
        }

        const clusterMatches = matches.filter(m => m.start < clusterEnd && m.end > clusterStart);
        return { start: clusterStart, end: clusterEnd, matches: clusterMatches };
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
