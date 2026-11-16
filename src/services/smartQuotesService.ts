import * as vscode from 'vscode';
import { ConfigService } from './configService';
import { isChapterFile } from '../utils/volumeHelper';
import { parse } from 'jsonc-parser';
import { findQuoteExit, proseQuoteLine, quoteInput, QUOTE_PAIRS, QUOTE_CHARACTERS } from '../utils/smartQuotes';
import { Logger } from '../utils/logger';

export class SmartQuotesService implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[] = [];
    private pairing?: vscode.Disposable;
    private pairingKey = '';
    private basePairs?: vscode.AutoClosingPair[];
    private novel = false;
    private disposed = false;
    private lastContext?: boolean;
    private contextQueue: PromiseLike<unknown> = Promise.resolve();
    private cache?: { document: vscode.TextDocument; version: number; offset: number; value: ReturnType<typeof proseQuoteLine> };
    readonly ready: Promise<void>;

    constructor(private readonly config: ConfigService,
        private readonly root = vscode.workspace.workspaceFolders?.[0]?.uri) {
        this.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(() => this.refresh()),
            vscode.window.onDidChangeTextEditorSelection(() => this.refresh()),
            vscode.workspace.onDidChangeTextDocument(() => this.refresh()),
            config.onDidChangeConfig(() => { this.refresh(); void this.checkProject(); })
        );
        this.ready = Promise.all([this.checkProject(), this.loadMarkdownConfiguration()]).then(() => this.refresh());
    }

    private async checkProject(): Promise<void> {
        try { this.novel = !!this.root && (await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.root, 'novel.jsonc'))).type === vscode.FileType.File; }
        catch { this.novel = false; }
        this.refresh();
    }

    private async loadMarkdownConfiguration(): Promise<void> {
        try {
            const markdown = vscode.extensions.getExtension('vscode.markdown') ?? vscode.extensions.getExtension('vscode.markdown-basics');
            const configuration = markdown?.packageJSON.contributes?.languages?.find((language: { id: string }) => language.id === 'markdown')?.configuration;
            if (!markdown || typeof configuration !== 'string') { throw new Error('Markdown 原生语言配置不可用'); }
            const bytes = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(markdown.extensionUri, configuration));
            const errors: import('jsonc-parser').ParseError[] = [];
            const base = parse(Buffer.from(bytes).toString('utf8'), errors) as {
                autoClosingPairs?: ({ open: string; close: string; notIn?: string[] } | [string, string])[];
            };
            if (errors.length || !Array.isArray(base?.autoClosingPairs)) { throw new Error('Markdown 原生配对配置无效'); }
            const tokenTypes: Record<string, vscode.SyntaxTokenType> = {
                string: vscode.SyntaxTokenType.String, comment: vscode.SyntaxTokenType.Comment, regex: vscode.SyntaxTokenType.RegEx
            };
            this.basePairs = base.autoClosingPairs.map(pair => {
                if (Array.isArray(pair)) { return { open: pair[0], close: pair[1] }; }
                return { open: pair.open, close: pair.close, notIn: pair.notIn?.map(token => tokenTypes[token]) };
            });
        } catch (error) {
            Logger.warn(`智能引号保留原生输入：${String(error)}`);
        }
    }

    private editor(): vscode.TextEditor | undefined {
        const editor = vscode.window.activeTextEditor;
        if (this.disposed || !this.novel || !this.root || !this.config.shouldSmartQuotes() || !editor
            || editor.document.languageId !== 'markdown' || editor.document.uri.scheme !== 'file') { return undefined; }
        const prefix = vscode.Uri.joinPath(this.root, 'chapters').toString() + '/';
        const uri = editor.document.uri;
        return uri.toString().startsWith(prefix) && isChapterFile(uri.path.split('/').pop() || '') ? editor : undefined;
    }

    private line(editor: vscode.TextEditor, forInput = false): ReturnType<typeof proseQuoteLine> {
        if (editor.selections.length !== 1 || !editor.selection.isEmpty) { return undefined; }
        const document = editor.document;
        if (!forInput && !Array.from(document.lineAt(editor.selection.active.line).text).some(char => QUOTE_CHARACTERS.has(char))) {
            return undefined;
        }
        const offset = document.offsetAt(editor.selection.active);
        if (this.cache?.document !== document || this.cache.version !== document.version || this.cache.offset !== offset) {
            this.cache = { document, version: document.version, offset, value: proseQuoteLine(document.getText(), offset) };
        }
        return this.cache.value;
    }

    refresh(): void {
        const editor = this.editor();
        const line = editor && this.line(editor, true);
        const pairs = line ? Object.entries(QUOTE_PAIRS)
            .filter(([open, close]) => quoteInput(line.line, line.column, open).text.length === 2 || line.line[line.column] === close)
            .map(([open, close]): vscode.AutoClosingPair => ({ open, close, notIn: [vscode.SyntaxTokenType.String, vscode.SyntaxTokenType.Comment] })) : [];
        const key = this.basePairs && pairs.length ? pairs.map(pair => pair.open).join('') : '';
        if (key !== this.pairingKey) {
            this.pairing?.dispose();
            this.pairing = undefined;
            this.pairingKey = key;
            if (key) {
                // 原生配对保留输入法同步，避免接管 type 命令后破坏普通中文输入。
                this.pairing = vscode.languages.setLanguageConfiguration('markdown', {
                    autoClosingPairs: [...this.basePairs!, ...pairs]
                });
            }
        }
        const canJump = !!line && findQuoteExit(line.line, line.column) !== undefined;
        if (canJump !== this.lastContext) {
            this.lastContext = canJump;
            this.contextQueue = this.contextQueue.then(() => vscode.commands.executeCommand('setContext', 'noveler.canJumpQuote', canJump));
        }
    }

    async jumpOut(): Promise<void> {
        const editor = this.editor();
        const line = editor && this.line(editor);
        const end = line && findQuoteExit(line.line, line.column);
        if (!editor || end === undefined) { await vscode.commands.executeCommand('tab'); return; }
        const after = new vscode.Position(editor.selection.active.line, end + 1);
        editor.selection = new vscode.Selection(after, after);
        editor.revealRange(new vscode.Range(after, after));
        this.refresh();
    }

    dispose(): void {
        this.disposed = true;
        this.pairing?.dispose();
        this.pairing = undefined;
        this.pairingKey = '';
        this.subscriptions.forEach(item => item.dispose());
        this.lastContext = undefined;
        this.refresh();
    }
}
