import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VolumeType } from '../types/volume';
import { Logger } from '../utils/logger';
import { ConfigService } from '../services/configService';
import { VolumeService } from '../services/volumeService';
import { generateVolumeFolderName } from '../utils/volumeHelper';
import { formatDateTime } from '../utils/dateFormatter';

/**
 * 创建新卷
 */
export async function createVolume(): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const configService = ConfigService.getInstance();
    const volumeService = VolumeService.getInstance();

    // 检查是否启用分卷功能
    if (!configService.isVolumesEnabled()) {
        const enable = await vscode.window.showWarningMessage(
            '分卷功能未启用。是否要启用分卷功能？',
            '启用', '取消'
        );

        if (enable !== '启用') {
            return;
        }

        // 启用分卷功能
        await enableVolumes(workspaceFolder);
        vscode.window.showInformationMessage('已启用分卷功能，请重新运行创建卷命令');
        return;
    }

    // 检查文件夹结构
    const volumesConfig = configService.getVolumesConfig();
    if (volumesConfig.folderStructure !== 'nested') {
        vscode.window.showErrorMessage('当前文件夹结构为 flat（扁平），无法创建卷。请在配置中将 folderStructure 设置为 nested');
        return;
    }

    // 步骤 1: 选择卷类型
    const volumeType = await selectVolumeType();
    if (!volumeType) {
        return;
    }

    // 步骤 2: 自动计算卷序号
    await volumeService.scanVolumes();
    const volumeNumber = calculateNextVolumeNumber(volumeService, volumeType);

    // 步骤 3: 输入卷名称
    const volumeTitle = await inputVolumeTitle();
    if (!volumeTitle) {
        return;
    }

    // 步骤 4: 输入卷描述（可选）
    const volumeDescription = await inputVolumeDescription();

    // 生成卷文件夹名称
    const folderName = generateVolumeFolderName(volumeType, volumeNumber, volumeTitle);

    // 创建卷文件夹
    const chaptersPath = path.join(workspaceFolder.uri.fsPath, 'chapters');
    const volumeFolderPath = path.join(chaptersPath, folderName);

    if (fs.existsSync(volumeFolderPath)) {
        vscode.window.showErrorMessage(`卷文件夹已存在: ${folderName}`);
        return;
    }

    try {
        // 创建文件夹
        fs.mkdirSync(volumeFolderPath, { recursive: true });
        Logger.info(`创建卷文件夹: ${volumeFolderPath}`);

        // 默认创建 volume.json 元数据文件
        await createVolumeMetadata(volumeFolderPath, {
            volumeType,
            volumeNumber,
            volumeTitle,
            volumeDescription
        });

        // 只有正文卷默认创建大纲文件
        if (volumeType === 'main') {
            await createVolumeOutline(volumeFolderPath, volumeTitle);
        }

        vscode.window.showInformationMessage(`✅ 成功创建卷: ${volumeTitle}`);

        // 智能刷新：刷新侧边栏 + 根据配置决定是否更新 README
        await vscode.commands.executeCommand('noveler.smartRefresh');
    } catch (error) {
        Logger.error('创建卷失败', error);
        vscode.window.showErrorMessage(`创建卷失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 选择卷类型
 */
async function selectVolumeType(): Promise<VolumeType | undefined> {
    interface VolumeTypeItem extends vscode.QuickPickItem {
        type: VolumeType;
    }

    const items: VolumeTypeItem[] = [
        {
            label: '$(book) 正文卷',
            description: '主线剧情卷',
            detail: '小说的主要故事线，按顺序编号（如：第一卷、第二卷）',
            type: 'main'
        },
        {
            label: '$(book) 前传卷',
            description: '前置故事卷',
            detail: '发生在主线之前的故事，使用负数编号或特殊标记（如：前传一）',
            type: 'prequel'
        },
        {
            label: '$(book) 后传卷',
            description: '后续故事卷',
            detail: '发生在主线之后的故事，编号在正文后（如：后传一）',
            type: 'sequel'
        },
        {
            label: '$(book) 番外卷',
            description: '独立故事卷',
            detail: '独立于主线的番外故事（如：番外一）',
            type: 'extra'
        }
    ];

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: '请选择卷的类型',
        ignoreFocusOut: true
    });

    return selected?.type;
}

/**
 * 自动计算下一个卷序号（返回内部编号）
 *
 * @param volumeService 卷服务实例
 * @param volumeType 卷类型
 * @returns 内部编号（prequel: 负数，sequel: 1000+，extra: 2000+，main: 正数）
 */
function calculateNextVolumeNumber(volumeService: VolumeService, volumeType: VolumeType): number {
    const volumes = volumeService.getVolumes();

    // 查找相同类型的卷
    const sameTypeVolumes = volumes.filter(v => v.volumeType === volumeType);

    if (sameTypeVolumes.length === 0) {
        // 返回该类型的起始内部编号
        switch (volumeType) {
            case 'prequel':
                return -1;
            case 'sequel':
                return 1001;
            case 'extra':
                return 2001;
            default:
                return 1;
        }
    }

    // 找到最大内部编号
    const maxInternalNumber = Math.max(...sameTypeVolumes.map(v => v.volume));

    // 返回下一个内部编号
    switch (volumeType) {
        case 'prequel':
            // 前传是负数递减：-1, -2, -3...
            return maxInternalNumber - 1;
        default:
            // 其他类型都是递增
            return maxInternalNumber + 1;
    }
}

/**
 * 输入卷名称
 */
async function inputVolumeTitle(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
        prompt: '请输入卷名称',
        placeHolder: '例如：崛起、起源、余波、日常',
        validateInput: (value) => {
            if (!value.trim()) {
                return '卷名称不能为空';
            }
            // 检查是否包含非法字符
            if (/[<>:"/\\|?*]/.test(value)) {
                return '卷名称不能包含以下字符: < > : " / \\ | ? *';
            }
            return undefined;
        },
        ignoreFocusOut: true
    });
}

/**
 * 输入卷描述（可选）
 */
async function inputVolumeDescription(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
        prompt: '请输入卷描述（可选，直接回车跳过）',
        placeHolder: '例如：主角从平凡少年成长为强者的故事',
        ignoreFocusOut: true
    });
}

/**
 * 创建 volume.json 元数据文件
 */
async function createVolumeMetadata(volumeFolderPath: string, info: {
    volumeType: VolumeType;
    volumeNumber: number;
    volumeTitle: string;
    volumeDescription?: string;
}): Promise<void> {
    const metadata = {
        "volume": info.volumeNumber,
        "volumeType": info.volumeType,
        "title": info.volumeTitle,
        "subtitle": "",
        "status": "planning",
        "targetWords": 500000,
        "description": info.volumeDescription || "",
        "startDate": "",
        "endDate": "",
        "theme": "",
        "mainConflict": ""
    };

    const metadataPath = path.join(volumeFolderPath, 'volume.json');
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
    Logger.info(`创建 volume.json: ${metadataPath}`);
}

/**
 * 创建 outline.md 大纲文件
 */
async function createVolumeOutline(volumeFolderPath: string, volumeTitle: string): Promise<void> {
    const outlineContent = `# ${volumeTitle} - 大纲

## 卷概述

<!-- 在这里描述本卷的整体情节和主题 -->

## 主要情节

### 起始
<!-- 本卷的开端 -->

### 发展
<!-- 情节的发展 -->

### 高潮
<!-- 本卷的高潮部分 -->

### 结局
<!-- 本卷如何收尾 -->

## 重要角色

<!-- 本卷中的重要角色 -->

## 关键事件

<!-- 本卷中的关键转折点 -->
`;

    const outlinePath = path.join(volumeFolderPath, 'outline.md');
    fs.writeFileSync(outlinePath, outlineContent, 'utf-8');
    Logger.info(`创建 outline.md: ${outlinePath}`);
}

/**
 * 启用分卷功能
 */
async function enableVolumes(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
    const configPath = path.join(workspaceFolder.uri.fsPath, 'novel.jsonc');

    if (!fs.existsSync(configPath)) {
        vscode.window.showErrorMessage('未找到 novel.jsonc 配置文件');
        return;
    }

    try {
        let configText = fs.readFileSync(configPath, 'utf-8');

        // 简单替换：将 "enabled": false 改为 "enabled": true
        configText = configText.replace(
            /"volumes":\s*\{[^}]*"enabled":\s*false/,
            (match) => match.replace('"enabled": false', '"enabled": true')
        );

        // 将 folderStructure 从 flat 改为 nested
        configText = configText.replace(
            /"folderStructure":\s*"flat"/,
            '"folderStructure": "nested"'
        );

        // 更新 modified 时间戳
        const now = formatDateTime(new Date());
        configText = configText.replace(
            /"modified":\s*"[^"]*"/,
            `"modified": "${now}"`
        );

        fs.writeFileSync(configPath, configText, 'utf-8');
        Logger.info('已启用分卷功能');
    } catch (error) {
        Logger.error('启用分卷功能失败', error);
        throw error;
    }
}
