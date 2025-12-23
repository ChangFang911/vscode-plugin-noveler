import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as jsoncParser from 'jsonc-parser';
import { VolumeInfo, VolumeStatus, VolumeType } from '../types/volume';
import { Logger } from '../utils/logger';
import { VolumeService } from '../services/volumeService';
import { NovelerTreeItem } from '../views/novelerViewProvider';
import { generateVolumeFolderName, getVolumeStatusName, getVolumeTypeName } from '../utils/volumeHelper';
import { formatDateTime } from '../utils/dateFormatter';

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
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        // 生成新的文件夹名称
        const newFolderName = generateVolumeFolderName(volume.volumeType, volume.volume, newTitle);
        const oldFolderPath = volume.folderPath;
        const newFolderPath = path.join(path.dirname(oldFolderPath), newFolderName);

        // 检查新文件夹是否已存在
        const oldFolderUri = vscode.Uri.file(oldFolderPath);
        const newFolderUri = vscode.Uri.file(newFolderPath);

        try {
            await vscode.workspace.fs.stat(newFolderUri);
            vscode.window.showErrorMessage(`卷文件夹已存在: ${newFolderName}`);
            return;
        } catch {
            // 文件夹不存在，可以继续
        }

        // 重命名文件夹
        await vscode.workspace.fs.rename(oldFolderUri, newFolderUri);
        Logger.info(`重命名卷文件夹: ${oldFolderPath} -> ${newFolderPath}`);

        // 更新 volume.json
        const volumeJsonPath = path.join(newFolderPath, 'volume.json');
        const volumeJsonUri = vscode.Uri.file(volumeJsonPath);

        try {
            const contentBytes = await vscode.workspace.fs.readFile(volumeJsonUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const metadata = jsoncParser.parse(content);
            metadata.title = newTitle;
            const updatedContent = JSON.stringify(metadata, null, 2);
            await vscode.workspace.fs.writeFile(volumeJsonUri, Buffer.from(updatedContent, 'utf8'));
            Logger.info(`更新 volume.json: ${volumeJsonPath}`);
        } catch (error) {
            Logger.warn(`volume.json 不存在或读取失败: ${volumeJsonPath}`, error);
        }

        vscode.window.showInformationMessage(`✅ 成功重命名卷: ${newTitle}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
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
        `确定要删除卷「${volume.title}」吗？\n此操作将删除卷文件夹及其下的所有章节（${volume.stats.chapterCount} 章）。`,
        { modal: true },
        '删除', '取消'
    );

    if (confirm !== '删除') {
        return;
    }

    try {
        // 删除文件夹（异步）
        const folderUri = vscode.Uri.file(volume.folderPath);
        await vscode.workspace.fs.delete(folderUri, { recursive: true, useTrash: false });
        Logger.info(`删除卷文件夹: ${volume.folderPath}`);

        vscode.window.showInformationMessage(`✅ 已删除卷: ${volume.title}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
    } catch (error) {
        Logger.error('删除卷失败', error);
        vscode.window.showErrorMessage(`删除卷失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 设置卷状态
 */
export async function setVolumeStatus(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

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
        // 更新 volume.json
        const volumeJsonPath = path.join(volume.folderPath, 'volume.json');
        const volumeJsonUri = vscode.Uri.file(volumeJsonPath);

        try {
            // 尝试读取现有文件
            const contentBytes = await vscode.workspace.fs.readFile(volumeJsonUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const metadata = jsoncParser.parse(content);
            metadata.status = selected.status;
            const updatedContent = JSON.stringify(metadata, null, 2);
            await vscode.workspace.fs.writeFile(volumeJsonUri, Buffer.from(updatedContent, 'utf8'));
            Logger.info(`更新卷状态: ${volume.title} -> ${selected.status}`);
        } catch {
            // 如果没有 volume.json，创建一个
            const metadata = {
                "volume": volume.volume,
                "volumeType": volume.volumeType,
                "title": volume.title,
                "subtitle": "",
                "status": selected.status,
                "targetWords": 500000,
                "description": "",
                "startDate": "",
                "endDate": "",
                "theme": "",
                "mainConflict": ""
            };
            const content = JSON.stringify(metadata, null, 2);
            await vscode.workspace.fs.writeFile(volumeJsonUri, Buffer.from(content, 'utf8'));
            Logger.info(`创建 volume.json 并设置状态: ${volume.title} -> ${selected.status}`);
        }

        vscode.window.showInformationMessage(`✅ 已将卷「${volume.title}」状态设置为：${getVolumeStatusName(selected.status)}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
    } catch (error) {
        Logger.error('设置卷状态失败', error);
        vscode.window.showErrorMessage(`设置卷状态失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 编辑卷信息
 */
export async function editVolumeInfo(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    const volumeJsonPath = path.join(volume.folderPath, 'volume.json');

    // 如果 volume.json 不存在，先创建
    if (!fs.existsSync(volumeJsonPath)) {
        const metadata = {
            "volume": volume.volume,
            "volumeType": volume.volumeType,
            "title": volume.title,
            "subtitle": "",
            "status": volume.status,
            "targetWords": 100000,
            "description": "",
            "startDate": "",
            "endDate": "",
            "theme": "",
            "mainConflict": ""
        };
        fs.writeFileSync(volumeJsonPath, JSON.stringify(metadata, null, 2), 'utf-8');
        Logger.info(`创建 volume.json: ${volumeJsonPath}`);
    }

    // 打开文件
    const doc = await vscode.workspace.openTextDocument(volumeJsonPath);
    await vscode.window.showTextDocument(doc);
}

/**
 * 设置卷类型
/**
 * 设置卷类型
 */
export async function setVolumeType(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

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
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        // 更新 volume.json
        const volumeJsonPath = path.join(volume.folderPath, 'volume.json');
        const volumeJsonUri = vscode.Uri.file(volumeJsonPath);

        // 读取并更新 volume.json
        try {
            const contentBytes = await vscode.workspace.fs.readFile(volumeJsonUri);
            const content = Buffer.from(contentBytes).toString('utf8');
            const metadata = jsoncParser.parse(content);
            metadata.volumeType = selected.type;
            const updatedContent = JSON.stringify(metadata, null, 2);
            await vscode.workspace.fs.writeFile(volumeJsonUri, Buffer.from(updatedContent, 'utf8'));
            Logger.info(`更新卷类型: ${volume.title} -> ${selected.type}`);
        } catch (error) {
            Logger.warn(`volume.json 不存在或读取失败: ${volumeJsonPath}`, error);
        }

        // 生成新的文件夹名称（反映类型变化）
        const newFolderName = generateVolumeFolderName(selected.type, volume.volume, volume.title);
        const oldFolderPath = volume.folderPath;
        const newFolderPath = path.join(path.dirname(oldFolderPath), newFolderName);

        // 如果文件夹名称需要变化，执行重命名
        if (oldFolderPath !== newFolderPath) {
            const oldFolderUri = vscode.Uri.file(oldFolderPath);
            const newFolderUri = vscode.Uri.file(newFolderPath);

            // 检查新文件夹是否已存在
            try {
                await vscode.workspace.fs.stat(newFolderUri);
                vscode.window.showErrorMessage(`卷文件夹已存在: ${newFolderName}`);
                return;
            } catch {
                // 文件夹不存在，可以继续
            }

            // 重命名文件夹
            await vscode.workspace.fs.rename(oldFolderUri, newFolderUri);
            Logger.info(`重命名卷文件夹: ${oldFolderPath} -> ${newFolderPath}`);
        }

        vscode.window.showInformationMessage(`✅ 已将卷「${volume.title}」类型设置为：${getVolumeTypeName(selected.type)}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
    } catch (error) {
        Logger.error('设置卷类型失败', error);
        vscode.window.showErrorMessage(`设置卷类型失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 快速创建章节到当前卷
 */
export async function createChapterInVolume(item: NovelerTreeItem): Promise<void> {
    const volume = item.metadata;
    if (!volume) {
        vscode.window.showErrorMessage('无法获取卷信息');
        return;
    }

    const chapterTitle = await vscode.window.showInputBox({
        prompt: '请输入章节名称（不需要输入"第几章"）',
        placeHolder: '例如：陨落的天才',
        ignoreFocusOut: true
    });

    if (!chapterTitle) {
        return;
    }

    // 获取 VolumeService 实例并扫描卷信息
    const volumeService = VolumeService.getInstance();
    await volumeService.scanVolumes();

    // 使用 VolumeService 计算正确的章节号（根据配置的编号模式）
    const chapterNumber = await volumeService.calculateNextChapterNumber(volume);

    // 生成文件名
    const fileName = `第${String(chapterNumber).padStart(3, '0')}章-${chapterTitle}.md`;
    const filePath = path.join(volume.folderPath, fileName);

    // 检查文件是否已存在
    if (fs.existsSync(filePath)) {
        vscode.window.showErrorMessage(`章节已存在: ${fileName}`);
        return;
    }

    // 创建章节内容
    const now = formatDateTime(new Date());
    const frontMatter = `---
title: ${chapterTitle}
chapter: ${chapterNumber}
volume: ${volume.volume}
volumeType: ${volume.volumeType}
status: draft
created: ${now}
modified: ${now}
wordCount: 0
targetWords: 2500
---

# ${chapterTitle}

`;

    try {
        fs.writeFileSync(filePath, frontMatter, 'utf-8');
        Logger.info(`创建章节: ${filePath}`);

        // 刷新侧边栏
        await vscode.commands.executeCommand('noveler.smartRefresh');
    } catch (error) {
        Logger.error('创建章节失败', error);
        vscode.window.showErrorMessage(`创建章节失败: ${error instanceof Error ? error.message : String(error)}`);
    }
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

    // 检查大纲文件是否存在
    if (!fs.existsSync(outlinePath)) {
        const create = await vscode.window.showInformationMessage(
            `卷「${volume.title}」还没有大纲文件，是否创建？`,
            '创建', '取消'
        );

        if (create === '创建') {
            // 创建大纲文件
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
                fs.writeFileSync(outlinePath, outlineContent, 'utf-8');
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
    const currentVolume = volumeService.getVolumeForChapter(chapterPath);

    // 显示卷选择器
    interface VolumeItem extends vscode.QuickPickItem {
        volume: VolumeInfo;
    }

    const items: VolumeItem[] = volumes.map(v => ({
        label: `${getVolumeIconForType(v.volumeType)} ${v.title}`,
        description: `${v.stats.chapterCount} 章`,
        detail: currentVolume?.volume === v.volume ? '(当前卷)' : undefined,
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
    if (currentVolume && selected.volume.volume === currentVolume.volume) {
        vscode.window.showInformationMessage('章节已在该卷中');
        return;
    }

    try {
        // 移动文件（异步）
        const fileName = path.basename(chapterPath);
        const targetPath = path.join(selected.volume.folderPath, fileName);
        const chapterUri = vscode.Uri.file(chapterPath);
        const targetUri = vscode.Uri.file(targetPath);

        // 检查目标文件是否存在
        try {
            await vscode.workspace.fs.stat(targetUri);
            vscode.window.showErrorMessage(`目标卷中已存在���名章节: ${fileName}`);
            return;
        } catch {
            // 文件不存在，可以继续
        }

        // 读取章节内容
        const contentBytes = await vscode.workspace.fs.readFile(chapterUri);
        const content = Buffer.from(contentBytes).toString('utf8');

        // 更新 frontmatter 的 volume 和 volumeType 字段
        const updatedContent = updateChapterVolumeFrontMatter(content, selected.volume);

        // 写入新位置
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(updatedContent, 'utf8'));

        // 删除原文件
        await vscode.workspace.fs.delete(chapterUri, { useTrash: false });

        Logger.info(`移动章节: ${chapterPath} -> ${targetPath}`);

        // 如果当前打开的是被移动的章节，重新打开新位置的文件
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.uri.fsPath === chapterPath) {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            const doc = await vscode.workspace.openTextDocument(targetPath);
            await vscode.window.showTextDocument(doc);
        }

        vscode.window.showInformationMessage(`✅ 已将章节移动到卷「${selected.volume.title}」`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
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

        // 检查目标文件是否存在
        try {
            await vscode.workspace.fs.stat(targetUri);
            vscode.window.showErrorMessage(`目标卷中已存在同名章节: ${fileName}`);
            return;
        } catch {
            // 文件不存在，可以继续
        }

        // 读取章节内容
        const contentBytes = await vscode.workspace.fs.readFile(chapterUri);
        const content = Buffer.from(contentBytes).toString('utf8');

        // 更新 frontmatter 的 volume 和 volumeType 字段
        const updatedContent = updateChapterVolumeFrontMatter(content, selected.volume);

        // 写入新位置
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(updatedContent, 'utf8'));

        Logger.info(`复制章节: ${chapterPath} -> ${targetPath}`);

        vscode.window.showInformationMessage(`✅ 已将章节复制到卷「${selected.volume.title}」`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
    } catch (error) {
        Logger.error('复制章节失败', error);
        vscode.window.showErrorMessage(`复制章节失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 更新章节 frontmatter 中的 volume 和 volumeType 字段
 */
function updateChapterVolumeFrontMatter(content: string, targetVolume: VolumeInfo): string {
    // 使用正则表达式替换 frontmatter 中的 volume 和 volumeType
    let updatedContent = content;

    // 匹配 frontmatter 区域
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
        let frontmatterContent = frontmatterMatch[1];

        // 更新或添加 volume 字段
        if (/^volume:\s*.+$/m.test(frontmatterContent)) {
            frontmatterContent = frontmatterContent.replace(/^volume:\s*.+$/m, `volume: ${targetVolume.volume}`);
        } else {
            frontmatterContent += `\nvolume: ${targetVolume.volume}`;
        }

        // 更新或添加 volumeType 字段
        if (/^volumeType:\s*.+$/m.test(frontmatterContent)) {
            frontmatterContent = frontmatterContent.replace(/^volumeType:\s*.+$/m, `volumeType: ${targetVolume.volumeType}`);
        } else {
            frontmatterContent += `\nvolumeType: ${targetVolume.volumeType}`;
        }

        // 替换整个 frontmatter
        updatedContent = content.replace(/^---\s*\n[\s\S]*?\n---/, `---\n${frontmatterContent}\n---`);
    }

    return updatedContent;
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
