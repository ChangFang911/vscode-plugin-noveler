import * as vscode from 'vscode';

export interface HighlightStyle {
    color?: string;
    backgroundColor?: string;
    fontStyle?: string;
    fontWeight?: string;
}

export interface NovelConfig {
    highlight?: {
        dialogue?: HighlightStyle;
        thought?: HighlightStyle;
        character?: HighlightStyle;
        ellipsis?: HighlightStyle;
    };
    format?: {
        chineseQuoteStyle?: string;
        autoFormat?: boolean;
        convertQuotes?: boolean; // 是否转换引号
    };
    wordCount?: {
        showInStatusBar?: boolean;
        includePunctuation?: boolean;
    };
    characters?: string[]; // 全局人物名称列表
}

export class ConfigService {
    private static instance: ConfigService;
    private config: NovelConfig = {};
    private fileWatcher?: vscode.FileSystemWatcher;
    private context?: vscode.ExtensionContext;
    private configLoadPromise?: Promise<void>; // 配置加载的 Promise，避免竞态条件

    private constructor() {
        // 先设置默认配置，确保立即可用
        this.setDefaultConfig();
        // 然后异步加载实际配置
        this.configLoadPromise = this.loadConfig();
        this.watchConfig();
    }

    public static getInstance(context?: vscode.ExtensionContext): ConfigService {
        if (!ConfigService.instance) {
            ConfigService.instance = new ConfigService();
        }
        if (context) {
            ConfigService.instance.context = context;
            // 如果有 context，重新加载默认配置
            ConfigService.instance.setDefaultConfig();
            // 重新加载配置
            ConfigService.instance.configLoadPromise = ConfigService.instance.loadConfig();
        }
        return ConfigService.instance;
    }

    /**
     * 等待配置加载完成
     */
    public async waitForConfig(): Promise<void> {
        if (this.configLoadPromise) {
            await this.configLoadPromise;
        }
    }

    private async loadConfig() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const configUri = vscode.Uri.joinPath(workspaceFolder.uri, 'novel.json');

        try {
            const fileData = await vscode.workspace.fs.readFile(configUri);
            const configText = Buffer.from(fileData).toString('utf8');
            const fullConfig = JSON.parse(configText);

            // 提取 noveler 配置部分
            if (fullConfig.noveler) {
                this.config = fullConfig.noveler;
                // 配置加载完成，触发重新加载高亮
                vscode.commands.executeCommand('noveler.reloadHighlights');
            }
        } catch (error) {
            // 配置文件不存在或解析失败，已有默认配置
            console.log('Noveler: 使用默认配置');
        }
    }

    private setDefaultConfig() {
        // 如果有 context，尝试从模板文件读取默认配置
        if (this.context) {
            const templatePath = vscode.Uri.joinPath(this.context.extensionUri, 'templates', 'default-config.json');
            vscode.workspace.fs.readFile(templatePath).then(
                templateData => {
                    const templateText = Buffer.from(templateData).toString('utf8');
                    const templateConfig = JSON.parse(templateText);
                    if (templateConfig.noveler) {
                        this.config = templateConfig.noveler;
                        // 触发重新加载高亮
                        vscode.commands.executeCommand('noveler.reloadHighlights');
                    }
                },
                () => {
                    // 如果读取失败，使用硬编码的默认配置
                    this.setHardcodedDefaultConfig();
                }
            );
        } else {
            // 没有 context，使用硬编码的默认配置
            this.setHardcodedDefaultConfig();
        }
    }

    private setHardcodedDefaultConfig() {
        this.config = {
            highlight: {
                dialogue: {
                    color: "#ce9178",
                    backgroundColor: "rgba(206, 145, 120, 0.15)",
                    fontStyle: "normal"
                },
                thought: {
                    color: "#608b4e",
                    backgroundColor: "rgba(96, 139, 78, 0.15)",
                    fontStyle: "italic"
                },
                character: {
                    color: "#4ec9b0",
                    backgroundColor: "rgba(78, 201, 176, 0.15)",
                    fontWeight: "bold"
                },
                ellipsis: {
                    color: "#569cd6",
                    backgroundColor: "rgba(86, 156, 214, 0.15)",
                    fontWeight: "bold"
                }
            },
            format: {
                chineseQuoteStyle: "「」",
                autoFormat: true,
                convertQuotes: true
            },
            wordCount: {
                showInStatusBar: true,
                includePunctuation: true
            },
            characters: []
        };
    }

    private watchConfig() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const pattern = new vscode.RelativePattern(workspaceFolder, 'novel.json');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidChange(() => {
            this.configLoadPromise = this.loadConfig();
            // 触发重新加载高亮
            vscode.commands.executeCommand('noveler.reloadHighlights');
        });

        this.fileWatcher.onDidCreate(() => {
            this.configLoadPromise = this.loadConfig();
        });
    }

    public getConfig(): NovelConfig {
        return this.config;
    }

    public getHighlightStyle(type: 'dialogue' | 'thought' | 'character' | 'ellipsis'): HighlightStyle {
        return this.config.highlight?.[type] || {};
    }

    public getChineseQuoteStyle(): string {
        return this.config.format?.chineseQuoteStyle || "「」";
    }

    public shouldShowWordCountInStatusBar(): boolean {
        return this.config.wordCount?.showInStatusBar !== false;
    }

    public shouldAutoFormat(): boolean {
        return this.config.format?.autoFormat !== false;
    }

    public getCharacters(): string[] {
        return this.config.characters || [];
    }

    public shouldConvertQuotes(): boolean {
        return this.config.format?.convertQuotes !== false;
    }

    public dispose() {
        this.fileWatcher?.dispose();
    }
}
