/**
 * README 更新工具
 */

import * as vscode from 'vscode';
import matter = require('gray-matter');

interface ChapterInfo {
    number: number;
    title: string;
    fileName: string;
    wordCount: number;
    status: string;
}

interface ProjectStats {
    totalWords: number;
    completedChapters: number;
    totalChapters: number;
    chapters: ChapterInfo[];
}

/**
 * 扫描章节目录，获取统计信息
 */
export async function scanChapters(): Promise<ProjectStats> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error('未找到工作区');
    }

    const chaptersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'chapters');
    const chapters: ChapterInfo[] = [];
    let totalWords = 0;
    let completedChapters = 0;

    try {
        await vscode.workspace.fs.stat(chaptersFolderUri);

        const files = await vscode.workspace.fs.readDirectory(chaptersFolderUri);
        const mdFiles = files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
            .map(([name]) => name)
            .sort(); // 按文件名排序

        for (const fileName of mdFiles) {
            try {
                const fileUri = vscode.Uri.joinPath(chaptersFolderUri, fileName);
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = Buffer.from(fileData).toString('utf8');

                // 解析 Front Matter
                const parsed = matter(fileContent);
                const frontMatter = parsed.data;

                if (frontMatter && frontMatter.chapter !== undefined) {
                    const wordCount = frontMatter.wordCount || 0;
                    const status = frontMatter.status || '草稿';

                    chapters.push({
                        number: frontMatter.chapter,
                        title: frontMatter.title || fileName,
                        fileName: fileName,
                        wordCount: wordCount,
                        status: status
                    });

                    totalWords += wordCount;

                    // 统计完成的章节（状态为"已完成"）
                    if (status === '已完成') {
                        completedChapters++;
                    }
                }
            } catch (error) {
                console.error(`Noveler: 读取章节文件失败 ${fileName}`, error);
            }
        }

        // 按章节号排序
        chapters.sort((a, b) => a.number - b.number);

    } catch (error) {
        console.log('Noveler: chapters 目录不存在或为空');
    }

    return {
        totalWords,
        completedChapters,
        totalChapters: chapters.length,
        chapters
    };
}

/**
 * 更新 README.md 文件
 */
export async function updateReadme(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个工作区');
        return;
    }

    const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');

    try {
        // 检查 README 是否存在
        await vscode.workspace.fs.stat(readmeUri);
    } catch {
        vscode.window.showErrorMessage('Noveler: 未找到 README.md 文件');
        return;
    }

    try {
        // 读取 README 内容
        const readmeData = await vscode.workspace.fs.readFile(readmeUri);
        let readmeContent = Buffer.from(readmeData).toString('utf8');

        // 获取章节统计
        const stats = await scanChapters();

        // 更新目录部分
        const chapterListContent = generateChapterList(stats.chapters);
        readmeContent = updateSection(
            readmeContent,
            '## 目录',
            '## 写作进度',
            chapterListContent
        );

        // 更新写作进度部分
        const progressContent = generateProgressSection(stats);
        readmeContent = updateSection(
            readmeContent,
            '## 写作进度',
            '## 备注',
            progressContent
        );

        // 如果没有"备注"部分，就添加到末尾
        if (!readmeContent.includes('## 备注')) {
            readmeContent = updateSectionToEnd(
                readmeContent,
                '## 写作进度',
                progressContent
            );
        }

        // 写回文件
        await vscode.workspace.fs.writeFile(
            readmeUri,
            Buffer.from(readmeContent, 'utf8')
        );

        vscode.window.showInformationMessage(
            `Noveler: README 已更新 - 共 ${stats.totalChapters} 章，${stats.totalWords} 字`
        );

    } catch (error) {
        vscode.window.showErrorMessage(`Noveler: 更新 README 失败 - ${error}`);
        console.error('Noveler: 更新 README 错误', error);
    }
}

/**
 * 生成章节列表内容
 */
function generateChapterList(chapters: ChapterInfo[]): string {
    if (chapters.length === 0) {
        return '\n暂无章节\n';
    }

    let content = '\n';
    for (const chapter of chapters) {
        const statusEmoji = getStatusEmoji(chapter.status);
        content += `- [${chapter.title}](chapters/${chapter.fileName}) ${statusEmoji} (${chapter.wordCount} 字)\n`;
    }
    return content;
}

/**
 * 生成写作进度内容
 */
function generateProgressSection(stats: ProjectStats): string {
    const completionRate = stats.totalChapters > 0
        ? Math.round((stats.completedChapters / stats.totalChapters) * 100)
        : 0;

    return `
- **总字数**：${stats.totalWords.toLocaleString()} 字
- **完成章节**：${stats.completedChapters} / ${stats.totalChapters} 章 (${completionRate}%)
- **章节列表**：见上方目录
`;
}

/**
 * 获取状态对应的 emoji
 */
function getStatusEmoji(status: string): string {
    const emojiMap: { [key: string]: string } = {
        '草稿': '📝',
        '初稿': '✏️',
        '修改中': '🔧',
        '已完成': '✅'
    };
    return emojiMap[status] || '📄';
}

/**
 * 更新 README 中的某个部分
 */
function updateSection(
    content: string,
    startMarker: string,
    endMarker: string,
    newContent: string
): string {
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
        return content;
    }

    const endIndex = content.indexOf(endMarker, startIndex);
    if (endIndex === -1) {
        return content;
    }

    const before = content.substring(0, startIndex + startMarker.length);
    const after = content.substring(endIndex);

    return before + newContent + '\n' + after;
}

/**
 * 更新到文件末尾（当没有结束标记时）
 */
function updateSectionToEnd(
    content: string,
    startMarker: string,
    newContent: string
): string {
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) {
        return content;
    }

    // 找到下一个 ## 标题或文件末尾
    const nextHeaderIndex = content.indexOf('\n##', startIndex + startMarker.length);

    if (nextHeaderIndex === -1) {
        // 没有下一个标题，更新到末尾
        const before = content.substring(0, startIndex + startMarker.length);
        return before + newContent + '\n';
    } else {
        // 有下一个标题
        const before = content.substring(0, startIndex + startMarker.length);
        const after = content.substring(nextHeaderIndex);
        return before + newContent + '\n' + after;
    }
}
