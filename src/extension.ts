import * as vscode from 'vscode';
import { ChineseNovelFormatProvider } from './providers/formatProvider';
import { WordCountService } from './services/wordCountService';
import { NovelHighlightProvider } from './providers/highlightProvider';
import { ChapterCodeLensProvider } from './providers/codeLensProvider';
import { ConfigService } from './services/configService';
import { FocusModeService } from './services/focusModeService';
import { ProjectStatsService } from './services/projectStatsService';
import { SensitiveWordService } from './services/sensitiveWordService';
import { VolumeService } from './services/volumeService';
import { NameGeneratorService } from './services/nameGeneratorService';
import { SensitiveWordDiagnosticProvider } from './providers/sensitiveWordDiagnostic';
import { SensitiveWordCodeActionProvider } from './providers/sensitiveWordCodeAction';
import { NovelerViewProvider } from './views/novelerViewProvider';
import { StatsWebviewProvider } from './views/statsWebviewProvider';
import { initTemplateLoader } from './utils/templateLoader';
import { updateFrontMatter } from './utils/frontMatterHelper';
import { handleReadmeAutoUpdate } from './utils/readmeAutoUpdate';
import { registerAllCommands } from './commands/commandRegistrar';
import { PARAGRAPH_INDENT, VOLUME_TYPE_NAMES } from './constants';
import { MigrationService } from './services/migrationService';
import { Debouncer } from './utils/debouncer';
import { handleError, ErrorSeverity } from './utils/errorHandler';
import { WORD_COUNT_DEBOUNCE_DELAY, HIGHLIGHT_DEBOUNCE_DELAY, README_UPDATE_DEBOUNCE_DELAY, CHAPTERS_FOLDER, CONFIG_FILE_NAME } from './constants';
import { Logger, LogLevel } from './utils/logger';

let wordCountStatusBarItem: vscode.StatusBarItem;
let wordCountService: WordCountService;
let highlightProvider: NovelHighlightProvider;
let codeLensProvider: ChapterCodeLensProvider;
let configService: ConfigService;
let focusModeService: FocusModeService;
let sensitiveWordService: SensitiveWordService;
let sensitiveWordDiagnostic: SensitiveWordDiagnosticProvider;

// 防抖器
let wordCountDebouncer: Debouncer;
let highlightDebouncer: Debouncer;
let readmeUpdateDebouncer: Debouncer;

export async function activate(context: vscode.ExtensionContext) {
    // 初始化日志系统（最先执行，确保后续能记录日志）
    Logger.initialize(context, LogLevel.Info);
    Logger.info('Noveler 中文小说写作助手正在激活...');

    try {
        // 初始化防抖器
        wordCountDebouncer = new Debouncer(WORD_COUNT_DEBOUNCE_DELAY);
        highlightDebouncer = new Debouncer(HIGHLIGHT_DEBOUNCE_DELAY);
        readmeUpdateDebouncer = new Debouncer(README_UPDATE_DEBOUNCE_DELAY);

        // 初始化模板加载器
        initTemplateLoader(context);

        // 初始化配置服务
        configService = ConfigService.initialize();
        context.subscriptions.push(configService);

        // 初始化字数统计服务（不依赖配置加载完成）
        wordCountService = new WordCountService();

        // 初始化高亮提供者
        highlightProvider = new NovelHighlightProvider();
        context.subscriptions.push(highlightProvider);

        // 初始化专注模式服务
        focusModeService = new FocusModeService();
        context.subscriptions.push(focusModeService);

        // 【关键】优先注册侧边栏视图，确保 UI 可用
        const novelerViewProvider = new NovelerViewProvider();
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('novelerView', novelerViewProvider)
        );
        Logger.info('侧边栏视图已注册');

        // 初始化统计服务和 Webview
        const projectStatsService = new ProjectStatsService();
        const statsWebviewProvider = new StatsWebviewProvider(context, projectStatsService);

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

        // 【关键】优先注册所有命令，确保命令可用
        registerAllCommands({
            context,
            wordCountService,
            configService,
            focusModeService,
            sensitiveWordService: null as unknown as SensitiveWordService, // 稍后初始化
            sensitiveWordDiagnostic: null as unknown as SensitiveWordDiagnosticProvider,
            novelerViewProvider,
            statsWebviewProvider,
            highlightProvider,
            updateHighlights
        });
        Logger.info('命令已注册');

        // 注册事件监听器
        registerEventListeners(context, novelerViewProvider);

        // === 以下是可以延迟加载的服务 ===

        // 等待配置加载完��
        await configService.waitForConfig();

        // 执行配置迁移（如果需要）
        try {
            await MigrationService.checkAndMigrate(context);
        } catch (migrationError) {
            Logger.error('配置迁移失败，但不影响基本功能', migrationError);
        }

        // 初始化敏感词检测服务
        try {
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
        } catch (sensitiveWordError) {
            Logger.error('敏感词服务初始化失败，但不影响基本功能', sensitiveWordError);
        }

        // 初始化姓名生成服务
        try {
            NameGeneratorService.initialize(context);
            Logger.info('随机起名功能已启用');
        } catch (nameGenError) {
            Logger.error('姓名生成服务初始化失败', nameGenError);
        }

        // 初始化 Code Lens 提供者
        codeLensProvider = new ChapterCodeLensProvider(wordCountService);
        context.subscriptions.push(
            vscode.languages.registerCodeLensProvider(
                { language: 'markdown', pattern: '**/chapters/**' },
                codeLensProvider
            )
        );

        // 订阅配置变更事件
        context.subscriptions.push(
            configService.onDidChangeConfig(() => {
                vscode.commands.executeCommand('noveler.refresh');
                codeLensProvider?.refresh();
                // 自动重载高亮配置
                highlightProvider.reloadDecorations();
                updateHighlights(vscode.window.activeTextEditor);
            })
        );

        // 初始更新
        updateWordCountImmediate(vscode.window.activeTextEditor);
        updateHighlightsImmediate(vscode.window.activeTextEditor);

        Logger.info('Noveler 中文小说写作助手已激活');
    } catch (error) {
        Logger.error('Noveler 激活失败', error);
        vscode.window.showErrorMessage(`Noveler 激活失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 注册事件监听器
 */
function registerEventListeners(
    context: vscode.ExtensionContext,
    novelerViewProvider: NovelerViewProvider
): void {
    // 监听文档变化，更新字数统计和高亮
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            updateWordCountImmediate(editor);
            updateHighlightsImmediate(editor);
        })
    );

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((e) => {
            if (e.document === vscode.window.activeTextEditor?.document) {
                updateWordCountDebounced(vscode.window.activeTextEditor);
                updateHighlightsDebounced(vscode.window.activeTextEditor);
            }
            handleLineBreak(e);
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

    // 监听文档保存事件
    context.subscriptions.push(
        vscode.workspace.onWillSaveTextDocument(async (e) => {
            if (e.document.languageId === 'markdown') {
                e.waitUntil(updateFrontMatterOnSave(e.document));
            }
        })
    );

    // 监听文档保存完成事件
    context.subscriptions.push(
        vscode.workspace.onDidSaveTextDocument((document) => {
            if (document.languageId === 'markdown') {
                novelerViewProvider.refresh();

                const filePath = document.uri.fsPath;
                if (filePath.includes('/chapters/') || filePath.includes('/characters/')) {
                    readmeUpdateDebouncer.debounce(async () => {
                        await handleReadmeAutoUpdate();
                    });
                }
            }
        })
    );

    // 注册文件系统监听器
    registerFileSystemWatchers(context, novelerViewProvider);
}

/**
 * 注册文件系统监听器
 */
function registerFileSystemWatchers(
    context: vscode.ExtensionContext,
    novelerViewProvider: NovelerViewProvider
): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    // 监听章节文件变化
    const chaptersPattern = new vscode.RelativePattern(workspaceFolder, `${CHAPTERS_FOLDER}/*.md`);
    const chaptersWatcher = vscode.workspace.createFileSystemWatcher(chaptersPattern);
    chaptersWatcher.onDidCreate(() => novelerViewProvider.refresh());
    chaptersWatcher.onDidDelete(() => novelerViewProvider.refresh());
    chaptersWatcher.onDidChange(() => novelerViewProvider.refresh());
    context.subscriptions.push(chaptersWatcher);

    // 监听人物文件变化
    const charactersPattern = new vscode.RelativePattern(workspaceFolder, 'characters/*.md');
    const charactersWatcher = vscode.workspace.createFileSystemWatcher(charactersPattern);
    charactersWatcher.onDidCreate(() => novelerViewProvider.refresh());
    charactersWatcher.onDidDelete(() => novelerViewProvider.refresh());
    charactersWatcher.onDidChange(() => novelerViewProvider.refresh());
    context.subscriptions.push(charactersWatcher);

    // 监听配置文件变化
    const configPattern = new vscode.RelativePattern(workspaceFolder, CONFIG_FILE_NAME);
    const configWatcher = vscode.workspace.createFileSystemWatcher(configPattern);
    configWatcher.onDidCreate(() => novelerViewProvider.refresh());
    configWatcher.onDidDelete(() => novelerViewProvider.refresh());
    configWatcher.onDidChange(() => novelerViewProvider.refresh());
    context.subscriptions.push(configWatcher);

    // 监听敏感词配置文件变化
    const sensitiveWordsPattern = new vscode.RelativePattern(
        workspaceFolder,
        '.noveler/sensitive-words/{custom-words.jsonc,whitelist.jsonc}'
    );
    const sensitiveWordsWatcher = vscode.workspace.createFileSystemWatcher(sensitiveWordsPattern);

    const reloadSensitiveWords = async () => {
        try {
            await sensitiveWordService.reload();
            Logger.info('敏感词库已自动重新加载');

            if (vscode.window.activeTextEditor) {
                sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
            }
        } catch (error) {
            Logger.error('自动重新加载敏感词库失败', error);
        }
    };

    sensitiveWordsWatcher.onDidCreate(reloadSensitiveWords);
    sensitiveWordsWatcher.onDidChange(reloadSensitiveWords);
    sensitiveWordsWatcher.onDidDelete(reloadSensitiveWords);
    context.subscriptions.push(sensitiveWordsWatcher);

    // 监听目录变化
    const dirPattern = new vscode.RelativePattern(workspaceFolder, '{chapters,characters}');
    const dirWatcher = vscode.workspace.createFileSystemWatcher(dirPattern);
    dirWatcher.onDidCreate(() => novelerViewProvider.refresh());
    dirWatcher.onDidDelete(() => novelerViewProvider.refresh());
    context.subscriptions.push(dirWatcher);
}

// ============ 字数统计和高亮更新函数 ============

function updateWordCountImmediate(editor: vscode.TextEditor | undefined) {
    wordCountDebouncer.immediate(() => updateWordCount(editor));
}

function updateWordCountDebounced(editor: vscode.TextEditor | undefined) {
    wordCountDebouncer.debounce(() => updateWordCount(editor));
}

function updateHighlightsImmediate(editor: vscode.TextEditor | undefined) {
    highlightDebouncer.immediate(() => updateHighlights(editor));
}

function updateHighlightsDebounced(editor: vscode.TextEditor | undefined) {
    highlightDebouncer.debounce(() => updateHighlights(editor));
}

function updateWordCount(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.languageId !== 'markdown') {
        wordCountStatusBarItem.hide();
        return;
    }

    if (!configService.shouldShowWordCountInStatusBar()) {
        wordCountStatusBarItem.hide();
        return;
    }

    const selection = editor.selection;
    if (!selection.isEmpty) {
        const selectedText = editor.document.getText(selection);
        const selectionStats = wordCountService.getSelectionWordCount(selectedText);
        wordCountStatusBarItem.text = `$(selection) 总计 ${selectionStats.totalChars.toLocaleString()} | 正文 ${selectionStats.contentChars.toLocaleString()} | 标点 ${selectionStats.punctuation.toLocaleString()}`;
        wordCountStatusBarItem.tooltip = `选中文本统计\n━━━━━━━━━━━━━━\n总计: ${selectionStats.totalChars.toLocaleString()} 字\n正文: ${selectionStats.contentChars.toLocaleString()} 字\n标点: ${selectionStats.punctuation.toLocaleString()} 个`;
    } else {
        const stats = wordCountService.getWordCount(editor.document);
        let statusText = `$(pencil) 总计 ${stats.totalChars.toLocaleString()} | 正文 ${stats.contentChars.toLocaleString()} | 标点 ${stats.punctuation.toLocaleString()}`;
        let tooltipText = `当前文档统计\n━━━━━━━━━━━━━━\n总计: ${stats.totalChars.toLocaleString()} 字\n正文: ${stats.contentChars.toLocaleString()} 字\n标点: ${stats.punctuation.toLocaleString()} 个`;

        if (configService.isVolumesEnabled()) {
            const volumeService = VolumeService.getInstance();
            const volume = volumeService.getVolumeForChapter(editor.document.uri.fsPath);

            if (volume) {
                const volumeTypeName = VOLUME_TYPE_NAMES[volume.volumeType] || volume.volumeType;
                statusText += ` | 📚 ${volume.title}`;
                tooltipText += `\n━━━━━━━━━━━━━━\n所属卷: ${volume.title}\n卷类型: ${volumeTypeName}\n卷总字数: ${volume.stats.totalWords.toLocaleString()} 字\n卷章节数: ${volume.stats.chapterCount}`;
            }
        }

        wordCountStatusBarItem.text = statusText;
        wordCountStatusBarItem.tooltip = tooltipText;
    }

    wordCountStatusBarItem.show();
}

function updateHighlights(editor: vscode.TextEditor | undefined) {
    if (!editor || editor.document.languageId !== 'markdown') {
        return;
    }
    highlightProvider.updateHighlights(editor);
}

// ============ 保存和换行处理 ============

async function updateFrontMatterOnSave(document: vscode.TextDocument): Promise<vscode.TextEdit[]> {
    try {
        const stats = wordCountService.getWordCount(document);
        return updateFrontMatter(document, stats.totalChars);
    } catch (error) {
        handleError('保存时更新 Front Matter 失败', error, ErrorSeverity.Silent);
        return [];
    }
}

function handleLineBreak(event: vscode.TextDocumentChangeEvent) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || event.document !== editor.document) {
        return;
    }

    if (event.document.languageId !== 'markdown') {
        return;
    }

    const filePath = event.document.uri.fsPath;
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (!normalizedPath.includes(`/${CHAPTERS_FOLDER}/`)) {
        return;
    }

    if (event.contentChanges.length !== 1) {
        return;
    }

    const change = event.contentChanges[0];

    if (change.text !== '\n') {
        return;
    }

    const line = event.document.lineAt(change.range.start.line);
    const previousLineText = line.text.trim();

    const autoEmptyLineEnabled = configService.shouldAutoEmptyLine();
    const paragraphIndentEnabled = configService.shouldParagraphIndent();

    Logger.info(`[换行处理] 空行: ${autoEmptyLineEnabled}, 缩进: ${paragraphIndentEnabled}, 前一行: "${previousLineText}"`);

    if (!autoEmptyLineEnabled && !paragraphIndentEnabled) {
        return;
    }

    if (previousLineText.startsWith('#') || previousLineText.startsWith('<!--') || previousLineText === '---') {
        return;
    }

    const isPreviousLineEmpty = previousLineText === '';

    if (autoEmptyLineEnabled && !paragraphIndentEnabled && isPreviousLineEmpty) {
        return;
    }

    editor.edit((editBuilder) => {
        let textToInsert = '';

        if (autoEmptyLineEnabled && !isPreviousLineEmpty) {
            textToInsert += '\n';
            Logger.info(`[换行处理] 添加空行`);
        }

        if (paragraphIndentEnabled) {
            textToInsert += PARAGRAPH_INDENT;
            Logger.info(`[换行处理] 添加缩进`);
        }

        if (textToInsert) {
            const insertPos = new vscode.Position(change.range.start.line + 1, 0);
            editBuilder.insert(insertPos, textToInsert);
            Logger.info(`[换行处理] 在第 ${change.range.start.line + 1} 行插入: "${textToInsert.replace(/\n/g, '\\n')}"`);
        }
    }, {
        undoStopBefore: false,
        undoStopAfter: false
    });
}

export function deactivate() {
    Logger.info('Noveler 已停用');

    wordCountDebouncer?.dispose();
    highlightDebouncer?.dispose();
    readmeUpdateDebouncer?.dispose();
}
