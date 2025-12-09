import * as vscode from 'vscode';
import { ProjectStatsService } from '../services/projectStatsService';
import { WordCountService } from '../services/wordCountService';
import { extractFrontMatter, getContentWithoutFrontMatter } from '../utils/frontMatterHelper';
import { CHAPTERS_FOLDER, CHARACTERS_FOLDER, DRAFTS_FOLDER, REFERENCES_FOLDER, CONFIG_FILE_NAME } from '../constants';
import { Logger } from '../utils/logger';
import { VolumeInfo } from '../types/volume';
import { VolumeService } from '../services/volumeService';
import { ConfigService } from '../services/configService';
import { convertToChineseNumber } from '../utils/chineseNumber';
import { convertToRomanNumber } from '../utils/volumeHelper';

/**
 * TreeView 节点类型
 */
export enum NodeType {
    Overview = 'overview',        // 项目概览
    Actions = 'actions',          // 快捷操作
    OtherActions = 'otherActions', // 其他操作
    Chapters = 'chapters',        // 章节列表
    Characters = 'characters',    // 人物管理
    Outlines = 'outlines',        // 大纲列表
    References = 'references',    // 参考资料

    // 子节点类型
    OverviewItem = 'overviewItem',
    ActionItem = 'actionItem',
    OtherActionItem = 'otherActionItem',
    Volume = 'volume',            // 卷节点
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
        public readonly metadata?: VolumeInfo,  // 用于存储卷信息
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
    private volumeService: VolumeService;
    private configService: ConfigService;

    // 预编译的正则表达式（静态成员，所有实例共享）
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    constructor() {
        this.statsService = new ProjectStatsService();
        this.volumeService = VolumeService.getInstance();
        this.configService = ConfigService.getInstance();
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
                case NodeType.OtherActions:
                    return this.getOtherActionItems();
                case NodeType.Chapters:
                    return await this.getChapterItems();
                case NodeType.Volume:
                    // 卷节点：返回该卷下的章节
                    return await this.getVolumeChapterItems(element);
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
        const volumesEnabled = this.configService.isVolumesEnabled();

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
                volumesEnabled ? 'chapterGroupWithVolumes' : 'chapterGroup',  // 根据是否启用分卷使用不同的 contextValue
                volumesEnabled ? '点击 ➕ 创建章节或卷' : '点击 ➕ 创建章节',
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
            new NovelerTreeItem(
                '🔧 其他操作',
                NodeType.OtherActions,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'otherActions',
                undefined,
                '更多功能和设置'
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
                '格式化当前章节',
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
                '切换专注模式',
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
                '统计仪表板',
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
                '敏感词配置',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.openSensitiveWordsConfig',
                    title: '打开敏感词配置',
                },
                'actionItem',
                undefined,
                '配置敏感词检测级别和自定义词库'
            ),
            new NovelerTreeItem(
                '打开配置文件',
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
     * 获取其他操作子项
     */
    private getOtherActionItems(): NovelerTreeItem[] {
        const items: NovelerTreeItem[] = [
            new NovelerTreeItem(
                '更新 README 统计',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.updateReadme',
                    title: '更新 README 统计',
                },
                'otherActionItem',
                undefined,
                '手动更新 README.md 中的项目统计信息'
            ),
            new NovelerTreeItem(
                '重新加载敏感词库',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.reloadSensitiveWords',
                    title: '重新加载敏感词库',
                },
                'otherActionItem',
                undefined,
                '重新加载敏感词库配置'
            ),
            new NovelerTreeItem(
                '重新加载高亮配置',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.reloadHighlights',
                    title: '重新加载高亮配置',
                },
                'otherActionItem',
                undefined,
                '重新加载章节高亮标记配置'
            ),
            new NovelerTreeItem(
                '🎲 随机起名',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.generateRandomName',
                    title: '随机起名',
                },
                'otherActionItem',
                undefined,
                '生成多种风格的随机姓名'
            ),
        ];

        // 如果启用了分卷功能，添加迁移相关命令
        const volumesEnabled = this.configService.isVolumesEnabled();
        if (volumesEnabled) {
            items.push(
                new NovelerTreeItem(
                    '回退到扁平结构',
                    NodeType.OtherActionItem,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'noveler.rollbackToFlatStructure',
                        title: '回退到扁平结构',
                    },
                    'otherActionItem',
                    undefined,
                    '将分卷结构回退到扁平章节结构'
                )
            );
        } else {
            items.push(
                new NovelerTreeItem(
                    '迁移到分卷结构',
                    NodeType.OtherActionItem,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'noveler.migrateToVolumeStructure',
                        title: '迁移到分卷结构',
                    },
                    'otherActionItem',
                    undefined,
                    '将扁平章节结构迁移到分卷结构'
                )
            );
        }

        return items;
    }

    /**
     * 获取章节列表子项
     * 根据是否启用分卷功能，返回不同的结构
     */
    private async getChapterItems(): Promise<NovelerTreeItem[]> {
        const volumesEnabled = this.configService.isVolumesEnabled();

        if (volumesEnabled) {
            // 启用分卷：显示卷列表
            return await this.getVolumeItems();
        } else {
            // 未启用分卷：显示扁平的章节列表
            return await this.getFlatChapterItems();
        }
    }

    /**
     * 获取卷列表
     */
    private async getVolumeItems(): Promise<NovelerTreeItem[]> {
        const volumes = await this.volumeService.scanVolumes();

        if (volumes.length === 0) {
            return [
                new NovelerTreeItem(
                    '💡 还没有卷，请在 chapters/ 下创建卷文件夹',
                    NodeType.EmptyHint,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    'emptyHint',
                    undefined,
                    '创建卷文件夹示例：chapters/第一卷-崛起/'
                ),
            ];
        }

        const items: NovelerTreeItem[] = [];

        for (const volume of volumes) {
            const statusIcon = this.getVolumeStatusIcon(volume.status);

            // 生成卷序号标识
            const volumeLabel = this.getVolumeLabel(volume);

            const description = `${volume.stats.chapterCount} 章 · ${volume.stats.totalWords.toLocaleString()} 字`;
            const tooltip = this.getVolumeTooltip(volume);

            const item = new NovelerTreeItem(
                `${statusIcon} ${volumeLabel}`,
                NodeType.Volume,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'volume',
                description,
                tooltip,
                volume  // 存储卷信息到 metadata
            );

            items.push(item);
        }

        return items;
    }

    /**
     * 获取卷标签（带序号）
     */
    private getVolumeLabel(volume: VolumeInfo): string {
        let prefix = '';
        let volumeNum = volume.volume;

        switch (volume.volumeType) {
            case 'prequel':
                prefix = '前传';
                volumeNum = Math.abs(volumeNum);
                break;
            case 'sequel':
                prefix = '后传';
                volumeNum = volumeNum - 1000;
                break;
            case 'extra':
                prefix = '番外';
                volumeNum = volumeNum - 2000;
                break;
            case 'main':
            default:
                prefix = '第';
                break;
        }

        // 根据配置格式化序号
        const volumesConfig = this.configService.getVolumesConfig();
        let volumeNumStr: string;

        switch (volumesConfig.numberFormat) {
            case 'chinese':
                volumeNumStr = convertToChineseNumber(volumeNum);
                break;
            case 'roman':
                volumeNumStr = convertToRomanNumber(volumeNum);
                break;
            case 'arabic':
            default:
                volumeNumStr = String(volumeNum);
                break;
        }

        if (volume.volumeType === 'main') {
            return `${prefix}${volumeNumStr}卷 ${volume.title}`;
        } else {
            return `${prefix}${volumeNumStr} ${volume.title}`;
        }
    }

    /**
     * 获取卷状态图标
     */
    private getVolumeStatusIcon(status: string): string {
        switch (status) {
            case 'planning':
                return '📝';  // 计划中
            case 'completed':
                return '✅';  // 已完成
            case 'writing':
            default:
                return '✍️';  // 创作中
        }
    }

    /**
     * 获取卷的 tooltip
     */
    private getVolumeTooltip(volume: VolumeInfo): string {
        const typeNames: Record<string, string> = {
            'main': '正文',
            'prequel': '前传',
            'sequel': '后传',
            'extra': '番外'
        };

        const statusNames: Record<string, string> = {
            'planning': '计划中',
            'writing': '创作中',
            'completed': '已完成'
        };

        let tooltip = `${volume.title}\n━━━━━━━━━━━━━━\n`;
        tooltip += `类型: ${typeNames[volume.volumeType] || volume.volumeType}\n`;
        tooltip += `状态: ${statusNames[volume.status] || volume.status}\n`;
        tooltip += `━━━━━━━━━━━━━━\n`;
        tooltip += `章节数: ${volume.stats.chapterCount}\n`;
        tooltip += `总字数: ${volume.stats.totalWords.toLocaleString()} 字\n`;
        tooltip += `完成度: ${volume.stats.completedChapters}/${volume.stats.chapterCount}`;

        if (volume.metadata?.description) {
            tooltip += `\n━━━━━━━━━━━━━━\n${volume.metadata.description}`;
        }

        return tooltip;
    }

    /**
     * 获取卷下的章节列表
     */
    private async getVolumeChapterItems(volumeNode: NovelerTreeItem): Promise<NovelerTreeItem[]> {
        const volume = volumeNode.metadata;
        if (!volume) {
            return [];
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const items: NovelerTreeItem[] = [];

        // 检查是否存在 outline.md 大纲文件，如果存在则添加到列表开头
        const outlinePath = vscode.Uri.joinPath(
            workspaceFolder.uri,
            'chapters',
            volume.folderName,
            'outline.md'
        );

        try {
            await vscode.workspace.fs.stat(outlinePath);
            // 文件存在，添加到列表
            const outlineItem = new NovelerTreeItem(
                '📝 卷大纲',
                NodeType.OutlineItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'vscode.open',
                    title: '打开卷大纲',
                    arguments: [outlinePath],
                },
                'volumeOutline',
                undefined,
                `点击编辑「${volume.title}」的大纲`
            );
            outlineItem.resourceUri = outlinePath;
            items.push(outlineItem);
        } catch {
            // 文件不存在，不添加
        }

        for (const chapterFile of volume.chapters) {
            const chapterPath = vscode.Uri.joinPath(
                workspaceFolder.uri,
                'chapters',
                volume.folderName,
                chapterFile
            );

            try {
                const content = await vscode.workspace.fs.readFile(chapterPath);
                const text = Buffer.from(content).toString('utf8');

                const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
                const chapterNum = frontMatter.chapter;
                const title = this.extractTitle(text, chapterFile);
                const contentWithoutFM = this.removeFrontMatter(text);
                const wordCount = this.countWords(contentWithoutFM);
                const status = this.extractStatus(text);

                // 获取详细字数统计
                const detailedStats = this.getDetailedWordCount(contentWithoutFM);
                const totalWords = detailedStats.content + detailedStats.punctuation;
                const tooltip = `${title}\n━━━━━━━━━━━━━━\n总计: ${totalWords.toLocaleString()} 字\n正文: ${detailedStats.content.toLocaleString()} 字\n标点: ${detailedStats.punctuation.toLocaleString()} 个\n━━━━━━━━━━━━━━\n状态: ${status}\n所属卷: ${volume.title}`;

                // 生成章节标签（带序号，根据配置格式化）
                let chapterLabel = title;
                if (chapterNum) {
                    const volumesConfig = this.configService.getVolumesConfig();
                    let chapterNumStr: string;

                    switch (volumesConfig.numberFormat) {
                        case 'chinese':
                            chapterNumStr = convertToChineseNumber(chapterNum);
                            break;
                        case 'roman':
                            chapterNumStr = convertToRomanNumber(chapterNum);
                            break;
                        case 'arabic':
                        default:
                            chapterNumStr = String(chapterNum);
                            break;
                    }

                    chapterLabel = `第${chapterNumStr}章 ${title}`;
                }

                const item = new NovelerTreeItem(
                    chapterLabel,
                    NodeType.ChapterItem,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'vscode.open',
                        title: '打开章节',
                        arguments: [chapterPath],
                    },
                    'chapter',
                    `${wordCount.toLocaleString()} 字`,
                    tooltip
                );
                item.resourceUri = chapterPath;
                items.push(item);
            } catch (error) {
                Logger.error(`读取章节文件失败 ${chapterFile}`, error);
            }
        }

        if (items.length === 0) {
            return [
                new NovelerTreeItem(
                    '💡 该卷还没有章节',
                    NodeType.EmptyHint,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    'emptyHint',
                    undefined,
                    '在该卷文件夹中创建 Markdown 文件'
                ),
            ];
        }

        return items;
    }

    /**
     * 获取扁平的章节列表（未启用分卷时）
     */
    private async getFlatChapterItems(): Promise<NovelerTreeItem[]> {
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
                const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
                const chapterNum = frontMatter.chapter;
                const title = this.extractTitle(text, filename);
                const contentWithoutFM = this.removeFrontMatter(text);
                const wordCount = this.countWords(contentWithoutFM);
                const status = this.extractStatus(text);

                // 获取详细字数统计
                const detailedStats = this.getDetailedWordCount(contentWithoutFM);
                const totalWords = detailedStats.content + detailedStats.punctuation;
                const tooltip = `${title}\n━━━━━━━━━━━━━━\n总计: ${totalWords.toLocaleString()} 字\n正文: ${detailedStats.content.toLocaleString()} 字\n标点: ${detailedStats.punctuation.toLocaleString()} 个\n━━━━━━━━━━━━━━\n状态: ${status}`;

                // 生成章节标签（带序号，扁平模式始终使用阿拉伯数字）
                const chapterLabel = chapterNum ? `第${chapterNum}章 ${title}` : title;

                return {
                    label: chapterLabel,
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
            iconPrefix: '',
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
            iconPrefix: '',
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
            iconPrefix: '',
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
                .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));

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

            // 对于章节，提取 chapter 字段进行数字排序
            const filesWithMeta: Array<[string, number | null]> = [];
            for (const [filename] of mdFiles) {
                if (config.folderName === 'chapters') {
                    try {
                        const filePath = vscode.Uri.joinPath(folderPath, filename);
                        const content = await vscode.workspace.fs.readFile(filePath);
                        const text = Buffer.from(content).toString('utf8');
                        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
                        const chapterNum = frontMatter.chapter ? Number(frontMatter.chapter) : null;
                        filesWithMeta.push([filename, chapterNum]);
                    } catch {
                        filesWithMeta.push([filename, null]);
                    }
                } else {
                    filesWithMeta.push([filename, null]);
                }
            }

            // 排序：有 chapter 字段的按数字排序，无 chapter 字段的按文件名排序
            filesWithMeta.sort(([aName, aChapter], [bName, bChapter]) => {
                if (aChapter !== null && bChapter !== null) {
                    return aChapter - bChapter; // 数字排序
                } else if (aChapter !== null) {
                    return -1; // 有 chapter 的排前面
                } else if (bChapter !== null) {
                    return 1;
                } else {
                    return aName.localeCompare(bName); // 文件名排序
                }
            });

            const items: NovelerTreeItem[] = [];

            for (const [filename] of filesWithMeta) {
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
