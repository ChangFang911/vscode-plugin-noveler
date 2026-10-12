import * as vscode from 'vscode';
import * as path from 'path';
import { parseFrontMatter } from '../utils/frontMatterParser';
import { Logger } from '../utils/logger';
import { ConfigService } from '../services/configService';
import { VolumeService } from '../services/volumeService';
import { generateVolumeFolderName } from '../utils/volumeHelper';
import { formatDateTime } from '../utils/dateFormatter';
import { ChapterMove, MigrationFile, migrateChapters, saveMigrationDocuments } from '../utils/chapterMigration';

/**
 * 章节信息（用于迁移分析）
 */
interface ChapterInfo {
    fileName: string;
    filePath: string;
    chapter?: number;
    title?: string;
}

/**
 * 卷分组信息
 */
interface VolumeGroup {
    volumeNumber: number;
    title: string;
    chapters: ChapterInfo[];
}

/**
 * 结构迁移向导：扁平结构 → 嵌套结构（分卷）
 *
 */
export async function migrateToVolumeStructure(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const configService = ConfigService.getInstance();
    const volumesConfig = configService.getVolumesConfig();

    // 检查当前结构
    if (volumesConfig.folderStructure === 'nested') {
        vscode.window.showInformationMessage('当前已是嵌套结构（分卷模式）');
        return;
    }

    // 确认操作
    const confirm = await vscode.window.showWarningMessage(
        '📚 结构迁移向导\n\n即将将扁平的章节结构迁移为分卷结构。\n此操作会移动 chapters/ 目录下的所有章节文件到对应的卷文件夹中。\n\n执行前会自动创建临时备份，校验成功后清理。',
        { modal: true },
        '继续', '取消'
    );

    if (confirm !== '继续') {
        return;
    }

    const chaptersPath = path.join(workspaceFolder.uri.fsPath, 'chapters');

    try {
        await saveMigrationDocuments(workspaceFolder.uri);
        const chapters = await scanChapterFiles(chaptersPath);
        if (chapters.length === 0) {
            vscode.window.showInformationMessage('chapters 目录下没有章节文件');
            return;
        }

        // 步骤 2: 直接进入自定义分卷流程
        const volumeGroups = await createCustomVolumeGroups(chapters);

        if (!volumeGroups) {
            return; // 用户取消
        }

        // 步骤 3: 确认迁移方案
        const confirmed = await confirmMigrationPlan(volumeGroups);

        if (!confirmed) {
            return;
        }

        // 步骤 4: 执行迁移（带进度提示）
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "迁移到分卷结构",
            cancellable: false  // 关键操作不允许取消
        }, async (progress) => {
            await executeMigration(workspaceFolder.uri, volumeGroups, progress);
        });

        // 步骤 6: 刷新 VolumeService 缓存
        const volumeService = VolumeService.getInstance();
        await configService.reloadConfig();
        await volumeService.scanVolumes(true);

        // 步骤 7: 完整刷新（迁移后需要更新所有数据）
        await vscode.commands.executeCommand('noveler.refresh');

        vscode.window.showInformationMessage(
            `结构迁移完成，已组织 ${volumeGroups.length} 个卷，移动 ${chapters.length} 个章节。`
        );
    } catch (error) {
        Logger.error('结构迁移失败', error);
        vscode.window.showErrorMessage(`结构迁移失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 扫描章节文件，读取 frontmatter
 */
async function scanChapterFiles(chaptersPath: string): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    const folder = vscode.Uri.file(chaptersPath);
    const entries = await vscode.workspace.fs.readDirectory(folder);
    for (const [name, type] of entries) {
        if (type !== vscode.FileType.File || !name.endsWith('.md') || name === 'outline.md' || name === 'README.md') {
            continue;
        }
        const uri = vscode.Uri.joinPath(folder, name);
        const content = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
        const parsed = parseFrontMatter(content);
        const data = parsed.data as Record<string, unknown>;
        chapters.push({
            fileName: name,
            filePath: uri.fsPath,
            chapter: data.chapter ? Number(data.chapter) : undefined,
            title: (data.title as string) || name.replace('.md', '')
        });
    }

    // 按 chapter 字段排序
    chapters.sort((a, b) => {
        if (a.chapter !== undefined && b.chapter !== undefined) {
            return a.chapter - b.chapter;
        }
        return a.fileName.localeCompare(b.fileName);
    });

    return chapters;
}

/**
 * 自定义分配（通过选择每卷的最后一章）
 */
async function createCustomVolumeGroups(chapters: ChapterInfo[]): Promise<VolumeGroup[] | undefined> {
    const volumeGroups: VolumeGroup[] = [];
    let remainingChapters = [...chapters];
    let volumeNum = 1;

    vscode.window.showInformationMessage(
        '💡 自定义分卷提示\n\n请为每个卷选择"最后一章"，系统会自动将该章及之前的所有章节分配到该卷。',
        '开始'
    );

    while (remainingChapters.length > 0) {
        // 构建章节选项列表
        interface ChapterOption extends vscode.QuickPickItem {
            chapterIndex: number;
        }

        const chapterOptions: ChapterOption[] = remainingChapters.map((chapter, idx) => ({
            label: `📄 ${chapter.title}`,
            description: `第${chapter.chapter || idx + 1}章`,
            detail: idx === remainingChapters.length - 1 ? '（最后一章）' : undefined,
            chapterIndex: idx
        }));

        // 添加"剩余全部"选项
        if (remainingChapters.length > 1) {
            chapterOptions.push({
                label: `📚 剩余全部 (${remainingChapters.length} 章)`,
                description: '将剩余所有章节分为一卷',
                detail: '推荐：如果后面都是同一卷',
                chapterIndex: remainingChapters.length - 1 // 指向最后一章
            });
        }

        const selected = await vscode.window.showQuickPick(chapterOptions, {
            placeHolder: `第 ${volumeNum} 卷：请选择该卷的最后一章 (已分配 ${chapters.length - remainingChapters.length} 章，剩余 ${remainingChapters.length} 章)`,
            ignoreFocusOut: true
        });

        if (!selected) {
            return undefined; // 用户取消
        }

        const endIndex = selected.chapterIndex;
        const volumeChapters = remainingChapters.slice(0, endIndex + 1);

        // 询问卷名称
        const volumeTitle = await vscode.window.showInputBox({
            prompt: `请输入第 ${volumeNum} 卷的名称（同名旧卷可复用，已有卷资料保留）`,
            placeHolder: `例如：崛起`,
            value: `卷${volumeNum}`,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '卷名不能为空';
                }
                if (/[/\\:*?"<>|]/.test(value) || [...value].some(character => character.charCodeAt(0) < 32)) {
                    return '卷名不能包含路径分隔符或文件名非法字符';
                }
                return undefined;
            },
            ignoreFocusOut: true
        });

        if (!volumeTitle) {
            return undefined; // 用户取消
        }

        // 添加卷分组
        volumeGroups.push({
            volumeNumber: volumeNum,
            title: volumeTitle.trim(),
            chapters: volumeChapters
        });

        // 移除已分配的章节
        remainingChapters = remainingChapters.slice(endIndex + 1);
        volumeNum++;

        // 如果已经分配完所有章节，结束循环
        if (remainingChapters.length === 0) {
            break;
        }
    }

    return volumeGroups;
}

/**
 * 确认迁移方案
 */
async function confirmMigrationPlan(volumeGroups: VolumeGroup[]): Promise<boolean> {
    const summary = volumeGroups.map((vol, idx) => {
        const chapterList = vol.chapters.length <= 5
            ? vol.chapters.map(c => `  • ${c.title}`).join('\n')
            : `  • ${vol.chapters.slice(0, 3).map(c => c.title).join('\n  • ')}\n  • ... 还有 ${vol.chapters.length - 3} 章`;

        return `${idx + 1}. 第${vol.volumeNumber}卷 - ${vol.title} (${vol.chapters.length} 章)\n${chapterList}`;
    }).join('\n\n');

    const totalChapters = volumeGroups.reduce((sum, vol) => sum + vol.chapters.length, 0);

    const message = `📋 迁移方案确认\n\n将创建 ${volumeGroups.length} 个卷，移动 ${totalChapters} 个章节：\n\n${summary}\n\n确认执行迁移？`;

    const confirm = await vscode.window.showInformationMessage(
        message,
        { modal: true },
        '确认', '取消'
    );

    return confirm === '确认';
}

/**
 * 执行迁移
 */
async function executeMigration(
    root: vscode.Uri,
    volumeGroups: VolumeGroup[],
    progress?: vscode.Progress<{ message?: string; increment?: number }>
): Promise<void> {
    const moves: ChapterMove[] = [];
    const files: MigrationFile[] = [];
    for (const group of volumeGroups) {
        const folderName = generateVolumeFolderName('main', group.volumeNumber, group.title);
        const folder = vscode.Uri.joinPath(root, 'chapters', folderName);
        for (const chapter of group.chapters) {
            moves.push({ source: vscode.Uri.file(chapter.filePath), target: vscode.Uri.joinPath(folder, chapter.fileName) });
        }
        files.push({
            uri: vscode.Uri.joinPath(folder, 'volume.json'),
            content: JSON.stringify({
                volume: group.volumeNumber, volumeType: 'main', title: group.title,
                status: 'writing', description: '', created: formatDateTime(new Date())
            }, null, 2)
        });
        const chapterList = group.chapters.map((chapter, index) => `${index + 1}. ${chapter.title || chapter.fileName}`).join('\n');
        files.push({
            uri: vscode.Uri.joinPath(folder, 'outline.md'),
            content: `# ${folderName} - 大纲\n\n## 卷简介\n\n${group.title}\n\n## 章节列表\n\n${chapterList}\n\n## 创作备注\n\n`
        });
    }
    await migrateChapters(root, moves, files, 'nested', progress);
}

export async function rollbackToFlatStructure(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }
    const configService = ConfigService.getInstance();
    if (configService.getVolumesConfig().folderStructure === 'flat') {
        vscode.window.showInformationMessage('当前已是扁平结构');
        return;
    }
    const confirm = await vscode.window.showWarningMessage(
        '将章节移回 chapters/ 根目录，原卷目录的大纲、元数据和附属文件保留。执行前自动备份，遇到同名章节则停止。',
        { modal: true }, '继续', '取消'
    );
    if (confirm !== '继续') { return; }
    try {
        await saveMigrationDocuments(workspaceFolder.uri);
        const volumeService = VolumeService.getInstance();
        const volumes = await volumeService.scanVolumes(true);
        if (volumes.length === 0) {
            vscode.window.showInformationMessage('未找到卷文件夹');
            return;
        }
        const chapters = vscode.Uri.joinPath(workspaceFolder.uri, 'chapters');
        const moves: ChapterMove[] = [];
        for (const volume of volumes) {
            for (const chapter of volume.chapters) {
                moves.push({ source: vscode.Uri.joinPath(chapters, volume.folderName, chapter), target: vscode.Uri.joinPath(chapters, chapter) });
            }
        }
        await migrateChapters(workspaceFolder.uri, moves, [], 'flat');
        await configService.reloadConfig();
        await volumeService.scanVolumes(true);
        await vscode.commands.executeCommand('noveler.refresh');
        vscode.window.showInformationMessage('已回到扁平结构，卷资料保留在原目录。');
    } catch (error) {
        Logger.error('回滚失败', error);
        vscode.window.showErrorMessage(`回滚失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}
