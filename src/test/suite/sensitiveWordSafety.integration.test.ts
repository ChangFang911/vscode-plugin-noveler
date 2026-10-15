import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { parse } from 'jsonc-parser';
import { NovelHighlightProvider } from '../../providers/highlightProvider';
import { ConfigService } from '../../services/configService';
import { SensitiveWordService } from '../../services/sensitiveWordService';
import { SensitiveWordDiagnosticProvider } from '../../providers/sensitiveWordDiagnostic';
import { SensitiveWordCodeActionProvider, applySensitiveWordFix, SensitiveWordFix } from '../../providers/sensitiveWordCodeAction';
import { addToWhitelist, addToCustomWords } from '../../commands/addToSensitiveWordsCommand';
import { TrieTree } from '../../utils/trieTree';
import { SimpleTrieTree } from '../../utils/simpleTrieTree';
import { applyDocumentChange, documentIO } from '../../utils/documentOperations';
import { createTestWorkspace, removeTestWorkspace, writeTestFile, undoDocumentChange } from './testWorkspace';

suite('Sensitive Word Safety Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    let service: SensitiveWordService;
    let diagnosticProvider: SensitiveWordDiagnosticProvider;
    let diagnostics: vscode.Diagnostic[];
    let createCollection: typeof vscode.languages.createDiagnosticCollection;
    const file = (...parts: string[]) => vscode.Uri.joinPath(root, ...parts);

    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, name: '安全验证', index: 0 });
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        const execute = vscode.commands.executeCommand.bind(vscode.commands);
        sandbox.stub(vscode.commands, 'executeCommand').callsFake((command: string, ...args: unknown[]) =>
            command === 'noveler.reloadSensitiveWords' ? Promise.resolve() : execute(command, ...args));
        const trie = new TrieTree();
        trie.insert('小王', 'high');
        trie.insert('小王子', 'medium');
        service = Object.assign(Object.create(SensitiveWordService.prototype), {
            trie, whitelist: new Set<string>(), config: { enabled: true, checkOnType: true, checkOnSave: true,
                whitelist: { enabled: true, path: '.noveler/sensitive-words/whitelist.jsonc' },
                customLibrary: { enabled: true, path: '.noveler/sensitive-words/custom-words.jsonc' },
                display: { severity: 'Warning', showWordCount: false } }
        });
        sandbox.stub(SensitiveWordService, 'getInstance').returns(service);
        diagnostics = [];
        createCollection = vscode.languages.createDiagnosticCollection.bind(vscode.languages);
        sandbox.stub(vscode.languages, 'createDiagnosticCollection').returns({
            set: (_uri: vscode.Uri, values: vscode.Diagnostic[]) => { diagnostics = values; },
            delete: () => { diagnostics = []; }, clear: () => { diagnostics = []; }, dispose: () => undefined
        } as unknown as vscode.DiagnosticCollection);
        diagnosticProvider = new SensitiveWordDiagnosticProvider(service);
    });
    teardown(async () => {
        diagnosticProvider?.dispose();
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function chapter(text: string) {
        const uri = file('chapters', '匹配验证.md');
        await writeTestFile(uri, text);
        return vscode.workspace.openTextDocument(uri);
    }
    function actions(document: vscode.TextDocument, values = diagnostics) {
        return new SensitiveWordCodeActionProvider(diagnosticProvider).provideCodeActions(document,
            new vscode.Range(0, 0, document.lineCount, 0),
            { diagnostics: values, triggerKind: vscode.CodeActionTriggerKind.Invoke, only: undefined },
            {} as vscode.CancellationToken);
    }
    test('real detection chooses the longer name with exact CRLF and emoji offsets', async () => {
        const document = await chapter('---\r\ntitle: 小王子\r\n---\r\n😀小王子遇见小王，小王子。');
        const matches = service.detect(document);
        assert.deepStrictEqual(matches.map(match => [match.word, match.level]), [
            ['小王子', 'medium'], ['小王', 'high'], ['小王子', 'medium']
        ]);
        for (const match of matches) {
            assert.strictEqual(document.getText().slice(match.start, match.end), match.word);
        }
        diagnosticProvider.updateDiagnostics(document);
        assert.deepStrictEqual(diagnostics.map(diagnostic => document.getText(diagnostic.range)), ['小王子', '小王', '小王子']);
        assert.strictEqual(actions(document).length, 12);
    });
    test('stale diagnostics cannot offer fixes for text moved by an edit', async () => {
        const document = await chapter('小王子走过。');
        diagnosticProvider.updateDiagnostics(document);
        const old = [...diagnostics];
        await applyDocumentChange(document.uri, text => '前言' + text);
        assert.deepStrictEqual(actions(document, old), []);
    });
    test('old diagnostics are rejected even when another identical word remains at the same range', async () => {
        const document = await chapter('小王子和小王。');
        diagnosticProvider.updateDiagnostics(document);
        const old = [...diagnostics];
        await applyDocumentChange(document.uri, text => text + '新正文');
        assert.deepStrictEqual(actions(document, old), []);
    });
    test('whitelisting and session ignore preserve the body and affect only the requested scope', async () => {
        const document = await chapter('小王子和小王，小王子。');
        (service as unknown as { whitelist: Set<string> }).whitelist.add('小王子');
        assert.deepStrictEqual(service.detect(document).map(match => match.word), ['小王']);
        diagnosticProvider.ignoreWordInDocument(document.uri.toString(), '小王');
        diagnosticProvider.updateDiagnostics(document);
        assert.deepStrictEqual(diagnostics, []);
        assert.strictEqual(service.detect(document).length, 1);
        assert.strictEqual(document.getText(), '小王子和小王，小王子。');
    });
    test('partial longer words and nested suffixes keep the existing leftmost longest rule', () => {
        for (const [words, text, expected] of [
            [['三', '三丰', '张三丰田'], '张三丰', [['三丰', 1, 3]]],
            [['he', 'she'], 'she he', [['she', 0, 3], ['he', 4, 6]]]
        ] as Array<[string[], string, Array<[string, number, number]>]>) {
            const sensitive = new TrieTree();
            const names = new SimpleTrieTree();
            sensitive.insertBatch(words, 'high');
            names.insertBatch(words);
            for (const matches of [sensitive.search(text), names.search(text)]) {
                assert.deepStrictEqual(matches.map(match => [match.word, match.start, match.end]), expected);
                for (const match of matches) { assert.strictEqual(text.slice(match.start, match.end), match.word); }
            }
        }
    });
    test('supplementary characters in names retain UTF-16 positions in both production matchers', () => {
        const sensitive = new TrieTree();
        const names = new SimpleTrieTree();
        sensitive.insert('𠮷野', 'high');
        names.insert('𠮷野');
        const text = '😀𠮷野来了𠮷野';
        for (const matches of [sensitive.search(text), names.search(text)]) {
            assert.deepStrictEqual(matches.map(match => [match.word, match.start, match.end]), [
                ['𠮷野', 2, 5], ['𠮷野', 7, 10]
            ]);
            for (const match of matches) { assert.strictEqual(text.slice(match.start, match.end), match.word); }
        }
    });
    test('whitelist entry preserves dirty JSONC comments, existing words and undo', async () => {
        const uri = file('.noveler', 'sensitive-words', 'whitelist.jsonc');
        await vscode.workspace.fs.createDirectory(file('.noveler', 'sensitive-words'));
        await writeTestFile(uri, '{\r\n // 保留我的说明\r\n "words": ["旧词"], "custom": 42,\r\n}');
        await applyDocumentChange(uri, text => text.replace('旧词', '未保存词'));
        const whitelist = await vscode.workspace.openTextDocument(uri);
        const before = whitelist.getText();
        const document = await chapter('小王子');
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 0, 0, 3);
        await addToWhitelist();
        assert.deepStrictEqual(parse(whitelist.getText()).words, ['未保存词', '小王子']);
        assert.ok(whitelist.getText().includes('// 保留我的说明'));
        assert.strictEqual(parse(whitelist.getText()).custom, 42);
        assert.ok(!whitelist.getText().replace(/\r\n/g, '').includes('\n'));
        await undoDocumentChange(whitelist, before);
    });
    test('fixes remain available when VS Code reconstructs diagnostics without custom properties', async () => {
        const document = await chapter('小王子');
        diagnosticProvider.updateDiagnostics(document);
        const copies = diagnostics.map(value => Object.assign(new vscode.Diagnostic(value.range, value.message, value.severity), {
            source: value.source, code: value.code
        }));
        assert.strictEqual(actions(document, copies).length, 4);
        diagnosticProvider.clearAll();
        assert.deepStrictEqual(actions(document, copies), []);
    });
    for (const replacement of ['', '***']) {
        test(`fixing one repeated word preserves its neighbors and undo with replacement=${replacement}`, async () => {
            const document = await chapter('前言 小王子，小王子。\n未保存正文');
            const before = document.getText();
            await vscode.window.showTextDocument(document);
            diagnosticProvider.updateDiagnostics(document);
            const action = actions(document).find(value => replacement ? value.title.startsWith('替换为') : value.title.startsWith('删除'));
            assert.ok(action?.command);
            const fix = action.command.arguments![0] as SensitiveWordFix;
            assert.strictEqual(fix.replacement, replacement);
            await applySensitiveWordFix(fix);
            assert.strictEqual(document.getText(), `前言 ${replacement}，小王子。\n未保存正文`);
            await undoDocumentChange(document, before);
        });
    }
    test('a fix offered before further typing refuses to modify the changed body', async () => {
        const document = await chapter('小王子来了');
        diagnosticProvider.updateDiagnostics(document);
        const fix = actions(document).find(value => value.title.startsWith('删除'))!.command!.arguments![0] as SensitiveWordFix;
        await applyDocumentChange(document.uri, text => '新正文' + text);
        const changed = document.getText();
        await applySensitiveWordFix(fix);
        assert.strictEqual(document.getText(), changed);
        assert.strictEqual((vscode.window.showWarningMessage as sinon.SinonStub).calledOnce, true);
    });
    test('ignore applies only to the selected document and resets with clearAll', async () => {
        const document = await chapter('小王子');
        const uri = file('chapters', '另一章.md');
        await writeTestFile(uri, '小王子');
        diagnosticProvider.ignoreWordInDocument(document.uri.toString(), '小王子');
        diagnosticProvider.updateDiagnostics(document);
        assert.strictEqual(diagnostics.length, 0);
        diagnosticProvider.updateDiagnostics(await vscode.workspace.openTextDocument(uri));
        assert.strictEqual(diagnostics.length, 1);
        diagnosticProvider.clearAll();
        diagnosticProvider.updateDiagnostics(document);
        assert.strictEqual(diagnostics.length, 1);
    });
    test('Quick Fix whitelist command and selection entry share the configured JSON fallback and preserve word comments', async () => {
        service.getConfig().whitelist!.path = 'references/我的白名单.jsonc';
        await vscode.workspace.fs.createDirectory(file('references'));
        const uri = file('references', '我的白名单.json');
        await writeTestFile(uri, '{ "words": ["旧词" /* 词条备注 */], "custom": 42 }');
        const document = await chapter('小王子');
        diagnosticProvider.updateDiagnostics(document);
        const command = actions(document)[0].command!;
        assert.strictEqual(command.command, 'noveler.addToWhitelist');
        await addToWhitelist(command.arguments![0]);
        const whitelist = await vscode.workspace.openTextDocument(uri);
        assert.deepStrictEqual(parse(whitelist.getText()).words, ['旧词', '小王子']);
        assert.ok(whitelist.getText().includes('/* 词条备注 */'));
        assert.strictEqual(parse(whitelist.getText()).custom, 42);
        await addToWhitelist('小王子');
        assert.deepStrictEqual(parse(whitelist.getText()).words, ['旧词', '小王子']);
    });
    test('invalid whitelist stops rather than overwriting existing content', async () => {
        const uri = file('.noveler', 'sensitive-words', 'whitelist.jsonc');
        await vscode.workspace.fs.createDirectory(file('.noveler', 'sensitive-words'));
        for (const original of ['{ bad', '[]', '{ "words": "旧词" }', '{ "words": [1] }']) {
            await writeTestFile(uri, original);
            const document = await vscode.workspace.openTextDocument(uri);
            await applyDocumentChange(uri, () => original);
            await addToWhitelist('小王子');
            assert.strictEqual(document.getText(), original);
        }
        assert.strictEqual((vscode.window.showErrorMessage as sinon.SinonStub).callCount, 4);
    });
    test('failed whitelist saves do not report success or reload the library', async () => {
        const uri = file('.noveler', 'sensitive-words', 'whitelist.jsonc');
        await vscode.workspace.fs.createDirectory(file('.noveler', 'sensitive-words'));
        await writeTestFile(uri, '{ "words": ["旧词"] }');
        sandbox.stub(documentIO, 'save').resolves(false);
        await addToWhitelist('小王子');
        assert.strictEqual((vscode.window.showInformationMessage as sinon.SinonStub).called, false);
        assert.strictEqual((vscode.commands.executeCommand as sinon.SinonStub).calledWith('noveler.reloadSensitiveWords'), false);
        assert.deepStrictEqual(parse((await vscode.workspace.openTextDocument(uri)).getText()).words, ['旧词', '小王子']);
    });
    test('adding custom words creates missing directories and keeps the selected text exact', async () => {
        const document = await chapter('前言小王子尾声');
        const editor = await vscode.window.showTextDocument(document);
        editor.selection = new vscode.Selection(0, 2, 0, 5);
        await addToCustomWords();
        const uri = file('.noveler', 'sensitive-words', 'custom-words.jsonc');
        const words = parse((await vscode.workspace.openTextDocument(uri)).getText()).words;
        assert.deepStrictEqual(words, ['小王子']);
        assert.strictEqual(document.getText(), '前言小王子尾声');
    });

    test('native VS Code Quick Fix round trip keeps all actions and invokes the registered safe edit command', async () => {
        await vscode.extensions.getExtension('chang.chinese-novel-writer')!.activate();
        const document = await chapter('小王子来了');
        diagnosticProvider.updateDiagnostics(document);
        const collection = createCollection('noveler-safety-native');
        const registration = vscode.languages.registerCodeActionsProvider('markdown', new SensitiveWordCodeActionProvider(diagnosticProvider));
        try {
            collection.set(document.uri, diagnostics);
            await vscode.window.showTextDocument(document);
            const result = await vscode.commands.executeCommand<vscode.CodeAction[]>('vscode.executeCodeActionProvider',
                document.uri, diagnostics[0].range, vscode.CodeActionKind.QuickFix.value);
            const fix = result.find(value => value.command?.command === 'noveler.applySensitiveWordFix' && value.title.startsWith('删除'));
            assert.ok(fix?.command, '灯泡应在真实宿主诊断往返后仍提供安全删除入口');
            await vscode.commands.executeCommand(fix.command.command, ...fix.command.arguments!);
            assert.strictEqual(document.getText(), '来了');
            await undoDocumentChange(document, '小王子来了');
        } finally { registration.dispose(); collection.dispose(); }
    });
    test('character name overlaps use the longest alias while sensitive diagnostics remain independently actionable', async () => {
        sandbox.stub(ConfigService, 'getInstance').returns({ getHighlightStyle: () => ({}),
            getCharacters: () => ['小王', '小王子'] } as unknown as ConfigService);
        const document = await chapter('---\nname: 小王子\n---\n😀小王子和小王 <!-- 小王 --> 「小王子」');
        const decorations = sinon.spy();
        const provider = new NovelHighlightProvider();
        try {
            await provider.refreshCharacterNames();
            await provider.updateHighlights({ document, setDecorations: decorations } as unknown as vscode.TextEditor);
            assert.deepStrictEqual((decorations.lastCall.args[1] as vscode.Range[]).map(range => document.getText(range)), ['小王子', '小王']);
            diagnosticProvider.updateDiagnostics(document);
            assert.deepStrictEqual(diagnostics.map(diagnostic => document.getText(diagnostic.range)), ['小王子', '小王', '小王', '小王子']);
            assert.ok(actions(document).some(action => action.title === '删除 "小王子"'));
        } finally { provider.dispose(); }
    });

});
