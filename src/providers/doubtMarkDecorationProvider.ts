/**
 * 疑问标记编辑器装饰提供器
 * 在编辑器中为 <!--? --> 和 <!--✓ --> 行添加颜色标注
 */

import * as vscode from 'vscode';
import { findMarksInText } from '../services/doubtMarkService';

export class DoubtMarkDecorationProvider {
    private readonly unresolvedDecoration: vscode.TextEditorDecorationType;
    private readonly resolvedDecoration: vscode.TextEditorDecorationType;
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.unresolvedDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            backgroundColor: new vscode.ThemeColor('diffEditor.insertedLineBackground'),
            borderWidth: '0 0 0 3px',
            borderStyle: 'solid',
            borderColor: new vscode.ThemeColor('list.warningForeground'),
            overviewRulerColor: new vscode.ThemeColor('list.warningForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        });

        this.resolvedDecoration = vscode.window.createTextEditorDecorationType({
            isWholeLine: true,
            opacity: '0.5',
            overviewRulerColor: new vscode.ThemeColor('testing.iconPassed'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
        });
    }

    /** 对当前活动编辑器应用装饰 */
    updateDecorations(editor: vscode.TextEditor | undefined): void {
        if (!editor || editor.document.languageId !== 'markdown') { return; }

        const text = editor.document.getText();
        const marks = findMarksInText(text);

        const unresolvedRanges: vscode.Range[] = [];
        const resolvedRanges: vscode.Range[] = [];

        for (const mark of marks) {
            const lineObj = editor.document.lineAt(mark.lineNumber);
            const range = lineObj.range;
            if (mark.resolved) {
                resolvedRanges.push(range);
            } else {
                unresolvedRanges.push(range);
            }
        }

        editor.setDecorations(this.unresolvedDecoration, unresolvedRanges);
        editor.setDecorations(this.resolvedDecoration, resolvedRanges);
    }

    /** 注册到 context，监听编辑器切换和文档变更 */
    register(context: vscode.ExtensionContext): void {
        // 激活时更新当前编辑器
        this.updateDecorations(vscode.window.activeTextEditor);

        // 切换活动编辑器时更新
        this.disposables.push(
            vscode.window.onDidChangeActiveTextEditor(editor => {
                this.updateDecorations(editor);
            })
        );

        // 文档内容变更时更新（含未保存的改动）
        this.disposables.push(
            vscode.workspace.onDidChangeTextDocument(event => {
                const editor = vscode.window.activeTextEditor;
                if (editor && editor.document === event.document) {
                    this.updateDecorations(editor);
                }
            })
        );

        context.subscriptions.push(...this.disposables, this);
    }

    dispose(): void {
        this.unresolvedDecoration.dispose();
        this.resolvedDecoration.dispose();
        for (const d of this.disposables) { d.dispose(); }
    }
}
