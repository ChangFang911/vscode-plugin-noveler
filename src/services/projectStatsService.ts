import * as vscode from 'vscode';
import { CHAPTERS_FOLDER, CHARACTERS_FOLDER, COMPLETED_STATUS } from '../constants';
import { WordCountService } from './wordCountService';
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import { parseFrontMatter } from '../utils/frontMatterParser';
import { Logger } from '../utils/logger';

/**
 * 项目统计信息接口
 * 包含小说项目的整体统计数据
 */
export interface ProjectStats {
    /** 总字数（所有章节的字数总和） */
    totalWords: number;
    /** 章节数（chapters 目录下的 .md 文件数） */
    chapterCount: number;
    /** 人物数（characters 目录下的 .md 文件数） */
    characterCount: number;
    /** 已完成章节数（状态为"已完成"的章节） */
    completedChapters: number;
    /** 完成率（百分比，0-100） */
    completionRate: number;
}

/**
 * 项目统计服务类
 * 负责扫描和统计小说项目的整体数据
 *
 * 功能：
 * - 统计所有章节的总字数
 * - 统计章节数量和完成情况
 * - 统计人物数量
 * - 计算项目完成率
 *
 * @example
 * ```typescript
 * const service = new ProjectStatsService();
 * const stats = await service.getStats();
 * if (stats) {
 *     console.log(`总字数: ${stats.totalWords}`);
 *     console.log(`完成率: ${stats.completionRate}%`);
 * }
 * ```
 */
export class ProjectStatsService {
    /**
     * 获取项目统计信息
     * 异步扫描 chapters 和 characters 目录，收集统计数据
     *
     * @returns 项目统计信息对象，如果失败返回 null
     *
     * @example
     * ```typescript
     * const service = new ProjectStatsService();
     * const stats = await service.getStats();
     * if (stats) {
     *     vscode.window.showInformationMessage(
     *         `项目共 ${stats.chapterCount} 章，${stats.totalWords} 字`
     *     );
     * }
     * ```
     */
    public async getStats(): Promise<ProjectStats | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                Logger.debug('未找到工作区文件夹');
                return null;
            }

            const stats: ProjectStats = {
                totalWords: 0,
                chapterCount: 0,
                characterCount: 0,
                completedChapters: 0,
                completionRate: 0,
            };

            // 统计章节
            await this.collectChapterStats(workspaceFolder, stats);

            // 统计人物
            await this.collectCharacterStats(workspaceFolder, stats);

            // 计算完成率
            if (stats.chapterCount > 0) {
                stats.completionRate = Math.round((stats.completedChapters / stats.chapterCount) * 100);
            }

            return stats;
        } catch (error) {
            handleError('统计项目信息失败', error, ErrorSeverity.Silent);
            return null;
        }
    }

    /**
     * 统计章节信息
     */
    private async collectChapterStats(
        workspaceFolder: vscode.WorkspaceFolder,
        stats: ProjectStats
    ): Promise<void> {
        const chaptersPath = vscode.Uri.joinPath(workspaceFolder.uri, CHAPTERS_FOLDER);

        try {
            const files = await vscode.workspace.fs.readDirectory(chaptersPath);
            const mdFiles = files.filter(([name, type]) =>
                type === vscode.FileType.File && name.endsWith('.md')
            );

            stats.chapterCount = mdFiles.length;

            // 读取每个章节文件统计字数和状态
            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(chaptersPath, filename);
                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    // 使用 frontMatterHelper 移除 Front Matter
                    const contentText = this.removeFrontMatter(text);
                    const wordCount = this.countWords(contentText);
                    stats.totalWords += wordCount;

                    // 检查状态
                    if (this.isChapterCompleted(text)) {
                        stats.completedChapters++;
                    }
                } catch (error) {
                    handleError(`读取章节文件失败 ${filename}`, error, ErrorSeverity.Silent);
                }
            }
        } catch (error) {
            // chapters 目录不存在，忽略
        }
    }

    /**
     * 统计人物信息
     */
    private async collectCharacterStats(
        workspaceFolder: vscode.WorkspaceFolder,
        stats: ProjectStats
    ): Promise<void> {
        const charactersPath = vscode.Uri.joinPath(workspaceFolder.uri, CHARACTERS_FOLDER);

        try {
            const files = await vscode.workspace.fs.readDirectory(charactersPath);
            const mdFiles = files.filter(([name, type]) =>
                type === vscode.FileType.File && name.endsWith('.md')
            );

            stats.characterCount = mdFiles.length;
        } catch (error) {
            // characters 目录不存在，忽略
        }
    }

    /**
     * 移除 Front Matter
     */
    private removeFrontMatter(text: string): string {
        try {
            const parsed = parseFrontMatter(text);
            return parsed.content || text;
        } catch (error) {
            // 解析失败，降级到正则匹配
            const frontMatterRegex = /^---\n[\s\S]*?\n---\n/;
            return text.replace(frontMatterRegex, '');
        }
    }

    /**
     * 统计字数（中文字符 + 英文单词）
     * 使用 WordCountService 的统一方法
     */
    private countWords(text: string): number {
        return WordCountService.getSimpleWordCount(text);
    }

    /**
     * 检查章节是否完成
     */
    private isChapterCompleted(text: string): boolean {
        try {
            const parsed = parseFrontMatter(text);
            const data = parsed.data as Record<string, unknown>;
            if (data && data.status) {
                const status = String(data.status).trim();
                return status === COMPLETED_STATUS || status === 'completed';
            }
        } catch (error) {
            // 解析失败，降级到正则匹配
            const statusMatch = text.match(/^status:\s*["']?(.+?)["']?$/m);
            if (statusMatch) {
                const status = statusMatch[1].trim();
                return status === COMPLETED_STATUS || status === 'completed';
            }
        }
        return false;
    }
}
