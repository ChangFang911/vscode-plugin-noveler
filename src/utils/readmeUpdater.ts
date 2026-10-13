import * as vscode from 'vscode';
import { parseFrontMatter } from './frontMatterParser';
import { handleError, handleSuccess, ErrorSeverity } from './errorHandler';
import { ConfigService } from '../services/configService';
import { VolumeService } from '../services/volumeService';
import { CHAPTERS_FOLDER, CHARACTERS_FOLDER, STATUS_EMOJI_MAP } from '../constants';
import { Logger } from './logger';
import { getStatusDisplayName } from './statusHelper';
import { applyDocumentChange, documentIO, fileExists } from './documentOperations';

interface ChapterInfo {
    number: number;
    title: string;
    fileName: string;
    wordCount: number;
    status: string;
    volume?: number;
    volumeType?: string;
}

interface VolumeChapters {
    volumeNumber: number;
    volumeType: string;
    volumeTitle: string;
    volumeStatus: string;
    chapters: ChapterInfo[];
    totalWords: number;
    completedChapters: number;
}

interface CharacterInfo {
    name: string;
    fileName: string;
    importance: string;
    gender: string;
    firstAppearance: string;
}

interface ProjectStats {
    totalWords: number;
    completedChapters: number;
    totalChapters: number;
    chapters: ChapterInfo[];
    characters: CharacterInfo[];
    volumes?: VolumeChapters[];  // 新增：卷分组信息
    volumesEnabled: boolean;     // 新增：是否启用分卷
}

/**
 * 扫描章节目录，获取统计信息
 */
export async function scanChapters(): Promise<ProjectStats> {
    const workspaceFolder = documentIO.workspaceFolder();
    if (!workspaceFolder) {
        throw new Error('未找到工作区');
    }

    const configService = ConfigService.getInstance();
    const volumesEnabled = configService.isVolumesEnabled();

    const chaptersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, CHAPTERS_FOLDER);
    const chapters: ChapterInfo[] = [];
    let totalWords = 0;
    let completedChapters = 0;

    // 如果启用分卷，使用 VolumeService 扫描
    if (volumesEnabled) {
        const volumeService = VolumeService.getInstance();
        await volumeService.scanVolumes();
        const volumes = volumeService.getVolumes();

        const volumeChapters: VolumeChapters[] = [];

        for (const volume of volumes) {
            let volumeTotalWords = 0;
            let volumeCompletedChapters = 0;

            // 并行读取当前卷的所有章节文件以提升性能
            const chapterResults = await Promise.all(
                volume.chapters.map(async (chapterFile) => {
                    try {
                        const fileUri = vscode.Uri.joinPath(
                            workspaceFolder.uri,
                            CHAPTERS_FOLDER,
                            volume.folderName,
                            chapterFile
                        );
                        const fileData = await vscode.workspace.fs.readFile(fileUri);
                        const fileContent = Buffer.from(fileData).toString('utf8');

                        const parsed = parseFrontMatter(fileContent);
                        const frontMatter = parsed.data as Record<string, unknown>;

                        if (frontMatter && frontMatter.chapter !== undefined) {
                            const wordCount = (frontMatter.wordCount as number) || 0;
                            const statusValue = (frontMatter.status as string) || 'draft';
                            const status = getStatusDisplayName(statusValue); // 转换为中文显示

                            return {
                                number: frontMatter.chapter as number,
                                title: (frontMatter.title as string) || chapterFile,
                                fileName: `${volume.folderName}/${chapterFile}`,
                                wordCount: wordCount,
                                status: status,
                                volume: volume.volume,
                                volumeType: volume.volumeType
                            } as ChapterInfo;
                        }
                        return null;
                    } catch (error) {
                        handleError(`读取章节文件失败 ${chapterFile}`, error, ErrorSeverity.Silent);
                        return null;
                    }
                })
            );

            // 过滤并收集有效的章节信息
            const volumeChapterList = chapterResults.filter((info): info is ChapterInfo => info !== null);

            // 计算统计数据
            for (const chapterInfo of volumeChapterList) {
                chapters.push(chapterInfo);
                volumeTotalWords += chapterInfo.wordCount;
                totalWords += chapterInfo.wordCount;

                if (chapterInfo.status === '已完成') {
                    volumeCompletedChapters++;
                    completedChapters++;
                }
            }

            // 按章节号排序
            volumeChapterList.sort((a, b) => a.number - b.number);

            volumeChapters.push({
                volumeNumber: volume.volume,
                volumeType: volume.volumeType,
                volumeTitle: volume.title,
                volumeStatus: volume.status,
                chapters: volumeChapterList,
                totalWords: volumeTotalWords,
                completedChapters: volumeCompletedChapters
            });
        }

        return {
            totalWords,
            completedChapters,
            totalChapters: chapters.length,
            chapters,
            characters: [],
            volumes: volumeChapters,
            volumesEnabled: true
        };
    }

    // 扁平结构（未启用分卷）
    try {
        await vscode.workspace.fs.stat(chaptersFolderUri);

        const files = await vscode.workspace.fs.readDirectory(chaptersFolderUri);
        const mdFiles = files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
            .map(([name]) => name)
            .sort(); // 按文件名排序

        // 并行读取所有章节文件以提升性能
        const chapterResults = await Promise.all(
            mdFiles.map(async (fileName) => {
                try {
                    const fileUri = vscode.Uri.joinPath(chaptersFolderUri, fileName);
                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                    const fileContent = Buffer.from(fileData).toString('utf8');

                    // 解析 Front Matter
                    const parsed = parseFrontMatter(fileContent);
                    const frontMatter = parsed.data as Record<string, unknown>;

                    if (frontMatter && frontMatter.chapter !== undefined) {
                        const wordCount = (frontMatter.wordCount as number) || 0;
                        const statusValue = (frontMatter.status as string) || 'draft';
                        const status = getStatusDisplayName(statusValue); // 转换为中文显示

                        return {
                            number: frontMatter.chapter as number,
                            title: (frontMatter.title as string) || fileName,
                            fileName: fileName,
                            wordCount: wordCount,
                            status: status
                        } as ChapterInfo;
                    }
                    return null;
                } catch (error) {
                    handleError(`读取章节文件失败 ${fileName}`, error, ErrorSeverity.Silent);
                    return null;
                }
            })
        );

        // 过滤并收集有效的章节信息
        const validChapters = chapterResults.filter((info): info is ChapterInfo => info !== null);

        // 计算统计数据
        for (const chapterInfo of validChapters) {
            chapters.push(chapterInfo);
            totalWords += chapterInfo.wordCount;

            // 统计完成的章节（状态为"已完成"）
            if (chapterInfo.status === '已完成') {
                completedChapters++;
            }
        }

        // 按章节号排序
        chapters.sort((a, b) => a.number - b.number);

    } catch (error) {
        Logger.debug('chapters 目录不存在或为空');
    }

    return {
        totalWords,
        completedChapters,
        totalChapters: chapters.length,
        chapters,
        characters: [],
        volumesEnabled: false
    };
}

/**
 * 扫描人物目录，获取人物信息
 */
export async function scanCharacters(): Promise<CharacterInfo[]> {
    const workspaceFolder = documentIO.workspaceFolder();
    if (!workspaceFolder) {
        return [];
    }

    const charactersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, CHARACTERS_FOLDER);
    const characters: CharacterInfo[] = [];

    try {
        await vscode.workspace.fs.stat(charactersFolderUri);

        const files = await vscode.workspace.fs.readDirectory(charactersFolderUri);
        const mdFiles = files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
            .map(([name]) => name)
            .sort(); // 按文件名排序

        for (const fileName of mdFiles) {
            try {
                const fileUri = vscode.Uri.joinPath(charactersFolderUri, fileName);
                const fileData = await vscode.workspace.fs.readFile(fileUri);
                const fileContent = Buffer.from(fileData).toString('utf8');

                // 解析 Front Matter
                const parsed = parseFrontMatter(fileContent);
                const frontMatter = parsed.data as Record<string, unknown>;

                if (frontMatter && frontMatter.name) {
                    characters.push({
                        name: (frontMatter.name as string) || fileName.replace('.md', ''),
                        fileName: fileName,
                        importance: (frontMatter.importance as string) || '次要配角',
                        gender: (frontMatter.gender as string) || '',
                        firstAppearance: (frontMatter.firstAppearance as string) || ''
                    });
                }
            } catch (error) {
                handleError(`读取人物文件失败 ${fileName}`, error, ErrorSeverity.Silent);
            }
        }

        // 按重要性排序（主角 > 重要配角 > 次要配角 > 路人）
        const importanceOrder: { [key: string]: number } = {
            '主角': 1,
            '重要配角': 2,
            '次要配角': 3,
            '路人': 4
        };

        characters.sort((a, b) => {
            const orderA = importanceOrder[a.importance] || 999;
            const orderB = importanceOrder[b.importance] || 999;
            if (orderA !== orderB) {
                return orderA - orderB;
            }
            // 同等重要性按名称排序
            return a.name.localeCompare(b.name, 'zh-CN');
        });

    } catch (error) {
        Logger.debug('characters 目录不存在或为空');
    }

    return characters;
}

/**
 * 更新 README.md 文件
 * @param silent 是否静默更新（不显示通知）
 */
export async function updateReadme(silent = false): Promise<void> {
    const workspaceFolder = documentIO.workspaceFolder();
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个工作区');
        return;
    }

    const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');

    try {
        if (!await fileExists(readmeUri)) { return; }
        const document = await vscode.workspace.openTextDocument(readmeUri);
        const sections = readmeSections(document.getText());
        const hasCatalog = sections.some(section => section.title === '目录');
        const hasProgress = sections.some(section => section.title === '写作进度');
        const hasCharacters = sections.some(section => section.title === '人物设定');
        let addMissing = ConfigService.getInstance().getReadmeAutoUpdateMode() === 'always';

        // 如果缺少必要的标题，根据配置处理
        if (!hasCatalog || !hasProgress || !hasCharacters) {
            const configService = ConfigService.getInstance();
            const autoUpdateMode = configService.getReadmeAutoUpdateMode();

            if (autoUpdateMode === 'always') {
                // 总是自动添加
                addMissing = true;
            } else if (autoUpdateMode === 'ask') {
                // 询问用户
                const missingSections = [];
                if (!hasCatalog) { missingSections.push('目录'); }
                if (!hasProgress) { missingSections.push('写作进度'); }
                if (!hasCharacters) { missingSections.push('人物设定'); }

                const result = await vscode.window.showWarningMessage(
                    `README.md 缺少必要的章节标题（"## ${missingSections.join('"、"## ')}"），是否自动添加？`,
                    '自动添加', '取消'
                );

                if (result === '自动添加') {
                    addMissing = true;
                } else {
                    return;
                }
            } else {
                // never - 不做任何处理，但继续更新已有的章节
                // 如果缺少必要标题但配置为never，则跳过更新
                vscode.window.showWarningMessage('README.md 缺少必要的章节标题，请手动添加或修改配置');
                return;
            }
        }

        // 并行获取章节统计和人物信息,减少 I/O 时间
        const [stats, characters] = await Promise.all([
            scanChapters(),
            scanCharacters()
        ]);
        stats.characters = characters;

        await applyDocumentChange(readmeUri, text => {
            const current = readmeSections(text);
            const has = (title: string) => current.some(section => section.title === title);
            if (['目录', '写作进度', '人物设定'].some(title => !has(title)) && !addMissing) {
                throw new Error('README 标题已变化，更新已停止');
            }
            let result = addMissing ? appendMissingSections(text, has('目录'), has('写作进度'), has('人物设定')) : text;
            result = updateSection(result, '目录', generateChapterList(stats));
            result = updateSection(result, '写作进度', generateProgressSection(stats));
            return updateSection(result, '人物设定', generateCharacterSection(stats.characters));
        });
        if (!await documentIO.save(document) || document.isDirty) {
            throw new Error('README 更新未保存，请检查编辑器内容');
        }

        // 只在非静默模式下显示通知
        if (!silent) {
            handleSuccess(`README 已更新 - 共 ${stats.totalChapters} 章，${stats.totalWords.toLocaleString()} 字，${stats.characters.length} 个人物`);
        } else {
            Logger.info(`README 已更新 - 共 ${stats.totalChapters} 章，${stats.totalWords.toLocaleString()} 字，${stats.characters.length} 个人物`);
        }

    } catch (error) {
        handleError('更新 README 失败', error);
    }
}

/**
 * 自动添加缺失的章节标题
 */
function appendMissingSections(content: string, hasCatalog: boolean, hasProgress: boolean, hasCharacters: boolean): string {
    let result = content;
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    const append = (text: string) => { result += text.replace(/\n/g, eol); };

    // 在文件末尾添加缺失的章节
    if (!hasCatalog) {
        append('\n\n## 目录\n\n暂无章节\n');
    }

    if (!hasProgress) {
        append('\n\n## 写作进度\n\n- **总字数**：0 字\n- **完成章节**：0 / 0 章 (0%)\n- **章节列表**：见上方目录\n');
    }

    if (!hasCharacters) {
        append('\n\n## 人物设定\n\n暂无人物\n');
    }

    return result;
}

/**
 * 生成章节列表内容
 */
function generateChapterList(stats: ProjectStats): string {
    if (stats.totalChapters === 0) {
        return '\n暂无章节\n';
    }

    let content = '\n';

    // 如果启用分卷，按卷分组显示
    if (stats.volumesEnabled && stats.volumes && stats.volumes.length > 0) {
        for (const volumeInfo of stats.volumes) {
            const volumeLabel = getVolumeLabel(volumeInfo);
            const statusEmoji = getVolumeStatusEmoji(volumeInfo.volumeStatus);

            content += `\n### ${statusEmoji} ${volumeLabel}\n\n`;
            content += `> ${volumeInfo.totalWords.toLocaleString()} 字 · ${volumeInfo.chapters.length} 章 · 完成 ${volumeInfo.completedChapters}/${volumeInfo.chapters.length}\n\n`;

            if (volumeInfo.chapters.length === 0) {
                content += `- *该卷暂无章节*\n`;
            } else {
                for (const chapter of volumeInfo.chapters) {
                    const chapterStatusEmoji = getStatusEmoji(chapter.status);
                    content += `- [${chapter.title}](chapters/${chapter.fileName}) ${chapterStatusEmoji} (${chapter.wordCount.toLocaleString()} 字)\n`;
                }
            }
            content += '\n';
        }
    } else {
        // 扁平结构：直接列出所有章节
        for (const chapter of stats.chapters) {
            const statusEmoji = getStatusEmoji(chapter.status);
            content += `- [${chapter.title}](chapters/${chapter.fileName}) ${statusEmoji} (${chapter.wordCount.toLocaleString()} 字)\n`;
        }
    }

    return content;
}

/**
 * 获取卷标签（带类型和序号）
 */
function getVolumeLabel(volumeInfo: VolumeChapters): string {
    let prefix = '';
    let volumeNum = volumeInfo.volumeNumber;

    switch (volumeInfo.volumeType) {
        case 'prequel':
            prefix = '前传';
            volumeNum = Math.abs(volumeNum);
            break;
        case 'sequel':
            prefix = '后传';
            // If already > 1000, subtract 1000; otherwise use as-is
            volumeNum = volumeNum >= 1000 ? volumeNum - 1000 : volumeNum;
            break;
        case 'extra':
            prefix = '番外';
            // If already > 2000, subtract 2000; otherwise use as-is
            volumeNum = volumeNum >= 2000 ? volumeNum - 2000 : volumeNum;
            break;
        case 'main':
        default:
            prefix = '第';
            break;
    }

    if (volumeInfo.volumeType === 'main') {
        return `${prefix}${volumeNum}卷 ${volumeInfo.volumeTitle}`;
    } else {
        return `${prefix}${volumeNum} ${volumeInfo.volumeTitle}`;
    }
}

/**
 * 获取卷状态图标
 */
function getVolumeStatusEmoji(status: string): string {
    switch (status) {
        case 'planning':
            return '📝';
        case 'completed':
            return '✅';
        case 'writing':
        default:
            return '✍️';
    }
}

/**
 * 生成写作进度内容
 */
function generateProgressSection(stats: ProjectStats): string {
    const completionRate = stats.totalChapters > 0
        ? Math.round((stats.completedChapters / stats.totalChapters) * 100)
        : 0;

    let content = `
- **总字数**：${stats.totalWords.toLocaleString()} 字
- **完成章节**：${stats.completedChapters} / ${stats.totalChapters} 章 (${completionRate}%)
`;

    // 如果启用分卷，显示卷统计信息
    if (stats.volumesEnabled && stats.volumes && stats.volumes.length > 0) {
        content += `- **卷数**：${stats.volumes.length} 卷\n`;
        content += `\n#### 分卷进度\n\n`;

        for (const volumeInfo of stats.volumes) {
            const volumeLabel = getVolumeLabel(volumeInfo);
            const volumeCompletionRate = volumeInfo.chapters.length > 0
                ? Math.round((volumeInfo.completedChapters / volumeInfo.chapters.length) * 100)
                : 0;
            const statusEmoji = getVolumeStatusEmoji(volumeInfo.volumeStatus);

            content += `- ${statusEmoji} **${volumeLabel}**：${volumeInfo.totalWords.toLocaleString()} 字 · ${volumeInfo.completedChapters}/${volumeInfo.chapters.length} 章 (${volumeCompletionRate}%)\n`;
        }
    }

    content += `\n- **章节列表**：见上方目录\n`;

    return content;
}

/**
 * 生成人物设定内容
 */
function generateCharacterSection(characters: CharacterInfo[]): string {
    if (characters.length === 0) {
        return '\n暂无人物\n';
    }

    let content = '\n';

    // 按重要性分组
    const groups: { [key: string]: CharacterInfo[] } = {
        '主角': [],
        '重要配角': [],
        '次要配角': [],
        '路人': []
    };

    characters.forEach(char => {
        const importance = char.importance || '次要配角';
        if (!groups[importance]) {
            groups[importance] = [];
        }
        groups[importance].push(char);
    });

    // 生成每个分组的内容（按指定顺序）
    const importanceOrder = ['主角', '重要配角', '次要配角', '路人'];

    for (const importance of importanceOrder) {
        const chars = groups[importance];
        if (chars && chars.length > 0) {
            content += `\n### ${importance}\n\n`;
            for (const char of chars) {
                const genderEmoji = char.gender === '男' ? '👨' : char.gender === '女' ? '👩' : '👤';
                const firstAppearance = char.firstAppearance ? ` | 首次登场：${char.firstAppearance}` : '';
                content += `- [${char.name}](characters/${char.fileName}) ${genderEmoji}${firstAppearance}\n`;
            }
        }
    }

    return content;
}

/**
 * 获取状态对应的 emoji
 */
function getStatusEmoji(status: string): string {
    return STATUS_EMOJI_MAP[status] || '📄';
}

/**
 * 更新 README 中的某个部分
 */
function readmeSections(content: string): Array<{ title: string; start: number; end: number }> {
    const sections: Array<{ title: string; start: number; end: number }> = [];
    let offset = 0;
    let comment = false;
    let fence = '';
    for (const line of content.split('\n')) {
        const delimiter = line.match(/^ {0,3}(\u0060{3,}|~{3,})/);
        if (fence) {
            if (delimiter && delimiter[1][0] === fence[0] && delimiter[1].length >= fence.length
                && line.slice(delimiter[0].length).trim() === '') { fence = ''; }
        } else {
            let visible = '';
            let position = 0;
            while (position < line.length) {
                const token = line.indexOf(comment ? '-->' : '<!--', position);
                if (token === -1) {
                    visible += comment ? ' '.repeat(line.length - position) : line.slice(position);
                    break;
                }
                visible += comment ? ' '.repeat(token - position + 3) : line.slice(position, token) + '    ';
                position = token + (comment ? 3 : 4);
                comment = !comment;
            }
            const opening = visible.match(/^ {0,3}(\u0060{3,}|~{3,})/);
            if (opening) { fence = opening[1]; }
            else {
                const heading = visible.match(/^ {0,3}##[ \t]+(.+?)\s*$/);
                if (heading) { sections.push({ title: heading[1].replace(/[ \t]+#+$/, ''), start: offset, end: offset + line.length }); }
            }
        }
        offset += line.length + 1;
    }
    return sections;
}

function updateSection(content: string, title: string, newContent: string): string {
    const sections = readmeSections(content);
    const matches = sections.filter(section => section.title === title);
    if (matches.length !== 1) { throw new Error('README 中的“' + title + '”标题缺失或重复，更新已停止'); }
    const section = matches[0];
    const next = sections.find(item => item.start > section.start);
    const eol = content.includes('\r\n') ? '\r\n' : '\n';
    return content.slice(0, section.end).replace(/\r$/, '')
        + newContent.replace(/\r?\n/g, eol) + eol + content.slice(next?.start ?? content.length);
}
