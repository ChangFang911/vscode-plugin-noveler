/**
 * 项目概览节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { ProjectStatsService, ProjectStats } from '../../services/projectStatsService';
import { ConfigService } from '../../services/configService';

export class OverviewNodesProvider {
    constructor(
        private statsService: ProjectStatsService,
        private configService: ConfigService
    ) {}

    async getItems(): Promise<NovelerTreeItem[]> {
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
            this.createTotalWordsItem(stats),
            this.createChapterCountItem(stats),
            this.createCharacterCountItem(stats),
            this.createCompletionItem(stats),
            this.createModeIndicatorItem(),
        ];
    }

    private createTotalWordsItem(stats: ProjectStats): NovelerTreeItem {
        return new NovelerTreeItem(
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
        );
    }

    private createChapterCountItem(stats: ProjectStats): NovelerTreeItem {
        return new NovelerTreeItem(
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
        );
    }

    private createCharacterCountItem(stats: ProjectStats): NovelerTreeItem {
        return new NovelerTreeItem(
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
        );
    }

    private createCompletionItem(stats: ProjectStats): NovelerTreeItem {
        return new NovelerTreeItem(
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
        );
    }

    private createModeIndicatorItem(): NovelerTreeItem {
        const volumesEnabled = this.configService.isVolumesEnabled();
        const modeLabel = volumesEnabled ? '分卷模式' : '简单模式';
        const modeTooltip = volumesEnabled
            ? '当前使用分卷模式\n章节按卷组织\n\n点击切换到简单模式'
            : '当前使用简单模式\n所有章节在同一目录\n\n点击切换到分卷模式';
        const switchCommand = volumesEnabled
            ? 'noveler.rollbackToFlatStructure'
            : 'noveler.migrateToVolumeStructure';

        return new NovelerTreeItem(
            '项目模式',
            NodeType.OverviewItem,
            vscode.TreeItemCollapsibleState.None,
            {
                command: switchCommand,
                title: '切换项目模式'
            },
            'overviewItem',
            modeLabel,
            modeTooltip
        );
    }
}
