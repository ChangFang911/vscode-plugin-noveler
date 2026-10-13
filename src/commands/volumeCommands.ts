import * as vscode from 'vscode';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { patchJsoncFields } from '../utils/settingsHelper';
import { VolumeInfo, VolumeStatus, VolumeType } from '../types/volume';
import { Logger } from '../utils/logger';
import { VolumeService } from '../services/volumeService';
import { ConfigService } from '../services/configService';
import { NovelerTreeItem } from '../views/novelerViewProvider';
import { generateVolumeFolderName, getVolumeStatusName, getVolumeTypeName } from '../utils/volumeHelper';
import { CHAPTER_NUMBER_PADDING, DEFAULT_VOLUME_TARGET_WORDS, VOLUME_TYPE_OFFSETS } from '../constants';
import { writeAndOpenChapter, runChapterCreation } from './createChapter';
import { validateChapterName } from '../utils/inputValidator';
import { loadTemplates } from '../utils/templateLoader';
import { patchFrontMatter, applyDocumentChange, copyDocument, createDocument, fileExists, documentIO, saveDocumentsUnder } from '../utils/documentOperations';


function defaultVolumeMetadata(volume: VolumeInfo): Record<string, unknown> {
    return { volume: volume.volume, volumeType: volume.volumeType, title: volume.title,
        subtitle: '', status: volume.status, targetWords: DEFAULT_VOLUME_TARGET_WORDS,
        description: '', startDate: '', endDate: '', theme: '', mainConflict: '' };
}

let updatingVolume = false;

async function updateVolumeMetadata(volume: VolumeInfo, fields: Record<string, unknown>, folderName?: string): Promise<void> {
    if (updatingVolume) { throw new Error('正在修改卷，请完成当前操作后再试'); }
    updatingVolume = true;
    const folder = vscode.Uri.file(volume.folderPath);
    const target = folderName ? vscode.Uri.joinPath(folder, '..', folderName) : folder;
    const uri = vscode.Uri.joinPath(folder, 'volume.json');
    let original = '';
    let updated = '';
    let existed = false;
    let attempted = false;
    try {
        if (!await fileExists(folder)) { throw new Error('原卷目录已不存在，请刷新后重试'); }
        if (target.toString() !== folder.toString() && await fileExists(target)) {
            throw new Error('目标卷目录已存在，未覆盖');
        }
        existed = await fileExists(uri);
        const document = existed ? await vscode.workspace.openTextDocument(uri) : undefined;
        original = document?.getText() ?? JSON.stringify(defaultVolumeMetadata(volume), null, 2);
        patchJsoncFields(original, fields);
        await saveDocumentsUnder(folder);
        original = document?.getText() ?? original;
        updated = patchJsoncFields(original, fields);
        if (existed) {
            attempted = true;
            await applyDocumentChange(uri, text => {
                if (text !== original) { throw new Error('卷资料已变化，请重试'); }
                return updated;
            });
            if (!await documentIO.save(document!) || document!.isDirty) { throw new Error('卷资料未保存，操作已停止'); }
        } else {
            await createDocument(uri, updated);
            attempted = true;
        }
        if (target.toString() !== folder.toString()) {
            const edit = new vscode.WorkspaceEdit();
            edit.renameFile(folder, target, { overwrite: false });
            if (!await vscode.workspace.applyEdit(edit)) { throw new Error('卷目录重命名未完成'); }
        }
    } catch (error) {
        if (attempted) {
            try {
                if (!await fileExists(folder)) { throw new Error('原卷目录位置已变化，请检查：' + target.fsPath); }
                const metadataExists = await fileExists(uri);
                if (existed && !metadataExists) { throw new Error('原卷资料已不存在'); }
                if (metadataExists) {
                    const document = await vscode.workspace.openTextDocument(uri);
                    if (document.getText() !== original && document.getText() !== updated) {
                        throw new Error('卷资料存在新的修改，未覆盖');
                    }
                    if (existed) {
                        await applyDocumentChange(uri, text => {
                            if (text !== original && text !== updated) {
                                throw new Error('卷资料存在新的修改，未覆盖');
                            }
                            return original;
                        });
                        if (!await documentIO.save(document) || document.isDirty) { throw new Error('卷资料恢复未保存'); }
                    } else {
                        const edit = new vscode.WorkspaceEdit();
                        edit.deleteFile(uri, { ignoreIfNotExists: true });
                        if (!await vscode.workspace.applyEdit(edit)) { throw new Error('新建卷资料清理失败'); }
                    }
                }
            } catch (restoreError) {
                const root = documentIO.workspaceFolder()?.uri;
                let recovery = '';
                if (root && existed) {
                    const backup = vscode.Uri.joinPath(root, '.noveler', 'backups', 'volume-' + randomBytes(8).toString('hex') + '.json');
                    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(backup, '..'));
                    await documentIO.writeFile(backup, Buffer.from(original));
                    recovery = '；原卷资料备份：' + backup.fsPath;
                }
                throw new Error(String(error) + '；恢复未完成：' + String(restoreError) + recovery);
            }
        }
        throw error;
    } finally {
        updatingVolume = false;
    }
}

/**
 * 重命名卷
 */
export async function renameVolume(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    const newTitle = await vscode.window.showInputBox({
        prompt: '请输入新的卷名称',
        value: volume.title,
        validateInput: (value) => {
            if (!value.trim()) {
                return '卷名称不能为空';
            }
            if (/[<>:"/\\|?*]/.test(value)) {
                return '卷名称不能包含以下字符: < > : " / \\ | ? *';
            }
            return undefined;
        },
        ignoreFocusOut: true
    });

    if (!newTitle || newTitle === volume.title) {
        return;
    }

    try {
        const workspaceFolder = documentIO.workspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        const newFolderName = generateVolumeFolderName(volume.volumeType, volume.volume, newTitle);
        await updateVolumeMetadata(volume, { title: newTitle }, newFolderName);

        vscode.window.showInformationMessage(`✅ 成功重命名卷: ${newTitle}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        Logger.error('重命名卷失败', error);
        vscode.window.showErrorMessage(`重命名卷失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 删除卷
 */
export async function deleteVolume(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `确定要删除卷「${volume.title}」吗？\n此操作将把卷文件夹及其下的所有章节移入废纸篓（${volume.stats.chapterCount} 章）。\n恢复时可将整个卷文件夹从废纸篓拖回 chapters 目录，再刷新插件。`,
        { modal: true },
        '删除', '取消'
    );

    if (confirm !== '删除') {
        return;
    }

    try {
        // 删除文件夹（异步）
        const folderUri = vscode.Uri.file(volume.folderPath);
        await saveDocumentsUnder(folderUri);
        await documentIO.delete(folderUri, { recursive: true, useTrash: true });
        Logger.info(`删除卷文件夹: ${volume.folderPath}`);

        vscode.window.showInformationMessage(
            `已移入废纸篓：${volume.title}。若“放回原处”不可用，将整个卷文件夹拖回 chapters 目录后刷新即可恢复。`,
            '定位恢复目录'
        ).then(choice => {
            if (choice === '定位恢复目录') {
                return vscode.commands.executeCommand('revealFileInOS', vscode.Uri.joinPath(folderUri, '..'));
            }
        }).then(undefined, error => Logger.warn('显示或定位卷恢复目录失败', error));

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        Logger.error('删除卷失败', error);
        vscode.window.showErrorMessage(`删除卷失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 编辑卷属性（合并了设置状态、设置类型、编辑信息）
 */
export async function editVolumeProperties(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    interface PropertyItem extends vscode.QuickPickItem {
        action: 'status' | 'type' | 'info';
    }

    const items: PropertyItem[] = [
        {
            label: '$(symbol-event) 设置状态',
            description: `当前: ${getVolumeStatusName(volume.status)}`,
            detail: '设置卷的写作进度状态',
            action: 'status'
        },
        {
            label: '$(symbol-class) 设置类型',
            description: `当前: ${getVolumeTypeName(volume.volumeType)}`,
            detail: '设置卷的类型（正文/前传/后传/番外）',
            action: 'type'
        },
        {
            label: '$(json) 编辑详细信息',
            description: '打开 volume.json',
            detail: '编辑卷的完整元数据（描述、目标字数等）',
            action: 'info'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `编辑卷「${volume.title}」的属性`,
        ignoreFocusOut: true
    });

    if (!selected) {
        return;
    }

    switch (selected.action) {
        case 'status':
            await setVolumeStatusInternal(volume);
            break;
        case 'type':
            await setVolumeTypeInternal(volume);
            break;
        case 'info':
            await editVolumeInfoInternal(volume);
            break;
    }
}

/**
 * 内部方法：设置卷状态
 */
async function setVolumeStatusInternal(volume: VolumeInfo): Promise<void> {
    interface StatusItem extends vscode.QuickPickItem {
        status: VolumeStatus;
    }

    const items: StatusItem[] = [
        {
            label: '$(edit) 计划中',
            description: '正在规划卷的内容',
            status: 'planning'
        },
        {
            label: '$(pencil) 创作中',
            description: '正在撰写卷的章节',
            status: 'writing'
        },
        {
            label: '$(check) 已完成',
            description: '卷的所有章节已完成',
            status: 'completed'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前状态：${getVolumeStatusName(volume.status)}`,
        ignoreFocusOut: true
    });

    if (!selected || selected.status === volume.status) {
        return;
    }

    try {
        await updateVolumeMetadata(volume, { status: selected.status });

        vscode.window.showInformationMessage(`✅ 已将卷「${volume.title}」状态设置为：${getVolumeStatusName(selected.status)}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        Logger.error('设置卷状态失败', error);
        vscode.window.showErrorMessage(`设置卷状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 内部方法：设置卷类型
 */
async function setVolumeTypeInternal(volume: VolumeInfo): Promise<void> {
    interface TypeItem extends vscode.QuickPickItem {
        type: VolumeType;
    }

    const items: TypeItem[] = [
        {
            label: '$(book) 正文卷',
            description: '主线剧情卷',
            type: 'main'
        },
        {
            label: '$(book) 前传卷',
            description: '前置故事卷',
            type: 'prequel'
        },
        {
            label: '$(book) 后传卷',
            description: '后续故事卷',
            type: 'sequel'
        },
        {
            label: '$(book) 番外卷',
            description: '独立故事卷',
            type: 'extra'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `当前类型：${getVolumeTypeName(volume.volumeType)}`,
        ignoreFocusOut: true
    });

    if (!selected || selected.type === volume.volumeType) {
        return;
    }

    try {
        const workspaceFolder = documentIO.workspaceFolder();
        if (!workspaceFolder) {
            return;
        }

        const ordinal = volume.volumeType === 'prequel' ? Math.abs(volume.volume)
            : volume.volume >= VOLUME_TYPE_OFFSETS[volume.volumeType]
                ? volume.volume - VOLUME_TYPE_OFFSETS[volume.volumeType] : volume.volume;
        if (!Number.isSafeInteger(ordinal) || ordinal < 1) { throw new Error('卷序号无效，请先修复卷资料'); }
        const number = selected.type === 'prequel' ? -ordinal : VOLUME_TYPE_OFFSETS[selected.type] + ordinal;
        const newFolderName = generateVolumeFolderName(selected.type, number, volume.title);
        await updateVolumeMetadata(volume, { volumeType: selected.type, volume: number }, newFolderName);

        vscode.window.showInformationMessage(`✅ 已将卷「${volume.title}」类型设置为：${getVolumeTypeName(selected.type)}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        Logger.error('设置卷类型失败', error);
        vscode.window.showErrorMessage(`设置卷类型失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 内部方法：编辑卷信息
 */
async function editVolumeInfoInternal(volume: VolumeInfo): Promise<void> {
    const volumeJsonPath = path.join(volume.folderPath, 'volume.json');
    const volumeJsonUri = vscode.Uri.file(volumeJsonPath);

    if (!await fileExists(volumeJsonUri)) {
        await createDocument(volumeJsonUri, JSON.stringify(defaultVolumeMetadata(volume), null, 2));
    }

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(volumeJsonPath);
    await vscode.window.showTextDocument(doc);
}

/**
 * 快速创建章节到当前卷
 */
export async function createChapterInVolume(item: NovelerTreeItem): Promise<void> {
    await runChapterCreation(() => createChapterInVolumeInternal(item));
}

async function createChapterInVolumeInternal(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    const input = await vscode.window.showInputBox({
        prompt: '请输入章节名称（不需要输入"第几章"）',
        placeHolder: '例如：陨落的天才',
        ignoreFocusOut: true
    });

    if (!input) { return; }
    const chapterTitle = validateChapterName(input);
    if (!chapterTitle) {
        vscode.window.showErrorMessage('章节名称无效');
        return;
    }
    if (chapterTitle !== input && await vscode.window.showWarningMessage(
        `章节名称包含非法字符，将使用清理后的名称：${chapterTitle}`, '确定', '取消'
    ) !== '确定') { return; }

    // 获取配置服务，读取最新配置
    const configService = ConfigService.getInstance();
    await configService.reloadConfig();
    const targetWords = configService.getTargetWords();

    // 获取 VolumeService 实例并强制刷新卷信息
    const volumeService = VolumeService.getInstance();
    await volumeService.scanVolumes(true);

    // 使用 VolumeService 计算正确的章节号（根据配置的编号模式）
    const chapterNumber = await volumeService.calculateNextChapterNumber(volume);

    // 生成文件名（使用统一的 padding 常量）
    const fileName = `第${String(chapterNumber).padStart(CHAPTER_NUMBER_PADDING, '0')}章-${chapterTitle}.md`;

    // 加载模板（与 createChapter 保持一致）
    const templates = await loadTemplates();

    // 通过公共函数创建并打开章节文件
    await writeAndOpenChapter({
        folderUri: vscode.Uri.file(volume.folderPath),
        fileName,
        chapterTitle: `第${chapterNumber}章 ${chapterTitle}`,
        chapterNumber,
        volumeInfo: {
            volume: volume.volume,
            volumeType: volume.volumeType,
            folderName: volume.folderName
        },
        targetWords,
        template: templates?.chapter
    });
}

/**
 * 打开卷大纲
 */
export async function openVolumeOutline(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    const outlinePath = path.join(volume.folderPath, 'outline.md');
    const outlineUri = vscode.Uri.file(outlinePath);

    // 检查大纲文件是否存在
    let outlineExists = true;
    try {
        await vscode.workspace.fs.stat(outlineUri);
    } catch {
        outlineExists = false;
    }

    if (!outlineExists) {
        const create = await vscode.window.showInformationMessage(
            `卷「${volume.title}」还没有大纲文件，是否创建？`,
            '创建', '取消'
        );

        if (create === '创建') {
            const outlineContent = `# ${volume.title} - 大纲

## 卷概述

（在此简要描述本卷的主要内容和目标）

## 主要情节

### 起始

（情节的开端）

### 发展

（情节的推进）

### 高潮

（情节的冲突顶点）

### 结局

（情节的收束）

## 重要角色

- 角色1：描述
- 角色2：描述

## 关键事件

1. 事件1
2. 事件2
3. 事件3
`;
            try {
                await vscode.workspace.fs.writeFile(outlineUri, Buffer.from(outlineContent, 'utf-8'));
                Logger.info(`创建卷大纲: ${outlinePath}`);
            } catch (error) {
                Logger.error('创建卷大纲失败', error);
                vscode.window.showErrorMessage(`创建卷大纲失败: ${error instanceof Error ? error.message : String(error)}`);
                return;
            }
        } else {
            return;
        }
    }

    // 打开大纲文件
    try {
        const doc = await vscode.workspace.openTextDocument(outlinePath);
        await vscode.window.showTextDocument(doc);
    } catch (error) {
        Logger.error('打开卷大纲失败', error);
        vscode.window.showErrorMessage(`打开卷大纲失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 移动章节到其他卷
 */
export async function moveChapterToVolume(item: NovelerTreeItem): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取章节信息');
        return;
    }

    const chapterPath = item.resourceUri.fsPath;
    const volumeService = VolumeService.getInstance();

    // 扫描所有卷
    await volumeService.scanVolumes();
    const volumes = volumeService.getVolumes();

    if (volumes.length === 0) {
        vscode.window.showErrorMessage('没有可用的卷');
        return;
    }

    // 获取当前章节所属的卷
    const currentVolume = volumes.find(volume => volume.folderPath === path.dirname(chapterPath));

    // 显示卷选择器
    interface VolumeItem extends vscode.QuickPickItem {
        volume: VolumeInfo;
    }

    const items: VolumeItem[] = volumes.map(v => ({
        label: `${getVolumeIconForType(v.volumeType)} ${v.title}`,
        description: `${v.stats.chapterCount} 章`,
        detail: currentVolume?.folderPath === v.folderPath ? '(当前卷)' : undefined,
        volume: v
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择目标卷',
        ignoreFocusOut: true
    });

    if (!selected) {
        return;
    }

    // 如果选择的是当前卷，不执行操作
    if (currentVolume && selected.volume.folderPath === currentVolume.folderPath) {
        vscode.window.showInformationMessage('章节已在该卷中');
        return;
    }

    try {
        // 移动文件（异步）
        const fileName = path.basename(chapterPath);
        const targetPath = path.join(selected.volume.folderPath, fileName);
        const chapterUri = vscode.Uri.file(chapterPath);
        const targetUri = vscode.Uri.file(targetPath);

        await applyDocumentChange(chapterUri, content => updateChapterVolumeFrontMatter(content, selected.volume), targetUri);

        Logger.info(`移动章节: ${chapterPath} -> ${targetPath}`);

        vscode.window.showInformationMessage(`✅ 已将章节移动到卷「${selected.volume.title}」`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        Logger.error('移动章节失败', error);
        vscode.window.showErrorMessage(`移动章节失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 复制章节到其他卷
 */
export async function copyChapterToVolume(item: NovelerTreeItem): Promise<void> {
    if (!item.resourceUri) {
        vscode.window.showErrorMessage('无法获取章节信息');
        return;
    }

    const chapterPath = item.resourceUri.fsPath;
    const volumeService = VolumeService.getInstance();

    // 扫描所有卷
    await volumeService.scanVolumes();
    const volumes = volumeService.getVolumes();

    if (volumes.length === 0) {
        vscode.window.showErrorMessage('没有可用的卷');
        return;
    }

    // 显示卷选择器
    interface VolumeItem extends vscode.QuickPickItem {
        volume: VolumeInfo;
    }

    const items: VolumeItem[] = volumes.map(v => ({
        label: `${getVolumeIconForType(v.volumeType)} ${v.title}`,
        description: `${v.stats.chapterCount} 章`,
        volume: v
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '选择目标卷',
        ignoreFocusOut: true
    });

    if (!selected) {
        return;
    }

    try {
        // 复制文件（异步）
        const fileName = path.basename(chapterPath);
        const targetPath = path.join(selected.volume.folderPath, fileName);
        const chapterUri = vscode.Uri.file(chapterPath);
        const targetUri = vscode.Uri.file(targetPath);

        await copyDocument(chapterUri, targetUri, content => updateChapterVolumeFrontMatter(content, selected.volume));

        Logger.info(`复制章节: ${chapterPath} -> ${targetPath}`);

        vscode.window.showInformationMessage(`✅ 已将章节复制到卷「${selected.volume.title}」`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.refresh');
    } catch (error) {
        Logger.error('复制章节失败', error);
        vscode.window.showErrorMessage(`复制章节失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 更新章节 frontmatter 中的 volume 和 volumeType 字段
 */
function updateChapterVolumeFrontMatter(content: string, targetVolume: VolumeInfo): string {
    return patchFrontMatter(content, { volume: targetVolume.volume, volumeType: targetVolume.volumeType });
}

/**
 * 获取卷类型对应的图标
 */
function getVolumeIconForType(volumeType: VolumeType): string {
    switch (volumeType) {
        case 'prequel':
            return '📖';
        case 'sequel':
            return '📕';
        case 'extra':
            return '📘';
        case 'main':
        default:
            return '📚';
    }
}
