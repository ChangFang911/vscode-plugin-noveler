/**
 * 快捷操作节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { ConfigService } from '../../services/configService';

export class ActionNodesProvider {
    constructor(private configService: ConfigService) {}

    getActionItems(): NovelerTreeItem[] {
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
                '刷新视图',
                NodeType.ActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.refresh',
                    title: '刷新视图',
                },
                'actionItem',
                undefined,
                '完整刷新：更新侧边栏和 README 统计'
            ),
        ];
    }

    getOtherActionItems(): NovelerTreeItem[] {
        const items: NovelerTreeItem[] = [
            new NovelerTreeItem(
                '统计仪表板',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.showStats',
                    title: '显示统计仪表板',
                },
                'otherActionItem',
                undefined,
                '查看详细的写作统计和可视化数据'
            ),
            new NovelerTreeItem(
                '配置敏感词库',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.openSensitiveWordsConfig',
                    title: '配置敏感词库',
                },
                'otherActionItem',
                undefined,
                '配置敏感词检测级别和自定义词库'
            ),
            new NovelerTreeItem(
                '打开配置文件',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.openConfig',
                    title: '打开配置文件',
                },
                'otherActionItem',
                undefined,
                '编辑小说配置（设置、人物列表等）'
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
            new NovelerTreeItem(
                '刷新敏感词库',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.reloadSensitiveWords',
                    title: '刷新敏感词库',
                },
                'otherActionItem',
                undefined,
                '重新加载敏感词库配置'
            ),
            new NovelerTreeItem(
                '刷新高亮设置',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.reloadHighlights',
                    title: '刷新高亮设置',
                },
                'otherActionItem',
                undefined,
                '重新加载章节高亮标记配置'
            ),
        ];

        // 如果启用了分卷功能，添加迁移相关命令
        const volumesEnabled = this.configService.isVolumesEnabled();
        if (volumesEnabled) {
            items.push(
                new NovelerTreeItem(
                    '退出分卷模式',
                    NodeType.OtherActionItem,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'noveler.rollbackToFlatStructure',
                        title: '退出分卷模式',
                    },
                    'otherActionItem',
                    undefined,
                    '将分卷结构回退到扁平章节结构'
                )
            );
        } else {
            items.push(
                new NovelerTreeItem(
                    '切换到分卷模式',
                    NodeType.OtherActionItem,
                    vscode.TreeItemCollapsibleState.None,
                    {
                        command: 'noveler.migrateToVolumeStructure',
                        title: '切换到分卷模式',
                    },
                    'otherActionItem',
                    undefined,
                    '将扁平章节结构迁移到分卷结构'
                )
            );
        }

        return items;
    }
}
