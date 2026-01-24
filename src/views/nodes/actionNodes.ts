/**
 * 快捷操作节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';

export class ActionNodesProvider {
    getActionItems(): NovelerTreeItem[] {
        // 快捷操作已合并到其他操作中
        return [];
    }

    getOtherActionItems(): NovelerTreeItem[] {
        const items: NovelerTreeItem[] = [
            new NovelerTreeItem(
                '⚙️ 快速设置',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.quickSettings',
                    title: '快速设置',
                },
                'otherActionItem',
                undefined,
                '快速配置常用选项（字数、引号、高亮颜色等）'
            ),
            new NovelerTreeItem(
                '切换专注模式',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.toggleFocusMode',
                    title: '切换专注模式',
                },
                'otherActionItem',
                undefined,
                '隐藏其他面板，专心写作'
            ),
            new NovelerTreeItem(
                '👁 切换护眼模式',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.toggleEyeCareMode',
                    title: '切换护眼模式',
                },
                'otherActionItem',
                undefined,
                '使用护眼主题保护视力（仅当前项目）'
            ),
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
        ];

        return items;
    }
}
