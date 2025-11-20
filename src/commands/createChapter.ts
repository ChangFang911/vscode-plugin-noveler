/**
 * 创建章节命令
 */

import * as vscode from 'vscode';
import { loadTemplates } from '../utils/templateLoader';
import { formatDateTime } from '../utils/dateFormatter';
import { convertToChineseNumber } from '../utils/chineseNumber';

/**
 * 创建新章节
 */
export async function createChapter(chapterName: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('Noveler: 请先打开一个工作区');
        return;
    }

    const chaptersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'chapters');

    // 确保 chapters 目录存在
    try {
        await vscode.workspace.fs.stat(chaptersFolderUri);
    } catch {
        try {
            await vscode.workspace.fs.createDirectory(chaptersFolderUri);
        } catch (error) {
            vscode.window.showErrorMessage(`Noveler: 无法创建 chapters 目录 - ${error}`);
            return;
        }
    }

    // 扫描现有章节，自动计算下一个章节号
    let nextChapterNumber = 1;
    try {
        const files = await vscode.workspace.fs.readDirectory(chaptersFolderUri);
        const mdFiles = files
            .filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'))
            .map(([name]) => name);

        // 从文件名中提取章节号（格式：01-xxx.md, 02-xxx.md）
        const chapterNumbers = mdFiles
            .map(name => {
                const match = name.match(/^(\d+)-/);
                return match ? parseInt(match[1]) : 0;
            })
            .filter(num => num > 0);

        if (chapterNumbers.length > 0) {
            nextChapterNumber = Math.max(...chapterNumbers) + 1;
        }
    } catch (error) {
        console.log('Noveler: 扫描章节目录失败，使用默认章节号 1', error);
    }

    const now = formatDateTime(new Date());
    const chapterTitle = `第${convertToChineseNumber(nextChapterNumber)}章 ${chapterName}`;
    const fileName = `${String(nextChapterNumber).padStart(2, '0')}-${chapterName}.md`;

    // 从模板配置读取章节模板
    const templates = await loadTemplates();
    const chapterTemplate = templates?.chapter;

    const frontMatter = chapterTemplate?.frontMatter || {
        wordCount: 0,
        targetWords: 5000,
        characters: [],
        locations: [],
        tags: [],
        status: "草稿"
    };

    const content = chapterTemplate?.content || "\n";

    const template = `---
title: ${chapterTitle}
chapter: ${nextChapterNumber}
wordCount: ${frontMatter.wordCount}
targetWords: ${frontMatter.targetWords}
characters: ${JSON.stringify(frontMatter.characters)}
locations: ${JSON.stringify(frontMatter.locations)}
tags: ${JSON.stringify(frontMatter.tags)}
created: '${now}'
modified: '${now}'
status: ${frontMatter.status}
---

# ${chapterTitle}
${content}`;

    const fileUri = vscode.Uri.joinPath(chaptersFolderUri, fileName);

    // 检查文件是否已存在
    try {
        await vscode.workspace.fs.stat(fileUri);
        vscode.window.showWarningMessage(`Noveler: 文件已存在: ${fileName}`);
        return;
    } catch {
        // 文件不存在，继续创建
    }

    try {
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(template, 'utf8'));
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(`Noveler: 新章节已创建: ${chapterTitle}`);
    } catch (error) {
        vscode.window.showErrorMessage(`Noveler: 创建章节失败 - ${error}`);
    }
}
