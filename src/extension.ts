import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ChineseNovelFormatProvider } from './providers/formatProvider';
import { WordCountService } from './services/wordCountService';
import { NovelHighlightProvider } from './providers/highlightProvider';
import { ChapterCodeLensProvider } from './providers/codeLensProvider';
import { ConfigService } from './services/configService';
import { FocusModeService } from './services/focusModeService';
import { ProjectStatsService } from './services/projectStatsService';
import { SensitiveWordService } from './services/sensitiveWordService';
import { SensitiveWordDiagnosticProvider } from './providers/sensitiveWordDiagnostic';
import { SensitiveWordCodeActionProvider } from './providers/sensitiveWordCodeAction';
import { NovelerViewProvider } from './views/novelerViewProvider';
import { StatsWebviewProvider } from './views/statsWebviewProvider';
import { initTemplateLoader } from './utils/templateLoader';
import { updateFrontMatter } from './utils/frontMatterHelper';
import { updateReadme } from './utils/readmeUpdater';
import { initProject } from './commands/initProject';
import { createChapter } from './commands/createChapter';
import { createCharacter } from './commands/createCharacter';
import {
    renameChapter,
    markChapterCompleted,
    markChapterInProgress,
    updateChapterStatusWithDialog,
    deleteChapter,
    renameCharacter,
    deleteCharacter
} from './commands/contextMenuCommands';
import { jumpToReadmeSection } from './commands/jumpToReadme';
import { Debouncer } from './utils/debouncer';
import { handleError, ErrorSeverity } from './utils/errorHandler';
import { WORD_COUNT_DEBOUNCE_DELAY, HIGHLIGHT_DEBOUNCE_DELAY, README_UPDATE_DEBOUNCE_DELAY, CHAPTERS_FOLDER, AUTO_SAVE_DELAY_MS, CONFIG_FILE_NAME } from './constants';
import { Logger, LogLevel } from './utils/logger';

let wordCountStatusBarItem: vscode.StatusBarItem;
let wordCountService: WordCountService;
let highlightProvider: NovelHighlightProvider;
let codeLensProvider: ChapterCodeLensProvider;
let configService: ConfigService;
let focusModeService: FocusModeService;
let statsWebviewProvider: StatsWebviewProvider;
let sensitiveWordService: SensitiveWordService;
let sensitiveWordDiagnostic: SensitiveWordDiagnosticProvider;

// 防抖器
let wordCountDebouncer: Debouncer;
let highlightDebouncer: Debouncer;
let readmeUpdateDebouncer: Debouncer;

export async function activate(context: vscode.ExtensionContext) {
    // 初始化日志系统
    Logger.initialize(context, LogLevel.Info);
    Logger.info('Noveler 中文小说写作助手已激活');

    // 初始化防抖器
    wordCountDebouncer = new Debouncer(WORD_COUNT_DEBOUNCE_DELAY);
    highlightDebouncer = new Debouncer(HIGHLIGHT_DEBOUNCE_DELAY);
    readmeUpdateDebouncer = new Debouncer(README_UPDATE_DEBOUNCE_DELAY);

    // 初始化模板加载器
    initTemplateLoader(context);

    // 初始化配置服务
    configService = ConfigService.initialize();
    context.subscriptions.push(configService);

    // 等待配置加载完成
    await configService.waitForConfig();

    // 订阅配置变更事件
    context.subscriptions.push(
        configService.onDidChangeConfig(() => {
            // 配置变更时，刷新侧边栏和 CodeLens
            vscode.commands.executeCommand('noveler.refreshView');
            codeLensProvider?.refresh();
        })
    );

    // 初始化字数统计服务
    wordCountService = new WordCountService();

    // 初始化高亮提供者
    highlightProvider = new NovelHighlightProvider();
    context.subscriptions.push(highlightProvider);

    // 初始化敏感词检测服务（等待异步加载完成）
    sensitiveWordService = await SensitiveWordService.initialize(context);
    sensitiveWordDiagnostic = new SensitiveWordDiagnosticProvider(sensitiveWordService);
    sensitiveWordDiagnostic.register(context);

    // 注册敏感词快速修复提供器
    context.subscriptions.push(
        vscode.languages.registerCodeActionsProvider(
            'markdown',
            new SensitiveWordCodeActionProvider(),
            {
                providedCodeActionKinds: SensitiveWordCodeActionProvider.providedCodeActionKinds
            }
        )
    );
    Logger.info('敏感词检测功能已启用');

    // 初始化 Code Lens 提供者
    codeLensProvider = new ChapterCodeLensProvider(wordCountService);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'markdown', pattern: '**/chapters/**' },
            codeLensProvider
        )
    );

    // 注册 Noveler 侧边栏视图
    const novelerViewProvider = new NovelerViewProvider();
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('novelerView', novelerViewProvider)
    );

    // 注册刷新视图命令
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.refreshView', () => {
            novelerViewProvider.refresh();
        })
    );

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

    // 初始化统计服务和 Webview
    const projectStatsService = new ProjectStatsService();
    statsWebviewProvider = new StatsWebviewProvider(context, projectStatsService);

    // 注册命令：显示统计面板
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showStats', async () => {
            await statsWebviewProvider.show();
        })
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
            if (!editor) {
                vscode.window.showWarningMessage('没有打开的编辑器');
                return;
            }

            if (editor.document.languageId !== 'markdown') {
                vscode.window.showWarningMessage('只能格式化 Markdown 文档');
                return;
            }

            try {
                // 直接使用 Noveler 的格式化提供器
                const formatProvider = new ChineseNovelFormatProvider();
                const edits = formatProvider.provideDocumentFormattingEdits(
                    editor.document,
                    {} as vscode.FormattingOptions,
                    {} as vscode.CancellationToken
                );

                if (edits.length > 0) {
                    const workspaceEdit = new vscode.WorkspaceEdit();
                    workspaceEdit.set(editor.document.uri, edits);
                    await vscode.workspace.applyEdit(workspaceEdit);
                    vscode.window.showInformationMessage('文档格式化完成');
                } else {
                    vscode.window.showInformationMessage('文档无需格式化');
                }
            } catch (error) {
                vscode.window.showErrorMessage(`格式化失败: ${error}`);
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
            Logger.info('高亮配置已重新加载');
            // 不再显示通知，只记录日志
        })
    );

    // 注册命令：更新 README 统计
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.updateReadme', async () => {
            await updateReadme();
        })
    );

    // 初始化专注模式服务
    focusModeService = new FocusModeService();
    context.subscriptions.push(focusModeService);

    // 注册命令：切换专注模式
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.toggleFocusMode', async () => {
            await focusModeService.toggle();
        })
    );

    // 注册命令：打开配置文件
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.openConfig', async () => {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showWarningMessage('未找到工作区文件夹');
                return;
            }

            const configUri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);

            try {
                // 尝试打开配置文件
                const document = await vscode.workspace.openTextDocument(configUri);
                await vscode.window.showTextDocument(document);
            } catch (error) {
                // 配置文件不存在，询问是否创建
                const result = await vscode.window.showInformationMessage(
                    'novel.jsonc 配置文件不存在，是否创建？',
                    '创建', '取消'
                );

                if (result === '创建') {
                    try {
                        // 从模板读取默认配置
                        const templatePath = vscode.Uri.joinPath(
                            context.extensionUri,
                            'templates',
                            'default-config.jsonc'
                        );
                        const templateData = await vscode.workspace.fs.readFile(templatePath);

                        // 直接写入带注释的配置文件
                        await vscode.workspace.fs.writeFile(configUri, templateData);
                        const document = await vscode.workspace.openTextDocument(configUri);
                        await vscode.window.showTextDocument(document);
                        vscode.window.showInformationMessage('已创建 novel.jsonc 配置文件');
                    } catch (templateError) {
                        handleError('创建配置文件失败', templateError, ErrorSeverity.Error);
                    }
                }
            }
        })
    );

    // 注册右键菜单命令：章节操作
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.renameChapter', renameChapter)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.markChapterCompleted', markChapterCompleted)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.markChapterInProgress', markChapterInProgress)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.updateChapterStatus', updateChapterStatusWithDialog)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.deleteChapter', deleteChapter)
    );

    // 注册右键菜单命令：人物操作
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.renameCharacter', renameCharacter)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.deleteCharacter', deleteCharacter)
    );

    // 注册命令：重新加载敏感词库
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.reloadSensitiveWords', async () => {
            try {
                await sensitiveWordService.reload();
                vscode.window.showInformationMessage('敏感词库已重新加载');

                // 重新检测当前文档
                if (vscode.window.activeTextEditor) {
                    sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
                }
            } catch (error) {
                handleError('重新加载敏感词库失败', error, ErrorSeverity.Error);
            }
        })
    );

    // 注册命令：添加到白名单
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.addToWhitelist', async (word: string) => {
            try {
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!workspaceRoot) {
                    vscode.window.showErrorMessage('请先打开一个工作区');
                    return;
                }

                const whitelistDir = path.join(workspaceRoot, '.noveler', 'sensitive-words');
                const whitelistPath = path.join(whitelistDir, 'whitelist.json');

                // 确保目录存在
                if (!fs.existsSync(whitelistDir)) {
                    fs.mkdirSync(whitelistDir, { recursive: true });
                }

                // 读取或创建白名单文件
                interface WhitelistFile {
                    description: string;
                    words: string[];
                }

                let whitelist: WhitelistFile;
                if (fs.existsSync(whitelistPath)) {
                    const content = fs.readFileSync(whitelistPath, 'utf-8');
                    whitelist = JSON.parse(content);
                } else {
                    whitelist = {
                        description: '用户自定义白名单',
                        words: []
                    };
                }

                // 检查是否已存在
                if (whitelist.words.includes(word)) {
                    vscode.window.showInformationMessage(`"${word}" 已在白名单中`);
                    return;
                }

                // 添加词汇
                whitelist.words.push(word);

                // 保存文件
                fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2), 'utf-8');

                // 重新加载词库
                await sensitiveWordService.reload();

                // 重新检测当前文档
                if (vscode.window.activeTextEditor) {
                    sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
                }

                vscode.window.showInformationMessage(`已将 "${word}" 添加到白名单`);
            } catch (error) {
                handleError('添加到白名单失败', error, ErrorSeverity.Error);
            }
        })
    );

    // 注册命令：忽略敏感词（实际不做任何事）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.ignoreSensitiveWord', () => {
            // 这个命令不做任何事，只是提供一个选项让用户关闭提示
        })
    );

    // 注册命令：显示敏感词详情
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showSensitiveWordDetails', () => {
            // 打开问题面板
            vscode.commands.executeCommand('workbench.actions.view.problems');
        })
    );

    // 注册命令：跳转到 README 指定位置
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.jumpToReadmeSection', jumpToReadmeSection)
    );

    // 配置自动保存
    configureAutoSave();

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
            // 自动空行功能
            handleAutoEmptyLine(e);
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

    // 监听文档保存完成事件，刷新侧边栏视图
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (document.languageId === 'markdown') {
                // 刷新侧边栏视图，显示最新的字数统计
                novelerViewProvider.refresh();

                // 如果是章节或人物文件,防抖更新 README
                const filePath = document.uri.fsPath;
                if (filePath.includes('/chapters/') || filePath.includes('/characters/')) {
                    readmeUpdateDebouncer.debounce(async () => {
                        await updateReadme();
                    });
                }
            }
        })
    );

    // 监听 chapters 和 characters 目录的文件变化
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        // 监听章节文件变化
        const chaptersPattern = new vscode.RelativePattern(
            workspaceFolder,
            `${CHAPTERS_FOLDER}/*.md`
        );
        const chaptersWatcher = vscode.workspace.createFileSystemWatcher(chaptersPattern);

        chaptersWatcher.onDidCreate(() => novelerViewProvider.refresh());
        chaptersWatcher.onDidDelete(() => novelerViewProvider.refresh());
        chaptersWatcher.onDidChange(() => novelerViewProvider.refresh());

        context.subscriptions.push(chaptersWatcher);

        // 监听人物文件变化
        const charactersPattern = new vscode.RelativePattern(
            workspaceFolder,
            'characters/*.md'
        );
        const charactersWatcher = vscode.workspace.createFileSystemWatcher(charactersPattern);

        charactersWatcher.onDidCreate(() => novelerViewProvider.refresh());
        charactersWatcher.onDidDelete(() => novelerViewProvider.refresh());
        charactersWatcher.onDidChange(() => novelerViewProvider.refresh());

        context.subscriptions.push(charactersWatcher);

        // 监听 novel.jsonc 配置文件变化 (判断项目是否初始化)
        const configPattern = new vscode.RelativePattern(
            workspaceFolder,
            CONFIG_FILE_NAME
        );
        const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);

        configWatcher.onDidCreate(() => novelerViewProvider.refresh());
        configWatcher.onDidDelete(() => novelerViewProvider.refresh());
        configWatcher.onDidChange(() => novelerViewProvider.refresh());

        context.subscriptions.push(configWatcher);

        // 监听 chapters 和 characters 目录本身的变化
        const dirPattern = new vscode.RelativePattern(
            workspaceFolder,
            '{chapters,characters}'
        );
        const dirWatcher = vscode.workspace.createFileSystemWatcher(dirPattern);

        dirWatcher.onDidCreate(() => novelerViewProvider.refresh());
        dirWatcher.onDidDelete(() => novelerViewProvider.refresh());

        context.subscriptions.push(dirWatcher);
    }

    // 初始更新
    updateWordCountImmediate(vscode.window.activeTextEditor);
    updateHighlightsImmediate(vscode.window.activeTextEditor);
}

/**
 * 立即更新字数统计（用于切换编辑器）
 */
function updateWordCountImmediate(editor: vscode.TextEditor | undefined) {
    wordCountDebouncer.immediate(() => updateWordCount(editor));
}

/**
 * 防抖更新字数统计（用于文档内容变化）
 */
function updateWordCountDebounced(editor: vscode.TextEditor | undefined) {
    wordCountDebouncer.debounce(() => updateWordCount(editor));
}

/**
 * 立即更新高亮（用于切换编辑器）
 */
function updateHighlightsImmediate(editor: vscode.TextEditor | undefined) {
    highlightDebouncer.immediate(() => updateHighlights(editor));
}

/**
 * 防抖更新高亮（用于文档内容变化）
 */
function updateHighlightsDebounced(editor: vscode.TextEditor | undefined) {
    highlightDebouncer.debounce(() => updateHighlights(editor));
}

function updateWordCount(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.languageId !== 'markdown') {
        wordCountStatusBarItem.hide();
        return;
    }

    // 使用配置服务检��是否显示字数统计（内部已处理配置回退）
    if (!configService.shouldShowWordCountInStatusBar()) {
        wordCountStatusBarItem.hide();
        return;
    }

    // 检查是否有选中文本
    const selection = editor.selection;
    if (!selection.isEmpty) {
        // 显示选中文本的字数统计
        const selectedText = editor.document.getText(selection);
        const selectionStats = wordCountService.getSelectionWordCount(selectedText);
        wordCountStatusBarItem.text = `$(selection) 总计 ${selectionStats.totalChars.toLocaleString()} | 正文 ${selectionStats.contentChars.toLocaleString()} | 标点 ${selectionStats.punctuation.toLocaleString()}`;
        wordCountStatusBarItem.tooltip = `选中文本统计\n━━━━━━━━━━━━━━\n总计: ${selectionStats.totalChars.toLocaleString()} 字\n正文: ${selectionStats.contentChars.toLocaleString()} 字\n标点: ${selectionStats.punctuation.toLocaleString()} 个`;
    } else {
        // 显示整个文档的字数统计
        const stats = wordCountService.getWordCount(editor.document);
        wordCountStatusBarItem.text = `$(pencil) 总计 ${stats.totalChars.toLocaleString()} | 正文 ${stats.contentChars.toLocaleString()} | 标点 ${stats.punctuation.toLocaleString()}`;
        wordCountStatusBarItem.tooltip = `当前文档统计\n━━━━━━━━━━━━━━\n总计: ${stats.totalChars.toLocaleString()} 字\n正文: ${stats.contentChars.toLocaleString()} 字\n标点: ${stats.punctuation.toLocaleString()} 个`;
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
        // 直接使用原始 document 计算字数
        // wordCountService.getWordCount 内部会自动移除 Front Matter
        const stats = wordCountService.getWordCount(document);

        // 更新 Front Matter（使用总字符数，符合网文计数标准）
        return updateFrontMatter(document, stats.totalChars);
    } catch (error) {
        // 静默失败 - Front Matter 更新失败不应中断保存流程
        handleError('保存时更新 Front Matter 失败', error, ErrorSeverity.Silent);
        return [];
    }
}

/**
 * 处理自动空行功能
 */
function handleAutoEmptyLine(event: vscode.TextDocumentChangeEvent) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) {
        return;
    }

    // 检查是否应该启用自动空行
    if (!shouldEnableAutoEmptyLine(event.document)) {
        return;
    }

    // 检查是否是单个回车键输入
    if (event.contentChanges.length !== 1) {
        return;
    }

    const change = event.contentChanges[0];

    // 只处理回车键（换行符）
    if (change.text !== '\n') {
        return;
    }

    // 获取插入位置的前一行
    const line = event.document.lineAt(change.range.start.line);
    const previousLineText = line.text.trim();

    // 如果前一行为空，不插入空行（避免连续空行）
    if (previousLineText === '') {
        return;
    }

    // 插入额外的空行
    editor.edit((editBuilder) => {
        const position = new vscode.Position(change.range.start.line + 1, 0);
        editBuilder.insert(position, '\n');
    }, {
        undoStopBefore: false,
        undoStopAfter: false
    });
}

/**
 * 检查是否应该启用自动空行功能
 */
function shouldEnableAutoEmptyLine(document: vscode.TextDocument): boolean {
    // 1. 必须是 Markdown 文件
    if (document.languageId !== 'markdown') {
        return false;
    }

    // 2. 检查配置是否启用
    if (!configService.shouldAutoEmptyLine()) {
        return false;
    }

    // 3. 必须在 chapters 目录下
    const filePath = document.uri.fsPath;
    const normalizedPath = filePath.replace(/\\/g, '/');
    return normalizedPath.includes(`/${CHAPTERS_FOLDER}/`);
}

/**
 * 配置自动保存
 * 仅在工作区级别启用，不影响全局设置
 */
function configureAutoSave() {
    const enableAutoSave = configService.shouldAutoSave();

    if (enableAutoSave) {
        const config = vscode.workspace.getConfiguration('files');
        const currentAutoSave = config.get('autoSave');

        // 如果当前没有开启自动保存，则在工作区级别开启
        if (currentAutoSave === 'off') {
            config.update('autoSave', 'afterDelay', vscode.ConfigurationTarget.Workspace);
            config.update('autoSaveDelay', AUTO_SAVE_DELAY_MS, vscode.ConfigurationTarget.Workspace);
            Logger.info(`已在工作区级别启用自动保存（${AUTO_SAVE_DELAY_MS}ms 延迟）`);
        }
    }
}

export function deactivate() {
    Logger.info('Noveler 已停用');

    // 清理防抖器，防止内存泄漏
    wordCountDebouncer?.dispose();
    highlightDebouncer?.dispose();
    readmeUpdateDebouncer?.dispose();
}
