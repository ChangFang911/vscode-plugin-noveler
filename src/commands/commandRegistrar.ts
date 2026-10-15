import { manageCharacterAliases } from './manageCharacterAliases';
import { applySensitiveWordFix } from '../providers/sensitiveWordCodeAction';
/**
 * 命令注册模块
 * 将所有命令注册逻辑集中管理
 */

import * as vscode from 'vscode';
import { ChineseNovelFormatProvider } from '../providers/formatProvider';
import { WordCountService } from '../services/wordCountService';
import { ConfigService } from '../services/configService';
import { FocusModeService } from '../services/focusModeService';
import { SensitiveWordService } from '../services/sensitiveWordService';
import { SensitiveWordDiagnosticProvider } from '../providers/sensitiveWordDiagnostic';
import { NovelerViewProvider } from '../views/novelerViewProvider';
import { StatsWebviewProvider } from '../views/statsWebviewProvider';
import { WelcomeWebviewProvider } from '../views/welcomeWebviewProvider';
import { PreviewWebviewProvider } from '../views/previewWebviewProvider';
import { VolumeService } from '../services/volumeService';
import { handleReadmeAutoUpdate } from '../utils/readmeAutoUpdate';
import { initProject } from './initProject';
import { createChapter } from './createChapter';
import { createCharacter } from './createCharacter';
import { createVolume } from './createVolume';
import { openSensitiveWordsConfig } from './openSensitiveWordsConfigCommand';
import { addToCustomWords, addToWhitelist } from './addToSensitiveWordsCommand';
import { generateRandomName } from './generateName';
import { quickSettings } from './quickSettings';
import { CONFIG_FILE_NAME } from '../constants';
import {
    renameChapter,
    markChapterCompleted,
    markChapterInProgress,
    updateChapterStatusWithDialog,
    deleteChapter,
    renameCharacter,
    setCharacterImportance,
    deleteCharacter
} from './contextMenuCommands';
import {
    renameVolume,
    deleteVolume,
    editVolumeProperties,
    createChapterInVolume,
    moveChapterToVolume,
    copyChapterToVolume,
    openVolumeOutline
} from './volumeCommands';
import { migrateToVolumeStructure, rollbackToFlatStructure } from './migrationWizard';
import { jumpToReadmeSection } from './jumpToReadme';
import { handleError, ErrorSeverity } from '../utils/errorHandler';
import { Logger } from '../utils/logger';
import { NovelHighlightProvider } from '../providers/highlightProvider';
import { registerDoubtMarkCommands } from './doubtMarkCommands';

/**
 * 命令注册器依赖项
 */
export interface CommandRegistrarDeps {
    context: vscode.ExtensionContext;
    wordCountService: WordCountService;
    configService: ConfigService;
    focusModeService: FocusModeService;
    novelerViewProvider: NovelerViewProvider;
    statsWebviewProvider: StatsWebviewProvider;
    welcomeWebviewProvider: WelcomeWebviewProvider;
    previewWebviewProvider: PreviewWebviewProvider;
    highlightProvider: NovelHighlightProvider;
    updateHighlights: (editor: vscode.TextEditor | undefined) => void;
    /** 运行时获取敏感词诊断提供器（服务延迟初始化，注册时可能为 null） */
    getSensitiveWordDiagnostic: () => SensitiveWordDiagnosticProvider | undefined;
}

/**
 * 注册所有命令
 */
export function registerAllCommands(deps: CommandRegistrarDeps): void {
    registerCoreCommands(deps);
    registerChapterCommands(deps);
    registerCharacterCommands(deps);
    registerVolumeCommands(deps);
    registerSensitiveWordCommands(deps);
    registerMigrationCommands(deps);
    registerUtilityCommands(deps);
    registerDoubtMarkCommands(
        deps.context,
        deps.novelerViewProvider.doubtMarkNodes,
        () => deps.novelerViewProvider.refresh()
    );
}

/**
 * 注册核心命令
 */
function registerCoreCommands(deps: CommandRegistrarDeps): void {
    const { context, novelerViewProvider, statsWebviewProvider, welcomeWebviewProvider, previewWebviewProvider, focusModeService } = deps;

    // 刷新命令
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.refresh', async () => {
            VolumeService.getInstance().invalidateCache();
            novelerViewProvider.refresh();
            await handleReadmeAutoUpdate();
        })
    );

    // 显示统计面板
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showStats', async () => {
            await statsWebviewProvider.show();
        })
    );

    // 显示欢迎页面
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showWelcome', async () => {
            await welcomeWebviewProvider.show(false);
        })
    );

    // 显示手机预览
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showPreview', async () => {
            await previewWebviewProvider.show();
        })
    );

    // 初始化项目
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.initProject', async () => {
            await initProject(context);
        })
    );

    // 切换专注模式（改为显示设置菜单）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.toggleFocusMode', async () => {
            await focusModeService.showSettingsMenu();
        })
    );

    // 专注模式设置（独立入口）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.focusModeSettings', async () => {
            await focusModeService.showSettingsMenu();
        })
    );

    // 打开配置文件
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.openConfig', async () => {
            await openConfigFile(context);
        })
    );

    // 更新 README（向后兼容）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.updateReadme', async () => {
            await vscode.commands.executeCommand('noveler.refresh');
        })
    );
}

/**
 * 注册章节相关命令
 */
function registerChapterCommands(deps: CommandRegistrarDeps): void {
    const { context } = deps;

    // 创建章节
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

    // 章节右键菜单命令
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
}

/**
 * 注册人物相关命令
 */
function registerCharacterCommands(deps: CommandRegistrarDeps): void {
    const { context, novelerViewProvider } = deps;

    // 创建人物
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

    // 随机起名
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.generateRandomName', async () => {
            await generateRandomName();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.manageCharacterAliases', manageCharacterAliases),
        vscode.commands.registerCommand('noveler.setCharacterImportance', target =>
            setCharacterImportance(target, () => novelerViewProvider.refresh()))
    );

    // 人物右键菜单命令
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.renameCharacter', renameCharacter)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.deleteCharacter', deleteCharacter)
    );
}

/**
 * 注册分卷相关命令
 */
function registerVolumeCommands(deps: CommandRegistrarDeps): void {
    const { context } = deps;

    // 创建卷
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.createVolume', async () => {
            await createVolume();
        })
    );

    // 卷右键菜单命令
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.renameVolume', renameVolume)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.deleteVolume', deleteVolume)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.editVolumeProperties', editVolumeProperties)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.createChapterInVolume', createChapterInVolume)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.moveChapterToVolume', moveChapterToVolume)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.copyChapterToVolume', copyChapterToVolume)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.openVolumeOutline', openVolumeOutline)
    );
}

/**
 * 注册敏感词相关命令
 */
function registerSensitiveWordCommands(deps: CommandRegistrarDeps): void {
    const { context, getSensitiveWordDiagnostic } = deps;

    // 打开敏感词配置
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.openSensitiveWordsConfig', async () => {
            await openSensitiveWordsConfig();
        })
    );

    // 添加到自定义词库
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.addToCustomWords', addToCustomWords)
    );

    // 添加选中文本到白名单
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.addSelectedToWhitelist', () => addToWhitelist())
    );

    // 重新加载敏感词库
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.reloadSensitiveWords', async () => {
            try {
                const sensitiveWordService = SensitiveWordService.getInstance();
                await sensitiveWordService.reload();
                const diagnostic = getSensitiveWordDiagnostic();
                if (diagnostic && vscode.window.activeTextEditor) {
                    diagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
                }
                vscode.window.showInformationMessage('敏感词库已重新加载');
            } catch (error) {
                handleError('重新加载敏感词库失败', error, ErrorSeverity.Error);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.addToWhitelist', (word: string) => addToWhitelist(word)),
        vscode.commands.registerCommand('noveler.applySensitiveWordFix', async fix => {
            try { await applySensitiveWordFix(fix); }
            catch (error) { handleError('处理敏感词失败', error, ErrorSeverity.Error); }
        })
    );

    // 忽略敏感词（会话级别）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.ignoreSensitiveWord', (documentUri: string, word: string) => {
            const diagnostic = getSensitiveWordDiagnostic();
            if (diagnostic && documentUri && word) {
                diagnostic.ignoreWordInDocument(documentUri, word);
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document.uri.toString() === documentUri) {
                    diagnostic.updateDiagnostics(editor.document);
                }
            }
        })
    );

    // 显示敏感词详情
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.showSensitiveWordDetails', () => {
            vscode.commands.executeCommand('workbench.actions.view.problems');
        })
    );
}

/**
 * 注册迁移相关命令
 */
function registerMigrationCommands(deps: CommandRegistrarDeps): void {
    const { context } = deps;

    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.migrateToVolumeStructure', migrateToVolumeStructure)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.rollbackToFlatStructure', rollbackToFlatStructure)
    );
}

/**
 * 注册实用工具命令
 */
function registerUtilityCommands(deps: CommandRegistrarDeps): void {
    const { context, highlightProvider, updateHighlights } = deps;

    // 格式化文档
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.formatDocument', async (uri?: vscode.Uri) => {
            await formatCurrentDocument(uri);
        })
    );

    // 重载高亮配置
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.reloadHighlights', () => {
            highlightProvider.reloadDecorations();
            updateHighlights(vscode.window.activeTextEditor);
            Logger.info('高亮配置已重新加载');
        })
    );

    // 跳转到 README
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.jumpToReadmeSection', jumpToReadmeSection)
    );

    // 快速设置
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.quickSettings', async () => {
            await quickSettings();
        })
    );

    // 切换护眼模式
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.toggleEyeCareMode', async () => {
            try {
                const configService = ConfigService.getInstance();
                const newEnabled = await configService.toggleEyeCareMode();
                vscode.window.showInformationMessage(
                    `护眼模式已${newEnabled ? '启用' : '禁用'}（仅当前项目生效）`
                );
            } catch (error) {
                handleError('切换护眼模式失败', error);
            }
        })
    );

    // 刷新护眼模式（重新应用颜色配置）
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.refreshEyeCareMode', async () => {
            try {
                const configService = ConfigService.getInstance();
                if (configService.isEyeCareModeEnabled()) {
                    await configService.toggleEyeCareMode(true);  // 强制重新应用
                    vscode.window.showInformationMessage('护眼模式已刷新');
                }
            } catch (error) {
                handleError('刷新护眼模式失败', error);
            }
        })
    );
}

/**
 * 打开配置文件
 */
async function openConfigFile(context: vscode.ExtensionContext): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showWarningMessage('未找到工作区文件夹');
        return;
    }

    const configUri = vscode.Uri.joinPath(workspaceFolder.uri, CONFIG_FILE_NAME);

    try {
        const document = await vscode.workspace.openTextDocument(configUri);
        await vscode.window.showTextDocument(document);
    } catch {
        const result = await vscode.window.showInformationMessage(
            'novel.jsonc 配置文件不存在，是否创建？',
            '创建', '取消'
        );

        if (result === '创建') {
            try {
                const templatePath = vscode.Uri.joinPath(
                    context.extensionUri,
                    'templates',
                    'default-config.jsonc'
                );
                const templateData = await vscode.workspace.fs.readFile(templatePath);

                await vscode.workspace.fs.writeFile(configUri, templateData);
                const document = await vscode.workspace.openTextDocument(configUri);
                await vscode.window.showTextDocument(document);
                vscode.window.showInformationMessage('已创建 novel.jsonc 配置文件');
            } catch (templateError) {
                handleError('创建配置文件失败', templateError, ErrorSeverity.Error);
            }
        }
    }
}

/**
 * 格式化当前文档
 */
async function formatCurrentDocument(uri?: vscode.Uri): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor && !uri) {
        vscode.window.showWarningMessage('没有打开的编辑器');
        return;
    }

    try {
        const document = uri ? await vscode.workspace.openTextDocument(uri) : editor!.document;
        if (document.languageId !== 'markdown') {
            vscode.window.showWarningMessage('只能格式化 Markdown 文档');
            return;
        }
        const formatProvider = new ChineseNovelFormatProvider();
        const edits = formatProvider.provideDocumentFormattingEdits(
            document,
            {} as vscode.FormattingOptions,
            {} as vscode.CancellationToken
        );

        if (edits.length > 0) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            workspaceEdit.set(document.uri, edits);
            if (!await vscode.workspace.applyEdit(workspaceEdit)) {
                throw new Error('文档修改未应用');
            }
            vscode.window.showInformationMessage('文档格式化完成');
        } else {
            vscode.window.showInformationMessage('文档无需格式化');
        }
    } catch (error) {
        vscode.window.showErrorMessage(`格式化失败: ${error}`);
    }
}
