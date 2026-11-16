import * as assert from 'assert';
import * as vscode from 'vscode';
import { AutoParagraphService } from '../../services/autoParagraphService';
import { SmartQuotesService } from '../../services/smartQuotesService';
import { ConfigService, NovelConfig } from '../../services/configService';
import { createTestWorkspace, removeTestWorkspace, readTestFile, writeTestFile, undoDocumentChange } from './testWorkspace';

suite('Native paragraph and save integration', () => {
    let root: vscode.Uri;
    let service: AutoParagraphService;
    let changes: vscode.EventEmitter<NovelConfig>;
    let emptyLine: boolean;
    let indent: boolean;
    let config: ConfigService;
    let counter = 0;
    setup(async () => {
        root = await createTestWorkspace();
        changes = new vscode.EventEmitter<NovelConfig>();
        emptyLine = true;
        indent = true;
        config = { shouldAutoEmptyLine: () => emptyLine, shouldParagraphIndent: () => indent, shouldSmartQuotes: () => true,
            onDidChangeConfig: changes.event } as ConfigService;
        service = new AutoParagraphService(config, root);
    });
    teardown(async () => {
        service.dispose(); changes.dispose();
        await removeTestWorkspace(root);
    });
    async function open(text: string, path = `chapters/分段${++counter}.md`) {
        const uri = vscode.Uri.joinPath(root, path);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
        await writeTestFile(uri, text);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        const end = document.positionAt(text.length);
        editor.selection = new vscode.Selection(end, end);
        service.refresh();
        return editor;
    }
    for (const [spacing, indentation, suffix] of [[true, true, '\n\n　　'], [true, false, '\n\n'],
        [false, true, '\n　　'], [false, false, '\n']] as const) {
        test(`real Enter respects spacing=${spacing}, indent=${indentation} and one undo`, async () => {
            emptyLine = spacing; indent = indentation;
            const editor = await open('正文');
            await vscode.commands.executeCommand('type', { text: '\n' });
            assert.strictEqual(editor.document.getText(), '正文' + suffix);
            assert.strictEqual(editor.document.offsetAt(editor.selection.active), editor.document.getText().length);
            await undoDocumentChange(editor.document, '正文');
        });
    }
    test('Enter inside a paragraph splits prose without dropping the suffix', async () => {
        const editor = await open('正文结尾');
        editor.selection = new vscode.Selection(0, 2, 0, 2);
        service.refresh();
        await vscode.commands.executeCommand('type', { text: '\n' });
        assert.strictEqual(editor.document.getText(), '正文\n\n　　结尾');
    });
    test('Enter on an empty indented paragraph adds no extra empty paragraph', async () => {
        const editor = await open('　　');
        await vscode.commands.executeCommand('type', { text: '\n' });
        assert.strictEqual(editor.document.getText(), '　　\n　　');
    });
    for (const [text, path] of [['# 标题', 'chapters/标题.md'], ['```\n内容', 'chapters/代码.md'],
        ['# 人物\n正文', 'characters/人物.md'], ['# 大纲\n正文', 'chapters/outline.md']]) {
        test(`protected editing remains native in ${path}`, async () => {
            const editor = await open(text, path);
            await vscode.commands.executeCommand('type', { text: '\n' });
            assert.strictEqual(editor.document.getText(), text + '\n');
        });
    }
    test('disabling options restores native Enter without rewriting project settings', async () => {
        const configUri = vscode.Uri.joinPath(root, 'novel.jsonc');
        const original = await readTestFile(configUri);
        const editor = await open('正文');
        emptyLine = false; indent = false; changes.fire({});
        await vscode.commands.executeCommand('type', { text: '\n' });
        assert.strictEqual(editor.document.getText(), '正文\n');
        assert.strictEqual(await readTestFile(configUri), original);
    });
    test('native Enter coexists with smart quote pairing and Tab', async () => {
        const quotes = new SmartQuotesService(config, root);
        try {
            await quotes.ready;
            const editor = await open('');
            await vscode.commands.executeCommand('type', { text: '“' });
            await vscode.commands.executeCommand('type', { text: '你好' });
            await quotes.jumpOut();
            await vscode.commands.executeCommand('type', { text: '\n' });
            assert.strictEqual(editor.document.getText(), '“你好”\n\n　　');
        } finally { quotes.dispose(); }
    });
    for (const formatOnSave of [false, true]) {
        test(`autosave adds only the final newline and settles clean with formatOnSave=${formatOnSave}`, async () => {
            const files = vscode.workspace.getConfiguration('files');
            const editorConfig = vscode.workspace.getConfiguration('editor');
            const previous = {
                mode: files.inspect<string>('autoSave')?.workspaceValue,
                delay: files.inspect<number>('autoSaveDelay')?.workspaceValue,
                newline: files.inspect<boolean>('insertFinalNewline')?.workspaceValue,
                format: editorConfig.inspect<boolean>('formatOnSave')?.workspaceValue,
                formatter: editorConfig.inspect<string>('defaultFormatter')?.workspaceValue
            };
            let listener: vscode.Disposable | undefined;
            let timer: ReturnType<typeof setTimeout> | undefined;
            try {
                await files.update('autoSaveDelay', 200, vscode.ConfigurationTarget.Workspace);
                await files.update('insertFinalNewline', true, vscode.ConfigurationTarget.Workspace);
                await files.update('autoSave', 'afterDelay', vscode.ConfigurationTarget.Workspace);
                await editorConfig.update('defaultFormatter', 'chang.chinese-novel-writer', vscode.ConfigurationTarget.Workspace);
                await editorConfig.update('formatOnSave', formatOnSave, vscode.ConfigurationTarget.Workspace);
                const editor = await open('# 第一章\n\n　　正文');
                const document = editor.document;
                let saves = 0;
                const saved = new Promise<void>((resolve, reject) => {
                    listener = vscode.workspace.onDidSaveTextDocument(candidate => {
                        if (candidate === document) { saves++; resolve(); }
                    });
                    timer = setTimeout(() => reject(new Error('自动保存未完成')), 8000);
                });
                await editor.edit(edit => edit.insert(document.positionAt(document.getText().length), '新增'));
                await saved;
                const snapshot = document.getText();
                assert.ok(snapshot.endsWith('正文新增\n'));
                await new Promise(resolve => setTimeout(resolve, 700));
                assert.strictEqual(document.getText(), snapshot);
                assert.strictEqual(document.isDirty, false);
                assert.strictEqual(saves, 1);
                assert.strictEqual(await readTestFile(document.uri), snapshot);
                await document.save();
                await new Promise(resolve => setTimeout(resolve, 300));
                assert.ok(document.getText().endsWith('正文新增\n'));
                assert.strictEqual(document.isDirty, false);
            } finally {
                listener?.dispose(); clearTimeout(timer);
                await files.update('autoSave', previous.mode, vscode.ConfigurationTarget.Workspace);
                await files.update('autoSaveDelay', previous.delay, vscode.ConfigurationTarget.Workspace);
                await files.update('insertFinalNewline', previous.newline, vscode.ConfigurationTarget.Workspace);
                await editorConfig.update('formatOnSave', previous.format, vscode.ConfigurationTarget.Workspace);
                await editorConfig.update('defaultFormatter', previous.formatter, vscode.ConfigurationTarget.Workspace);
            }
        });
    }
});
