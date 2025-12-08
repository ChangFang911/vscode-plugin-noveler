import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import matter from 'gray-matter';
import { Logger } from '../utils/logger';
import { ConfigService } from '../services/configService';
import { VolumeService } from '../services/volumeService';
import { generateVolumeFolderName } from '../utils/volumeHelper';
import { formatDateTime } from '../utils/dateFormatter';

/**
 * 章节信息（用于迁移分析）
 */
interface ChapterInfo {
    fileName: string;
    filePath: string;
    chapter?: number;
    volume?: number;
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
 * 新设计流程：
 * 1. 扫描所有章节文件，读取 frontmatter
 * 2. 智能分析：检查章节是否已有 volume 字段
 * 3. 提供迁移方案：
 *    - 方案A：根据现有 volume 字段自动分组（如果有）
 *    - 方案B：所有章节放入一个卷
 *    - 方案C：按章节数平均分配到 N 个卷
 *    - 方案D：自定义分配（高级）
 * 4. 批量创建卷文件夹和元数据
 * 5. 批量移动章节文件
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
        '📚 结构迁移向导\n\n即将将扁平的章节结构迁移为分卷结构。\n此操作会移动 chapters/ 目录下的所有章节文件到对应的卷文件夹中。\n\n⚠️ 建议先备份项目！',
        { modal: true },
        '继续', '取消'
    );

    if (confirm !== '继续') {
        return;
    }

    const chaptersPath = path.join(workspaceFolder.uri.fsPath, 'chapters');

    // 检查 chapters 目录
    if (!fs.existsSync(chaptersPath)) {
        vscode.window.showErrorMessage('未找到 chapters 目录');
        return;
    }

    try {
        // 步骤 1: 扫描章节文件
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

        // 步骤 4: 执行迁移
        await executeMigration(chaptersPath, volumeGroups, volumesConfig.numberFormat || 'arabic');

        // 步骤 5: 更新配置
        await updateConfigToNested(workspaceFolder);

        // 步骤 6: 刷新 VolumeService 缓存
        const volumeService = VolumeService.getInstance();
        await volumeService.scanVolumes();

        // 步骤 7: 刷新侧边栏
        vscode.commands.executeCommand('noveler.refreshView');

        vscode.window.showInformationMessage(
            `✅ 结构迁移完成！\n\n已创建 ${volumeGroups.length} 个卷，移动 ${chapters.length} 个章节。`
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

    const entries = fs.readdirSync(chaptersPath, { withFileTypes: true });

    for (const entry of entries) {
        // 只处理 .md 文件
        if (!entry.isFile() || !entry.name.endsWith('.md')) {
            continue;
        }

        const filePath = path.join(chaptersPath, entry.name);

        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const parsed = matter(content);

            const chapterInfo: ChapterInfo = {
                fileName: entry.name,
                filePath: filePath,
                chapter: parsed.data.chapter ? Number(parsed.data.chapter) : undefined,
                volume: parsed.data.volume ? Number(parsed.data.volume) : undefined,
                title: parsed.data.title || entry.name.replace('.md', '')
            };

            chapters.push(chapterInfo);
        } catch (error) {
            Logger.warn(`读取章节文件失败: ${entry.name}`, error);
        }
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
            prompt: `请输入第 ${volumeNum} 卷的名称`,
            placeHolder: `例如：崛起`,
            value: `卷${volumeNum}`,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return '卷名不能为空';
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
    chaptersPath: string,
    volumeGroups: VolumeGroup[],
    _numberFormat: string
): Promise<void> {
    // 步骤 1: 检查所有卷文件夹是否已存在（防止重复迁移）
    for (const volumeGroup of volumeGroups) {
        const volumeFolderName = generateVolumeFolderName(
            'main',
            volumeGroup.volumeNumber,
            volumeGroup.title
        );
        const volumePath = path.join(chaptersPath, volumeFolderName);

        if (fs.existsSync(volumePath)) {
            throw new Error(`卷文件夹已存在: ${volumeFolderName}\n\n请先删除或重命名该文件夹，然后重新执行迁移。`);
        }
    }

    // 步骤 2: 创建卷文件夹和元数据，移动章节
    for (const volumeGroup of volumeGroups) {
        // 生成卷文件夹名
        const volumeFolderName = generateVolumeFolderName(
            'main',
            volumeGroup.volumeNumber,
            volumeGroup.title
        );
        const volumePath = path.join(chaptersPath, volumeFolderName);

        // 创建卷文件夹
        fs.mkdirSync(volumePath, { recursive: true });
        Logger.info(`创建卷文件夹: ${volumeFolderName}`);

        // 创建 volume.json 元数据文件
        const volumeMetadata = {
            title: volumeGroup.title,
            status: 'writing',
            description: '',
            created: formatDateTime(new Date()),
            modified: formatDateTime(new Date())
        };
        fs.writeFileSync(
            path.join(volumePath, 'volume.json'),
            JSON.stringify(volumeMetadata, null, 2),
            'utf-8'
        );

        // 创建 outline.md 卷大纲文件
        // 生成章节列表（格式：1. 第X章 标题）
        const chapterList = volumeGroup.chapters.map((c, idx) => {
            // 如果章节有 chapter 字段，使用它；否则使用索引
            const chapterNum = c.chapter ?? (idx + 1);
            // 如果 title 已经包含章节号（旧格式），直接使用；否则添加章节号
            const displayTitle = c.title?.startsWith('第') ? c.title : `第${chapterNum}章 ${c.title || c.fileName.replace('.md', '')}`;
            return `${idx + 1}. ${displayTitle}`;
        }).join('\n');

        const outlineContent = `# ${volumeFolderName} - 大纲\n\n## 卷简介\n\n${volumeGroup.title}\n\n## 章节列表\n\n${chapterList}\n\n## 创作备注\n\n`;
        fs.writeFileSync(
            path.join(volumePath, 'outline.md'),
            outlineContent,
            'utf-8'
        );

        // 移动章节文件
        for (const chapter of volumeGroup.chapters) {
            const targetPath = path.join(volumePath, chapter.fileName);

            try {
                // 检查源文件是否存在
                if (!fs.existsSync(chapter.filePath)) {
                    Logger.warn(`源文件不存在，跳过: ${chapter.fileName}`);
                    continue;
                }

                // 检查目标文件是否已存在
                if (fs.existsSync(targetPath)) {
                    Logger.warn(`目标文件已存在，跳过: ${chapter.fileName}`);
                    continue;
                }

                // 移动文件
                fs.renameSync(chapter.filePath, targetPath);
                Logger.info(`移动章节: ${chapter.fileName} -> ${volumeFolderName}`);

                // 更新章节文件的 frontmatter，移除 volume 字段（因为现在通过文件夹结构管理）
                try {
                    const content = fs.readFileSync(targetPath, 'utf-8');
                    const parsed = matter(content);

                    // 如果有 volume 字段，移除它
                    if (parsed.data.volume !== undefined) {
                        delete parsed.data.volume;

                        // 重新生成文件内容
                        const updatedContent = matter.stringify(parsed.content, parsed.data);
                        fs.writeFileSync(targetPath, updatedContent, 'utf-8');
                        Logger.info(`已清理章节 ${chapter.fileName} 的 volume 字段`);
                    }
                } catch (error) {
                    Logger.warn(`更新章节 frontmatter 失败: ${chapter.fileName}`, error);
                    // 不抛出错误，因为这不是致命问题
                }
            } catch (error) {
                Logger.error(`移动章节失败: ${chapter.fileName}`, error);
                throw new Error(`移动章节失败: ${chapter.fileName}\n${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }
}

/**
 * 更新配置文件为 nested 结构
 */
async function updateConfigToNested(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const configPath = path.join(workspaceFolder.uri.fsPath, 'novel.jsonc');

    if (!fs.existsSync(configPath)) {
        Logger.warn('未找到 novel.jsonc 配置文件');
        return;
    }

    try {
        let configText = fs.readFileSync(configPath, 'utf-8');

        // 启用分卷功能（处理多种可能的格式）
        configText = configText.replace(
            /"enabled":\s*false/g,
            (match, offset) => {
                // 检查是否在 volumes 配置块中
                const before = configText.substring(Math.max(0, offset - 200), offset);
                if (before.includes('"volumes"')) {
                    return '"enabled": true';
                }
                return match;
            }
        );

        // 将 folderStructure 从 flat 改为 nested
        configText = configText.replace(
            /"folderStructure":\s*"flat"/g,
            '"folderStructure": "nested"'
        );

        fs.writeFileSync(configPath, configText, 'utf-8');
        Logger.info('已更新配置为 nested 结构');
    } catch (error) {
        Logger.error('更新配置失败', error);
        throw error;
    }
}

/**
 * 回滚迁移：嵌套结构 → 扁平结构
 */
export async function rollbackToFlatStructure(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const configService = ConfigService.getInstance();
    const volumesConfig = configService.getVolumesConfig();

    // 检查当前结构
    if (volumesConfig.folderStructure === 'flat') {
        vscode.window.showInformationMessage('当前已是扁平结构');
        return;
    }

    // 确认操作
    const confirm = await vscode.window.showWarningMessage(
        '⚠️ 回滚到扁平结构\n\n即将将所有卷文件夹中的章节移回 chapters/ 根目录，并删除卷文件夹。\n\n建议先备份项目！',
        { modal: true },
        '继续', '取消'
    );

    if (confirm !== '继续') {
        return;
    }

    try {
        const volumeService = VolumeService.getInstance();
        const volumes = await volumeService.scanVolumes();

        if (volumes.length === 0) {
            vscode.window.showInformationMessage('未找到卷文件夹');
            return;
        }

        const chaptersPath = path.join(workspaceFolder.uri.fsPath, 'chapters');

        // 移动所有章节回 chapters/ 根目录
        for (const volume of volumes) {
            for (const chapterFile of volume.chapters) {
                const sourcePath = path.join(chaptersPath, volume.folderName, chapterFile);
                const targetPath = path.join(chaptersPath, chapterFile);

                // 检查目标文件是否已存在
                if (fs.existsSync(targetPath)) {
                    Logger.warn(`文件已存在，跳过: ${chapterFile}`);
                    continue;
                }

                // 移动文件
                const finalTargetPath = targetPath;
                fs.renameSync(sourcePath, finalTargetPath);
                Logger.info(`移动章节: ${chapterFile} -> chapters/`);
            }

            // 删除空的卷文件夹（保留 volume.json 等元数据文件）
            const remainingFiles = fs.readdirSync(volume.folderPath);
            if (remainingFiles.every(f => !f.endsWith('.md') || f === 'outline.md')) {
                // 只删除 .md 文件都移走后的文件夹
                fs.rmSync(volume.folderPath, { recursive: true });
                Logger.info(`删除卷文件夹: ${volume.folderName}`);
            }
        }

        // 更新配置
        await updateConfigToFlat(workspaceFolder);

        // 刷新 VolumeService 缓存
        await volumeService.scanVolumes();

        // 刷新侧边栏
        vscode.commands.executeCommand('noveler.refreshView');

        vscode.window.showInformationMessage(`✅ 已回滚到扁平结构！`);
    } catch (error) {
        Logger.error('回滚失败', error);
        vscode.window.showErrorMessage(`回滚失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 更新配置文件为 flat 结构
 */
async function updateConfigToFlat(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const configPath = path.join(workspaceFolder.uri.fsPath, 'novel.jsonc');

    if (!fs.existsSync(configPath)) {
        Logger.warn('未找到 novel.jsonc 配置文件');
        return;
    }

    try {
        let configText = fs.readFileSync(configPath, 'utf-8');

        // 禁用分卷功能（处理多种可能的格式）
        configText = configText.replace(
            /"enabled":\s*true/g,
            (match, offset) => {
                // 检查是否在 volumes 配置块中
                const before = configText.substring(Math.max(0, offset - 200), offset);
                if (before.includes('"volumes"')) {
                    return '"enabled": false';
                }
                return match;
            }
        );

        // 将 folderStructure 从 nested 改为 flat
        configText = configText.replace(
            /"folderStructure":\s*"nested"/g,
            '"folderStructure": "flat"'
        );

        fs.writeFileSync(configPath, configText, 'utf-8');
        Logger.info('已更新配置为 flat 结构');
    } catch (error) {
        Logger.error('更新配置失败', error);
        throw error;
    }
}
