import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { readFileSync } from 'fs';
import * as path from 'path';
import { copyChapterBody, chapterCopyIO } from '../../commands/copyChapterBody';
import { documentIO } from '../../utils/documentOperations';
import { renderManuscriptTxt } from '../../utils/manuscriptText';
import { createTestWorkspace, removeTestWorkspace, writeTestFile, readTestFile } from './testWorkspace';

suite('Copy chapter body integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    let clipboard: sinon.SinonStub;
    let info: sinon.SinonStub;
    let warning: sinon.SinonStub;
    let error: sinon.SinonStub;
    const chapter = (body: string) => `---\nchapter: 1\ntitle: 初遇\nstatus: 草稿\n---\n\n${body}`;
    const file = (name = '章节.md') => vscode.Uri.joinPath(root, 'chapters', name);
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, index: 0, name: '测试小说' });
        clipboard = sandbox.stub(chapterCopyIO, 'writeClipboard').resolves();
        info = sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        warning = sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        error = sandbox.stub(vscode.window, 'showErrorMessage').resolves();
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    test('registered command copies the chosen chapter with the same body as TXT export', async () => {
        const body = '# 第一章 初遇\n\n正文**强调** <!--? 待办 -->\n下一段\n\n## 回忆\n\n结尾<!--✓ 已处理 -->';
        const text = chapter(body);
        await writeTestFile(file(), text);
        const output = renderManuscriptTxt({ title: '测试小说', volumes: [{ chapters: [
            { number: 1, title: '第一章 初遇', body, attributes: {}, source: file().toString() }
        ] }] });
        await vscode.commands.executeCommand('noveler.copyChapterBody', { resourceUri: file() });
        const expected = '　　正文强调\n　　下一段\n\n回忆\n\n　　结尾';
        assert.strictEqual(clipboard.firstCall?.args[0], expected);
        assert.ok(String(output.files[0].content).includes(expected));
        assert.ok(info.calledOnce);
        assert.ok(warning.notCalled && error.notCalled);
        assert.strictEqual(await readTestFile(file()), text);
    });
    test('copies dirty text without saving or changing content, version and selection', async () => {
        const original = chapter('# 第一章\n\n原稿');
        await writeTestFile(file(), original);
        const doc = await vscode.workspace.openTextDocument(file());
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        await editor.edit(edit => edit.insert(doc.positionAt(doc.getText().length), '\n新内容'));
        const text = doc.getText();
        const version = doc.version;
        const selection = editor.selection;
        await copyChapterBody();
        assert.strictEqual(clipboard.firstCall?.args[0], '　　原稿\n　　新内容');
        assert.strictEqual(doc.getText(), text);
        assert.strictEqual(doc.version, version);
        assert.ok(editor.selection.isEqual(selection));
        assert.ok(doc.isDirty);
        assert.strictEqual(await readTestFile(file()), original);
    });
    test('a sidebar target takes priority over another active chapter and invalid neighbors', async () => {
        await writeTestFile(file(), chapter('# 第一章\n\n目标正文'));
        await writeTestFile(file('其他.md'), chapter('# 第二章\n\n其他正文'));
        await writeTestFile(file('损坏.md'), '---\nchapter: [');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file('其他.md')));
        await copyChapterBody({ resourceUri: file() });
        assert.strictEqual(clipboard.firstCall?.args[0], '　　目标正文');
    });
    test('copies nested chapters without waiting for the success notification to close', async () => {
        const folder = vscode.Uri.joinPath(root, 'chapters', '第01卷-初遇');
        const uri = vscode.Uri.joinPath(folder, '第一章.md');
        await vscode.workspace.fs.createDirectory(folder);
        await writeTestFile(uri, chapter('# 第一章\n\n分卷正文'));
        info.returns(new Promise(() => undefined));
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await Promise.race([
                copyChapterBody({ resourceUri: uri }),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('复制命令不应等待关闭成功提示')), 2000); })
            ]);
        } finally { clearTimeout(timer); }
        assert.strictEqual(clipboard.firstCall?.args[0], '　　分卷正文');
    });
    test('uses newer disk content instead of a clean editor cache', async () => {
        await writeTestFile(file(), chapter('# 第一章\n\n旧内容'));
        await vscode.workspace.openTextDocument(file());
        await writeTestFile(file(), chapter('# 第一章\n\n新内容'));
        await copyChapterBody(file());
        assert.strictEqual(clipboard.firstCall?.args[0], '　　新内容');
    });
    for (const body of ['', '# 第一章', '# 第一章\n\n<!--? 只有待办 -->']) {
        test(`empty body keeps the existing clipboard: ${JSON.stringify(body)}`, async () => {
            await writeTestFile(file(), chapter(body));
            await copyChapterBody(file());
            assert.ok(clipboard.notCalled && info.notCalled && warning.calledOnce);
        });
    }
    for (const body of ['---\nchapter: 1', '---\nchapter: [\n---\n正文', '---\ntitle: 缺号\n---\n正文', chapter('# 标题\n\n正文<!-- 未闭合')]) {
        test(`invalid chapter stops without replacing the clipboard: ${JSON.stringify(body)}`, async () => {
            await writeTestFile(file(), body);
            await copyChapterBody(file());
            assert.ok(clipboard.notCalled && info.notCalled && error.calledOnce);
            assert.strictEqual(await readTestFile(file()), body);
        });
    }
    for (const name of ['outline.md', 'README.md', 'VOLUME.md']) {
        test(`does not copy supporting document ${name}`, async () => {
            await writeTestFile(file(name), chapter('# 文档\n正文'));
            await copyChapterBody(file(name));
            assert.ok(clipboard.notCalled && warning.calledOnce);
        });
    }
    test('rejects characters, external files and explicit targets without a URI', async () => {
        for (const target of [vscode.Uri.joinPath(root, 'characters', '人物.md'), vscode.Uri.joinPath(root, '..', '其他项目', 'chapters', '章节.md'), {}]) {
            await copyChapterBody(target);
        }
        assert.ok(clipboard.notCalled);
        assert.strictEqual(warning.callCount, 3);
    });
    test('missing project configuration, missing files and invalid UTF-8 stop the operation', async () => {
        await copyChapterBody(file());
        await vscode.workspace.fs.writeFile(file(), new Uint8Array([0xff, 0xfe, 0xff]));
        await copyChapterBody(file());
        await vscode.workspace.fs.delete(vscode.Uri.joinPath(root, 'novel.jsonc'));
        await copyChapterBody(file());
        assert.ok(clipboard.notCalled && info.notCalled);
        assert.strictEqual(error.callCount, 3);
    });
    test('read permission and clipboard failures never report success', async () => {
        const text = chapter('# 第一章\n\n原稿');
        await writeTestFile(file(), text);
        const read = sandbox.stub(documentIO, 'readFile').rejects(vscode.FileSystemError.NoPermissions());
        await copyChapterBody(file());
        assert.ok(clipboard.notCalled && info.notCalled && error.calledOnce);
        read.restore();
        clipboard.rejects(new Error('剪贴板不可用'));
        await copyChapterBody(file());
        assert.ok(info.notCalled);
        assert.strictEqual(error.callCount, 2);
        assert.strictEqual(await readTestFile(file()), text);
    });
    test('copies CRLF text, preserves prose and warns about images without a confirmation dialog', async () => {
        const text = chapter('# 第一章\n\n　　正文***\n\n![插图说明](image.png)\n\n```\n<!-- 字面量 -->\n```').replace(/\n/g, '\r\n');
        await writeTestFile(file(), text);
        await copyChapterBody(file());
        const result = clipboard.firstCall?.args[0] as string;
        assert.ok(result.includes('　　正文***'));
        assert.ok(result.includes('插图说明') && result.includes('<!-- 字面量 -->'));
        assert.ok(!result.includes('\r') && !result.includes('第一章'));
        assert.ok(warning.notCalled && info.calledOnce);
        assert.ok(String(info.firstCall.args[0]).includes('不包含图片'));
        assert.strictEqual(await readTestFile(file()), text);
    });
    test('editor and sidebar menus contribute the registered copy command', () => {
        const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        assert.ok(manifest.contributes.commands.some((item: { command: string }) => item.command === 'noveler.copyChapterBody'));
        for (const menu of ['editor/context', 'view/item/context']) {
            assert.ok(manifest.contributes.menus[menu].some((item: { command: string; when: string }) => item.command === 'noveler.copyChapterBody' && item.when.includes('chapter')));
        }
    });
});
