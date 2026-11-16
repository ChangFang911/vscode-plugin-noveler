import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { addDoubtMark } from '../../commands/addDoubtMark';
import { DoubtMarkService, findMarksInText } from '../../services/doubtMarkService';
import { ChineseNovelFormatProvider } from '../../providers/formatProvider';
import { ConfigService } from '../../services/configService';
import { markdownToText } from '../../utils/manuscriptText';
import { createTestWorkspace, removeTestWorkspace, readTestFile, writeTestFile, undoDocumentChange } from './testWorkspace';

suite('Caret todo insertion integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    let input: sinon.SinonStub;
    let warning: sinon.SinonStub;
    let error: sinon.SinonStub;
    let count = 0;
    const marker = '<!--? 补充原因 -->';
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        input = sandbox.stub(vscode.window, 'showInputBox').resolves('补充原因');
        warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        error = sandbox.stub(vscode.window, 'showErrorMessage').resolves();
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function open(text: string, selection?: vscode.Selection) {
        const uri = vscode.Uri.joinPath(root, 'chapters', `定位${++count}.md`);
        await writeTestFile(uri, text);
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document, { preview: false });
        editor.selection = selection ?? new vscode.Selection(0, 0, 0, 0);
        return editor;
    }
    const cases: [string, string, vscode.Selection, string][] = [
        ['middle', '他停下脚步。', new vscode.Selection(0, 3, 0, 3), '他停下' + marker + '脚步。'],
        ['start', '正文', new vscode.Selection(0, 0, 0, 0), marker + '正文'],
        ['end', '正文', new vscode.Selection(0, 2, 0, 2), '正文' + marker],
        ['empty line', '\n结尾', new vscode.Selection(0, 0, 0, 0), marker + '\n结尾'],
        ['whitespace', '　　\n结尾', new vscode.Selection(0, 1, 0, 1), '　' + marker + '　\n结尾'],
        ['forward selection', '他停下脚步。', new vscode.Selection(0, 1, 0, 5), '他停下脚步' + marker + '。'],
        ['reverse selection', '他停下脚步。', new vscode.Selection(0, 5, 0, 1), '他停下脚步' + marker + '。'],
        ['multiple paragraphs', '第一段\n\n第二段\n结尾', new vscode.Selection(0, 1, 2, 2), '第一段\n\n第二' + marker + '段\n结尾'],
        ['reverse multiple paragraphs', '第一段\n\n第二段', new vscode.Selection(2, 2, 0, 1), '第一段\n\n第二' + marker + '段'],
        ['CRLF and Unicode', '人物𠮷野\r\n第二行', new vscode.Selection(0, 4, 1, 2), '人物𠮷野\r\n第二' + marker + '行']
    ];
    for (const [name, original, selection, expected] of cases) {
        test(`${name} preserves prose and puts the caret after one marker`, async () => {
            const editor = await open(original, selection);
            await vscode.commands.executeCommand('noveler.addDoubtMark');
            assert.strictEqual(editor.document.getText(), expected);
            assert.strictEqual(editor.document.offsetAt(editor.selection.active), expected.indexOf(marker) + marker.length);
            assert.ok(editor.selection.isEmpty && editor.document.isDirty);
            assert.strictEqual(await readTestFile(editor.document.uri), original);
            assert.strictEqual(findMarksInText(expected).length, 1);
            assert.ok(warning.notCalled && error.notCalled);
        });
    }
    test('one undo preserves earlier edits, and redo restores only the inserted marker', async () => {
        const editor = await open('正文');
        await editor.edit(edit => edit.insert(new vscode.Position(0, 2), '新增'));
        const before = editor.document.getText();
        editor.selection = new vscode.Selection(0, 2, 0, 2);
        await addDoubtMark();
        await undoDocumentChange(editor.document, before);
        await vscode.commands.executeCommand('redo');
        assert.strictEqual(editor.document.getText(), '正文' + marker + '新增');
    });
    test('cancellation preserves selection, document version and content', async () => {
        const editor = await open('正文', new vscode.Selection(0, 2, 0, 0));
        const version = editor.document.version;
        input.resolves(undefined);
        await addDoubtMark();
        assert.strictEqual(editor.document.getText(), '正文');
        assert.strictEqual(editor.document.version, version);
        assert.ok(editor.selection.isReversed);
        assert.ok(!editor.document.isDirty);
    });
    test('document changes during the input stop insertion without undoing the user edit', async () => {
        const editor = await open('正文', new vscode.Selection(0, 1, 0, 1));
        input.callsFake(async () => {
            await editor.edit(edit => edit.insert(new vscode.Position(0, 0), '新内容'));
            return '补充原因';
        });
        await addDoubtMark();
        assert.strictEqual(editor.document.getText(), '新内容正文');
        assert.ok(warning.calledWithMatch('正文已变化'));
        assert.ok(error.notCalled);
    });
    test('metadata-only save during the input keeps the target body position usable', async () => {
        const original = '---\nchapter: 1\nwordCount: 0\nmodified: 2000-01-01 00:00:00\n---\n\n他停下脚步。';
        const editor = await open(original, new vscode.Selection(6, 3, 6, 3));
        await editor.edit(edit => edit.insert(editor.document.positionAt(editor.document.getText().length), '新增'));
        editor.selection = new vscode.Selection(6, 3, 6, 3);
        input.callsFake(async () => {
            assert.ok(await editor.document.save());
            return '补充原因';
        });
        await addDoubtMark();
        assert.ok(editor.document.getText().endsWith('他停下' + marker + '脚步。新增'));
        assert.ok(warning.notCalled && error.notCalled);
    });
    test('a changed header length and final newline preserve the body anchor', async () => {
        const original = '---\nchapter: 1\n---\n正文结尾';
        const editor = await open(original, new vscode.Selection(3, 2, 3, 2));
        input.callsFake(async () => {
            const latest = '---\nchapter: 1\nwordCount: 4\nmodified: 新时间\n---\n正文结尾\n';
            await editor.edit(edit => edit.replace(new vscode.Range(editor.document.positionAt(0), editor.document.positionAt(editor.document.getText().length)), latest));
            return '补充原因';
        });
        await addDoubtMark();
        assert.ok(editor.document.getText().endsWith('正文' + marker + '结尾\n'));
        assert.ok(warning.notCalled && error.notCalled);
    });
    test('moving the selection during input does not change the captured insertion position', async () => {
        const editor = await open('正文结尾', new vscode.Selection(0, 1, 0, 1));
        input.callsFake(async () => {
            editor.selection = new vscode.Selection(0, 4, 0, 4);
            return '补充原因';
        });
        await addDoubtMark();
        assert.strictEqual(editor.document.getText(), '正' + marker + '文结尾');
    });
    test('switching to another document during input does not insert there or steal focus', async () => {
        const editor = await open('原文', new vscode.Selection(0, 1, 0, 1));
        let other!: vscode.TextEditor;
        input.callsFake(async () => {
            other = await open('其他文件');
            return '补充原因';
        });
        await addDoubtMark();
        assert.strictEqual(editor.document.getText(), '原文');
        assert.ok(warning.calledWithMatch('编辑窗口已切换'));
        assert.strictEqual(other.document.getText(), '其他文件');
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), other.document.uri.toString());
    });
    test('closing the target document during input stops insertion', async () => {
        const editor = await open('正文', new vscode.Selection(0, 1, 0, 1));
        input.callsFake(async () => {
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
            return '补充原因';
        });
        await addDoubtMark();
        assert.strictEqual(await readTestFile(editor.document.uri), '正文');
        assert.ok(warning.calledWithMatch('编辑窗口已切换'));
        assert.ok(error.notCalled);
    });
    test('multiple carets are rejected before requesting input', async () => {
        const editor = await open('正文\n正文');
        editor.selections = [new vscode.Selection(0, 1, 0, 1), new vscode.Selection(1, 1, 1, 1)];
        await addDoubtMark();
        assert.ok(input.notCalled && warning.calledOnce);
        assert.strictEqual(editor.document.getText(), '正文\n正文');
    });
    for (const content of ['内容 --> 正文', '<!-- 嵌套注释', '多行\n内容']) {
        test(`invalid marker content cannot damage prose: ${JSON.stringify(content)}`, async () => {
            const editor = await open('正文');
            input.resolves(content);
            await addDoubtMark();
            assert.strictEqual(editor.document.getText(), '正文');
            assert.ok(warning.calledOnce && error.notCalled);
        });
    }
    test('empty content stays compatible with existing empty todo markers', async () => {
        const editor = await open('正文', new vscode.Selection(0, 1, 0, 1));
        input.resolves('');
        await addDoubtMark();
        assert.strictEqual(editor.document.getText(), '正<!--?  -->文');
        assert.strictEqual(findMarksInText(editor.document.getText())[0].content, '');
    });
    for (const original of ['正文<!--? 已有待办 -->结尾', '正文<!-- 普通注释 -->结尾', '正文<!-- 未闭合']) {
        test(`insertion inside a comment is rejected: ${original}`, async () => {
            const end = original.includes('-->') ? original.indexOf('-->') : original.length;
            const editor = await open(original, new vscode.Selection(0, end, 0, end));
            await addDoubtMark();
            assert.ok(input.notCalled && warning.calledOnce);
            assert.strictEqual(editor.document.getText(), original);
        });
    }
    test('new inline markers remain usable after formatting, resolution, reopening and deletion', async () => {
        const editor = await open('# 第一章\n\n他停下脚步。', new vscode.Selection(2, 3, 2, 3));
        await addDoubtMark();
        sandbox.stub(ConfigService, 'getInstance').returns({
            getChineseQuoteStyle: () => '「」', shouldAutoEmptyLine: () => true, shouldParagraphIndent: () => true, shouldConvertQuotes: () => true
        } as unknown as ConfigService);
        const edits = new ChineseNovelFormatProvider().provideDocumentFormattingEdits(
            editor.document, { tabSize: 4, insertSpaces: true }, {} as vscode.CancellationToken);
        await editor.edit(edit => { for (const item of edits) { edit.replace(item.range, item.newText); } });
        const mark = findMarksInText(editor.document.getText())[0];
        const data = { ...mark, fileUri: editor.document.uri, fileName: '定位', id: 'test' };
        const service = DoubtMarkService.getInstance();
        await service.resolveMark(data);
        assert.strictEqual(findMarksInText(editor.document.getText())[0].resolved, true);
        const resolved = findMarksInText(editor.document.getText())[0];
        await service.reopenMark({ ...data, ...resolved });
        const pending = findMarksInText(editor.document.getText())[0];
        assert.strictEqual(pending.resolved, false);
        assert.strictEqual(markdownToText(editor.document.getText(), true).body, '　　他停下脚步。');
        await service.deleteMark({ ...data, ...pending });
        assert.strictEqual(findMarksInText(editor.document.getText()).length, 0);
        assert.ok(editor.document.getText().includes('他停下脚步。'));
    });
});
