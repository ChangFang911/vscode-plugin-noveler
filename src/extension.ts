import * as vscode from 'vscode';
import { ChineseNovelFormatProvider } from './providers/formatProvider';
import { WordCountService } from './services/wordCountService';
import { NovelHighlightProvider } from './providers/highlightProvider';
import { ConfigService } from './services/configService';
import { initTemplateLoader } from './utils/templateLoader';
import { updateFrontMatter, getContentWithoutFrontMatter } from './utils/frontMatterHelper';
import { updateReadme } from './utils/readmeUpdater';
import { initProject } from './commands/initProject';
import { createChapter } from './commands/createChapter';
import { createCharacter } from './commands/createCharacter';
import { WORD_COUNT_DEBOUNCE_DELAY, HIGHLIGHT_DEBOUNCE_DELAY } from './constants';

let wordCountStatusBarItem: vscode.StatusBarItem;
let wordCountService: WordCountService;
let highlightProvider: NovelHighlightProvider;
let configService: ConfigService;

// 防抖定时器
let wordCountDebounceTimer: NodeJS.Timeout | undefined;
let highlightDebounceTimer: NodeJS.Timeout | undefined;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Noveler 中文小说写作助手已激活');

    // 初始化模板加载器
    initTemplateLoader(context);

    // 初始化配置服务
    configService = ConfigService.getInstance(context);
    context.subscriptions.push(configService);

    // 等待配置加载完成
    await configService.waitForConfig();

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
            await initProject(context);
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
                    `字数: ${stats.totalChars} | 中文: ${stats.chineseChars} | 段落: ${stats.paragraphs}`
                );
            }
        })
    );

    // 注册命令：创建新章节
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.createChapter', async () => {
            const chapterName = await vscode.window.showInputBox({
                prompt: '只输入章节名称（不需要输入"第几章"）',
                placeHolder: '例如：陨落的天才'
            });

            if (chapterName) {
                await createChapter(chapterName);
            }
        })
    );

    // 注册命令：创建人物
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.createCharacter', async () => {
            const characterName = await vscode.window.showInputBox({
                prompt: '请输入人物名称',
                placeHolder: '例如：萧炎'
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
            vscode.window.showInformationMessage('Noveler: 高亮配置已重新加载');
        })
    );

    // 注册命令：更新 README 统计
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.updateReadme', async () => {
            await updateReadme();
        })
    );

    // 监听文档变化，更新字数统计和高亮
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            // 切换文档时立即更新
            updateWordCountImmediate(editor);
            updateHighlightsImmediate(editor);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document === vscode.window.activeTextEditor?.document) {
                // 文档内容变化时使用防抖
                updateWordCountDebounced(vscode.window.activeTextEditor);
                updateHighlightsDebounced(vscode.window.activeTextEditor);
            }
        })
    );

    // 监听选中文本变化
    context.subscriptions.push(
        vscode.window.onDidChangeTextEditorSelection((e) => {
            if (e.textEditor === vscode.window.activeTextEditor) {
                updateWordCount(e.textEditor);
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
    updateWordCountImmediate(vscode.window.activeTextEditor);
    updateHighlightsImmediate(vscode.window.activeTextEditor);
}

/**
 * 立即更新字数统计（用于切换编辑器）
 */
function updateWordCountImmediate(editor: vscode.TextEditor | undefined) {
    // 清除防抖定时器
    if (wordCountDebounceTimer) {
        clearTimeout(wordCountDebounceTimer);
        wordCountDebounceTimer = undefined;
    }
    updateWordCount(editor);
}

/**
 * 防抖更新字数统计（用于文档内容变化）
 */
function updateWordCountDebounced(editor: vscode.TextEditor | undefined) {
    if (wordCountDebounceTimer) {
        clearTimeout(wordCountDebounceTimer);
    }
    wordCountDebounceTimer = setTimeout(() => {
        updateWordCount(editor);
        wordCountDebounceTimer = undefined;
    }, WORD_COUNT_DEBOUNCE_DELAY);
}

/**
 * 立即更新高亮（用于切换编辑器）
 */
function updateHighlightsImmediate(editor: vscode.TextEditor | undefined) {
    // 清除防抖定时器
    if (highlightDebounceTimer) {
        clearTimeout(highlightDebounceTimer);
        highlightDebounceTimer = undefined;
    }
    updateHighlights(editor);
}

/**
 * 防抖更新高亮（用于文档内容变化）
 */
function updateHighlightsDebounced(editor: vscode.TextEditor | undefined) {
    if (highlightDebounceTimer) {
        clearTimeout(highlightDebounceTimer);
    }
    highlightDebounceTimer = setTimeout(() => {
        updateHighlights(editor);
        highlightDebounceTimer = undefined;
    }, HIGHLIGHT_DEBOUNCE_DELAY);
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

    // 检查是否有选中文本
    const selection = editor.selection;
    if (!selection.isEmpty) {
        // 显示选中文本的字数（网文标准：总字符数）
        const selectedText = editor.document.getText(selection);
        const selectionStats = wordCountService.getSelectionWordCount(selectedText);
        wordCountStatusBarItem.text = `$(selection) ${selectionStats.totalChars} 字 (已选)`;
        wordCountStatusBarItem.tooltip = `选中文本统计:\n字数: ${selectionStats.totalChars} 字\n中文: ${selectionStats.chineseChars} 字\n段落: ${selectionStats.paragraphs}`;
    } else {
        // 显示整个文档的字数（网文标准：总字符数）
        const stats = wordCountService.getWordCount(editor.document);
        wordCountStatusBarItem.text = `$(pencil) ${stats.totalChars} 字`;
        wordCountStatusBarItem.tooltip = `文档统计:\n字数: ${stats.totalChars} 字\n中文: ${stats.chineseChars} 字\n段落: ${stats.paragraphs}`;
    }

    wordCountStatusBarItem.show();
}

function updateHighlights(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }
    highlightProvider.updateHighlights(editor);
}

/**
 * 保存时更新 Front Matter
 */
async function updateFrontMatterOnSave(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    try {
        // 获取正文内容（不含 Front Matter）
        const content = getContentWithoutFrontMatter(document);

        // 计算字数（网文标准：总字符数）
        const stats = wordCountService.getWordCount({
            getText: () => content,
            languageId: 'markdown'
        } as vscode.TextDocument);

        // 更新 Front Matter（使用总字符数，符合网文计数标准）
        return updateFrontMatter(document, stats.totalChars);
    } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('Noveler: 保存时更新 Front Matter 失败', errorMsg);
        // 不显示错误提示，因为 updateFrontMatter 内部已经处理了
        return [];
    }
}

export function deactivate() {
    console.log('Noveler 已停用');
}
