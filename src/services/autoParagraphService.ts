import * as vscode from 'vscode';
import { ConfigService } from './configService';
import { PARAGRAPH_INDENT } from '../constants';
import { isChapterFile } from '../utils/volumeHelper';
import { proseQuoteLine } from '../utils/smartQuotes';

export class AutoParagraphService implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[];
    private rules?: vscode.Disposable;
    private key = '';
    private disposed = false;
    private cache?: { document: vscode.TextDocument; version: number; offset: number; prose: boolean };

    constructor(private readonly config: ConfigService,
        private readonly root = vscode.workspace.workspaceFolders?.[0]?.uri) {
        this.subscriptions = [
            vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
            vscode.window.onDidChangeTextEditorSelection(() => this.refresh()),
            vscode.workspace.onDidChangeTextDocument(() => this.refresh()),
            config.onDidChangeConfig(() => this.refresh())
        ];
        this.refresh();
    }

    private isProse(editor: vscode.TextEditor): boolean {
        const document = editor.document;
        const offset = document.offsetAt(editor.selection.active);
        if (this.cache?.document !== document || this.cache.version !== document.version || this.cache.offset !== offset) {
            this.cache = { document, version: document.version, offset,
                prose: proseQuoteLine(document.getText(), offset) !== undefined };
        }
        return this.cache.prose;
    }

    refresh(): void {
        const editor = vscode.window.activeTextEditor;
        const document = editor?.document;
        const emptyLine = this.config.shouldAutoEmptyLine();
        const indent = this.config.shouldParagraphIndent();
        const prefix = this.root && vscode.Uri.joinPath(this.root, 'chapters').toString() + '/';
        const applicable = !this.disposed && (emptyLine || indent) && editor && document?.languageId === 'markdown'
            && prefix && document.uri.toString().startsWith(prefix) && isChapterFile(document.uri.path.split('/').pop() || '')
            && editor.selections.length === 1 && editor.selection.isEmpty
            && this.isProse(editor);
        const key = applicable ? `${emptyLine}:${indent}` : '';
        if (key === this.key) { return; }
        this.rules?.dispose();
        this.rules = undefined;
        this.key = key;
        if (!key) { return; }
        const indentation = indent ? PARAGRAPH_INDENT : '';
        // 原生回车规则只处理用户分段，保存补末尾换行不会再次修改正文。
        this.rules = vscode.languages.setLanguageConfiguration('markdown', {
            onEnterRules: [
                { beforeText: /\S/, action: { indentAction: vscode.IndentAction.None, appendText: (emptyLine ? '\n' : '') + indentation } },
                { beforeText: /^\s*$/, action: { indentAction: vscode.IndentAction.None, appendText: indentation } }
            ]
        });
    }

    dispose(): void {
        this.disposed = true;
        this.rules?.dispose();
        this.rules = undefined;
        this.cache = undefined;
        this.subscriptions.forEach(subscription => subscription.dispose());
    }
}
