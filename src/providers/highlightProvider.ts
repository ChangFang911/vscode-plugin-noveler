import * as vscode from 'vscode';
import { ConfigService } from '../services/configService';
import matter = require('gray-matter');

export class NovelHighlightProvider {
    private dialogueDecorationType!: vscode.TextEditorDecorationType;
    private thoughtDecorationType!: vscode.TextEditorDecorationType;
    private characterDecorationType!: vscode.TextEditorDecorationType;
    private ellipsisDecorationType!: vscode.TextEditorDecorationType;
    private configService: ConfigService;
    private characterNamesCache: string[] = [];
    private lastCacheUpdate: number = 0;
    private readonly CACHE_DURATION = 30000; // 30秒缓存

    constructor() {
        this.configService = ConfigService.getInstance();
        this.createDecorationTypes();
        this.loadCharacterNames(); // 初始化时加载人物名称
    }

    private createDecorationTypes() {
        // 从配置读取样式
        const dialogueStyle = this.configService.getHighlightStyle('dialogue');
        const thoughtStyle = this.configService.getHighlightStyle('thought');
        const characterStyle = this.configService.getHighlightStyle('character');
        const ellipsisStyle = this.configService.getHighlightStyle('ellipsis');

        // 对话高亮
        this.dialogueDecorationType = vscode.window.createTextEditorDecorationType({
            color: dialogueStyle.color,
            backgroundColor: dialogueStyle.backgroundColor,
            fontStyle: dialogueStyle.fontStyle as any
        });

        // 心理描写高亮
        this.thoughtDecorationType = vscode.window.createTextEditorDecorationType({
            color: thoughtStyle.color,
            backgroundColor: thoughtStyle.backgroundColor,
            fontStyle: thoughtStyle.fontStyle as any
        });

        // 人物名称高亮
        this.characterDecorationType = vscode.window.createTextEditorDecorationType({
            color: characterStyle.color,
            backgroundColor: characterStyle.backgroundColor,
            fontWeight: characterStyle.fontWeight as any
        });

        // 省略号高亮
        this.ellipsisDecorationType = vscode.window.createTextEditorDecorationType({
            color: ellipsisStyle.color,
            backgroundColor: ellipsisStyle.backgroundColor,
            fontWeight: ellipsisStyle.fontWeight as any
        });
    }

    public reloadDecorations() {
        // 释放旧的装饰类型
        this.dialogueDecorationType.dispose();
        this.thoughtDecorationType.dispose();
        this.characterDecorationType.dispose();
        this.ellipsisDecorationType.dispose();

        // 重新创建装饰类型
        this.createDecorationTypes();
    }

    // 从 characters/ 目录加载所有人物名称
    private async loadCharacterNames() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return;
        }

        const charactersFolderUri = vscode.Uri.joinPath(workspaceFolder.uri, 'characters');

        try {
            // 检查目录是否存在
            await vscode.workspace.fs.stat(charactersFolderUri);

            // 读取目录中的所有文件
            const files = await vscode.workspace.fs.readDirectory(charactersFolderUri);
            const mdFiles = files.filter(([name, type]) =>
                type === vscode.FileType.File && name.endsWith('.md')
            );

            const names: string[] = [];

            // 遍历所有人物文件，提取 name 字段
            for (const [fileName] of mdFiles) {
                try {
                    const fileUri = vscode.Uri.joinPath(charactersFolderUri, fileName);
                    const fileData = await vscode.workspace.fs.readFile(fileUri);
                    const fileContent = Buffer.from(fileData).toString('utf8');

                    // 使用 gray-matter 解��� Front Matter
                    const parsed = matter(fileContent);
                    if (parsed.data && parsed.data.name) {
                        names.push(parsed.data.name);
                    }
                } catch (error) {
                    console.log(`Noveler: 无法读取人物文件 ${fileName}`);
                }
            }

            this.characterNamesCache = names;
            this.lastCacheUpdate = Date.now();
            console.log(`Noveler: 从 characters/ 目录加载了 ${names.length} 个人物名称:`, names);
        } catch (error) {
            // characters 目录不存在或为空
            console.log('Noveler: characters 目录不存在');
        }
    }

    // 获取人物名称列表（使用缓存）
    private async getCharacterNames(): Promise<string[]> {
        const now = Date.now();
        // 如果缓存过期，重新加载
        if (now - this.lastCacheUpdate > this.CACHE_DURATION) {
            await this.loadCharacterNames();
        }
        return this.characterNamesCache;
    }

    public async updateHighlights(editor: vscode.TextEditor) {
        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        const text = editor.document.getText();
        const dialogueRanges: vscode.Range[] = [];
        const thoughtRanges: vscode.Range[] = [];
        const characterRanges: vscode.Range[] = [];
        const ellipsisRanges: vscode.Range[] = [];

        // 从 characters/ 目录获取人物名称
        const characterNamesFromFiles = await this.getCharacterNames();

        // 从配置文件获取人物名称
        const characterNamesFromConfig = this.configService.getCharacters();

        // 合并两个来源的人物名称，去重
        const allCharacterNames = [...new Set([...characterNamesFromFiles, ...characterNamesFromConfig])];
        const characterNames = allCharacterNames;

        if (characterNames.length > 0) {
            console.log(`Noveler: 合并后的人物名称 (${characterNames.length}个):`, characterNames);
        }

        // 匹配对话（所有常见引号格式）
        // 「」直角引号  ""弯引号  ""左右引号  ''单引号  ""英文引号  \u201c\u201d英文左右双引号  \u2018\u2019英文左右单引号
        const dialogueRegex = /「[^」]*」|"[^"]*"|"[^"]*"|'[^']*'|"[^"]*"|\u201c[^\u201d]*\u201d|\u2018[^\u2019]*\u2019/g;
        let match;
        while ((match = dialogueRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            dialogueRanges.push(new vscode.Range(startPos, endPos));
        }

        // 调试：输出匹配数量
        if (dialogueRanges.length > 0) {
            console.log(`Noveler: 找到 ${dialogueRanges.length} 个对话`);
        }

        // 匹配心理描写（）
        const thoughtRegex = /（[^）]*）/g;
        while ((match = thoughtRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            thoughtRanges.push(new vscode.Range(startPos, endPos));
        }

        // 从 characters/ 目录加载的人物名高亮
        if (characterNames.length > 0) {
            // 转义特殊字符并构建正则
            const escapedNames = characterNames.map(name =>
                name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            );
            const namesPattern = escapedNames.join('|');
            const characterNameRegex = new RegExp(namesPattern, 'g');

            while ((match = characterNameRegex.exec(text)) !== null) {
                const startPos = editor.document.positionAt(match.index);
                const endPos = editor.document.positionAt(match.index + match[0].length);
                characterRanges.push(new vscode.Range(startPos, endPos));
            }
        }

        // 匹配省略号
        const ellipsisRegex = /…+|\.{3,}/g;
        while ((match = ellipsisRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[0].length);
            ellipsisRanges.push(new vscode.Range(startPos, endPos));
        }

        // 应用装饰
        editor.setDecorations(this.dialogueDecorationType, dialogueRanges);
        editor.setDecorations(this.thoughtDecorationType, thoughtRanges);
        editor.setDecorations(this.characterDecorationType, characterRanges);
        editor.setDecorations(this.ellipsisDecorationType, ellipsisRanges);
    }

    public dispose() {
        this.dialogueDecorationType.dispose();
        this.thoughtDecorationType.dispose();
        this.characterDecorationType.dispose();
        this.ellipsisDecorationType.dispose();
    }
}
