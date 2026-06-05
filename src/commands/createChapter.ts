/**
 * 创建章节命令
 */

import * as vscode from 'vscode';
import { loadTemplates } from '../utils/templateLoader';
import { formatDateTime } from '../utils/dateFormatter';
import { convertToChineseNumber } from '../utils/chineseNumber';
import { convertToRomanNumber } from '../utils/volumeHelper';
import { validateChapterName } from '../utils/inputValidator';
import { handleError, handleSuccess } from '../utils/errorHandler';
import { ConfigService } from '../services/configService';
import { VolumeService } from '../services/volumeService';
import { CHAPTERS_FOLDER, CHAPTER_NUMBER_PADDING, VOLUME_TYPE_NAMES, SIDEBAR_REFRESH_DELAY } from '../constants';
import { Logger } from '../utils/logger';
import { VolumeInfo } from '../types/volume';

/**
 * 公共：写入章节文件并在编辑器中打开
 * createChapter 和 createChapterInVolume 均通过此函数完成实际文件操作
 */
export async function writeAndOpenChapter(params: {
    folderUri: vscode.Uri;
    fileName: string;
    chapterTitle: string;       // 用于标题行（含章节号）
    chapterNumber: number;
    volumeInfo?: { volume: number; volumeType: string; folderName?: string };
    targetWords: number;
    template?: { frontMatter?: { wordCount: number; status: string; characters: unknown[]; locations: unknown[]; tags: unknown[] }; content?: string };
}): Promise<void> {
    const { folderUri, fileName, chapterTitle, chapterNumber, volumeInfo, targetWords, template } = params;
    const fileUri = vscode.Uri.joinPath(folderUri, fileName);

    // 检查文件是否已存在
    try {
        await vscode.workspace.fs.stat(fileUri);
        vscode.window.showWarningMessage(`Noveler: 文件已存在: ${fileName}`);
        return;
    } catch {
        // 文件不存在，继续创建
    }

    const now = formatDateTime(new Date());
    const fm = template?.frontMatter;
    const content = template?.content || "\n";

    const frontMatterLines: string[] = [
        `title: ${params.chapterTitle.replace(/^第\S+章\s*/, '')}`,  // title 只存章节名，不含序号
        `chapter: ${chapterNumber}`
    ];
    if (volumeInfo) {
        frontMatterLines.push(`volume: ${volumeInfo.volume}`);
        frontMatterLines.push(`volumeType: ${volumeInfo.volumeType}`);
    }
    frontMatterLines.push(
        `status: ${fm?.status ?? 'draft'}`,
        `created: ${now}`,
        `modified: ${now}`,
        `wordCount: ${fm?.wordCount ?? 0}`,
        `targetWords: ${targetWords}`,
        `characters: ${JSON.stringify(fm?.characters ?? [])}`,
        `locations: ${JSON.stringify(fm?.locations ?? [])}`,
        `tags: ${JSON.stringify(fm?.tags ?? [])}`
    );

    const fileContent = `---\n${frontMatterLines.join('\n')}\n---\n\n# ${chapterTitle}\n${content}`;

    try {
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(fileContent, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, {
            viewColumn: vscode.ViewColumn.Active,
            preserveFocus: false
        });

        const locationInfo = volumeInfo?.folderName ? ` (${volumeInfo.folderName})` : '';
        handleSuccess(`新章节已创建: ${params.chapterTitle.replace(/^第\S+章\s*/, '')}${locationInfo}`);

        setTimeout(() => {
            vscode.commands.executeCommand('noveler.refresh').then(
                () => {
                    if (editor !== vscode.window.activeTextEditor) {
                        vscode.window.showTextDocument(editor.document, {
                            viewColumn: editor.viewColumn,
                            preserveFocus: false
                        });
                    }
                },
                (error: unknown) => { Logger.error('刷新侧边栏失败', error); }
            );
        }, SIDEBAR_REFRESH_DELAY);
    } catch (error) {
        handleError('创建章节失败', error);
    }
}

/**
 * 创建新章节
 */
export async function createChapter(chapterName: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个工作区');
        return;
    }

    // 验证并清理章节名称
    const sanitizedName = validateChapterName(chapterName);
    if (!sanitizedName) {
        vscode.window.showErrorMessage('Noveler: 章节名称无效，请避免使用特殊字符（如 / \\ : * ? " < > |）');
        return;
    }

    // 如果清理后的名称与原始名称不同，提示用户
    if (sanitizedName !== chapterName) {
        const useCleanedName = await vscode.window.showWarningMessage(
            `章节名称包含非法字符，将使用清理后的名称："${sanitizedName}"`,
            '确定', '取消'
        );
        if (useCleanedName !== '确定') {
            return;
        }
    }

    // 获取配置服务
    const configService = ConfigService.getInstance();
    await configService.waitForConfig(); // 等待配置加载完成

    // 关键：重新加载配置，确保使用最新的用户设置
    await configService.reloadConfig();

    // 获取分卷服务
    const volumeService = VolumeService.getInstance();
    await volumeService.scanVolumes(true); // 强制刷新，防止缓存导致章节号重复

    const volumesConfig = configService.getVolumesConfig();

    // 决定目标文件夹和章节号
    let targetFolderUri: vscode.Uri;
    let nextChapterNumber: number;
    let targetVolume: VolumeInfo | undefined;

    // 检查是否启用分卷功能且使用嵌套结构
    if (volumesConfig.enabled && volumesConfig.folderStructure === 'nested') {
        Logger.info('分卷功能已启用，使用嵌套结构');

        // 获取所有卷
        const volumes = volumeService.getVolumes();

        if (volumes.length === 0) {
            // 如果没有卷，提示用户先创建卷
            const createVolume = await vscode.window.showWarningMessage(
                '当前没有任何卷文件夹，是否要在 chapters/ 目录下手动创建卷文件夹？\n\n卷文件��命名示例：\n- 第01卷-崛起\n- 第一卷-崛起\n- 第I卷-崛起',
                { modal: true },
                '好的', '取消'
            );

            if (createVolume !== '好的') {
                return;
            }

            // 打开 chapters 目录
            const chaptersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, CHAPTERS_FOLDER);
            try {
                await vscode.workspace.fs.stat(chaptersFolderUri);
            } catch {
                await vscode.workspace.fs.createDirectory(chaptersFolderUri);
            }

            await vscode.commands.executeCommand('revealInExplorer', chaptersFolderUri);
            vscode.window.showInformationMessage('请在 chapters/ 目录下创建卷文件夹，然后重新运行此命令');
            return;
        }

        // 让用户选择目标卷
        interface VolumeQuickPickItem extends vscode.QuickPickItem {
            volume: VolumeInfo;
        }

        const volumeOptions: VolumeQuickPickItem[] = volumes.map(v => {
            // 格式化卷类型
            const typeLabel = VOLUME_TYPE_NAMES[v.volumeType] || v.volumeType;

            return {
                label: `$(book) ${v.folderName}`,
                description: `${typeLabel} | ${v.stats.chapterCount} 章 | ${v.stats.totalWords.toLocaleString()} 字`,
                detail: `下一章节号: ${v.stats.chapterCount + 1}`,
                volume: v
            };
        });

        const volumeChoice = await vscode.window.showQuickPick(volumeOptions, {
            placeHolder: '请选择要创建章节的卷',
            ignoreFocusOut: true
        });

        if (!volumeChoice) {
            return;
        }

        targetVolume = volumeChoice.volume;
        targetFolderUri = vscode.Uri.file(targetVolume.folderPath);

        // 使用 VolumeService 计算章节号
        nextChapterNumber = await volumeService.calculateNextChapterNumber(targetVolume);

        Logger.info(`选择卷: ${targetVolume.folderName}, 下一章节号: ${nextChapterNumber}`);
    } else {
        // 扁平模式：直接在 chapters/ 目录下创建
        Logger.info('使用扁平结构创建章节');

        targetFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, CHAPTERS_FOLDER);

        // 确保 chapters 目录存在
        try {
            await vscode.workspace.fs.stat(targetFolderUri);
        } catch {
            try {
                await vscode.workspace.fs.createDirectory(targetFolderUri);
            } catch (error) {
                handleError('无法创建 chapters 目录', error);
                return;
            }
        }

        // 使用 VolumeService 计算章节号（扁平模式）
        nextChapterNumber = await volumeService.calculateNextChapterNumber();

        Logger.info(`扁平模式，下一章节号: ${nextChapterNumber}`);
    }

    // 生成章节信息
    // title 字段只包含章节名称，不包含章节号（侧边栏会自动添加章节号）
    const chapterTitle = sanitizedName;
    const fullChapterTitle = `第${convertToChineseNumber(nextChapterNumber)}章 ${sanitizedName}`;

    // 根据卷的编号格式生成文件名
    let chapterNumberStr: string;
    if (targetVolume && volumesConfig.numberFormat) {
        // 如果在卷中创建，使用卷的编号格式
        switch (volumesConfig.numberFormat) {
            case 'chinese':
                chapterNumberStr = `第${convertToChineseNumber(nextChapterNumber)}章`;
                break;
            case 'roman':
                chapterNumberStr = `第${convertToRomanNumber(nextChapterNumber)}章`;
                break;
            case 'arabic':
            default:
                chapterNumberStr = `第${String(nextChapterNumber).padStart(CHAPTER_NUMBER_PADDING, '0')}章`;
                break;
        }
    } else {
        // 扁平模式使用阿拉伯数字（带前导零）
        chapterNumberStr = `第${String(nextChapterNumber).padStart(CHAPTER_NUMBER_PADDING, '0')}章`;
    }

    const fileName = `${chapterNumberStr}-${sanitizedName}.md`;

    // 从模板配置读取章节模板
    const templates = await loadTemplates();
    const chapterTemplate = templates?.chapter;

    // 🔑 关键：在使用 targetWords 前再次刷新，确保分卷模式下也能获取最新配置
    await configService.reloadConfig();
    const targetWords = configService.getTargetWords();

    await writeAndOpenChapter({
        folderUri: targetFolderUri,
        fileName,
        chapterTitle: fullChapterTitle,
        chapterNumber: nextChapterNumber,
        volumeInfo: targetVolume ? {
            volume: targetVolume.volume,
            volumeType: targetVolume.volumeType,
            folderName: targetVolume.folderName
        } : undefined,
        targetWords,
        template: chapterTemplate
    });
}
