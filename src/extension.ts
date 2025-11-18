import * as vscode from 'vscode';
import { ChineseNovelFormatProvider } from './providers/formatProvider';
import { WordCountService } from './services/wordCountService';
import { NovelHighlightProvider } from './providers/highlightProvider';

let wordCountStatusBarItem: vscode.StatusBarItem;
let wordCountService: WordCountService;
let highlightProvider: NovelHighlightProvider;

export function activate(context: vscode.ExtensionContext) {
    console.log('Noveler 中文小说写作助手已激活');

    // 初始化字数统计服务
    wordCountService = new WordCountService();

    // 初始化高亮提供者
    highlightProvider = new NovelHighlightProvider();
    context.subscriptions.push(highlightProvider);

    // 创建状态栏项
    wordCountStatusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    context.subscriptions.push(wordCountStatusBarItem);

    // 注册格式化提供者
    const formatProvider = new ChineseNovelFormatProvider();
    context.subscriptions.push(
        vscode.languages.registerDocumentFormattingEditProvider(
            'markdown',
            formatProvider
        )
    );

    // 注册命令：格式化文档
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.formatDocument', async () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                await vscode.commands.executeCommand('editor.action.formatDocument');
                vscode.window.showInformationMessage('文档格式化完成');
            }
        })
    );

    // 注册命令：显示字数统计
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showWordCount', () => {
            const editor = vscode.window.activeTextEditor;
            if (editor) {
                const stats = wordCountService.getWordCount(editor.document);
                vscode.window.showInformationMessage(
                    `总字数: ${stats.totalChars} | 中文字数: ${stats.chineseChars} | 段落数: ${stats.paragraphs}`
                );
            }
        })
    );

    // 注册命令：创建新章节
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.createChapter', async () => {
            const chapterName = await vscode.window.showInputBox({
                prompt: '请输入章节名称（不需要输入"第几章"）',
                placeHolder: '例如：初入江湖'
            });

            if (chapterName) {
                await createNewChapter(chapterName);
            }
        })
    );

    // 监听文档变化，更新字数统计和高亮
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateWordCount(editor);
            updateHighlights(editor);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document === vscode.window.activeTextEditor?.document) {
                updateWordCount(vscode.window.activeTextEditor);
                updateHighlights(vscode.window.activeTextEditor);
            }
        })
    );

    // 初始更新
    updateWordCount(vscode.window.activeTextEditor);
    updateHighlights(vscode.window.activeTextEditor);
}

function updateWordCount(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.languageId !== 'markdown') {
        wordCountStatusBarItem.hide();
        return;
    }

    const config = vscode.workspace.getConfiguration('noveler');
    if (!config.get('showWordCountInStatusBar', true)) {
        wordCountStatusBarItem.hide();
        return;
    }

    const stats = wordCountService.getWordCount(editor.document);
    wordCountStatusBarItem.text = `$(pencil) ${stats.chineseChars} 字`;
    wordCountStatusBarItem.tooltip = `总字数: ${stats.totalChars}\n中文字数: ${stats.chineseChars}\n段落数: ${stats.paragraphs}`;
    wordCountStatusBarItem.show();
}

function updateHighlights(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }
    highlightProvider.updateHighlights(editor);
}

async function createNewChapter(chapterName: string) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const chaptersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'chapters');

    // 确保 chapters 目录存在
    try {
        await vscode.workspace.fs.stat(chaptersFolderUri);
    } catch {
        await vscode.workspace.fs.createDirectory(chaptersFolderUri);
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
    } catch {
        // 目录不存在或为空，使用默认值 1
    }

    const now = new Date().toISOString();
    const chapterTitle = `第${convertToChineseNumber(nextChapterNumber)}章 ${chapterName}`;
    const fileName = `${String(nextChapterNumber).padStart(2, '0')}-${chapterName}.md`;

    const template = `---
title: "${chapterTitle}"
chapter: ${nextChapterNumber}
wordCount: 0
targetWords: 5000
characters: []
locations: []
tags: []
created: ${now}
modified: ${now}
status: "草稿"
---

# ${chapterTitle}

`;

    const fileUri = vscode.Uri.joinPath(chaptersFolderUri, fileName);

    // 检查文件是否已存在
    try {
        await vscode.workspace.fs.stat(fileUri);
        vscode.window.showWarningMessage(`文件已存在: ${fileName}`);
        return;
    } catch {
        // 文件不存在，继续创建
    }

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(template, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(`新章节已创建: ${chapterTitle}`);
}

// 转换数字为中文
function convertToChineseNumber(num: number): string {
    const chineseNums = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const chineseUnits = ['', '十', '百', '千'];

    if (num === 0) return chineseNums[0];
    if (num < 10) return chineseNums[num];
    if (num === 10) return '十';
    if (num < 20) return '十' + chineseNums[num % 10];
    if (num < 100) {
        const tens = Math.floor(num / 10);
        const ones = num % 10;
        return chineseNums[tens] + '十' + (ones > 0 ? chineseNums[ones] : '');
    }

    // 简化处理，100以上直接用阿拉伯数字
    return num.toString();
}

export function deactivate() {
    console.log('Noveler 已停用');
}
