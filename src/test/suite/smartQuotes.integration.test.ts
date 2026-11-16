import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { NovelHighlightProvider } from '../../providers/highlightProvider';
import { SmartQuotesService } from '../../services/smartQuotesService';
import { ConfigService, NovelConfig } from '../../services/configService';
import { quickSettings } from '../../commands/quickSettings';
import { createTestWorkspace, removeTestWorkspace, writeTestFile, undoDocumentChange } from './testWorkspace';

suite('Smart quote native editor integration', () => {
    let root: vscode.Uri;
    let service: SmartQuotesService;
    let enabled: boolean;
    let changes: vscode.EventEmitter<NovelConfig>;
    let sandbox: sinon.SinonSandbox;
    let count = 0;
    setup(async () => {
        root = await createTestWorkspace();
        enabled = true;
        changes = new vscode.EventEmitter<NovelConfig>();
        sandbox = sinon.createSandbox();
        service = new SmartQuotesService({ shouldSmartQuotes: () => enabled, onDidChangeConfig: changes.event } as ConfigService, root);
        await service.ready;
    });
    teardown(async () => {
        service.dispose(); changes.dispose(); sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function open(text: string, path = `chapters/验收${++count}.md`) {
        const uri = vscode.Uri.joinPath(root, path);
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(uri, '..'));
        await writeTestFile(uri, text);
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const end = doc.positionAt(text.length);
        editor.selection = new vscode.Selection(end, end);
        service.refresh();
        return editor;
    }
    const type = (text: string) => vscode.commands.executeCommand('type', { text });
    for (const [left, right] of [['“', '”'], ['「', '」'], ['‘', '’'], ['『', '』'], ['《', '》'], ['"', '"'], ["'", "'"]]) {
        test(`native typing completes ${left}${right} with the caret inside and Tab jumps out`, async () => {
            const editor = await open('');
            await type(left);
            assert.strictEqual(editor.document.getText(), left + right);
            assert.strictEqual(editor.selection.active.character, 1);
            await type('你好');
            await service.jumpOut();
            assert.strictEqual(editor.document.getText(), left + '你好' + right);
            assert.strictEqual(editor.selection.active.character, 4);
        });
    }
    for (const punctuation of ['，', '。', '！', '？', '；', '：', '、']) {
        test(`issue #11: native punctuation ${punctuation} preserves the preceding Chinese character`, async () => {
            const editor = await open('我是一个粉刷匠');
            await type(punctuation);
            assert.strictEqual(editor.document.getText(), '我是一个粉刷匠' + punctuation);
            assert.strictEqual(editor.selection.active.character, 8);
            await vscode.commands.executeCommand('deleteLeft');
            assert.strictEqual(editor.document.getText(), '我是一个粉刷匠');
        });
    }
    test('rapid punctuation and composition replacements stay on the native input path', async () => {
        const editor = await open('我是一个粉刷匠');
        await Promise.all(['，', '。', '！'].map(text => type(text)));
        assert.strictEqual(editor.document.getText(), '我是一个粉刷匠，。！');
        await vscode.commands.executeCommand('compositionStart');
        try {
            await vscode.commands.executeCommand('compositionType', { text: 'shi', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
            await vscode.commands.executeCommand('compositionType', { text: '是', replacePrevCharCnt: 3, replaceNextCharCnt: 0, positionDelta: 0 });
        } finally { await vscode.commands.executeCommand('compositionEnd'); }
        await type('，');
        assert.strictEqual(editor.document.getText(), '我是一个粉刷匠，。！是，');
    });
    test('native brackets still pair and project settings are not rewritten', async () => {
        const configUri = vscode.Uri.joinPath(root, 'novel.jsonc');
        const before = await vscode.workspace.fs.readFile(configUri);
        for (const [left, right] of [['(', ')'], ['[', ']'], ['{', '}']]) {
            const editor = await open('');
            await type(left);
            assert.strictEqual(editor.document.getText(), left + right);
            assert.strictEqual(editor.selection.active.character, 1);
        }
        assert.deepStrictEqual(await vscode.workspace.fs.readFile(configUri), before);
    });
    test('smart quotes never register a replacement typing command', async () => {
        service.dispose();
        const register = sandbox.spy(vscode.commands, 'registerCommand');
        service = new SmartQuotesService({ shouldSmartQuotes: () => enabled, onDidChangeConfig: changes.event } as ConfigService, root);
        await service.ready;
        await open('正文');
        await type('，');
        assert.ok(register.getCalls().every(call => !['type', 'compositionType', 'compositionStart', 'compositionEnd', 'replacePreviousChar'].includes(call.args[0])));
    });
    test('typing a closer keeps native behavior with smart quotes enabled', async () => {
        for (const [left, right] of [['“', '”'], ['「', '」'], ['"', '"'], ["'", "'"]]) {
            const text = left + '旧对话' + right;
            const native = await open(text);
            native.selection = new vscode.Selection(0, 4, 0, 4);
            await vscode.commands.executeCommand('default:type', { text: right });
            const expected = native.document.getText();
            const position = native.selection.active.character;
            const editor = await open(text);
            editor.selection = new vscode.Selection(0, 4, 0, 4);
            await type(right);
            assert.strictEqual(editor.document.getText(), expected);
            assert.strictEqual(editor.selection.active.character, position);
        }
    });
    test('old saved dialogue can be edited and exited from the middle through nested quotes', async () => {
        const text = '「他说：“你好”。」';
        const editor = await open(text);
        editor.selection = new vscode.Selection(0, 6, 0, 6);
        await type('呀');
        await service.jumpOut();
        assert.strictEqual(editor.document.getText(), '「他说：“你呀好”。」');
        assert.strictEqual(editor.selection.active.character, 9);
        await service.jumpOut();
        assert.strictEqual(editor.selection.active.character, 11);
    });
    test('nested dialogue typed in the native editor stays fully highlighted after Tab exits', async () => {
        const editor = await open('');
        for (const left of ['“', '「']) { await type(left); }
        await type('他说：');
        await type('“'); await type('你好');
        await service.jumpOut(); await type('。');
        await service.jumpOut(); await service.jumpOut();
        assert.strictEqual(editor.document.getText(), '“「他说：“你好”。」”');
        assert.strictEqual(editor.selection.active.character, editor.document.getText().length);
        sandbox.stub(ConfigService, 'getInstance').returns({ getHighlightStyle: () => ({}), getCharacters: () => [] } as unknown as ConfigService);
        const provider = new NovelHighlightProvider();
        const decorate = sinon.spy();
        try {
            await provider.updateHighlights({ document: editor.document, setDecorations: decorate } as unknown as vscode.TextEditor);
            assert.deepStrictEqual((decorate.firstCall.args[1] as vscode.Range[]).map(range => editor.document.getText(range)), [editor.document.getText()]);
        } finally { provider.dispose(); }
    });
    test('apostrophes inside English words are not paired', async () => {
        const editor = await open('don');
        await type("'"); await type('t');
        assert.strictEqual(editor.document.getText(), "don't");
    });
    test('a pasted opening quote is not paired, and undo and redo never add punctuation', async () => {
        const editor = await open('');
        await vscode.commands.executeCommand('paste', { text: '“' });
        assert.strictEqual(editor.document.getText(), '“');
        await undoDocumentChange(editor.document, '');
        await vscode.commands.executeCommand('redo');
        assert.strictEqual(editor.document.getText(), '“');
    });
    test('paired typing and following prose undo atomically through native typing', async () => {
        const editor = await open('');
        await type('“'); await type('你好');
        await undoDocumentChange(editor.document, '');
        await vscode.commands.executeCommand('redo');
        assert.strictEqual(editor.document.getText(), '“你好”');
    });
    for (const [text, path] of [
        ['---\ntitle: ', 'chapters/属性.md'], ['```\n', 'chapters/代码.md'],
        ['<!-- 注释 ', 'chapters/注释.md'], ['- 列表 ', 'chapters/列表.md'],
        ['|甲|乙|\n|---|---|\n|内容 ', 'chapters/表格.md'],
        ['', 'characters/人物.md'], ['', 'chapters/outline.md'], ['', '其他.md']
    ]) {
        test(`ordinary editing stays native in ${path}`, async () => {
            const editor = await open(text, path);
            await type('“');
            assert.strictEqual(editor.document.getText(), text + '“');
        });
    }
    test('disabling the feature restores native input immediately', async () => {
        const editor = await open('');
        enabled = false; changes.fire({});
        await type('“');
        assert.strictEqual(editor.document.getText(), '“');
    });
    test('native IME composition stays native and subsequent punctuation can be paired', async () => {
        const editor = await open('');
        await vscode.commands.executeCommand('compositionStart');
        try {
            await vscode.commands.executeCommand('compositionType', { text: 'ni', replacePrevCharCnt: 0, replaceNextCharCnt: 0, positionDelta: 0 });
            await vscode.commands.executeCommand('compositionType', { text: '你', replacePrevCharCnt: 2, replaceNextCharCnt: 0, positionDelta: 0 });
        } finally { await vscode.commands.executeCommand('compositionEnd'); }
        assert.strictEqual(editor.document.getText(), '你');
        await type('“');
        assert.strictEqual(editor.document.getText(), '你“”');
    });
    test('multiple carets and selected text keep their native typing behavior', async () => {
        const editor = await open('甲\n乙');
        editor.selections = [new vscode.Selection(0, 1, 0, 1), new vscode.Selection(1, 1, 1, 1)];
        service.refresh();
        await type('“');
        assert.strictEqual(editor.document.getText(), '甲“\n乙“');
        editor.selections = [new vscode.Selection(0, 0, 0, 1)];
        service.refresh();
        await type('「');
        assert.strictEqual(editor.document.getText(), '「“\n乙“');
    });
    test('native pairing coexists with another input handler without overriding type', async () => {
        const warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        await open('', '其他.md');
        const typing = sandbox.spy(async (args: { text: string }) => vscode.commands.executeCommand('default:type', args));
        const registration = vscode.commands.registerCommand('type', typing);
        try {
            const editor = await open('');
            await type('“');
            assert.strictEqual(editor.document.getText(), '“”');
            assert.ok(typing.calledOnce);
            assert.ok(warning.notCalled);
        } finally { registration.dispose(); }
    });
    test('quick settings writes only the optional smart quote flag and old projects default to enabled', async () => {
        const config = Object.create(ConfigService.prototype) as ConfigService;
        (config as unknown as { config: NovelConfig }).config = { format: { convertQuotes: false } };
        assert.strictEqual(config.shouldSmartQuotes(), true);
        sandbox.stub(ConfigService, 'getInstance').returns(config);
        const update = sandbox.stub(config, 'updateConfig').callsFake(async mutate => {
            const draft = { noveler: { format: { convertQuotes: false } } };
            mutate(draft); assert.deepStrictEqual(draft.noveler.format, { convertQuotes: false, smartQuotes: false });
        });
        sandbox.stub(vscode.window, 'showQuickPick').onFirstCall().callsFake(async items =>
            (items as vscode.QuickPickItem[]).find(item => (item as unknown as { id: string }).id === 'smartQuotes'))
            .onSecondCall().resolves({ value: false } as unknown as vscode.QuickPickItem);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        await quickSettings();
        assert.ok(update.calledOnce);
    });
});
