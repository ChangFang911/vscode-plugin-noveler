/**
 * 打开敏感词配置命令
 */

import * as vscode from 'vscode';
import { documentIO, fileExists } from '../utils/documentOperations';
import { Logger } from '../utils/logger';
import { ConfigService } from '../services/configService';
import { SensitiveWordService } from '../services/sensitiveWordService';

/**
 * 打开敏感词配置文件
 * 显示选项菜单，让用户选择要打开的配置
 */
export async function openSensitiveWordsConfig(): Promise<void> {
    try {
        const workspaceFolder = documentIO.workspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('请先打开一个 Noveler 项目');
            return;
        }


        // 显示选项菜单
        const options = [
            {
                label: '⚙️ 快速切换检测级别',
                description: '一键选择：严格/标准/宽松',
                action: 'quickLevel'
            },
            {
                label: '编辑自定义词库文件（高级）',
                description: '打开词库文件；也可选中文字后右键添加',
                action: 'custom'
            },
            {
                label: '编辑白名单文件（高级）',
                description: '打开白名单文件；也可通过正文灯泡或右键添加',
                action: 'whitelist'
            },
            {
                label: '📝 高级配置',
                description: '打开完整配置文件进行详细设置',
                action: 'config'
            }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: '请选择要执行的操作'
        });

        if (!selected) {
            return;
        }

        if (selected.action === 'quickLevel') {
            // 快速切换检测级别
            await quickSwitchLevel();
        } else if (selected.action === 'config') {
            // 打开 novel.jsonc 并跳转到 sensitiveWords 配置
            const novelConfigPath = vscode.Uri.joinPath(workspaceFolder.uri, 'novel.jsonc');
            const doc = await vscode.workspace.openTextDocument(novelConfigPath);
            const editor = await vscode.window.showTextDocument(doc);

            // 跳转到 sensitiveWords 配置位置
            const text = doc.getText();
            const sensitiveWordsIndex = text.indexOf('"sensitiveWords"');

            if (sensitiveWordsIndex !== -1) {
                const position = doc.positionAt(sensitiveWordsIndex);
                editor.selection = new vscode.Selection(position, position);
                editor.revealRange(
                    new vscode.Range(position, position),
                    vscode.TextEditorRevealType.InCenter
                );
            } else {
                vscode.window.showWarningMessage('未找到敏感词配置部分，请检查 novel.jsonc 文件格式');
            }
        } else if (selected.action === 'custom' || selected.action === 'whitelist') {
            const config = SensitiveWordService.getInstance().getConfig();
            const whitelist = selected.action === 'whitelist';
            const configuredPath = (whitelist ? config.whitelist?.path : config.customLibrary?.path)
                || `.noveler/sensitive-words/${whitelist ? 'whitelist' : 'custom-words'}.jsonc`;
            let uri = vscode.Uri.joinPath(workspaceFolder.uri, configuredPath);
            if (!await fileExists(uri)) {
                const fallbackPath = configuredPath.endsWith('.jsonc') ? configuredPath.replace(/\.jsonc$/, '.json')
                    : configuredPath.endsWith('.json') ? configuredPath.replace(/\.json$/, '.jsonc') : undefined;
                if (fallbackPath) {
                    const fallback = vscode.Uri.joinPath(workspaceFolder.uri, fallbackPath);
                    if (await fileExists(fallback)) { uri = fallback; }
                }
            }
            if (!await fileExists(uri)) {
                vscode.window.showWarningMessage(`${whitelist ? '白名单' : '自定义词库'}文件尚未创建，可在正文中选中文字后右键添加。`);
                return;
            }
            await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
        }

        Logger.info('已打开敏感词配置');
    } catch (error) {
        Logger.error('打开敏感词配置失败', error);
        vscode.window.showErrorMessage('打开敏感词配置失败');
    }
}

/**
 * 快速切换检测级别
 * 提供简单的预设选项，而非复杂的配置
 */
async function quickSwitchLevel(): Promise<void> {
    const configService = ConfigService.getInstance();
    const config = configService.getConfig();
    const currentLevels = config?.sensitiveWords?.builtInLibrary?.levels;

    // 判断当前级别
    let currentLevel = '标准';
    if (currentLevels) {
        if (currentLevels.high && currentLevels.medium && currentLevels.low) {
            currentLevel = '严格';
        } else if (currentLevels.high && currentLevels.medium && !currentLevels.low) {
            currentLevel = '标准';
        } else if (currentLevels.high && !currentLevels.medium && !currentLevels.low) {
            currentLevel = '宽松';
        }
    }

    const levels = [
        {
            label: '🔴 严格模式',
            description: '检测所有级别（高危+中危+低危）',
            detail: '适合网文平台发布，最大程度规避审核风险',
            value: { high: true, medium: true, low: true },
            picked: currentLevel === '严格'
        },
        {
            label: '🟡 标准模式（推荐）',
            description: '检测高危和中危词汇',
            detail: '平衡检测效果和误报率，适合大多数场景',
            value: { high: true, medium: true, low: false },
            picked: currentLevel === '标准'
        },
        {
            label: '🟢 宽松模式',
            description: '仅检测高危词汇',
            detail: '减少干扰，仅标记红线词汇',
            value: { high: true, medium: false, low: false },
            picked: currentLevel === '宽松'
        }
    ];

    const selected = await vscode.window.showQuickPick(levels, {
        placeHolder: `当前级别：${currentLevel}，请选择新的检测级别`
    });

    if (!selected) {
        return;
    }

    // 更新配置
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await configService.updateConfig((draft: any) => {
            if (!draft.noveler) draft.noveler = {};
            if (!draft.noveler.sensitiveWords) draft.noveler.sensitiveWords = {};
            if (!draft.noveler.sensitiveWords.builtInLibrary) draft.noveler.sensitiveWords.builtInLibrary = {};
            draft.noveler.sensitiveWords.builtInLibrary.levels = selected.value;
        });

        // 重新加载敏感词服务
        const sensitiveWordService = SensitiveWordService.getInstance();
        await sensitiveWordService.reload();

        const levelName = selected.label.replace(/^[🔴🟡🟢]\s*/u, '').replace('（推荐）', '').trim();
        vscode.window.showInformationMessage(`敏感词检测级别已切换为：${levelName}`);
        Logger.info(`敏感词检测级别已切换为：${levelName}`);
    } catch (error) {
        Logger.error('切换检测级别失败', error);
        vscode.window.showErrorMessage('切换检测级别失败，请手动编辑配置文件');
    }
}
