/**
 * 疑问标记 CodeLens 提供器
 * 在有标记的行上方显示操作快捷入口
 */

import * as vscode from 'vscode';
import { findMarksInText } from '../services/doubtMarkService';

export class DoubtMarkCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    provideCodeLenses(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.CodeLens[] {
        const marks = findMarksInText(document.getText());
        const lenses: vscode.CodeLens[] = [];

        for (const mark of marks) {
            if (mark.lineNumber >= document.lineCount) { continue; }
            const range = document.lineAt(mark.lineNumber).range;

            // 构建完整的 DoubtMark 对象供命令使用
            const markData = {
                id: `${document.uri.toString()}:${mark.lineNumber}`,
                fileUri: document.uri,
                fileName: document.uri.fsPath.split('/').pop()?.replace(/\.md$/, '') ?? '',
                lineNumber: mark.lineNumber,
                content: mark.content || '（未填写内容）',
                resolved: mark.resolved,
            };

            if (!mark.resolved) {
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(bookmark) 写作待办',
                    tooltip: mark.content,
                    command: '',
                }));
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(check) 标记已完成',
                    tooltip: '将此待办标为已完成',
                    command: 'noveler.resolveDoubtMark',
                    arguments: [markData],
                }));
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(trash) 删除',
                    tooltip: '删除此写作待办',
                    command: 'noveler.deleteDoubtMark',
                    arguments: [markData],
                }));
            } else {
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(pass) 已完成',
                    tooltip: mark.content,
                    command: '',
                }));
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(debug-restart) 重新打开',
                    tooltip: '重新标记为待处理',
                    command: 'noveler.reopenDoubtMark',
                    arguments: [markData],
                }));
                lenses.push(new vscode.CodeLens(range, {
                    title: '$(trash) 删除',
                    tooltip: '删除此写作待办',
                    command: 'noveler.deleteDoubtMark',
                    arguments: [markData],
                }));
            }
        }

        return lenses;
    }
}
