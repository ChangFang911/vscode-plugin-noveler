import * as vscode from 'vscode';
import { ProjectStatsService } from '../services/projectStatsService';
import { CONFIG_FILE_NAME } from '../constants';
import { VolumeService } from '../services/volumeService';
import { ConfigService } from '../services/configService';
import { NodeType, NovelerTreeItem } from './treeItem';
import {
    OverviewNodesProvider,
    ActionNodesProvider,
    ChapterNodesProvider,
    CharacterNodesProvider,
    OutlineNodesProvider,
    DoubtMarkNodesProvider,
} from './nodes';
import { DoubtMarkService } from '../services/doubtMarkService';
import { DoubtMarkTreeItem } from './nodes/doubtMarkNodes';

// 하위 호환을 위해 재내보내기 (기존 node 파일들이 이 경로로 임포트함)
export { NodeType, NovelerTreeItem };

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
    doubtMarkNodes: DoubtMarkNodesProvider;  // public 供 commandRegistrar 访问 filter 状态

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
        this.doubtMarkNodes = new DoubtMarkNodesProvider(DoubtMarkService.getInstance());
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
                case NodeType.Tools:
                    return this.actionNodes.getToolItems();
                case NodeType.Settings:
                    return this.actionNodes.getSettingsItems();
                case NodeType.DoubtMark:
                    return this.doubtMarkNodes.getFileGroupNodes();
                case NodeType.DoubtMarkFile:
                    return this.doubtMarkNodes.getMarkItemNodes(element as DoubtMarkTreeItem);
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
                    '初始化小说项目',
                    NodeType.InitProject,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'noveler.initProject',
                        title: '初始化小说项目',
                    },
                    'initProject',
                    undefined,
                    '点击此处在当前工作区初始化小说项目结构'
                ).withIcon(new vscode.ThemeIcon('add'))
            ];
        }

        // 已初始化，显示正常结构
        // isVolumesEnabled() 已经同时检查 enabled 和 folderStructure=nested
        const canCreateVolumes = this.configService.isVolumesEnabled();

        return [
            new NovelerTreeItem(
                '项目概览',
                NodeType.Overview,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'overview',
                undefined,
                '查看项目统计信息'
            ).withIcon(new vscode.ThemeIcon('pulse')),
            new NovelerTreeItem(
                '章节列表',
                NodeType.Chapters,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                canCreateVolumes ? 'chapterGroupWithVolumes' : 'chapterGroup',
                canCreateVolumes ? '点击 ➕ 创建章节或卷' : '点击 ➕ 创建章节',
                '浏览和管理章节'
            ).withIcon(new vscode.ThemeIcon('book')),
            new NovelerTreeItem(
                '人物管理',
                NodeType.Characters,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'characterGroup',
                '点击 ➕ 创建人物',
                '管理小说人物'
            ).withIcon(new vscode.ThemeIcon('person')),
            new NovelerTreeItem(
                '大纲草稿',
                NodeType.Outlines,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'outlineGroup',
                undefined,
                '大纲和草稿文件'
            ).withIcon(new vscode.ThemeIcon('note')),
            new NovelerTreeItem(
                '参考资料',
                NodeType.References,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'referenceGroup',
                undefined,
                '灵感和参考素材'
            ).withIcon(new vscode.ThemeIcon('references')),
            new NovelerTreeItem(
                '工具与设置',
                NodeType.OtherActions,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'otherActions',
                undefined,
                '更多功能和设置'
            ).withIcon(new vscode.ThemeIcon('tools')),
            this.doubtMarkNodes.getRootNode(),
        ];
    }
}
