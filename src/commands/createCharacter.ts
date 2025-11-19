/**
 * 创建人物命令
 */

import * as vscode from 'vscode';
import { loadTemplates } from '../utils/templateLoader';
import { formatDateTime } from '../utils/dateFormatter';

/**
 * 创建人物文件
 */
export async function createCharacter(characterName: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个工作区');
        return;
    }

    const charactersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'characters');

    // 确保 characters 目录存在
    try {
        await vscode.workspace.fs.stat(charactersFolderUri);
    } catch {
        try {
            await vscode.workspace.fs.createDirectory(charactersFolderUri);
        } catch (error) {
            vscode.window.showErrorMessage(`Noveler: 无法创建 characters 目录 - ${error}`);
            return;
        }
    }

    const now = formatDateTime(new Date());
    const fileName = `${characterName}.md`;

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

    const importanceOptions = characterTemplate?.importanceOptions || ["主角", "重要配角", "次要角色", "路人"];
    const content = characterTemplate?.content || "\n## 基本信息\n\n## 外貌描写\n\n## 性格特点\n\n## 背景故事\n\n## 人际关系\n\n## 能力特长\n\n## 成长轨迹\n\n## 重要事件\n\n## 备注\n\n";

    const template = `---
name: "${characterName}"
gender: "${frontMatter.gender}"
age: "${frontMatter.age}"
appearance: "${frontMatter.appearance}"
personality: "${frontMatter.personality}"
background: "${frontMatter.background}"
relationships: ${JSON.stringify(frontMatter.relationships)}
abilities: ${JSON.stringify(frontMatter.abilities)}
importance: "${frontMatter.importance}" # ${importanceOptions.join('/')}
firstAppearance: "${frontMatter.firstAppearance}"
tags: ${JSON.stringify(frontMatter.tags)}
created: "${now}"
modified: "${now}"
---

# ${characterName}
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
        vscode.window.showInformationMessage(`Noveler: 人物文件已创建: ${characterName}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Noveler: 创建人物失败 - ${error}`);
    }
}
