/**
 * VSCode API Mock
 * 用于单元测试的 VSCode API 模拟实现
 */

import * as sinon from 'sinon';

/**
 * 模拟 VSCode Uri
 */
export class MockUri {
    readonly scheme: string = 'file';
    readonly authority: string = '';
    readonly path: string;
    readonly query: string = '';
    readonly fragment: string = '';
    readonly fsPath: string;

    constructor(path: string) {
        this.path = path;
        this.fsPath = path;
    }

    toString(): string {
        return `file://${this.path}`;
    }

    static file(path: string): MockUri {
        return new MockUri(path);
    }

    static joinPath(base: MockUri, ...pathSegments: string[]): MockUri {
        const segments = [base.path, ...pathSegments];
        const joinedPath = segments.join('/').replace(/\/+/g, '/');
        return new MockUri(joinedPath);
    }
}

/**
 * 模拟 VSCode Position
 */
export class MockPosition {
    constructor(
        public readonly line: number,
        public readonly character: number
    ) {}

    isEqual(other: MockPosition): boolean {
        return this.line === other.line && this.character === other.character;
    }

    isBefore(other: MockPosition): boolean {
        return this.line < other.line ||
            (this.line === other.line && this.character < other.character);
    }

    isAfter(other: MockPosition): boolean {
        return this.line > other.line ||
            (this.line === other.line && this.character > other.character);
    }
}

/**
 * 模拟 VSCode Range
 */
export class MockRange {
    readonly start: MockPosition;
    readonly end: MockPosition;

    constructor(
        startLine: number,
        startCharacter: number,
        endLine: number,
        endCharacter: number
    );
    constructor(start: MockPosition, end: MockPosition);
    constructor(
        startOrLine: number | MockPosition,
        startCharOrEnd: number | MockPosition,
        endLine?: number,
        endCharacter?: number
    ) {
        if (typeof startOrLine === 'number') {
            this.start = new MockPosition(startOrLine, startCharOrEnd as number);
            this.end = new MockPosition(endLine!, endCharacter!);
        } else {
            this.start = startOrLine;
            this.end = startCharOrEnd as MockPosition;
        }
    }

    get isEmpty(): boolean {
        return this.start.isEqual(this.end);
    }

    contains(positionOrRange: MockPosition | MockRange): boolean {
        if (positionOrRange instanceof MockPosition) {
            return !positionOrRange.isBefore(this.start) && !positionOrRange.isAfter(this.end);
        }
        return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }
}

/**
 * 模拟 VSCode TextLine
 */
export class MockTextLine {
    constructor(
        public readonly lineNumber: number,
        public readonly text: string,
        public readonly range: MockRange,
        public readonly rangeIncludingLineBreak: MockRange,
        public readonly firstNonWhitespaceCharacterIndex: number,
        public readonly isEmptyOrWhitespace: boolean
    ) {}

    static create(lineNumber: number, text: string): MockTextLine {
        const range = new MockRange(lineNumber, 0, lineNumber, text.length);
        const rangeWithBreak = new MockRange(lineNumber, 0, lineNumber, text.length + 1);
        const firstNonWs = text.search(/\S/);
        return new MockTextLine(
            lineNumber,
            text,
            range,
            rangeWithBreak,
            firstNonWs === -1 ? text.length : firstNonWs,
            text.trim().length === 0
        );
    }
}

/**
 * 模拟 VSCode TextDocument
 */
export class MockTextDocument {
    private _lines: string[];
    private _version: number = 1;

    constructor(
        public readonly uri: MockUri,
        private _content: string,
        public readonly languageId: string = 'markdown',
        public readonly fileName: string = ''
    ) {
        this._lines = _content.split('\n');
    }

    get version(): number {
        return this._version;
    }

    get lineCount(): number {
        return this._lines.length;
    }

    getText(range?: MockRange): string {
        if (!range) {
            return this._content;
        }
        const startOffset = this.offsetAt(range.start);
        const endOffset = this.offsetAt(range.end);
        return this._content.substring(startOffset, endOffset);
    }

    lineAt(lineOrPosition: number | MockPosition): MockTextLine {
        const lineNumber = typeof lineOrPosition === 'number'
            ? lineOrPosition
            : lineOrPosition.line;
        return MockTextLine.create(lineNumber, this._lines[lineNumber] || '');
    }

    positionAt(offset: number): MockPosition {
        let line = 0;
        let char = 0;
        let remaining = offset;

        for (let i = 0; i < this._lines.length; i++) {
            const lineLength = this._lines[i].length + 1; // +1 for newline
            if (remaining < lineLength) {
                char = remaining;
                break;
            }
            remaining -= lineLength;
            line++;
        }

        return new MockPosition(line, char);
    }

    offsetAt(position: MockPosition): number {
        let offset = 0;
        for (let i = 0; i < position.line && i < this._lines.length; i++) {
            offset += this._lines[i].length + 1; // +1 for newline
        }
        offset += Math.min(position.character, (this._lines[position.line] || '').length);
        return offset;
    }

    getWordRangeAtPosition(position: MockPosition): MockRange | undefined {
        const line = this._lines[position.line];
        if (!line) return undefined;

        // 简单实现：查找位置处的单词边界
        let start = position.character;
        let end = position.character;

        while (start > 0 && /\w/.test(line[start - 1])) {
            start--;
        }
        while (end < line.length && /\w/.test(line[end])) {
            end++;
        }

        if (start === end) return undefined;
        return new MockRange(position.line, start, position.line, end);
    }

    // 用于测试：更新内容
    _updateContent(content: string): void {
        this._content = content;
        this._lines = content.split('\n');
        this._version++;
    }

    // 创建工厂方法
    static create(content: string, languageId: string = 'markdown'): MockTextDocument {
        const uri = MockUri.file(`/test/document-${Date.now()}.md`);
        return new MockTextDocument(uri, content, languageId, uri.fsPath);
    }
}

/**
 * 模拟 VSCode EventEmitter
 */
export class MockEventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];

    get event(): (listener: (e: T) => void) => { dispose: () => void } {
        return (listener) => {
            this.listeners.push(listener);
            return {
                dispose: () => {
                    const index = this.listeners.indexOf(listener);
                    if (index !== -1) {
                        this.listeners.splice(index, 1);
                    }
                }
            };
        };
    }

    fire(data: T): void {
        this.listeners.forEach(listener => listener(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}

/**
 * 模拟 VSCode DiagnosticCollection
 */
export class MockDiagnosticCollection {
    private _name: string;
    private _diagnostics = new Map<string, MockDiagnostic[]>();

    constructor(name: string) {
        this._name = name;
    }

    get name(): string {
        return this._name;
    }

    set(uri: MockUri, diagnostics: MockDiagnostic[]): void {
        this._diagnostics.set(uri.toString(), diagnostics);
    }

    delete(uri: MockUri): void {
        this._diagnostics.delete(uri.toString());
    }

    clear(): void {
        this._diagnostics.clear();
    }

    get(uri: MockUri): MockDiagnostic[] | undefined {
        return this._diagnostics.get(uri.toString());
    }

    forEach(callback: (uri: MockUri, diagnostics: MockDiagnostic[]) => void): void {
        this._diagnostics.forEach((diags, uriStr) => {
            callback(new MockUri(uriStr.replace('file://', '')), diags);
        });
    }

    dispose(): void {
        this._diagnostics.clear();
    }
}

/**
 * 模拟 VSCode Diagnostic
 */
export class MockDiagnostic {
    code?: string | number;
    source?: string;
    tags?: number[];
    relatedInformation?: unknown[];

    constructor(
        public range: MockRange,
        public message: string,
        public severity: MockDiagnosticSeverity = MockDiagnosticSeverity.Error
    ) {}
}

/**
 * 模拟 VSCode DiagnosticSeverity
 */
export enum MockDiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3
}

/**
 * 模拟 VSCode DiagnosticTag
 */
export enum MockDiagnosticTag {
    Unnecessary = 1,
    Deprecated = 2
}

/**
 * 模拟 VSCode StatusBarItem
 */
export class MockStatusBarItem {
    text: string = '';
    tooltip: string = '';
    command: string | undefined;
    private _visible: boolean = false;

    show(): void {
        this._visible = true;
    }

    hide(): void {
        this._visible = false;
    }

    get isVisible(): boolean {
        return this._visible;
    }

    dispose(): void {
        this._visible = false;
    }
}

/**
 * 模拟 VSCode StatusBarAlignment
 */
export enum MockStatusBarAlignment {
    Left = 1,
    Right = 2
}

/**
 * 模拟 VSCode WorkspaceEdit
 */
export class MockWorkspaceEdit {
    private edits: Array<{ uri: MockUri; edits: Array<{ range: MockRange; newText: string }> }> = [];

    replace(uri: MockUri, range: MockRange, newText: string): void {
        let entry = this.edits.find(e => e.uri.toString() === uri.toString());
        if (!entry) {
            entry = { uri, edits: [] };
            this.edits.push(entry);
        }
        entry.edits.push({ range, newText });
    }

    delete(uri: MockUri, range: MockRange): void {
        this.replace(uri, range, '');
    }

    set(uri: MockUri, edits: Array<{ range: MockRange; newText: string }>): void {
        const entry = this.edits.find(e => e.uri.toString() === uri.toString());
        if (entry) {
            entry.edits = edits;
        } else {
            this.edits.push({ uri, edits });
        }
    }

    getEdits(): typeof this.edits {
        return this.edits;
    }
}

/**
 * 模拟 VSCode CodeAction
 */
export class MockCodeAction {
    edit?: MockWorkspaceEdit;
    diagnostics?: MockDiagnostic[];
    command?: { command: string; title: string; arguments?: unknown[] };
    isPreferred?: boolean;

    constructor(
        public title: string,
        public kind?: MockCodeActionKind
    ) {}
}

/**
 * 模拟 VSCode CodeActionKind
 */
export class MockCodeActionKind {
    static readonly QuickFix = new MockCodeActionKind('quickfix');
    static readonly Refactor = new MockCodeActionKind('refactor');
    static readonly Source = new MockCodeActionKind('source');

    constructor(public readonly value: string) {}

    append(parts: string): MockCodeActionKind {
        return new MockCodeActionKind(`${this.value}.${parts}`);
    }
}

/**
 * 模拟 workspace.fs
 */
export interface MockFileSystem {
    readFile: sinon.SinonStub;
    writeFile: sinon.SinonStub;
    stat: sinon.SinonStub;
    createDirectory: sinon.SinonStub;
    delete: sinon.SinonStub;
    readDirectory: sinon.SinonStub;
}

export function createMockFileSystem(): MockFileSystem {
    return {
        readFile: sinon.stub(),
        writeFile: sinon.stub(),
        stat: sinon.stub(),
        createDirectory: sinon.stub(),
        delete: sinon.stub(),
        readDirectory: sinon.stub()
    };
}

/**
 * 模拟 vscode.window
 */
export interface MockWindow {
    showInformationMessage: sinon.SinonStub;
    showWarningMessage: sinon.SinonStub;
    showErrorMessage: sinon.SinonStub;
    showInputBox: sinon.SinonStub;
    showQuickPick: sinon.SinonStub;
    createStatusBarItem: sinon.SinonStub;
    activeTextEditor: MockTextEditor | undefined;
    onDidChangeActiveTextEditor: MockEventEmitter<MockTextEditor | undefined>;
}

export function createMockWindow(): MockWindow {
    const statusBarItem = new MockStatusBarItem();
    return {
        showInformationMessage: sinon.stub().resolves(),
        showWarningMessage: sinon.stub().resolves(),
        showErrorMessage: sinon.stub().resolves(),
        showInputBox: sinon.stub().resolves(),
        showQuickPick: sinon.stub().resolves(),
        createStatusBarItem: sinon.stub().returns(statusBarItem),
        activeTextEditor: undefined,
        onDidChangeActiveTextEditor: new MockEventEmitter<MockTextEditor | undefined>()
    };
}

/**
 * 模拟 TextEditor
 */
export interface MockTextEditor {
    document: MockTextDocument;
    selection: MockSelection;
    selections: MockSelection[];
}

/**
 * 模拟 Selection
 */
export class MockSelection extends MockRange {
    readonly anchor: MockPosition;
    readonly active: MockPosition;
    readonly isReversed: boolean;

    constructor(anchorLine: number, anchorChar: number, activeLine: number, activeChar: number) {
        const start = new MockPosition(
            Math.min(anchorLine, activeLine),
            anchorLine === activeLine ? Math.min(anchorChar, activeChar) : (anchorLine < activeLine ? anchorChar : activeChar)
        );
        const end = new MockPosition(
            Math.max(anchorLine, activeLine),
            anchorLine === activeLine ? Math.max(anchorChar, activeChar) : (anchorLine > activeLine ? anchorChar : activeChar)
        );
        super(start, end);
        this.anchor = new MockPosition(anchorLine, anchorChar);
        this.active = new MockPosition(activeLine, activeChar);
        this.isReversed = anchorLine > activeLine || (anchorLine === activeLine && anchorChar > activeChar);
    }
}

/**
 * 模拟 vscode.workspace
 */
export interface MockWorkspace {
    workspaceFolders: Array<{ uri: MockUri; name: string; index: number }> | undefined;
    fs: MockFileSystem;
    openTextDocument: sinon.SinonStub;
    applyEdit: sinon.SinonStub;
    createFileSystemWatcher: sinon.SinonStub;
    onDidOpenTextDocument: MockEventEmitter<MockTextDocument>;
    onDidCloseTextDocument: MockEventEmitter<MockTextDocument>;
    onDidChangeTextDocument: MockEventEmitter<{ document: MockTextDocument }>;
    onDidSaveTextDocument: MockEventEmitter<MockTextDocument>;
}

export function createMockWorkspace(workspacePath?: string): MockWorkspace {
    return {
        workspaceFolders: workspacePath ? [{
            uri: MockUri.file(workspacePath),
            name: 'test-workspace',
            index: 0
        }] : undefined,
        fs: createMockFileSystem(),
        openTextDocument: sinon.stub(),
        applyEdit: sinon.stub().resolves(true),
        createFileSystemWatcher: sinon.stub().returns({
            onDidChange: sinon.stub(),
            onDidCreate: sinon.stub(),
            onDidDelete: sinon.stub(),
            dispose: sinon.stub()
        }),
        onDidOpenTextDocument: new MockEventEmitter<MockTextDocument>(),
        onDidCloseTextDocument: new MockEventEmitter<MockTextDocument>(),
        onDidChangeTextDocument: new MockEventEmitter<{ document: MockTextDocument }>(),
        onDidSaveTextDocument: new MockEventEmitter<MockTextDocument>()
    };
}

/**
 * 模拟 vscode.commands
 */
export interface MockCommands {
    registerCommand: sinon.SinonStub;
    executeCommand: sinon.SinonStub;
}

export function createMockCommands(): MockCommands {
    return {
        registerCommand: sinon.stub().returns({ dispose: () => {} }),
        executeCommand: sinon.stub().resolves()
    };
}

/**
 * 模拟 vscode.languages
 */
export interface MockLanguages {
    createDiagnosticCollection: sinon.SinonStub;
    registerCodeActionsProvider: sinon.SinonStub;
    registerDocumentFormattingEditProvider: sinon.SinonStub;
}

export function createMockLanguages(): MockLanguages {
    return {
        createDiagnosticCollection: sinon.stub().callsFake((name: string) => new MockDiagnosticCollection(name)),
        registerCodeActionsProvider: sinon.stub().returns({ dispose: () => {} }),
        registerDocumentFormattingEditProvider: sinon.stub().returns({ dispose: () => {} })
    };
}

/**
 * 模拟 vscode.ExtensionContext
 */
export interface MockExtensionContext {
    subscriptions: Array<{ dispose: () => void }>;
    extensionUri: MockUri;
    extensionPath: string;
    globalState: {
        get: sinon.SinonStub;
        update: sinon.SinonStub;
    };
    workspaceState: {
        get: sinon.SinonStub;
        update: sinon.SinonStub;
    };
}

export function createMockExtensionContext(extensionPath: string = '/test/extension'): MockExtensionContext {
    return {
        subscriptions: [],
        extensionUri: MockUri.file(extensionPath),
        extensionPath,
        globalState: {
            get: sinon.stub(),
            update: sinon.stub().resolves()
        },
        workspaceState: {
            get: sinon.stub(),
            update: sinon.stub().resolves()
        }
    };
}

/**
 * 完整的 VSCode API Mock
 */
export interface VSCodeMock {
    Uri: typeof MockUri;
    Position: typeof MockPosition;
    Range: typeof MockRange;
    Selection: typeof MockSelection;
    Diagnostic: typeof MockDiagnostic;
    DiagnosticSeverity: typeof MockDiagnosticSeverity;
    DiagnosticTag: typeof MockDiagnosticTag;
    StatusBarAlignment: typeof MockStatusBarAlignment;
    WorkspaceEdit: typeof MockWorkspaceEdit;
    CodeAction: typeof MockCodeAction;
    CodeActionKind: typeof MockCodeActionKind;
    EventEmitter: typeof MockEventEmitter;
    window: MockWindow;
    workspace: MockWorkspace;
    commands: MockCommands;
    languages: MockLanguages;
}

export function createVSCodeMock(workspacePath?: string): VSCodeMock {
    return {
        Uri: MockUri,
        Position: MockPosition,
        Range: MockRange,
        Selection: MockSelection,
        Diagnostic: MockDiagnostic,
        DiagnosticSeverity: MockDiagnosticSeverity,
        DiagnosticTag: MockDiagnosticTag,
        StatusBarAlignment: MockStatusBarAlignment,
        WorkspaceEdit: MockWorkspaceEdit,
        CodeAction: MockCodeAction,
        CodeActionKind: MockCodeActionKind,
        EventEmitter: MockEventEmitter,
        window: createMockWindow(),
        workspace: createMockWorkspace(workspacePath),
        commands: createMockCommands(),
        languages: createMockLanguages()
    };
}
