import * as vscode from 'vscode';
import { ProjectStatsService } from '../services/projectStatsService';
import { WordCountService } from '../services/wordCountService';
import { extractFrontMatter, getContentWithoutFrontMatter } from '../utils/frontMatterHelper';
import { CHAPTERS_FOLDER, CHARACTERS_FOLDER, DRAFTS_FOLDER, REFERENCES_FOLDER, STATUS_EMOJI_MAP, CONFIG_FILE_NAME } from '../constants';
import { Logger } from '../utils/logger';

/**
 * TreeView 节点类型
 */
export enum NodeType {
    Overview = 'overview',        // 项目概览
    Actions = 'actions',          // 快捷操作
    Chapters = 'chapters',        // 章节列表
    Characters = 'characters',    // 人物管理
    Outlines = 'outlines',        // 大纲列表
    References = 'references',    // 参考资料

    // 子节点类型
    OverviewItem = 'overviewItem',
    ActionItem = 'actionItem',
    ChapterItem = 'chapterItem',
    CharacterItem = 'characterItem',
    OutlineItem = 'outlineItem',
    ReferenceItem = 'referenceItem',

    // 特殊节点
    InitProject = 'initProject',  // 初始化项目
    EmptyHint = 'emptyHint',      // 空状态提示
}

/**
 * TreeView 节点
 */
export class NovelerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly nodeType: NodeType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly contextValue?: string,
        public readonly description?: string,
        public readonly tooltip?: string,
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.description = description;
        this.tooltip = tooltip;
    }
}

/**
 * Noveler 侧边栏视图提供器
 */
export class NovelerViewProvider implements vscode.TreeDataProvider<NovelerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<NovelerTreeItem | undefined | null | void> =
        new vscode.EventEmitter<NovelerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NovelerTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private statsService: ProjectStatsService;

    // 预编译的正则表达式（静态成员，所有实例共享）
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    constructor() {
        this.statsService = new ProjectStatsService();
    }

    /**
     * 刷新视图
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * 检查项目是否已初始化
     */
    private async isProjectInitialized(): Promise<boolean> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return false;
        }

        try {
            const configUri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);
            await vscode.workspace.fs.stat(configUri);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取树节点
     */
    getTreeItem(element: NovelerTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * 获取子节点
     */
    async getChildren(element?: NovelerTreeItem): Promise<NovelerTreeItem[]> {
        try {
            // 根节点：检查是否已初始化
            if (!element) {
                return await this.getRootNodes();
            }

            // 子节点
            switch (element.nodeType) {
                case NodeType.Overview:
                    return await this.getOverviewItems();
                case NodeType.Actions:
                    return this.getActionItems();
                case NodeType.Chapters:
                    return await this.getChapterItems();
                case NodeType.Characters:
                    return await this.getCharacterItems();
                case NodeType.Outlines:
                    return await this.getOutlineItems();
                case NodeType.References:
                    return await this.getReferenceItems();
                default:
                    return [];
            }
        } catch (error) {
            Logger.error('获取视图子节点失败', error);
            return [
                new NovelerTreeItem(
                    '加载失败',
                    NodeType.OverviewItem,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请尝试刷新视图或查看控制台日志'
                ),
            ];
        }
    }

    /**
     * 获取根节点（四大分类）
     */
    private async getRootNodes(): Promise<NovelerTreeItem[]> {
        // 检查项目是否已初始化
        const initialized = await this.isProjectInitialized();

        if (!initialized) {
            // 未初始化，显示初始化引导
            return [
                new NovelerTreeItem(
                    '🚀 初始化小说项目',
                    NodeType.InitProject,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'noveler.initProject',
                        title: '初始化小说项目',
                    },
                    'initProject',
                    undefined,
                    '点击此处在当前工作区初始化小说项目结构'
                )
            ];
        }

        // 已初始化，显示正常结构
        return [
            new NovelerTreeItem(
                '📊 项目概览',
                NodeType.Overview,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'overview',
                undefined,
                '查看项目统计信息'
            ),
            new NovelerTreeItem(
                '⚡ 快捷操作',
                NodeType.Actions,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'actions',
                undefined,
                '常用功能快捷入口'
            ),
            new NovelerTreeItem(
                '📂 章节列表',
                NodeType.Chapters,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'chapterGroup',  // 改为 chapterGroup，用于添加内联按钮
                '点击 ➕ 创建章节',
                '浏览和管理章节'
            ),
            new NovelerTreeItem(
                '👤 人物管理',
                NodeType.Characters,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'characterGroup',  // 改为 characterGroup，用于添加内联按钮
                '点击 ➕ 创建人物',
                '管理小说人物'
            ),
            new NovelerTreeItem(
                '📝 大纲草稿',
                NodeType.Outlines,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'outlineGroup',
                undefined,
                '大纲和草稿文件'
            ),
            new NovelerTreeItem(
                '📚 参考资料',
                NodeType.References,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'referenceGroup',
                undefined,
                '灵感和参考素材'
            ),
        ];
    }

    /**
     * 获取项目概览子项
     */
    private async getOverviewItems(): Promise<NovelerTreeItem[]> {
        const stats = await this.statsService.getStats();

        if (!stats) {
            return [
                new NovelerTreeItem(
                    '未检测到小说项目',
                    NodeType.OverviewItem,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先运行 "Noveler: 初始化小说项目"'
                ),
            ];
        }

        return [
            new NovelerTreeItem(
                '总字数',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.jumpToReadmeSection',
                    title: '跳转到项目文档',
                    arguments: ['写作进度']
                },
                'overviewItem',
                stats.totalWords.toLocaleString(),
                `当前项目共 ${stats.totalWords.toLocaleString()} 字\n点击跳转到项目文档`
            ),
            new NovelerTreeItem(
                '章节数',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.jumpToReadmeSection',
                    title: '跳转到项目文档',
                    arguments: ['写作进度']
                },
                'overviewItem',
                `${stats.chapterCount} 章`,
                `已创建 ${stats.chapterCount} 个章节\n点击跳转到项目文档`
            ),
            new NovelerTreeItem(
                '人物数',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.jumpToReadmeSection',
                    title: '跳转到项目文档',
                    arguments: ['人物设定']
                },
                'overviewItem',
                `${stats.characterCount} 人`,
                `已创建 ${stats.characterCount} 个人物\n点击跳转到项目文档`
            ),
            new NovelerTreeItem(
                '完成进度',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.jumpToReadmeSection',
                    title: '跳转到项目文档',
                    arguments: ['写作进度']
                },
                'overviewItem',
                `${stats.completionRate}%`,
                `已完成 ${stats.completedChapters}/${stats.chapterCount} 章节 (${stats.completionRate}%)\n点击跳转到项目文档`
            ),
        ];
    }

    /**
     * 获取快捷操作子项
     */
    private getActionItems(): NovelerTreeItem[] {
        return [
            new NovelerTreeItem(
                '🎨 格式化当前章节',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.formatDocument',
                    title: '格式化当前章节',
                },
                'actionItem',
                undefined,
                '修正当前打开章节的标点和格式'
            ),
            new NovelerTreeItem(
                '🎯 切换专注模式',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.toggleFocusMode',
                    title: '切换专注模式',
                },
                'actionItem',
                undefined,
                '隐藏其他面板，专心写作'
            ),
            new NovelerTreeItem(
                '📊 统计仪表板',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.showStats',
                    title: '显示统计仪表板',
                },
                'actionItem',
                undefined,
                '查看详细的写作统计和可视化数据'
            ),
            new NovelerTreeItem(
                '⚙️ 打开配置文件',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.openConfig',
                    title: '打开配置文件',
                },
                'actionItem',
                undefined,
                '编辑小说配置（设置、人物列表等）'
            ),
        ];
    }

    /**
     * 获取章节列表子项
     */
    private async getChapterItems(): Promise<NovelerTreeItem[]> {
        return this.getMarkdownItems({
            folderName: CHAPTERS_FOLDER,
            nodeType: NodeType.Chapters,
            itemNodeType: NodeType.ChapterItem,
            iconPrefix: '',  // 章节的 icon 由状态决定，在 processor 中添加
            emptyHint: '💡 还没有章节，点击右侧 ➕ 创建',
            emptyTooltip: '点击章节列表标题右侧的 ➕ 按钮创建你的第一个章节',
            notFoundMessage: '未找到 chapters 目录',
            contextValue: 'chapter',
            commandTitle: '打开章节',
            itemProcessor: async (text, filename) => {
                const title = this.extractTitle(text, filename);
                const contentWithoutFM = this.removeFrontMatter(text);
                const wordCount = this.countWords(contentWithoutFM);
                const status = this.extractStatus(text);
                const statusIcon = this.getStatusIcon(status);

                // 获取详细字数统计
                const detailedStats = this.getDetailedWordCount(contentWithoutFM);
                const totalWords = detailedStats.content + detailedStats.punctuation;
                const tooltip = `${title}\n━━━━━━━━━━━━━━\n总计: ${totalWords.toLocaleString()} 字\n正文: ${detailedStats.content.toLocaleString()} 字\n标点: ${detailedStats.punctuation.toLocaleString()} 个\n━━━━━━━━━━━━━━\n状态: ${status}`;

                return {
                    label: `${statusIcon} ${title}`,  // 状态 icon 在这里添加
                    description: `${wordCount.toLocaleString()} 字`,
                    tooltip: tooltip,
                };
            },
        });
    }

    /**
     * 提取章节标题
     * 使用 frontMatterHelper 统一解析
     */
    private extractTitle(text: string, filename: string): string {
        // 使用 frontMatterHelper 提取 Front Matter
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);

        // 从 Front Matter 提取 title
        if (frontMatter.title) {
            return String(frontMatter.title).trim();
        }

        // 从第一个 # 标题提取
        const headingMatch = text.match(NovelerViewProvider.FIRST_HEADING_REGEX);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        // 使用文件名
        return filename.replace('.md', '');
    }

    /**
     * 提取章节状态
     * 使用 frontMatterHelper 统一解析
     */
    private extractStatus(text: string): string {
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
        if (frontMatter.status) {
            return String(frontMatter.status).trim();
        }
        return '草稿';
    }

    /**
     * 获取状态图标
     */
    private getStatusIcon(status: string): string {
        return STATUS_EMOJI_MAP[status] || '📄';
    }

    /**
     * 移除 Front Matter
     * 使用 frontMatterHelper 统一解析
     */
    private removeFrontMatter(text: string): string {
        return getContentWithoutFrontMatter({ getText: () => text } as vscode.TextDocument);
    }

    /**
     * 统计字数（排除标题，仅统计正文）
     */
    private countWords(text: string): number {
        return WordCountService.getSimpleWordCount(text, true);
    }

    /**
     * 获取详细字数统计（排除标题，仅统计正文）
     * @param text 已移除 Front Matter 的文本
     * @returns 包含正文、标点的详细统计
     */
    private getDetailedWordCount(text: string): { content: number; punctuation: number } {
        return WordCountService.getDetailedStats(text, true);
    }

    /**
     * 获取人物管理子项
     */
    private async getCharacterItems(): Promise<NovelerTreeItem[]> {
        return this.getMarkdownItems({
            folderName: CHARACTERS_FOLDER,
            nodeType: NodeType.Characters,
            itemNodeType: NodeType.CharacterItem,
            iconPrefix: '👤',
            emptyHint: '💡 还没有人物，点击右侧 ➕ 创建',
            emptyTooltip: '点击人物管理标题右侧的 ➕ 按钮创建你的第一个人物',
            notFoundMessage: '未找到 characters 目录',
            contextValue: 'character',
            commandTitle: '打开人物档案',
            itemProcessor: async (text, filename) => {
                const name = this.extractCharacterName(text, filename);
                const role = this.extractCharacterRole(text);
                return {
                    label: name,
                    description: role || undefined,
                    tooltip: `${name}${role ? `\n角色：${role}` : ''}`,
                };
            },
        });
    }

    /**
     * 提取人物名称
     * 使用 frontMatterHelper 统一解析
     */
    private extractCharacterName(text: string, filename: string): string {
        // 使用 frontMatterHelper 提取 Front Matter
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);

        // 从 Front Matter 提取 name
        if (frontMatter.name) {
            return String(frontMatter.name).trim();
        }

        // 从第一个 # 标题提取
        const headingMatch = text.match(NovelerViewProvider.FIRST_HEADING_REGEX);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        // 使用文件名
        return filename.replace('.md', '');
    }

    /**
     * 提取人物角色
     * 使用 frontMatterHelper 统一解析
     */
    private extractCharacterRole(text: string): string {
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
        if (frontMatter.role) {
            return String(frontMatter.role).trim();
        }
        return '';
    }

    /**
     * 获取大纲列表子项
     */
    private async getOutlineItems(): Promise<NovelerTreeItem[]> {
        return this.getMarkdownItems({
            folderName: DRAFTS_FOLDER,
            nodeType: NodeType.Outlines,
            itemNodeType: NodeType.OutlineItem,
            iconPrefix: '📋',
            emptyHint: '💡 还没有大纲文件',
            emptyTooltip: '可以在 drafts/ 目录创建 Markdown 文件',
            notFoundMessage: '未找到 drafts 目录',
            contextValue: 'outline',
            commandTitle: '打开大纲',
            itemProcessor: async (text, filename) => {
                const title = this.extractTitle(text, filename);
                return {
                    label: title,
                    description: undefined,
                    tooltip: title,
                };
            },
        });
    }

    /**
     * 获取参考资料列表子项
     */
    private async getReferenceItems(): Promise<NovelerTreeItem[]> {
        return this.getMarkdownItems({
            folderName: REFERENCES_FOLDER,
            nodeType: NodeType.References,
            itemNodeType: NodeType.ReferenceItem,
            iconPrefix: '📖',
            emptyHint: '💡 还没有参考资料',
            emptyTooltip: '可以在 references/ 目录创建 Markdown 文件',
            notFoundMessage: '未找到 references 目录',
            contextValue: 'reference',
            commandTitle: '打开参考资料',
            itemProcessor: async (text, filename) => {
                const title = this.extractTitle(text, filename);
                return {
                    label: title,
                    description: undefined,
                    tooltip: title,
                };
            },
        });
    }

    /**
     * 通用的 Markdown 文件列表获取方法
     * 用于减少重复代码
     */
    private async getMarkdownItems(config: {
        folderName: string;
        nodeType: NodeType;
        itemNodeType: NodeType;
        iconPrefix: string;
        emptyHint: string;
        emptyTooltip: string;
        notFoundMessage: string;
        contextValue: string;
        commandTitle: string;
        itemProcessor: (text: string, filename: string, filePath: vscode.Uri) => Promise<{
            label: string;
            description?: string;
            tooltip?: string;
        }>;
    }): Promise<NovelerTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const folderPath = vscode.Uri.joinPath(workspaceFolder.uri, config.folderName);

        try {
            const files = await vscode.workspace.fs.readDirectory(folderPath);
            const mdFiles = files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
                .sort(([a], [b]) => a.localeCompare(b));

            if (mdFiles.length === 0) {
                return [
                    new NovelerTreeItem(
                        config.emptyHint,
                        NodeType.EmptyHint,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        'emptyHint',
                        undefined,
                        config.emptyTooltip
                    ),
                ];
            }

            const items: NovelerTreeItem[] = [];

            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(folderPath, filename);

                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    const processed = await config.itemProcessor(text, filename, filePath);

                    const item = new NovelerTreeItem(
                        `${config.iconPrefix} ${processed.label}`,
                        config.itemNodeType,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'vscode.open',
                            title: config.commandTitle,
                            arguments: [filePath],
                        },
                        config.contextValue,
                        processed.description,
                        processed.tooltip
                    );
                    item.resourceUri = filePath;
                    items.push(item);
                } catch (error) {
                    Logger.error(`读取${config.folderName}文件失败 ${filename}`, error);
                }
            }

            return items;
        } catch (error) {
            return [
                new NovelerTreeItem(
                    config.notFoundMessage,
                    config.itemNodeType,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先运行 "Noveler: 初始化小说项目"'
                ),
            ];
        }
    }
}
