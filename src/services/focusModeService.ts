import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import { ConfigService } from './configService';
import { Logger } from '../utils/logger';

/**
 * 打字音效类型
 */
export type TypingSoundType = 'none' | 'mechanical' | 'typewriter' | 'bubble' | 'pop' | 'click' | 'click2' | 'click3' | 'custom';

/**
 * 打字机位置类型（保留类型定义以兼容配置）
 */
export type TypewriterPosition = 'top' | 'center' | 'bottom';

/**
 * 专注模式配置接口
 */
export interface FocusModeConfig {
    typewriter: boolean;
    typewriterPosition: TypewriterPosition;
    typingSound: TypingSoundType;
    typingSoundVolume: number;
    customSoundPaths?: string[];  // 用户自定义音效文件路径列表
    activeCustomSound?: string;   // 当前选中的自定义音效路径
}

/**
 * 文档状态枚举（用于区分用户输入和自动保存）
 */
enum DocumentState {
    Editing = 'editing',
    Saving = 'saving'
}

/**
 * 专注模式服务
 * 提供沉浸式写作体验：
 * - Zen Mode（VS Code 原生全屏）
 * - 打字音效（多种键盘音效可选）
 *
 * 注：打字机模式因 VS Code API 限制暂时移除
 */
export class FocusModeService implements vscode.Disposable {
    private disposables: vscode.Disposable[] = [];
    private configService: ConfigService;
    private extensionContext?: vscode.ExtensionContext;

    // ==================== 状态 ====================
    private currentSound: TypingSoundType = 'none';
    private soundVolume = 50;
    private customSoundPaths: string[] = [];
    private activeCustomSound: string | undefined;

    // ==================== 打字音效 ====================
    // 文档状态机：区分用户输入和保存操作
    private documentState: DocumentState = DocumentState.Editing;
    // 音效播放防抖
    private lastPlayTime = 0;
    private readonly PLAY_INTERVAL = 50; // 最小播放间隔 50ms
    // 音效文件路径缓存
    private soundFileCache: Map<string, string> = new Map();

    constructor() {
        this.configService = ConfigService.getInstance();
        this.loadConfig();
        this.setupListeners();
    }

    /**
     * 设置扩展上下文（用于获取资源路径）
     */
    public setExtensionContext(context: vscode.ExtensionContext): void {
        this.extensionContext = context;
        this.cacheSoundFiles();
    }

    /**
     * 缓存音效文件路径
     */
    private cacheSoundFiles(): void {
        if (!this.extensionContext) return;

        const fs = require('fs');
        const soundTypes: TypingSoundType[] = ['mechanical', 'typewriter', 'bubble', 'pop', 'click', 'click2', 'click3'];

        for (const soundType of soundTypes) {
            // 优先 wav，其次 mp3
            let soundFile = path.join(this.extensionContext.extensionPath, 'media', 'sounds', `${soundType}.wav`);
            if (!fs.existsSync(soundFile)) {
                soundFile = path.join(this.extensionContext.extensionPath, 'media', 'sounds', `${soundType}.mp3`);
                if (!fs.existsSync(soundFile)) {
                    continue;
                }
            }
            this.soundFileCache.set(soundType, soundFile);
        }

        Logger.debug(`[FocusModeService] 缓存了 ${this.soundFileCache.size} 个音效文件`);
    }

    /**
     * 缓存自定义音效文件
     */
    private cacheCustomSounds(): void {
        const fs = require('fs');

        // 清除旧的自定义音效缓存
        this.soundFileCache.delete('custom');

        // 缓存当前激活的自定义音效
        if (this.activeCustomSound && fs.existsSync(this.activeCustomSound)) {
            this.soundFileCache.set('custom', this.activeCustomSound);
            Logger.debug(`[FocusModeService] 缓存自定义音效: ${this.activeCustomSound}`);
        }
    }

    /**
     * 从配置加载状态
     */
    private loadConfig(): void {
        const config = this.configService.getFocusModeConfig();
        this.currentSound = config.typingSound;
        this.soundVolume = config.typingSoundVolume;
        this.customSoundPaths = config.customSoundPaths || [];
        this.activeCustomSound = config.activeCustomSound;

        // 缓存所有自定义音效
        this.cacheCustomSounds();
    }

    /**
     * 设置事件监听器
     */
    private setupListeners(): void {
        // ==================== 保存生命周期 ====================
        // 在保存期间标记状态，排除格式化触发的文本变化
        this.disposables.push(
            vscode.workspace.onWillSaveTextDocument(() => {
                this.documentState = DocumentState.Saving;
            })
        );

        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument(() => {
                // 延迟恢复编辑状态，确保保存过程中的所有事件都被忽略
                setTimeout(() => {
                    this.documentState = DocumentState.Editing;
                }, 150);
            })
        );

        // ==================== 文本变化监听（打字音效）====================
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument((e) => {
                // 音效关闭时不处理
                if (this.currentSound === 'none') {
                    return;
                }

                // 保存期间不处理
                if (this.documentState === DocumentState.Saving) {
                    return;
                }

                const editor = vscode.window.activeTextEditor;
                if (!editor || e.document !== editor.document) {
                    return;
                }

                // 只处理 markdown 文件
                if (e.document.languageId !== 'markdown') {
                    return;
                }

                // 排除 undo/redo
                if (e.reason !== undefined) {
                    return;
                }

                // 排除空变化
                if (e.contentChanges.length === 0) {
                    return;
                }

                // 检查是否为用户输入
                this.handleTextChangeForSound(e, editor);
            })
        );

        // ==================== 配置变化 ====================
        this.disposables.push(
            this.configService.onDidChangeConfig(() => {
                this.loadConfig();
            })
        );
    }

    // ==================== 打字音效 ====================

    /**
     * 处理文本变化，判断是否播放音效
     */
    private handleTextChangeForSound(
        e: vscode.TextDocumentChangeEvent,
        editor: vscode.TextEditor
    ): void {
        const cursorPos = editor.selection.active;

        for (const change of e.contentChanges) {
            // 判断是否为用户键盘输入：
            // 1. 单字符输入
            // 2. 非换行符
            // 3. 变化位置在光标处
            const changeStart = change.range.start;
            const isAtCursor = changeStart.line === cursorPos.line &&
                Math.abs(changeStart.character - cursorPos.character) <= 2;

            if (change.text.length === 1 &&
                change.text !== '\n' &&
                change.text !== '\r' &&
                change.rangeLength <= 1 &&
                isAtCursor) {
                this.playTypingSound();
                break;
            }
        }
    }

    /**
     * 播放打字音效（带防抖）
     */
    private playTypingSound(): void {
        const now = Date.now();
        if (now - this.lastPlayTime < this.PLAY_INTERVAL) {
            return;
        }
        this.lastPlayTime = now;

        const soundFile = this.soundFileCache.get(this.currentSound);
        if (!soundFile) return;

        this.playSoundFile(soundFile);
    }

    /**
     * 播放音效文件
     * 使用系统命令，不阻塞主线程
     */
    private playSoundFile(soundFile: string): void {
        const platform = process.platform;
        let command: string;
        let args: string[];

        if (platform === 'darwin') {
            // macOS: afplay
            command = 'afplay';
            args = ['-v', String(this.soundVolume / 100), soundFile];
        } else if (platform === 'win32') {
            // Windows: PowerShell
            command = 'powershell';
            args = ['-c', `(New-Object Media.SoundPlayer '${soundFile}').PlaySync()`];
        } else {
            // Linux: aplay
            command = 'aplay';
            args = ['-q', soundFile];
        }

        try {
            // 使用 spawn 异步播放，不等待完成
            const proc = cp.spawn(command, args, {
                stdio: 'ignore',
                detached: true
            });
            proc.unref(); // 允许父进程独立退出
        } catch (error) {
            Logger.debug(`[FocusModeService] 播放音效失败: ${error}`);
        }
    }

    /**
     * 试听音效
     */
    public previewSound(soundName: TypingSoundType): void {
        if (soundName === 'none') return;

        const soundFile = this.soundFileCache.get(soundName);
        if (!soundFile) return;

        this.playSoundFile(soundFile);
    }

    // ==================== 公共 API ====================

    /**
     * 切换 Zen Mode
     */
    public async toggle(): Promise<void> {
        await vscode.commands.executeCommand('workbench.action.toggleZenMode');
    }

    /**
     * 设置打字音效
     */
    public async setTypingSound(sound: TypingSoundType): Promise<void> {
        this.currentSound = sound;

        await this.configService.updateFocusModeConfig({
            typingSound: sound
        });

        vscode.window.showInformationMessage(`打字音效已设置为: ${this.getSoundName(sound)}`);
    }

    /**
     * 设置音效音量
     */
    public async setSoundVolume(volume: number): Promise<void> {
        this.soundVolume = Math.max(0, Math.min(100, volume));

        await this.configService.updateFocusModeConfig({
            typingSoundVolume: this.soundVolume
        });

        vscode.window.showInformationMessage(`音效音量已设置为: ${this.soundVolume}%`);
    }

    /**
     * 一键专注：开启 Zen Mode + 默认音效
     */
    public async enableFullFocus(): Promise<void> {
        // 开启 Zen Mode
        await vscode.commands.executeCommand('workbench.action.toggleZenMode');

        // 设置默认音效
        if (this.currentSound === 'none') {
            this.currentSound = 'mechanical';
            await this.configService.updateFocusModeConfig({ typingSound: 'mechanical' });
        }

        vscode.window.showInformationMessage('已进入专注模式（按 Esc 两次退出）');
    }

    /**
     * 显示专注模式设置菜单
     */
    public async showSettingsMenu(): Promise<void> {
        const items: vscode.QuickPickItem[] = [
            {
                label: '$(star-full) 一键专注',
                description: '推荐',
                detail: '开启 Zen Mode 全屏 + 机械键盘音效'
            },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            {
                label: '$(screen-full) Zen Mode',
                description: '切换全屏',
                detail: '进入/退出 VS Code 全屏专注模式（按 Esc 两次退出）'
            },
            {
                label: '$(unmute) 打字音效',
                description: this.currentSound === 'none' ? '当前: 关闭' : `当前: ${this.getSoundName(this.currentSound)}`,
                detail: '选择打字时的键盘音效'
            },
            {
                label: '$(settings) 音效音量',
                description: `当前: ${this.soundVolume}%`,
                detail: '调整打字音效的音量'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择专注模式设置',
            title: 'Noveler 专注模式'
        });

        if (!selected) return;

        if (selected.label.includes('一键专注')) {
            await this.enableFullFocus();
        } else if (selected.label.includes('Zen Mode')) {
            await this.toggle();
        } else if (selected.label.includes('打字音效')) {
            await this.showTypingSoundMenu();
        } else if (selected.label.includes('音效音量')) {
            await this.showVolumeInput();
        }
    }

    /**
     * 显示打字音效菜单（带试听功能）
     */
    private async showTypingSoundMenu(): Promise<void> {
        interface SoundMenuItem extends vscode.QuickPickItem {
            soundType: TypingSoundType;
            customPath?: string;
        }

        const soundOptions: { type: TypingSoundType; label: string; desc: string }[] = [
            { type: 'none', label: '$(mute) 关闭', desc: '不播放打字音效' },
            { type: 'mechanical', label: '$(keyboard) 机械键盘', desc: '清脆的机械键盘音效' },
            { type: 'typewriter', label: '$(edit) 打字机', desc: '复古打字机音效' },
            { type: 'bubble', label: '$(circle-outline) 气泡', desc: '轻柔气泡音效' },
            { type: 'pop', label: '$(primitive-dot) 弹出', desc: '弹出音效' },
            { type: 'click', label: '$(record) 点击 1', desc: '点击音效' },
            { type: 'click2', label: '$(record) 点击 2', desc: '点击音效变体' },
            { type: 'click3', label: '$(record) 点击 3', desc: '轻柔点击音效' },
        ];

        const items: SoundMenuItem[] = soundOptions.map(opt => ({
            label: opt.label + (this.currentSound === opt.type ? ' $(check)' : ''),
            description: opt.desc,
            soundType: opt.type
        }));

        // 添加已有的自定义音效
        for (const customPath of this.customSoundPaths) {
            const fileName = path.basename(customPath);
            const isActive = this.currentSound === 'custom' && this.activeCustomSound === customPath;
            items.push({
                label: `$(file-media) ${fileName}` + (isActive ? ' $(check)' : ''),
                description: '自定义音效',
                soundType: 'custom',
                customPath: customPath
            });
        }

        // 添加"添加自定义音效"选项
        items.push({
            label: '$(add) 添加自定义音效...',
            description: '选择本地音频文件',
            soundType: 'custom',
            customPath: '__add_new__'
        });

        // 创建 QuickPick 以支持试听
        const quickPick = vscode.window.createQuickPick<SoundMenuItem>();
        quickPick.items = items;
        quickPick.placeholder = '选择打字音效（选中时自动试听）';
        quickPick.title = '打字音效设置';

        // 当选中项变化时试听
        quickPick.onDidChangeActive((activeItems) => {
            if (activeItems.length > 0) {
                const item = activeItems[0];
                if (item.soundType === 'custom' && item.customPath && item.customPath !== '__add_new__') {
                    this.previewSoundFile(item.customPath);
                } else if (item.soundType !== 'none' && item.soundType !== 'custom') {
                    this.previewSound(item.soundType);
                }
            }
        });

        // 当确认选择时保存设置
        quickPick.onDidAccept(async () => {
            const selected = quickPick.selectedItems[0];
            if (selected) {
                if (selected.customPath === '__add_new__') {
                    quickPick.hide();
                    await this.addCustomSoundFile();
                } else if (selected.soundType === 'custom' && selected.customPath) {
                    await this.setCustomSound(selected.customPath);
                    quickPick.hide();
                } else {
                    await this.setTypingSound(selected.soundType);
                    quickPick.hide();
                }
            }
        });

        quickPick.onDidHide(() => quickPick.dispose());
        quickPick.show();
    }

    /**
     * 添加自定义音效文件
     */
    private async addCustomSoundFile(): Promise<void> {
        const result = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                '音频文件': ['mp3', 'wav', 'ogg', 'm4a']
            },
            title: '选择自定义打字音效文件'
        });

        if (result && result.length > 0) {
            const filePath = result[0].fsPath;

            // 检查是否已存在
            if (this.customSoundPaths.includes(filePath)) {
                vscode.window.showInformationMessage('该音效已在列表中');
                await this.setCustomSound(filePath);
                return;
            }

            // 添加到列表
            this.customSoundPaths.push(filePath);
            this.activeCustomSound = filePath;
            this.soundFileCache.set('custom', filePath);

            await this.configService.updateFocusModeConfig({
                typingSound: 'custom',
                customSoundPaths: this.customSoundPaths,
                activeCustomSound: filePath
            });

            this.currentSound = 'custom';
            vscode.window.showInformationMessage(`已添加自定义音效: ${path.basename(filePath)}`);
        }
    }

    /**
     * 设置当前使用的自定义音效
     */
    private async setCustomSound(soundPath: string): Promise<void> {
        this.activeCustomSound = soundPath;
        this.currentSound = 'custom';
        this.soundFileCache.set('custom', soundPath);

        await this.configService.updateFocusModeConfig({
            typingSound: 'custom',
            activeCustomSound: soundPath
        });

        vscode.window.showInformationMessage(`已切换到自定义音效: ${path.basename(soundPath)}`);
    }

    /**
     * 试听指定路径的音效文件
     */
    private previewSoundFile(soundPath: string): void {
        const fs = require('fs');
        if (!fs.existsSync(soundPath)) return;
        this.playSoundFile(soundPath);
    }

    /**
     * 显示音量输入框
     */
    private async showVolumeInput(): Promise<void> {
        const input = await vscode.window.showInputBox({
            prompt: '输入音效音量 (0-100)',
            value: String(this.soundVolume),
            validateInput: (value) => {
                const num = parseInt(value, 10);
                if (isNaN(num) || num < 0 || num > 100) {
                    return '请输入 0-100 之间的数字';
                }
                return null;
            }
        });

        if (input !== undefined) {
            await this.setSoundVolume(parseInt(input, 10));
        }
    }

    /**
     * 获取音效类型的中文名称
     */
    private getSoundName(type: TypingSoundType): string {
        const names: Record<TypingSoundType, string> = {
            none: '关闭',
            mechanical: '机械键盘',
            typewriter: '打字机',
            bubble: '气泡',
            pop: '弹出',
            click: '点击 1',
            click2: '点击 2',
            click3: '点击 3',
            custom: '自定义',
        };
        return names[type] || type;
    }

    /**
     * 获取当前状态
     */
    public getStatus(): {
        typingSound: TypingSoundType;
        volume: number;
    } {
        return {
            typingSound: this.currentSound,
            volume: this.soundVolume
        };
    }

    public dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
