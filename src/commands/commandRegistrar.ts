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
import { handleReadmeAutoUpdate } from '../utils/readmeAutoUpdate';
import { initProject } from './initProject';
import { createChapter } from './createChapter';
import { createCharacter } from './createCharacter';
import { createVolume } from './createVolume';
import { openSensitiveWordsConfig } from './openSensitiveWordsConfigCommand';
import { addToCustomWords, addToWhitelist } from './addToSensitiveWordsCommand';
import { generateRandomName } from './generateName';
import { CONFIG_FILE_NAME } from '../constants';
import {
    renameChapter,
    markChapterCompleted,
    markChapterInProgress,
    updateChapterStatusWithDialog,
    deleteChapter,
    renameCharacter,
    deleteCharacter
} from './contextMenuCommands';
import {
    renameVolume,
    deleteVolume,
    setVolumeStatus,
    editVolumeInfo,
    setVolumeType,
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

/**
 * 命令注册器依赖项
 */
export interface CommandRegistrarDeps {
    context: vscode.ExtensionContext;
    wordCountService: WordCountService;
    configService: ConfigService;
    focusModeService: FocusModeService;
    sensitiveWordService: SensitiveWordService;
    sensitiveWordDiagnostic: SensitiveWordDiagnosticProvider;
    novelerViewProvider: NovelerViewProvider;
    statsWebviewProvider: StatsWebviewProvider;
    highlightProvider: NovelHighlightProvider;
    updateHighlights: (editor: vscode.TextEditor | undefined) => void;
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
}

/**
 * 注册核心命令
 */
function registerCoreCommands(deps: CommandRegistrarDeps): void {
    const { context, novelerViewProvider, statsWebviewProvider, focusModeService } = deps;

    // 刷新命令
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.refresh', async () => {
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

    // 初始化项目
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.initProject', async () => {
            await initProject(context);
        })
    );

    // 切换专注模式
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.toggleFocusMode', async () => {
            await focusModeService.toggle();
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
    const { context } = deps;

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
        vscode.commands.registerCommand('noveler.setVolumeStatus', setVolumeStatus)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.editVolumeInfo', editVolumeInfo)
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.setVolumeType', setVolumeType)
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
    const { context, sensitiveWordService, sensitiveWordDiagnostic } = deps;

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
        vscode.commands.registerCommand('noveler.addSelectedToWhitelist', addToWhitelist)
    );

    // 重新加载敏感词库
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.reloadSensitiveWords', async () => {
            try {
                await sensitiveWordService.reload();
                vscode.window.showInformationMessage('敏感词库已重新加载');

                if (vscode.window.activeTextEditor) {
                    sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
                }
            } catch (error) {
                handleError('重新加载敏感词库失败', error, ErrorSeverity.Error);
            }
        })
    );

    // 添加到白名单
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.addToWhitelist', async (word: string) => {
            await addWordToWhitelist(word, sensitiveWordService, sensitiveWordDiagnostic);
        })
    );

    // 忽略敏感词
    context.subscriptions.push(
        vscode.commands.registerCommand('noveler.ignoreSensitiveWord', () => {
            // 空操作
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
        vscode.commands.registerCommand('noveler.formatDocument', async () => {
            await formatCurrentDocument();
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
async function formatCurrentDocument(): Promise<void> {
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
}

/**
 * 添加词汇到白名单
 */
async function addWordToWhitelist(
    word: string,
    sensitiveWordService: SensitiveWordService,
    sensitiveWordDiagnostic: SensitiveWordDiagnosticProvider
): Promise<void> {
    try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('请先打开一个工作区');
            return;
        }

        const whitelistDirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.noveler', 'sensitive-words');
        const whitelistUri = vscode.Uri.joinPath(whitelistDirUri, 'whitelist.jsonc');

        // 确保目录存在
        try {
            await vscode.workspace.fs.stat(whitelistDirUri);
        } catch {
            await vscode.workspace.fs.createDirectory(whitelistDirUri);
        }

        // 读取或创建白名单文件
        interface WhitelistFile {
            description: string;
            words: string[];
        }

        let whitelist: WhitelistFile;
        try {
            const content = await vscode.workspace.fs.readFile(whitelistUri);
            whitelist = JSON.parse(Buffer.from(content).toString('utf8'));
        } catch {
            whitelist = {
                description: '用户自定义白名单',
                words: []
            };
        }

        if (whitelist.words.includes(word)) {
            vscode.window.showInformationMessage(`"${word}" 已在白名单中`);
            return;
        }

        whitelist.words.push(word);

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(whitelistUri, encoder.encode(JSON.stringify(whitelist, null, 2)));

        await sensitiveWordService.reload();

        if (vscode.window.activeTextEditor) {
            sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
        }

        vscode.window.showInformationMessage(`已将 "${word}" 添加到白名单`);
    } catch (error) {
        handleError('添加到白名单失败', error, ErrorSeverity.Error);
    }
}
