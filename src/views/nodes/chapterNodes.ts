/**
 * 章节和卷节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { VolumeService } from '../../services/volumeService';
import { ConfigService } from '../../services/configService';
import { WordCountService } from '../../services/wordCountService';
import { extractChapterFrontMatter, getContentWithoutFrontMatter } from '../../utils/frontMatterHelper';
import { VOLUME_TYPE_NAMES, VOLUME_STATUS_NAMES } from '../../constants';
import { VolumeInfo } from '../../types/volume';
import { convertToChineseNumber } from '../../utils/chineseNumber';
import { convertToRomanNumber } from '../../utils/volumeHelper';
import { Logger } from '../../utils/logger';

export class ChapterNodesProvider {
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    constructor(
        private volumeService: VolumeService,
        private configService: ConfigService
    ) {}

    /**
     * 获取章节列表（根据是否启用分卷返回不同结构）
     */
    async getChapterItems(): Promise<NovelerTreeItem[]> {
        const volumesEnabled = this.configService.isVolumesEnabled();

        if (volumesEnabled) {
            return await this.getVolumeItems();
        } else {
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
                    '还没有卷，请在 chapters/ 下创建卷文件夹',
                    NodeType.EmptyHint,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    'emptyHint',
                    undefined,
                    '创建卷文件夹示例：chapters/第一卷-崛起/'
                ).withIcon(new vscode.ThemeIcon('info')),
            ];
        }

        const items: NovelerTreeItem[] = [];

        for (const volume of volumes) {
            const volumeIcon = this.getVolumeStatusIcon(volume.status);
            const volumeLabel = this.getVolumeLabel(volume);
            const description = `${volume.stats.chapterCount} 章 · ${volume.stats.totalWords.toLocaleString()} 字`;
            const tooltip = this.getVolumeTooltip(volume);

            const item = new NovelerTreeItem(
                volumeLabel,
                NodeType.Volume,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                'volume',
                description,
                tooltip,
                volume
            ).withIcon(volumeIcon);

            items.push(item);
        }

        return items;
    }

    /**
     * 获取卷下的章节列表
     */
    async getVolumeChapterItems(volumeNode: NovelerTreeItem): Promise<NovelerTreeItem[]> {
        const volume = volumeNode.metadata;
        if (!volume) {
            return [];
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const items: NovelerTreeItem[] = [];

        // 检查是否存在 outline.md 大纲文件
        const outlinePath = vscode.Uri.joinPath(
            workspaceFolder.uri,
            'chapters',
            volume.folderName,
            'outline.md'
        );

        try {
            await vscode.workspace.fs.stat(outlinePath);
            const outlineItem = new NovelerTreeItem(
                '卷大纲',
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
            ).withIcon(new vscode.ThemeIcon('list-tree'));
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

                const frontMatter = extractChapterFrontMatter({ getText: () => text } as vscode.TextDocument);
                const chapterNum = frontMatter.chapter;
                const title = this.extractTitle(text, chapterFile);
                const contentWithoutFM = this.removeFrontMatter(text);
                const wordCount = this.countWords(contentWithoutFM);
                const status = this.extractStatus(text);

                const detailedStats = this.getDetailedWordCount(contentWithoutFM);
                const totalWords = detailedStats.content + detailedStats.punctuation;
                const tooltip = `${title}\n━━━━━━━━━━━━━━\n总计: ${totalWords.toLocaleString()} 字\n正文: ${detailedStats.content.toLocaleString()} 字\n标点: ${detailedStats.punctuation.toLocaleString()} 个\n━━━━━━━━━━━━━━\n状态: ${status}\n所属卷: ${volume.title}`;

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
                    '该卷还没有章节',
                    NodeType.EmptyHint,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    'emptyHint',
                    undefined,
                    '在该卷文件夹中创建 Markdown 文件'
                ).withIcon(new vscode.ThemeIcon('info')),
            ];
        }

        return items;
    }

    /**
     * 获取扁平的章节列表
     */
    private async getFlatChapterItems(): Promise<NovelerTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const folderPath = vscode.Uri.joinPath(workspaceFolder.uri, ConfigService.getInstance().getChaptersFolder());

        try {
            const files = await vscode.workspace.fs.readDirectory(folderPath);
            const mdFiles = files.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));

            if (mdFiles.length === 0) {
                return [
                    new NovelerTreeItem(
                        '还没有章节，点击右侧 ➕ 创建',
                        NodeType.EmptyHint,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        'emptyHint',
                        undefined,
                        '点击章节列表标题右侧的 ➕ 按钮创建你的第一个章节'
                    ).withIcon(new vscode.ThemeIcon('info')),
                ];
            }

            // 提取 chapter 字段进行排序
            const filesWithMeta: Array<[string, number | null]> = [];
            for (const [filename] of mdFiles) {
                try {
                    const filePath = vscode.Uri.joinPath(folderPath, filename);
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');
                    const frontMatter = extractChapterFrontMatter({ getText: () => text } as vscode.TextDocument);
                    const chapterNum = frontMatter.chapter ? Number(frontMatter.chapter) : null;
                    filesWithMeta.push([filename, chapterNum]);
                } catch {
                    filesWithMeta.push([filename, null]);
                }
            }

            // 排序
            filesWithMeta.sort(([aName, aChapter], [bName, bChapter]) => {
                if (aChapter !== null && bChapter !== null) {
                    return aChapter - bChapter;
                } else if (aChapter !== null) {
                    return -1;
                } else if (bChapter !== null) {
                    return 1;
                } else {
                    return aName.localeCompare(bName);
                }
            });

            const items: NovelerTreeItem[] = [];

            for (const [filename] of filesWithMeta) {
                const filePath = vscode.Uri.joinPath(folderPath, filename);

                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    const frontMatter = extractChapterFrontMatter({ getText: () => text } as vscode.TextDocument);
                    const chapterNum = frontMatter.chapter;
                    const title = this.extractTitle(text, filename);
                    const contentWithoutFM = this.removeFrontMatter(text);
                    const wordCount = this.countWords(contentWithoutFM);
                    const status = this.extractStatus(text);

                    const detailedStats = this.getDetailedWordCount(contentWithoutFM);
                    const totalWords = detailedStats.content + detailedStats.punctuation;
                    const tooltip = `${title}\n━━━━━━━━━━━━━━\n总计: ${totalWords.toLocaleString()} 字\n正文: ${detailedStats.content.toLocaleString()} 字\n标点: ${detailedStats.punctuation.toLocaleString()} 个\n━━━━━━━━━━━━━━\n状态: ${status}`;

                    const chapterLabel = chapterNum ? `第${chapterNum}章 ${title}` : title;

                    const item = new NovelerTreeItem(
                        chapterLabel,
                        NodeType.ChapterItem,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'vscode.open',
                            title: '打开章节',
                            arguments: [filePath],
                        },
                        'chapter',
                        `${wordCount.toLocaleString()} 字`,
                        tooltip
                    );
                    item.resourceUri = filePath;
                    items.push(item);
                } catch (error) {
                    Logger.error(`读取章节文件失败 ${filename}`, error);
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

    // ========== 辅助方法 ==========

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

    private getVolumeStatusIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'planning':
                return new vscode.ThemeIcon('circle-outline');
            case 'completed':
                return new vscode.ThemeIcon('pass');
            case 'writing':
            default:
                return new vscode.ThemeIcon('edit');
        }
    }

    private getVolumeTooltip(volume: VolumeInfo): string {
        let tooltip = `${volume.title}\n━━━━━━━━━━━━━━\n`;
        tooltip += `类型: ${VOLUME_TYPE_NAMES[volume.volumeType] || volume.volumeType}\n`;
        tooltip += `状态: ${VOLUME_STATUS_NAMES[volume.status] || volume.status}\n`;
        tooltip += `━━━━━━━━━━━━━━\n`;
        tooltip += `章节数: ${volume.stats.chapterCount}\n`;
        tooltip += `总字数: ${volume.stats.totalWords.toLocaleString()} 字\n`;
        tooltip += `完成度: ${volume.stats.completedChapters}/${volume.stats.chapterCount}`;

        if (volume.metadata?.description) {
            tooltip += `\n━━━━━━━━━━━━━━\n${volume.metadata.description}`;
        }

        return tooltip;
    }

    private extractTitle(text: string, filename: string): string {
        const frontMatter = extractChapterFrontMatter({ getText: () => text } as vscode.TextDocument);

        if (frontMatter.title) {
            return String(frontMatter.title).trim();
        }

        const headingMatch = text.match(ChapterNodesProvider.FIRST_HEADING_REGEX);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        return filename.replace('.md', '');
    }

    private extractStatus(text: string): string {
        const frontMatter = extractChapterFrontMatter({ getText: () => text } as vscode.TextDocument);
        if (frontMatter.status) {
            return String(frontMatter.status).trim();
        }
        return '草稿';
    }

    private removeFrontMatter(text: string): string {
        return getContentWithoutFrontMatter({ getText: () => text } as vscode.TextDocument);
    }

    private countWords(text: string): number {
        return WordCountService.getSimpleWordCount(text, true);
    }

    private getDetailedWordCount(text: string): { content: number; punctuation: number } {
        return WordCountService.getDetailedStats(text, true);
    }
}
