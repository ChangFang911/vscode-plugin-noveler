import * as vscode from 'vscode';

export class NovelHighlightProvider {
    private dialogueDecorationType: vscode.TextEditorDecorationType;
    private thoughtDecorationType: vscode.TextEditorDecorationType;
    private characterDecorationType: vscode.TextEditorDecorationType;
    private ellipsisDecorationType: vscode.TextEditorDecorationType;

    constructor() {
        // 对话高亮 - 使用更明显的颜色和背景
        this.dialogueDecorationType = vscode.window.createTextEditorDecorationType({
            color: '#ce9178',
            backgroundColor: 'rgba(206, 145, 120, 0.15)',
            fontStyle: 'normal'
        });

        // 心理描写高亮 - 使用斜体和背景
        this.thoughtDecorationType = vscode.window.createTextEditorDecorationType({
            color: '#608b4e',
            backgroundColor: 'rgba(96, 139, 78, 0.15)',
            fontStyle: 'italic'
        });

        // 人物名称高亮 - 使用加粗和背景
        this.characterDecorationType = vscode.window.createTextEditorDecorationType({
            color: '#4ec9b0',
            backgroundColor: 'rgba(78, 201, 176, 0.15)',
            fontWeight: 'bold'
        });

        // 省略号高亮
        this.ellipsisDecorationType = vscode.window.createTextEditorDecorationType({
            color: '#569cd6',
            backgroundColor: 'rgba(86, 156, 214, 0.15)',
            fontWeight: 'bold'
        });
    }

    public updateHighlights(editor: vscode.TextEditor) {
        if (!editor || editor.document.languageId !== 'markdown') {
            return;
        }

        const text = editor.document.getText();
        const dialogueRanges: vscode.Range[] = [];
        const thoughtRanges: vscode.Range[] = [];
        const characterRanges: vscode.Range[] = [];
        const ellipsisRanges: vscode.Range[] = [];

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

        // 匹配人物名称（需要在对话或标点后面，避免误匹配）
        const characterRegex = /(?<=^|[，。！？：」"\n\s])([\u4e00-\u9fa5]{2,4})(?=说道|问道|答道|喊道|叫道|笑道|哭道|想道|低声说|大声说|轻声说|悄声说|冷冷地说|温柔地说|愤怒地说)/gm;
        while ((match = characterRegex.exec(text)) !== null) {
            const startPos = editor.document.positionAt(match.index);
            const endPos = editor.document.positionAt(match.index + match[1].length);
            characterRanges.push(new vscode.Range(startPos, endPos));
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
