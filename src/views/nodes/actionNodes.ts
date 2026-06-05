/**
 * 快捷操作节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';

export class ActionNodesProvider {
    getActionItems(): NovelerTreeItem[] {
        return [];
    }

    /**
     * 工具与设置：返回两个子分组节点
     */
    getOtherActionItems(): NovelerTreeItem[] {
        return [
            new NovelerTreeItem(
                '✍️ 写作工具',
                NodeType.Tools,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'toolsGroup',
                undefined,
                '统计、预览、起名等写作辅助工具'
            ),
            new NovelerTreeItem(
                '⚙️ 项目设置',
                NodeType.Settings,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'settingsGroup',
                undefined,
                '快速设置、敏感词库、配置文件'
            ),
        ];
    }

    /**
     * 写作工具子项
     */
    getToolItems(): NovelerTreeItem[] {
        return [
            new NovelerTreeItem(
                '📊 统计仪表板',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                { command: 'noveler.showStats', title: '显示统计仪表板' },
                'otherActionItem',
                undefined,
                '查看详细的写作统计和可视化数据'
            ),
            new NovelerTreeItem(
                '📱 手机预览',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                { command: 'noveler.showPreview', title: '手机阅读预览' },
                'otherActionItem',
                undefined,
                '模拟手机屏幕预览阅读效果'
            ),
            new NovelerTreeItem(
                '🎲 随机起名',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                { command: 'noveler.generateRandomName', title: '随机起名' },
                'otherActionItem',
                undefined,
                '生成多种风格的随机姓名'
            ),
        ];
    }

    /**
     * 项目设置子项
     */
    getSettingsItems(): NovelerTreeItem[] {
        return [
            new NovelerTreeItem(
                '⚙️ 快速设置',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                { command: 'noveler.quickSettings', title: '快速设置' },
                'otherActionItem',
                undefined,
                '快速配置常用选项（字数、引号、高亮颜色等）'
            ),
            new NovelerTreeItem(
                '🔍 敏感词库配置',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                { command: 'noveler.openSensitiveWordsConfig', title: '配置敏感词库' },
                'otherActionItem',
                undefined,
                '配置敏感词检测级别和自定义词库'
            ),
            new NovelerTreeItem(
                '📄 打开配置文件',
                NodeType.OtherActionItem,
                vscode.TreeItemCollapsibleState.None,
                { command: 'noveler.openConfig', title: '打开配置文件' },
                'otherActionItem',
                undefined,
                '直接编辑 novel.jsonc 配置文件'
            ),
        ];
    }
}
