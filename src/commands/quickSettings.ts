/**
 * 快速配置命令
 * 通过 QuickPick 界面快速修改常用配置项
 */

import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { handleError } from '../utils/errorHandler';

/**
 * 配置项定义
 */
interface SettingItem extends vscode.QuickPickItem {
    id: string;
    getValue: () => string;
}

/**
 * 打开快速配置界面
 */
export async function quickSettings(): Promise<void> {
    try {
        const configService = ConfigService.getInstance();

        // 构建配置项列表
        const items: SettingItem[] = [
            {
                id: 'targetWords',
                label: '$(symbol-number) 目标字数',
                description: `当前: ${configService.getTargetWords()} 字`,
                detail: '创建新章节时的默认字数目标',
                getValue: () => configService.getTargetWords().toString()
            },
            {
                id: 'quoteStyle',
                label: '$(symbol-string) 引号样式',
                description: `当前: ${configService.getChineseQuoteStyle()}`,
                detail: '中文引号的样式',
                getValue: () => configService.getChineseQuoteStyle()
            },
            {
                id: 'autoEmptyLine',
                label: configService.shouldAutoEmptyLine()
                    ? '$(x) 禁用自动空行'
                    : '$(check) 启用自动空行',
                description: configService.shouldAutoEmptyLine() ? '当前已启用' : '当前已禁用',
                detail: '在段落之间自动添加空行',
                getValue: () => configService.shouldAutoEmptyLine() ? '已启用' : '已禁用'
            },
            {
                id: 'paragraphIndent',
                label: configService.shouldParagraphIndent()
                    ? '$(x) 禁用段落缩进'
                    : '$(check) 启用段落缩进',
                description: configService.shouldParagraphIndent() ? '当前已启用' : '当前已禁用',
                detail: '段落首行自动添加两个全角空格',
                getValue: () => configService.shouldParagraphIndent() ? '已启用' : '已禁用'
            },
            {
                id: 'dialogueColor',
                label: '$(symbol-color) 对话高亮颜色',
                description: `当前: ${configService.getHighlightStyle('dialogue').color || '默认'}`,
                detail: '对话文本的高亮颜色',
                getValue: () => configService.getHighlightStyle('dialogue').color || '#ce9178'
            },
            {
                id: 'characterColor',
                label: '$(account) 人物高亮颜色',
                description: `当前: ${configService.getHighlightStyle('character').color || '默认'}`,
                detail: '人物名称的高亮颜色',
                getValue: () => configService.getHighlightStyle('character').color || '#4ec9b0'
            },
            {
                id: 'eyeCareMode',
                label: configService.isEyeCareModeEnabled()
                    ? '$(eye-closed) 禁用护眼模式'
                    : '$(eye) 启用护眼模式',
                description: configService.isEyeCareModeEnabled() ? '当前已启用' : '当前已禁用',
                detail: '使用豆沙绿背景保护眼睛（仅当前项目）',
                getValue: () => configService.isEyeCareModeEnabled() ? '已启用' : '已禁用'
            }
        ];

        // 显示配置项选择器
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要修改的配置项',
            matchOnDescription: true,
            matchOnDetail: true
        });

        if (!selected) {
            return;
        }

        // 根据选择的项目调用对应的配置函数
        switch (selected.id) {
            case 'targetWords':
                await configureTargetWords();
                break;
            case 'quoteStyle':
                await configureQuoteStyle();
                break;
            case 'autoEmptyLine':
                await toggleAutoEmptyLineDirect();
                break;
            case 'paragraphIndent':
                await toggleParagraphIndentDirect();
                break;
            case 'dialogueColor':
                await configureColor('dialogue', '对话高亮颜色');
                break;
            case 'characterColor':
                await configureColor('character', '人物高亮颜色');
                break;
            case 'eyeCareMode':
                await toggleEyeCareModeDirect();
                break;
        }

    } catch (error) {
        handleError('快速配置失败', error);
    }
}

/**
 * 配置目标字数
 */
async function configureTargetWords(): Promise<void> {
    const configService = ConfigService.getInstance();
    const current = configService.getTargetWords();

    const input = await vscode.window.showInputBox({
        prompt: '输入目标字数',
        value: current.toString(),
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num <= 0) {
                return '请输入有效的正整数';
            }
            if (num > 50000) {
                return '字数不能超过 50000';
            }
            return null;
        }
    });

    if (input === undefined) {
        return;
    }

    const targetWords = parseInt(input);
    await configService.updateConfig((draft) => {
        if (!draft.noveler) {
            draft.noveler = {};
        }
        draft.noveler.targetWords = { default: targetWords };
    });

    vscode.window.showInformationMessage(`已设置目标字数为 ${targetWords} 字`);
}

/**
 * 配置引号样式
 */
async function configureQuoteStyle(): Promise<void> {
    const configService = ConfigService.getInstance();

    const styles = [
        { label: '「」', description: '直角引号（日式）', value: '「」' },
        { label: '""', description: '弯引号', value: '""' },
        { label: '""', description: '直引号', value: '""' }
    ];

    const selected = await vscode.window.showQuickPick(styles, {
        placeHolder: '选择引号样式'
    });

    if (!selected) {
        return;
    }

    await configService.updateConfig((draft) => {
        if (!draft.noveler) {
            draft.noveler = {};
        }
        if (!draft.noveler.format) {
            draft.noveler.format = {};
        }
        draft.noveler.format.chineseQuoteStyle = selected.value;
    });

    vscode.window.showInformationMessage(`已设置引号样式为 ${selected.label}`);
}

/**
 * 直接切换自动空行
 */
async function toggleAutoEmptyLineDirect(): Promise<void> {
    const configService = ConfigService.getInstance();
    const currentEnabled = configService.shouldAutoEmptyLine();
    const newEnabled = !currentEnabled;

    await configService.updateConfig((draft) => {
        if (!draft.noveler) {
            draft.noveler = {};
        }
        draft.noveler.autoEmptyLine = { value: newEnabled };
    });

    vscode.window.showInformationMessage(
        `已${newEnabled ? '启用' : '禁用'}自动空行`
    );
}

/**
 * 直接切换段落缩进
 */
async function toggleParagraphIndentDirect(): Promise<void> {
    const configService = ConfigService.getInstance();
    const currentEnabled = configService.shouldParagraphIndent();
    const newEnabled = !currentEnabled;

    await configService.updateConfig((draft) => {
        if (!draft.noveler) {
            draft.noveler = {};
        }
        draft.noveler.paragraphIndent = { value: newEnabled };
    });

    vscode.window.showInformationMessage(
        `已${newEnabled ? '启用' : '禁用'}段落缩进`
    );
}

/**
 * 配置高亮颜色
 */
async function configureColor(type: 'dialogue' | 'character', label: string): Promise<void> {
    const configService = ConfigService.getInstance();
    const currentColor = configService.getHighlightStyle(type).color ||
        (type === 'dialogue' ? '#ce9178' : '#4ec9b0');

    // 预设颜色
    const presetColors = [
        { label: '$(symbol-color) 橙色', description: '#ce9178', value: '#ce9178' },
        { label: '$(symbol-color) 青色', description: '#4ec9b0', value: '#4ec9b0' },
        { label: '$(symbol-color) 黄色', description: '#dcdcaa', value: '#dcdcaa' },
        { label: '$(symbol-color) 蓝色', description: '#569cd6', value: '#569cd6' },
        { label: '$(symbol-color) 绿色', description: '#6a9955', value: '#6a9955' },
        { label: '$(symbol-color) 粉色', description: '#c586c0', value: '#c586c0' },
        { label: '$(edit) 自定义...', description: '输入自定义颜色代码', value: 'custom' }
    ];

    const selected = await vscode.window.showQuickPick(presetColors, {
        placeHolder: `选择${label}`
    });

    if (!selected) {
        return;
    }

    let color = selected.value;

    // 如果选择自定义，弹出输入框
    if (color === 'custom') {
        const input = await vscode.window.showInputBox({
            prompt: '输入颜色代码（如 #ff0000）',
            value: currentColor,
            validateInput: (value) => {
                if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
                    return '请输入有效的十六进制颜色代码（如 #ff0000）';
                }
                return null;
            }
        });

        if (!input) {
            return;
        }
        color = input;
    }

    await configService.updateConfig((draft) => {
        if (!draft.noveler) {
            draft.noveler = {};
        }
        if (!draft.noveler.highlight) {
            draft.noveler.highlight = {};
        }
        if (!draft.noveler.highlight[type]) {
            draft.noveler.highlight[type] = {};
        }
        draft.noveler.highlight[type]!.color = color;
    });

    vscode.window.showInformationMessage(`已设置${label}为 ${color}`);
}

/**
 * 直接切换护眼模式
 */
async function toggleEyeCareModeDirect(): Promise<void> {
    const configService = ConfigService.getInstance();
    const currentEnabled = configService.isEyeCareModeEnabled();

    // 直接切换状态
    const newEnabled = await configService.toggleEyeCareMode(!currentEnabled);

    vscode.window.showInformationMessage(
        `已${newEnabled ? '启用' : '禁用'}护眼模式（仅当前项目生效）`
    );
}
