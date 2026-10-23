import * as vscode from 'vscode';
import { ConfigService } from './configService';
import { isChapterFile } from '../utils/volumeHelper';
import { findQuoteExit, proseQuoteLine, quoteInput, QUOTE_CHARACTERS } from '../utils/smartQuotes';
import { Logger } from '../utils/logger';

export class SmartQuotesService implements vscode.Disposable {
    private readonly subscriptions: vscode.Disposable[] = [];
    private typing?: vscode.Disposable;
    private novel = false;
    private disposed = false;
    private failedEditor?: string;
    private conflictNotified = false;
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
        this.ready = this.checkProject();
    }

    private async checkProject(): Promise<void> {
        try { this.novel = !!this.root && (await vscode.workspace.fs.stat(vscode.Uri.joinPath(this.root, 'novel.jsonc'))).type === vscode.FileType.File; }
        catch { this.novel = false; }
        this.refresh();
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
        if (!editor) {
            this.typing?.dispose(); this.typing = undefined; this.failedEditor = undefined;
        } else if (!this.typing && this.failedEditor !== editor.document.uri.toString()) {
            try { this.typing = vscode.commands.registerCommand('type', args => this.type(args)); }
            catch (error) {
                this.failedEditor = editor.document.uri.toString();
                Logger.warn(`智能引号未接管已有输入扩展：${String(error)}`);
                if (!this.conflictNotified) {
                    this.conflictNotified = true;
                    void vscode.window.showWarningMessage('智能引号自动补齐未启用：另一个输入扩展正在处理键盘。已有引号仍可用 Tab 跳出。');
                }
            }
        }
        const line = editor && this.line(editor);
        const canJump = !!line && findQuoteExit(line.line, line.column) !== undefined;
        if (canJump !== this.lastContext) {
            this.lastContext = canJump;
            this.contextQueue = this.contextQueue.then(() => vscode.commands.executeCommand('setContext', 'noveler.canJumpQuote', canJump));
        }
    }

    private async type(args: { text: string }): Promise<void> {
        if (typeof args?.text !== 'string' || args.text.length !== 1 || !QUOTE_CHARACTERS.has(args.text)) {
            await vscode.commands.executeCommand('default:type', args); return;
        }
        const editor = this.editor();
        const line = editor && this.line(editor, true);
        if (!editor || !line) {
            await vscode.commands.executeCommand('default:type', args); return;
        }
        const input = quoteInput(line.line, line.column, args.text);
        const before = editor.selection.active;
        await vscode.commands.executeCommand('default:type', { ...args, text: input.text });
        if (input.text.length === 2 && editor === vscode.window.activeTextEditor
            && editor.selection.active.isEqual(before.translate(0, 2))) {
            const middle = before.translate(0, 1);
            editor.selection = new vscode.Selection(middle, middle);
        }
        this.refresh();
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
        this.typing?.dispose();
        this.subscriptions.forEach(item => item.dispose());
        this.lastContext = undefined;
        this.refresh();
    }
}
