/**
 * 创建人物命令
 */

import * as vscode from 'vscode';
import { loadTemplates } from '../utils/templateLoader';
import { formatDateTime } from '../utils/dateFormatter';
import { validateCharacterName } from '../utils/inputValidator';
import { handleError, handleSuccess } from '../utils/errorHandler';
import { updateReadme } from '../utils/readmeUpdater';
import { CHARACTERS_FOLDER } from '../constants';

/**
 * 创建人物文件
 */
export async function createCharacter(characterName: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个工作区');
        return;
    }

    // 验证并清理人物名称
    const sanitizedName = validateCharacterName(characterName);
    if (!sanitizedName) {
        vscode.window.showErrorMessage('Noveler: 人物名称无效或过长（最多50字符），请避免使用特殊字符（如 / \\ : * ? " < > |）');
        return;
    }

    // 如果清理后的名称与原始名称不同，提示用户
    if (sanitizedName !== characterName) {
        const useCleanedName = await vscode.window.showWarningMessage(
            `人物名称包含非法字符，将使用清理后的名称："${sanitizedName}"`,
            '确定', '取消'
        );
        if (useCleanedName !== '确定') {
            return;
        }
    }

    const charactersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, CHARACTERS_FOLDER);

    // 确保 characters 目录存在
    try {
        await vscode.workspace.fs.stat(charactersFolderUri);
    } catch {
        try {
            await vscode.workspace.fs.createDirectory(charactersFolderUri);
        } catch (error) {
            handleError('无法创建 characters 目录', error);
            return;
        }
    }

    const now = formatDateTime(new Date());
    const fileName = `${sanitizedName}.md`;

    // 从模板配置读取人物模板
    const templates = await loadTemplates();
    const characterTemplate = templates?.character;

    const frontMatter = characterTemplate?.frontMatter || {
        gender: "",
        age: "",
        appearance: "",
        personality: "",
        background: "",
        relationships: [],
        abilities: [],
        importance: "主角",
        firstAppearance: "",
        tags: []
    };

    const importanceOptions = characterTemplate?.importanceOptions || ["主角", "重要配角", "次要配角", "路人"];
    const content = characterTemplate?.content || "\n## 基本信息\n\n## 外貌描写\n\n## 性格特点\n\n## 背景故事\n\n## 人际关系\n\n## 能力特长\n\n## 成长轨迹\n\n## 重要事件\n\n## 备注\n\n";

    // 辅助函数：将空字符串转为引号包裹的空字符串，避免 YAML 解析为 null
    const toYamlString = (value: string) => value === "" ? '""' : value;

    const template = `---
name: ${sanitizedName}
gender: ${toYamlString(frontMatter.gender)}
age: ${toYamlString(frontMatter.age)}
appearance: ${toYamlString(frontMatter.appearance)}
personality: ${toYamlString(frontMatter.personality)}
background: ${toYamlString(frontMatter.background)}
relationships: ${JSON.stringify(frontMatter.relationships)}
abilities: ${JSON.stringify(frontMatter.abilities)}
importance: ${frontMatter.importance} # ${importanceOptions.join('/')}
firstAppearance: ${toYamlString(frontMatter.firstAppearance)}
tags: ${JSON.stringify(frontMatter.tags)}
created: '${now}'
modified: '${now}'
---

# ${sanitizedName}
${content}`;

    const fileUri = vscode.Uri.joinPath(charactersFolderUri, fileName);

    // 检查文件是否已存在
    try {
        await vscode.workspace.fs.stat(fileUri);
        vscode.window.showWarningMessage(`Noveler: 人物文件已存在: ${fileName}`);
        return;
    } catch {
        // 文件不存在，继续创建
    }

    try {
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(template, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
        handleSuccess(`人物文件已创建: ${sanitizedName}`);

        // 自动刷新侧边栏视图
        vscode.commands.executeCommand('noveler.refreshView');

        // 根据配置自动更新 README
        await handleReadmeAutoUpdate();
    } catch (error) {
        handleError('创建人物失败', error);
    }
}

/**
 * 根据配置处理 README 自动更新
 */
async function handleReadmeAutoUpdate(): Promise<void> {
    const config = vscode.workspace.getConfiguration('noveler');
    const autoUpdate = config.get<string>('autoUpdateReadmeOnCreate', 'ask');

    if (autoUpdate === 'always') {
        // 总是自动更新
        await updateReadme();
    } else if (autoUpdate === 'ask') {
        // 询问用户
        const result = await vscode.window.showInformationMessage(
            '是否更新 README 统计信息？',
            '更新', '跳过'
        );
        if (result === '更新') {
            await updateReadme();
        }
    }
    // autoUpdate === 'never' 时什么都不做
}
