/**
 * 快速配置命令
 * 通过 QuickPick 界面快速修改常用配置项
 */

import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import { handleError } from '../utils/errorHandler';

interface SettingItem extends vscode.QuickPickItem {
    id: string;
}

const NUMBERING_LABELS: Record<string, string> = {
    global:  '全局连续',
    volume:  '按卷重置',
    mixed:   '混合（正文全局 + 番外独立）',
};

function statusLabel(enabled: boolean): string {
    return enabled ? '$(check) 已启用' : '$(circle-slash) 已禁用';
}

/**
 * 打开快速配置界面
 */
export async function quickSettings(): Promise<void> {
    try {
        const configService = ConfigService.getInstance();
        const volumesEnabled  = configService.isVolumesEnabled();
        const numberingMode   = configService.getVolumesConfig().chapterNumbering;

        const sep = (label: string): vscode.QuickPickItem =>
            ({ label, kind: vscode.QuickPickItemKind.Separator });

        const items: (SettingItem | vscode.QuickPickItem)[] = [

            // ── 写作格式 ──────────────────────────────────────────
            sep('写作格式'),
            {
                id: 'targetWords',
                label: '$(symbol-number) 目标字数',
                description: `${configService.getTargetWords()} 字`,
                detail: '创建新章节时的默认字数目标',
            },
            {
                id: 'quoteStyle',
                label: '$(symbol-string) 引号样式',
                description: configService.getChineseQuoteStyle(),
                detail: '格式化时使用的中文引号',
            },
            {
                id: 'autoEmptyLine',
                label: '$(list-flat) 自动空行',
                description: statusLabel(configService.shouldAutoEmptyLine()),
                detail: '格式化时在段落之间自动添加空行',
            },
            {
                id: 'paragraphIndent',
                label: '$(text-size) 段落首行缩进',
                description: statusLabel(configService.shouldParagraphIndent()),
                detail: '格式化时段落首行自动添加两个全角空格',
            },

            // ── 视觉样式 ──────────────────────────────────────────
            sep('视觉样式'),
            {
                id: 'dialogueColor',
                label: '$(symbol-color) 对话高亮颜色',
                description: configService.getHighlightStyle('dialogue').color || '#ce9178',
                detail: '对话文字的高亮颜色',
            },
            {
                id: 'characterColor',
                label: '$(account) 人物高亮颜色',
                description: configService.getHighlightStyle('character').color || '#4ec9b0',
                detail: '人物名称的高亮颜色',
            },
            {
                id: 'eyeCareMode',
                label: '$(eye) 护眼模式',
                description: statusLabel(configService.isEyeCareModeEnabled()),
                detail: '豆沙绿背景，减少视觉疲劳（仅当前项目）',
            },

            // ── 分卷设置（仅分卷模式下显示）────────────────────────
            ...(volumesEnabled ? [
                sep('分卷设置') as vscode.QuickPickItem,
                {
                    id: 'chapterNumbering',
                    label: '$(list-ordered) 章节编号模式',
                    description: NUMBERING_LABELS[numberingMode] ?? numberingMode,
                    detail: '分卷下章节序号的计算方式',
                } as SettingItem,
            ] : []),

            // ── 专注写作 ──────────────────────────────────────────
            sep('专注写作'),
            {
                id: 'focusMode',
                label: '$(symbol-keyword) 专注模式',
                description: '打字机滚动 + 打字音效',
                detail: '沉浸式写作体验设置',
            },
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要修改的配置项',
            matchOnDescription: true,
            matchOnDetail: true,
        });

        const item = selected as SettingItem | undefined;
        if (!item?.id) {
            return;
        }

        switch (item.id) {
            case 'targetWords':      await configureTargetWords(); break;
            case 'quoteStyle':       await configureQuoteStyle(); break;
            case 'autoEmptyLine':    await toggleBoolSetting('autoEmptyLine'); break;
            case 'paragraphIndent':  await toggleBoolSetting('paragraphIndent'); break;
            case 'dialogueColor':    await configureColor('dialogue', '对话高亮颜色'); break;
            case 'characterColor':   await configureColor('character', '人物高亮颜色'); break;
            case 'eyeCareMode':      await toggleEyeCareMode(); break;
            case 'chapterNumbering': await configureChapterNumbering(); break;
            case 'focusMode':        await vscode.commands.executeCommand('noveler.focusModeSettings'); break;
        }

    } catch (error) {
        handleError('快速配置失败', error);
    }
}

// ── 各配置项处理函数 ──────────────────────────────────────────────────────────

async function configureTargetWords(): Promise<void> {
    const configService = ConfigService.getInstance();
    const current = configService.getTargetWords();

    const input = await vscode.window.showInputBox({
        prompt: '输入目标字数',
        value: current.toString(),
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num <= 0) { return '请输入有效的正整数'; }
            if (num > 50000) { return '字数不能超过 50000'; }
            return null;
        }
    });

    if (input === undefined) { return; }

    const targetWords = parseInt(input);
    await configService.updateConfig((draft) => {
        if (!draft.noveler) { draft.noveler = {}; }
        draft.noveler.targetWords = { default: targetWords };
    });

    vscode.window.showInformationMessage(`已设置目标字数为 ${targetWords} 字`);
}

async function configureQuoteStyle(): Promise<void> {
    const configService = ConfigService.getInstance();
    const current = configService.getChineseQuoteStyle();

    const styles = [
        { label: '「」', description: '直角引号（日式）', value: '「」' },
        { label: '""', description: '弯引号', value: '""' },
        { label: '""', description: '直引号', value: '""' },
    ].map(s => ({ ...s, picked: s.value === current }));

    const selected = await vscode.window.showQuickPick(styles, {
        placeHolder: '选择引号样式',
    });

    if (!selected || selected.value === current) { return; }

    await configService.updateConfig((draft) => {
        if (!draft.noveler) { draft.noveler = {}; }
        if (!draft.noveler.format) { draft.noveler.format = {}; }
        (draft.noveler.format as Record<string, unknown>).chineseQuoteStyle = selected.value;
    });

    vscode.window.showInformationMessage(`已设置引号样式为 ${selected.label}`);
}

async function toggleBoolSetting(key: 'autoEmptyLine' | 'paragraphIndent'): Promise<void> {
    const configService = ConfigService.getInstance();
    const labelMap = { autoEmptyLine: '自动空行', paragraphIndent: '段落首行缩进' } as const;
    const currentEnabled = key === 'autoEmptyLine'
        ? configService.shouldAutoEmptyLine()
        : configService.shouldParagraphIndent();

    const options = [
        { label: '$(check) 启用', value: true,  picked: currentEnabled },
        { label: '$(circle-slash) 禁用', value: false, picked: !currentEnabled },
    ];

    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: `设置${labelMap[key]}`,
    });

    if (!selected || selected.value === currentEnabled) { return; }

    await configService.updateConfig((draft) => {
        if (!draft.noveler) { draft.noveler = {}; }
        if (key === 'autoEmptyLine') {
            draft.noveler.autoEmptyLine = { value: selected.value };
        } else {
            draft.noveler.paragraphIndent = { value: selected.value };
        }
    });

    vscode.window.showInformationMessage(`已${selected.value ? '启用' : '禁用'}${labelMap[key]}`);
}

async function toggleEyeCareMode(): Promise<void> {
    const configService = ConfigService.getInstance();
    const currentEnabled = configService.isEyeCareModeEnabled();

    const options = [
        { label: '$(check) 启用', value: true,  picked: currentEnabled },
        { label: '$(circle-slash) 禁用', value: false, picked: !currentEnabled },
    ];

    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: '设置护眼模式',
    });

    if (!selected || selected.value === currentEnabled) { return; }

    await configService.toggleEyeCareMode(selected.value);
    vscode.window.showInformationMessage(
        `已${selected.value ? '启用' : '禁用'}护眼模式（仅当前项目生效）`
    );
}

async function configureColor(type: 'dialogue' | 'character', label: string): Promise<void> {
    const configService = ConfigService.getInstance();
    const currentColor = configService.getHighlightStyle(type).color ||
        (type === 'dialogue' ? '#ce9178' : '#4ec9b0');

    const presetColors = [
        { label: '$(symbol-color) 橙色',  description: '#ce9178', value: '#ce9178' },
        { label: '$(symbol-color) 青色',  description: '#4ec9b0', value: '#4ec9b0' },
        { label: '$(symbol-color) 黄色',  description: '#dcdcaa', value: '#dcdcaa' },
        { label: '$(symbol-color) 蓝色',  description: '#569cd6', value: '#569cd6' },
        { label: '$(symbol-color) 绿色',  description: '#6a9955', value: '#6a9955' },
        { label: '$(symbol-color) 粉色',  description: '#c586c0', value: '#c586c0' },
        { label: '$(edit) 自定义...', description: '输入自定义颜色代码', value: 'custom' },
    ].map(c => ({ ...c, picked: c.value === currentColor }));

    const selected = await vscode.window.showQuickPick(presetColors, {
        placeHolder: `选择${label}（当前：${currentColor}）`,
    });

    if (!selected) { return; }

    let color = selected.value;

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

        if (!input) { return; }
        color = input;
    }

    if (color === currentColor) { return; }

    await configService.updateConfig((draft) => {
        if (!draft.noveler) { draft.noveler = {}; }
        if (!draft.noveler.highlight) { draft.noveler.highlight = {}; }
        if (!(draft.noveler.highlight as Record<string, unknown>)[type]) {
            (draft.noveler.highlight as Record<string, unknown>)[type] = {};
        }
        ((draft.noveler.highlight as Record<string, Record<string, string>>)[type]).color = color;
    });

    vscode.window.showInformationMessage(`已设置${label}为 ${color}`);
}

async function configureChapterNumbering(): Promise<void> {
    const configService = ConfigService.getInstance();
    const current = configService.getVolumesConfig().chapterNumbering;

    const options = [
        {
            label: '$(list-ordered) 按卷重置',
            description: '每卷从第1章开始（推荐）',
            detail: '卷一第1章、卷二第1章各自独立计数，适合大多数长篇小说',
            value: 'volume',
        },
        {
            label: '$(arrow-right) 全局连续',
            description: '全书章节序号连续递增',
            detail: '跨卷不重置，全书唯一编号；注意：往非末尾卷插入章节时序号可能出现空洞',
            value: 'global',
        },
        {
            label: '$(git-branch) 混合（正文全局 + 番外独立）',
            description: '正文卷连续，番外/前传/后传各自从第1章开始',
            detail: '主线剧情保持全局序号，番外篇、前传、后传单独计数，互不影响',
            value: 'mixed',
        },
    ].map(o => ({ ...o, picked: o.value === current }));

    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: `当前：${NUMBERING_LABELS[current] ?? current}  ·  选择新模式`,
        matchOnDetail: true,
    });

    if (!selected || selected.value === current) { return; }

    await configService.updateConfig((draft) => {
        if (!draft.noveler) { draft.noveler = {}; }
        if (!draft.noveler.volumes) {
            draft.noveler.volumes = { enabled: false, folderStructure: 'flat', numberFormat: 'arabic', chapterNumbering: 'volume' };
        }
        draft.noveler.volumes.chapterNumbering = selected.value as 'global' | 'volume' | 'mixed';
    });

    vscode.window.showInformationMessage(`已将章节编号模式设置为「${selected.label.replace(/^\$\([^)]+\)\s*/, '')}」`);
}
