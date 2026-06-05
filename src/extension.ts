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
import { WelcomeWebviewProvider } from './views/welcomeWebviewProvider';
import { PreviewWebviewProvider } from './views/previewWebviewProvider';
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
let isApplyingAutoLineBreak = false;

export async function activate(context: vscode.ExtensionContext) {
    // 初始化日志系统（最先执行，确保后续能记录日志）
    Logger.initialize(context, LogLevel.Info);
    Logger.info('[Noveler] 中文小说写作助手正在激活...');

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
        focusModeService.setExtensionContext(context);
        context.subscriptions.push(focusModeService);

        // 【关键】优先注册侧边栏视图，确保 UI 可用
        const novelerViewProvider = new NovelerViewProvider();
        context.subscriptions.push(
            vscode.window.registerTreeDataProvider('novelerView', novelerViewProvider)
        );
        Logger.info('[Noveler] 侧边栏视图已注册');

        // 初始化统计服务和 Webview
        const projectStatsService = new ProjectStatsService();
        const statsWebviewProvider = new StatsWebviewProvider(context, projectStatsService);

        // 初始化欢迎页面 Webview
        const welcomeWebviewProvider = new WelcomeWebviewProvider(context);

        // 初始化手机预览 Webview
        const previewWebviewProvider = new PreviewWebviewProvider(context);

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
            welcomeWebviewProvider,
            previewWebviewProvider,
            highlightProvider,
            updateHighlights
        });
        Logger.info('[Noveler] 命令已注册');

        // 注册事件监听器
        registerEventListeners(context, novelerViewProvider, statsWebviewProvider);

        // === 以下是可以延迟加载的服务 ===

        // 🚀 并行加载配置和其他初始化
        // 配置加载和姓名生成服务不相互依赖，可以并行执行
        const configPromise = configService.waitForConfig();

        const nameGenPromise = Promise.resolve().then(() => {
            try {
                NameGeneratorService.initialize(context);
                Logger.info('[Noveler] 随机起名功能已启用');
            } catch (nameGenError) {
                Logger.error('[Noveler] 姓名生成服务初始化失败', nameGenError);
                throw nameGenError;
            }
        });

        const results = await Promise.allSettled([configPromise, nameGenPromise]);

        if (results[0].status === 'rejected') {
            Logger.error('[Noveler] 配置加载失败', results[0].reason);
        }

        // 执行配置迁移（如果需要）
        try {
            await MigrationService.checkAndMigrate(context);
        } catch (migrationError) {
            Logger.error('[Noveler] 配置迁移失败，但不影响基本功能', migrationError);
        }

        // 延迟加载敏感词服务（不阻塞初始化）
        // 用户首次需要敏感词检测时才初始化
        let sensitiveWordServicePromise: Promise<SensitiveWordService | null> | null = null;

        const initializeSensitiveWordService = async () => {
            if (sensitiveWordService) {
                return sensitiveWordService;
            }
            if (!sensitiveWordServicePromise) {
                sensitiveWordServicePromise = (async () => {
                    try {
                        const service = await SensitiveWordService.initialize(context);
                        sensitiveWordService = service;
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
                        Logger.info('[Noveler] 敏感词检测功能已启用（延迟加载）');
                        return service;
                    } catch (error) {
                        Logger.error('[Noveler] 敏感词服务初始化失败，但不影响基本功能', error);
                        return null;
                    }
                })();
            }
            return await sensitiveWordServicePromise;
        };

        // === 初始化敏感词服务已改为延迟加载 ===

        // 🚀 姓名生成服务已在并行加载中处理，此处移除重复初始化

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
            configService.onDidChangeConfig(async () => {
                vscode.commands.executeCommand('noveler.refresh');
                codeLensProvider?.refresh();
                // 自动重载高亮配置
                highlightProvider.reloadDecorations();
                updateHighlights(vscode.window.activeTextEditor);
                // 自动重载敏感词配置
                if (sensitiveWordService) {
                    try {
                        await sensitiveWordService.reload();
                        Logger.info('[Noveler] 敏感词配置已自动重新加载');
                        if (vscode.window.activeTextEditor) {
                            sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
                        }
                    } catch (error) {
                        Logger.error('[Noveler] 自动重新加载敏感词配置失败', error);
                    }
                }
            })
        );

        // 初始更新
        updateWordCountImmediate(vscode.window.activeTextEditor);
        updateHighlightsImmediate(vscode.window.activeTextEditor);

        // 异步同步护眼模式状态（不阻塞初始化完成）
        syncEyeCareModeTheme(context).catch((error) => {
            Logger.error('[Noveler] 护眼模式主题同步失败', error);
        });

        // 检查是否需要显示欢迎页面（首次安装）
        if (welcomeWebviewProvider.shouldShowWelcome()) {
            // 延迟显示，确保 UI 完全加载
            setTimeout(async () => {
                try {
                    await welcomeWebviewProvider.show(true);
                    Logger.info('[Noveler] 首次启动，显示欢迎页面');
                } catch (error) {
                    Logger.error('[Noveler] 显示欢迎页面失败', error);
                }
            }, 1000);
        }

        Logger.info('[Noveler] 中文小说写作助手已激活');
    } catch (error) {
        Logger.error('[Noveler] 激活失败', error);
        vscode.window.showErrorMessage(`Noveler 激活失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 注册事件监听器
 */
function registerEventListeners(
    context: vscode.ExtensionContext,
    novelerViewProvider: NovelerViewProvider,
    statsWebviewProvider: StatsWebviewProvider
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

                    // 🔑 新增：保存章节文件时，如果统计面板打开，立即刷新字数统计
                    if (filePath.includes('/chapters/')) {
                        statsWebviewProvider.refreshIfVisible().catch((error: unknown) => {
                            Logger.debug(`保存时刷新统计面板失败: ${error}`);
                        });
                    }
                }
            }
        })
    );

    // 注册文件系统监听器
    registerFileSystemWatchers(context, novelerViewProvider, statsWebviewProvider);
}

/**
 * 注册文件系统监听器
 */
function registerFileSystemWatchers(
    context: vscode.ExtensionContext,
    novelerViewProvider: NovelerViewProvider,
    statsWebviewProvider: StatsWebviewProvider
): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        return;
    }

    // 监听所有章节文件变化（**/*.md 同时覆盖扁平结构和嵌套分卷结构）
    const chaptersPattern = new vscode.RelativePattern(workspaceFolder, `${CHAPTERS_FOLDER}/**/*.md`);
    const chaptersWatcher = vscode.workspace.createFileSystemWatcher(chaptersPattern);
    chaptersWatcher.onDidCreate(() => {
        novelerViewProvider.refresh();
        statsWebviewProvider.refreshIfVisible().catch((err: unknown) => {
            Logger.debug(`统计面板刷新失败: ${err}`);
        });
    });
    chaptersWatcher.onDidDelete(() => {
        novelerViewProvider.refresh();
        statsWebviewProvider.refreshIfVisible().catch((err: unknown) => {
            Logger.debug(`统计面板刷新失败: ${err}`);
        });
    });
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
    configWatcher.onDidCreate(async () => {
        await configService.reloadConfig();
        novelerViewProvider.refresh();
    });
    configWatcher.onDidDelete(async () => {
        await configService.reloadConfig();
        novelerViewProvider.refresh();
    });
    configWatcher.onDidChange(async () => {
        await configService.reloadConfig();
        novelerViewProvider.refresh();
    });
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
            Logger.info('[Noveler] 敏感词库已自动重新加载');

            if (vscode.window.activeTextEditor) {
                sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
            }
        } catch (error) {
            Logger.error('[Noveler] 自动重新加载敏感词库失败', error);
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

/**
 * 同步护眼模式主题状态
 * 确保 VSCode 主题与 novel.jsonc 中的配置一致
 */
async function syncEyeCareModeTheme(_context: vscode.ExtensionContext): Promise<void> {
    try {
        const eyeCareModeEnabled = configService.isEyeCareModeEnabled();
        const workbenchConfig = vscode.workspace.getConfiguration('workbench');
        const eyeCareThemeName = 'Noveler 护眼模式';

        // 获取配置信息
        const inspected = workbenchConfig.inspect<string>('colorTheme');
        const workspaceTheme = inspected?.workspaceValue;

        Logger.info(`[Noveler] [护眼模式同步] enabled=${eyeCareModeEnabled}, workspaceTheme=${workspaceTheme}`);

        if (eyeCareModeEnabled) {
            // 护眼模式启用，确保使用护眼主题
            if (workspaceTheme !== eyeCareThemeName) {
                await workbenchConfig.update('colorTheme', eyeCareThemeName, vscode.ConfigurationTarget.Workspace);
                Logger.info('[Noveler] [护眼模式同步] 已切换到护眼主题');
            }
        } else {
            // 护眼模式禁用，确保不使用护眼主题
            if (workspaceTheme === eyeCareThemeName) {
                // 恢复之前保存的主题
                const previousTheme = configService.getConfig().eyeCareMode?.previousTheme;
                if (previousTheme) {
                    await workbenchConfig.update('colorTheme', previousTheme, vscode.ConfigurationTarget.Workspace);
                    Logger.info(`[Noveler] [护眼模式同步] 已恢复主题: ${previousTheme}`);
                } else {
                    await workbenchConfig.update('colorTheme', undefined, vscode.ConfigurationTarget.Workspace);
                    Logger.info('[Noveler] [护眼模式同步] 已清除工作区主题设置');
                }
            }
        }
    } catch (error) {
        Logger.error('[Noveler] 同步护眼模式主题失败', error);
    }
}

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
    // 跳过插件自身 editor.edit 触发的变更，防止循环插入
    if (isApplyingAutoLineBreak) {
        return;
    }

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

    // 跳过文件末尾添加换行的情况（VS Code 保存时可能自动添加尾部空行）
    const newLineIndex = change.range.start.line;
    const totalLines = event.document.lineCount;
    if (newLineIndex >= totalLines - 1) {
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
        Logger.info(`[换行处理] 在第 ${change.range.start.line + 1} 行插入: "${textToInsert.replace(/\n/g, '\\n')}"`);
        isApplyingAutoLineBreak = true;
        editor.edit((editBuilder) => {
            editBuilder.insert(insertPos, textToInsert);
        }, {
            undoStopBefore: false,
            undoStopAfter: false
        }).then(() => {
            isApplyingAutoLineBreak = false;
        }, () => {
            isApplyingAutoLineBreak = false;
        });
    }
}

export function deactivate() {
    Logger.info('[Noveler] 已停用');

    wordCountDebouncer?.dispose();
    highlightDebouncer?.dispose();
    readmeUpdateDebouncer?.dispose();
}
