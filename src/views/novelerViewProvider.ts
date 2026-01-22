import * as vscode from 'vscode';
import { ProjectStatsService } from '../services/projectStatsService';
import { CONFIG_FILE_NAME } from '../constants';
import { VolumeInfo } from '../types/volume';
import { VolumeService } from '../services/volumeService';
import { ConfigService } from '../services/configService';
import {
    OverviewNodesProvider,
    ActionNodesProvider,
    ChapterNodesProvider,
    CharacterNodesProvider,
    OutlineNodesProvider
} from './nodes';

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
 *
 * 架构说明：
 * - 主 Provider 负责协调各个节点提供器
 * - 具体的节点生成逻辑委托给专门的节点提供器
 * - 每个节点提供器负责一类节点的生成和管理
 */
export class NovelerViewProvider implements vscode.TreeDataProvider<NovelerTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<NovelerTreeItem | undefined | null | void> =
        new vscode.EventEmitter<NovelerTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NovelerTreeItem | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private statsService: ProjectStatsService;
    private volumeService: VolumeService;
    private configService: ConfigService;

    // 节点提供器
    private overviewNodes: OverviewNodesProvider;
    private actionNodes: ActionNodesProvider;
    private chapterNodes: ChapterNodesProvider;
    private characterNodes: CharacterNodesProvider;
    private outlineNodes: OutlineNodesProvider;

    constructor() {
        this.statsService = new ProjectStatsService();
        this.volumeService = VolumeService.getInstance();
        this.configService = ConfigService.getInstance();

        // 初始化节点提供器
        this.overviewNodes = new OverviewNodesProvider(this.statsService, this.configService);
        this.actionNodes = new ActionNodesProvider();
        this.chapterNodes = new ChapterNodesProvider(this.volumeService, this.configService);
        this.characterNodes = new CharacterNodesProvider();
        this.outlineNodes = new OutlineNodesProvider();
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

            // 子节点：委托给对应的节点提供器
            switch (element.nodeType) {
                case NodeType.Overview:
                    return await this.overviewNodes.getItems();
                case NodeType.Actions:
                    return this.actionNodes.getActionItems();
                case NodeType.OtherActions:
                    return this.actionNodes.getOtherActionItems();
                case NodeType.Chapters:
                    return await this.chapterNodes.getChapterItems();
                case NodeType.Volume:
                    // 卷节点：返回该卷下的章节
                    return await this.chapterNodes.getVolumeChapterItems(element);
                case NodeType.Characters:
                    return await this.characterNodes.getItems();
                case NodeType.Outlines:
                    return await this.outlineNodes.getOutlineItems();
                case NodeType.References:
                    return await this.outlineNodes.getReferenceItems();
                default:
                    return [];
            }
        } catch (error) {
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
                volumesEnabled ? 'chapterGroupWithVolumes' : 'chapterGroup',
                volumesEnabled ? '点击 ➕ 创建章节或卷' : '点击 ➕ 创建章节',
                '浏览和管理章节'
            ),
            new NovelerTreeItem(
                '👤 人物管理',
                NodeType.Characters,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'characterGroup',
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
}
