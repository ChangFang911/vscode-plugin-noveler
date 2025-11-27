import * as vscode from 'vscode';
import { CHAPTERS_FOLDER, CHARACTERS_FOLDER, COMPLETED_STATUS } from '../constants';
import { WordCountService } from './wordCountService';
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import matter = require('gray-matter');

/**
 * 项目统计信息
 */
export interface ProjectStats {
    totalWords: number;       // 总字数
    chapterCount: number;     // 章节数
    characterCount: number;   // 人物数
    completedChapters: number; // 已完成章节数
    completionRate: number;   // 完成率（百分比）
}

/**
 * 项目统计服务
 */
export class ProjectStatsService {
    /**
     * 获取项目统计信息
     */
    public async getStats(): Promise<ProjectStats | null> {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                console.log('Noveler: 未找到工作区文件夹');
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
     * 使用 gray-matter 统一解析
     */
    private removeFrontMatter(text: string): string {
        try {
            const parsed = matter(text);
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
     * 使用 gray-matter 统一解析 Front Matter
     */
    private isChapterCompleted(text: string): boolean {
        try {
            const parsed = matter(text);
            if (parsed.data && parsed.data.status) {
                const status = String(parsed.data.status).trim();
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
