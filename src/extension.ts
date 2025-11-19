import * as vscode from 'vscode';
import { ChineseNovelFormatProvider } from './providers/formatProvider';
import { WordCountService } from './services/wordCountService';
import { NovelHighlightProvider } from './providers/highlightProvider';
import { ConfigService } from './services/configService';

let wordCountStatusBarItem: vscode.StatusBarItem;
let wordCountService: WordCountService;
let highlightProvider: NovelHighlightProvider;
let configService: ConfigService;
let extensionContext: vscode.ExtensionContext;

// 加载模板配置
async function loadTemplates(): Promise<any> {
    try {
        const templatePath = vscode.Uri.joinPath(extensionContext.extensionUri, 'templates', 'default-templates.json');
        const templateData = await vscode.workspace.fs.readFile(templatePath);
        const templateText = Buffer.from(templateData).toString('utf8');
        return JSON.parse(templateText);
    } catch (error) {
        console.error('Noveler: 无法读取模板配置文件', error);
        return null;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Noveler 中文小说写作助手已激活');

    // 保存 context 供全局使用
    extensionContext = context;

    // 初始化配置服务
    configService = ConfigService.getInstance(context);
    context.subscriptions.push(configService);

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

    // 注册命令：初始化小说项目
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.initProject', async () => {
            await initNovelProject(context);
        })
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
                prompt: '���输入章节名称（不需要输入"第几章"）',
                placeHolder: '例如：初入江湖'
            });

            if (chapterName) {
                await createNewChapter(chapterName);
            }
        })
    );

    // 注册命令：创建人物
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.createCharacter', async () => {
            const characterName = await vscode.window.showInputBox({
                prompt: '请输入人物名称',
                placeHolder: '例如：张无忌'
            });

            if (characterName) {
                await createCharacter(characterName);
            }
        })
    );

    // 注册命令：重载高亮配置
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.reloadHighlights', () => {
            highlightProvider.reloadDecorations();
            updateHighlights(vscode.window.activeTextEditor);
            vscode.window.showInformationMessage('高亮配置已重新加载');
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

    // 监听文档保存事件，更新 Front Matter
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(async (e) => {
            if (e.document.languageId === 'markdown') {
                e.waitUntil(updateFrontMatterOnSave(e.document));
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

    // 使用 novel.json 配置，如果不存在则回退到 VSCode 设置
    if (!configService.shouldShowWordCountInStatusBar()) {
        const config = vscode.workspace.getConfiguration('noveler');
        if (!config.get('showWordCountInStatusBar', true)) {
            wordCountStatusBarItem.hide();
            return;
        }
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

// 格式化时间为可读格式 (YYYY-MM-DD HH:mm:ss)
function formatDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 保存时更新 Front Matter
async function updateFrontMatterOnSave(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    const text = document.getText();
    const edits: vscode.TextEdit[] = [];

    // 检查文件是否包含 Front Matter
    const frontMatterRegex = /^---\n([\s\S]*?)\n---/;
    const match = text.match(frontMatterRegex);

    if (!match) {
        return edits; // 没有 Front Matter，不处理
    }

    const frontMatterContent = match[1];
    const frontMatterEndIndex = match[0].length;

    // 计算文档字数（排除 Front Matter）
    const contentWithoutFrontMatter = text.substring(frontMatterEndIndex);
    const stats = wordCountService.getWordCount({
        getText: () => contentWithoutFrontMatter,
        languageId: 'markdown'
    } as vscode.TextDocument);

    // 更新 wordCount
    let updatedFrontMatter = frontMatterContent;
    const wordCountRegex = /^wordCount:\s*\d+$/m;
    if (wordCountRegex.test(updatedFrontMatter)) {
        updatedFrontMatter = updatedFrontMatter.replace(
            wordCountRegex,
            `wordCount: ${stats.chineseChars}`
        );
    }

    // 更新 modified 时间
    const modifiedRegex = /^modified:\s*.+$/m;
    const currentTime = formatDateTime(new Date());
    if (modifiedRegex.test(updatedFrontMatter)) {
        updatedFrontMatter = updatedFrontMatter.replace(
            modifiedRegex,
            `modified: ${currentTime}`
        );
    }

    // 如果 Front Matter 有变化，创建编辑
    if (updatedFrontMatter !== frontMatterContent) {
        const fullRange = new vscode.Range(
            document.positionAt(4), // "---\n" 之后
            document.positionAt(4 + frontMatterContent.length)
        );
        edits.push(vscode.TextEdit.replace(fullRange, updatedFrontMatter));
    }

    return edits;
}

async function initNovelProject(context: vscode.ExtensionContext) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个文件夹作为工作区');
        return;
    }

    // 询问小说名称
    const novelName = await vscode.window.showInputBox({
        prompt: '请输入小说名称',
        placeHolder: '例如：我的武侠小说'
    });

    if (!novelName) {
        return;
    }

    try {
        // 创建目录结构
        const directories = ['chapters', 'characters', 'drafts', 'references'];
        for (const dir of directories) {
            const dirUri = vscode.Uri.joinPath(workspaceFolder.uri, dir);
            try {
                await vscode.workspace.fs.stat(dirUri);
            } catch {
                await vscode.workspace.fs.createDirectory(dirUri);
            }
        }

        // 读取默认配置模板
        const templatePath = vscode.Uri.joinPath(context.extensionUri, 'templates', 'default-config.json');
        let defaultNovelerConfig;
        try {
            const templateData = await vscode.workspace.fs.readFile(templatePath);
            const templateText = Buffer.from(templateData).toString('utf8');
            const templateConfig = JSON.parse(templateText);
            defaultNovelerConfig = templateConfig.noveler;
        } catch (error) {
            vscode.window.showErrorMessage('无法读取默认配置模板');
            return;
        }

        // 创建 novel.json 配置文件
        const now = formatDateTime(new Date());
        const novelConfig = {
            name: novelName,
            author: "",
            description: "",
            genre: "",
            tags: [],
            created: now,
            modified: now,
            // Noveler 插件配置
            noveler: defaultNovelerConfig
        };

        const configUri = vscode.Uri.joinPath(workspaceFolder.uri, 'novel.json');
        await vscode.workspace.fs.writeFile(
            configUri,
            Buffer.from(JSON.stringify(novelConfig, null, 2), 'utf8')
        );

        // 从模板配置读取 README 和大纲模板
        const templates = await loadTemplates();

        // 创建 README.md
        let readmeContent = templates?.readme?.content || `# {novelName}

## 项目说明

这是使用 Noveler 插件创建的中文小说写作项目。

## 目录结构

- \`chapters/\` - 正式章节
- \`characters/\` - 人物设定
- \`drafts/\` - 草稿和大纲
- \`references/\` - 参考资料和设定
- \`novel.json\` - 小说配置文件

## 开始写作

使用命令 \`Noveler: 创建新章节\` 来创建新的章节。
`;
        readmeContent = readmeContent.replace(/{novelName}/g, novelName);

        const readmeUri = vscode.Uri.joinPath(workspaceFolder.uri, 'README.md');
        await vscode.workspace.fs.writeFile(
            readmeUri,
            Buffer.from(readmeContent, 'utf8')
        );

        // 在 drafts 目录创建一个示例大纲文件
        let outlineContent = templates?.outline?.content || `# {novelName} - 大纲

## 主要角色

-

## 主线剧情

1.

## 世界观设定

-
`;
        outlineContent = outlineContent.replace(/{novelName}/g, novelName);

        const outlineUri = vscode.Uri.joinPath(workspaceFolder.uri, 'drafts', '大纲.md');
        await vscode.workspace.fs.writeFile(
            outlineUri,
            Buffer.from(outlineContent, 'utf8')
        );

        vscode.window.showInformationMessage(
            `小说项目"${novelName}"初始化完成！已创建目录结构和配置文件。`
        );

        // 打开 README.md
        const readmeDoc = await vscode.workspace.openTextDocument(readmeUri);
        await vscode.window.showTextDocument(readmeDoc);

    } catch (error) {
        vscode.window.showErrorMessage(`初始化项目失败: ${error}`);
    }
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
title: "${chapterTitle}"
chapter: ${nextChapterNumber}
wordCount: ${frontMatter.wordCount}
targetWords: ${frontMatter.targetWords}
characters: ${JSON.stringify(frontMatter.characters)}
locations: ${JSON.stringify(frontMatter.locations)}
tags: ${JSON.stringify(frontMatter.tags)}
created: ${now}
modified: ${now}
status: "${frontMatter.status}"
---

# ${chapterTitle}
${content}`;

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

// 创建人物文件
async function createCharacter(characterName: string) {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('请先打开一个工作区');
        return;
    }

    const charactersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'characters');

    // 确保 characters 目录存在
    try {
        await vscode.workspace.fs.stat(charactersFolderUri);
    } catch {
        await vscode.workspace.fs.createDirectory(charactersFolderUri);
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
created: ${now}
modified: ${now}
---

# ${characterName}
${content}`;

    const fileUri = vscode.Uri.joinPath(charactersFolderUri, fileName);

    // 检查文件是否已存在
    try {
        await vscode.workspace.fs.stat(fileUri);
        vscode.window.showWarningMessage(`人物文件已存在: ${fileName}`);
        return;
    } catch {
        // 文件不存在，继续创建
    }

    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(template, 'utf8'));
    const doc = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(doc);

    vscode.window.showInformationMessage(`人物文件已创建: ${characterName}`);
}

export function deactivate() {
    console.log('Noveler 已停用');
}
