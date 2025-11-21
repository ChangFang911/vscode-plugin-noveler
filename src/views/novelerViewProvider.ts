import * as vscode from 'vscode';
import { ProjectStatsService } from '../services/projectStatsService';
import { WordCountService } from '../services/wordCountService';
import { extractFrontMatter, getContentWithoutFrontMatter } from '../utils/frontMatterHelper';

/**
 * TreeView 节点类型
 */
export enum NodeType {
    Overview = 'overview',        // 项目概览
    Actions = 'actions',          // 快捷操作
    Chapters = 'chapters',        // 章节大纲
    Characters = 'characters',    // 人物管理

    // 子节点类型
    OverviewItem = 'overviewItem',
    ActionItem = 'actionItem',
    ChapterItem = 'chapterItem',
    CharacterItem = 'characterItem',
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
            // 根节点
            if (!element) {
                return this.getRootNodes();
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
                default:
                    return [];
            }
        } catch (error) {
            console.error('Noveler: 获取视图子节点失败', error);
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
    private getRootNodes(): NovelerTreeItem[] {
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
                '📂 章节大纲',
                NodeType.Chapters,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'chapters',
                undefined,
                '浏览和管理章节'
            ),
            new NovelerTreeItem(
                '👤 人物管理',
                NodeType.Characters,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'characters',
                undefined,
                '管理小说人物'
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
                undefined,
                'overviewItem',
                stats.totalWords.toLocaleString(),
                `当前项目共 ${stats.totalWords.toLocaleString()} 字`
            ),
            new NovelerTreeItem(
                '章节数',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'overviewItem',
                `${stats.chapterCount} 章`,
                `已创建 ${stats.chapterCount} 个章节`
            ),
            new NovelerTreeItem(
                '人物数',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'overviewItem',
                `${stats.characterCount} 人`,
                `已创建 ${stats.characterCount} 个人物`
            ),
            new NovelerTreeItem(
                '完成进度',
                NodeType.OverviewItem,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'overviewItem',
                `${stats.completionRate}%`,
                `已完成 ${stats.completedChapters}/${stats.chapterCount} 章节 (${stats.completionRate}%)`
            ),
        ];
    }

    /**
     * 获取快捷操作子项
     */
    private getActionItems(): NovelerTreeItem[] {
        return [
            new NovelerTreeItem(
                '📝 创建新章节',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.createChapter',
                    title: '创建新章节',
                },
                'actionItem',
                undefined,
                '创建新的章节文件'
            ),
            new NovelerTreeItem(
                '👤 创建人物',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.createCharacter',
                    title: '创建人物',
                },
                'actionItem',
                undefined,
                '创建新的人物档案'
            ),
            new NovelerTreeItem(
                '🎨 格式化文档',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.formatDocument',
                    title: '格式化文档',
                },
                'actionItem',
                undefined,
                '格式化当前 Markdown 文档'
            ),
            new NovelerTreeItem(
                '📊 显示字数统计',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.showWordCount',
                    title: '显示字数统计',
                },
                'actionItem',
                undefined,
                '显示详细字数统计信息'
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
                '进入/退出 Zen Mode'
            ),
            new NovelerTreeItem(
                '📄 更新 README 统计',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.updateReadme',
                    title: '更新 README 统计',
                },
                'actionItem',
                undefined,
                '扫描章节并更新 README 统计信息'
            ),
            new NovelerTreeItem(
                '🔄 刷新视图',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.refreshView',
                    title: '刷新视图',
                },
                'actionItem',
                undefined,
                '刷新侧边栏视图'
            ),
        ];
    }

    /**
     * 获取章节大纲子项
     */
    private async getChapterItems(): Promise<NovelerTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const chaptersPath = vscode.Uri.joinPath(workspaceFolder.uri, 'chapters');

        try {
            const files = await vscode.workspace.fs.readDirectory(chaptersPath);
            const mdFiles = files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
                .sort(([a], [b]) => a.localeCompare(b));

            if (mdFiles.length === 0) {
                return [
                    new NovelerTreeItem(
                        '暂无章节',
                        NodeType.ChapterItem,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        undefined,
                        undefined,
                        '点击上方"创建新章节"开始创作'
                    ),
                ];
            }

            const items: NovelerTreeItem[] = [];

            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(chaptersPath, filename);

                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    // 提取标题和字数
                    const title = this.extractTitle(text, filename);
                    const wordCount = this.countWords(this.removeFrontMatter(text));
                    const status = this.extractStatus(text);
                    const statusIcon = this.getStatusIcon(status);

                    items.push(
                        new NovelerTreeItem(
                            `${statusIcon} ${title}`,
                            NodeType.ChapterItem,
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'vscode.open',
                                title: '打开章节',
                                arguments: [filePath],
                            },
                            'chapterItem',
                            `${wordCount.toLocaleString()} 字`,
                            `${title}\n字数：${wordCount.toLocaleString()}\n状态：${status}`
                        )
                    );
                } catch (error) {
                    console.error(`读取章节失败 ${filename}:`, error);
                }
            }

            return items;
        } catch (error) {
            return [
                new NovelerTreeItem(
                    '未找到 chapters 目录',
                    NodeType.ChapterItem,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先运行 "Noveler: 初始化小说项目"'
                ),
            ];
        }
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
        const headingMatch = text.match(/^#\s+(.+)$/m);
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
        const iconMap: Record<string, string> = {
            '草稿': '📝',
            '初稿': '✏️',
            '修改中': '🔧',
            '已完成': '✅',
            'draft': '📝',
            'completed': '✅',
        };
        return iconMap[status] || '📄';
    }

    /**
     * 移除 Front Matter
     * 使用 frontMatterHelper 统一解析
     */
    private removeFrontMatter(text: string): string {
        return getContentWithoutFrontMatter({ getText: () => text } as vscode.TextDocument);
    }

    /**
     * 统计字数
     * 使用 WordCountService 的统一方法
     */
    private countWords(text: string): number {
        return WordCountService.getSimpleWordCount(text);
    }

    /**
     * 获取人物管理子项
     */
    private async getCharacterItems(): Promise<NovelerTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const charactersPath = vscode.Uri.joinPath(workspaceFolder.uri, 'characters');

        try {
            const files = await vscode.workspace.fs.readDirectory(charactersPath);
            const mdFiles = files
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
                .sort(([a], [b]) => a.localeCompare(b));

            if (mdFiles.length === 0) {
                return [
                    new NovelerTreeItem(
                        '暂无人物',
                        NodeType.CharacterItem,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        undefined,
                        undefined,
                        '点击上方"创建人物"添加角色'
                    ),
                ];
            }

            const items: NovelerTreeItem[] = [];

            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(charactersPath, filename);

                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    // 提取人物名称
                    const name = this.extractCharacterName(text, filename);
                    const role = this.extractCharacterRole(text);

                    items.push(
                        new NovelerTreeItem(
                            `👤 ${name}`,
                            NodeType.CharacterItem,
                            vscode.TreeItemCollapsibleState.None,
                            {
                                command: 'vscode.open',
                                title: '打开人物档案',
                                arguments: [filePath],
                            },
                            'characterItem',
                            role || undefined,
                            `${name}${role ? `\n角色：${role}` : ''}`
                        )
                    );
                } catch (error) {
                    console.error(`读取人物文件失败 ${filename}:`, error);
                }
            }

            return items;
        } catch (error) {
            return [
                new NovelerTreeItem(
                    '未找到 characters 目录',
                    NodeType.CharacterItem,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先运行 "Noveler: 初始化小说项目"'
                ),
            ];
        }
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
        const headingMatch = text.match(/^#\s+(.+)$/m);
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
}
