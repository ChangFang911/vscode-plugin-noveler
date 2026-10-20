import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { mkdtemp, symlink } from 'fs/promises';
import { tmpdir } from 'os';
import * as path from 'path';
import { exportNovel } from '../../commands/exportNovel';
import { readManuscript } from '../../services/manuscriptService';
import { exportIO, suggestExportFolder, validateExportParent, writeManuscriptExport } from '../../services/manuscriptWriter';
import { VolumeService } from '../../services/volumeService';
import { documentIO, fileExists } from '../../utils/documentOperations';
import { renderManuscriptTxt, validateExportFolderName } from '../../utils/manuscriptText';
import { ActionNodesProvider } from '../../views/nodes/actionNodes';
import { createTestWorkspace, readTestFile, removeTestWorkspace, writeTestFile } from './testWorkspace';

suite('Manuscript export real files', () => {
    let root: vscode.Uri;
    let parent: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    const file = (...parts: string[]) => vscode.Uri.joinPath(root, ...parts);
    const chapter = (number: unknown, title = '起点', body = '　　正文') => `---\nchapter: ${JSON.stringify(number)}\ntitle: ${title}\nstatus: 草稿\n---\n\n# 第${number}章 ${title}\n\n${body}`;
    setup(async () => {
        root = await createTestWorkspace();
        parent = vscode.Uri.file(await mkdtemp(path.join(process.env.NOVELER_TEST_WORKSPACE || tmpdir(), 'noveler-export-output-')));
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, name: '测试小说', index: 0 });
        sandbox.stub(VolumeService, 'getInstance').returns(Object.create(VolumeService.prototype) as VolumeService);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.window, 'showOpenDialog').resolves([parent]);
        sandbox.stub(vscode.window, 'showInputBox').resolves('长夜-导出');
        sandbox.stub(vscode.commands, 'executeCommand').resolves();
        await configure();
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
        await vscode.workspace.fs.delete(parent, { recursive: true, useTrash: false });
    });
    async function configure(nested = false, chapterNumbering = 'volume', numberFormat = 'arabic') {
        await writeTestFile(file('novel.jsonc'), JSON.stringify({ name: '长夜', noveler: {
            volumes: { enabled: nested, folderStructure: nested ? 'nested' : 'flat', chapterNumbering, numberFormat }
        } }));
    }
    async function addVolume(name: string, number: number, body?: string) {
        await vscode.workspace.fs.createDirectory(file('chapters', name));
        await writeTestFile(file('chapters', name, '章节.md'), chapter(number, '起点', body));
    }
    async function assertCleanOutput() { assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(parent), []); }

    test('sidebar mouse entrance invokes the contributed command and creates a clean UTF-8 book', async () => {
        const entry = new ActionNodesProvider().getToolItems().find(item => item.label === '导出小说');
        assert.strictEqual(entry?.command?.command, 'noveler.exportNovel');
        await writeTestFile(file('chapters', '10.md'), chapter(10, '远行'));
        await writeTestFile(file('chapters', '2.md'), chapter(2, '初遇', '　　甲<!--✓ 注释 -->乙'));
        await writeTestFile(file('chapters', 'outline.md'), '# 不能导出的秘密大纲');
        const configBefore = await readTestFile(file('novel.jsonc'));
        await exportNovel();
        const text = await readTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '长夜.txt'));
        assert.strictEqual(text, '长夜\n\n第2章 初遇\n\n　　甲乙\n\n第10章 远行\n\n　　正文\n');
        assert.strictEqual(await readTestFile(file('novel.jsonc')), configBefore);
        assert.strictEqual(await readTestFile(file('chapters', '2.md')), chapter(2, '初遇', '　　甲<!--✓ 注释 -->乙'));
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).notCalled);
    });
    test('dirty chapter number, title, body and config name are exported without saving or formatting originals', async () => {
        const uri = file('chapters', '1.md');
        await writeTestFile(uri, chapter(1));
        const doc = await vscode.workspace.openTextDocument(uri);
        const config = await vscode.workspace.openTextDocument(file('novel.jsonc'));
        const dirty = chapter(7, '改过的标题', '　　尚未保存, 标点保持');
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, new vscode.Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), dirty);
        edit.replace(config.uri, new vscode.Range(config.positionAt(0), config.positionAt(config.getText().length)),
            '// 未保存备注\n' + config.getText().replace('"name":"长夜"', '"name":"未保存书名"'));
        assert.ok(await vscode.workspace.applyEdit(edit));
        await exportNovel();
        assert.ok((await readTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '未保存书名.txt'))).includes('第7章 改过的标题\n\n　　尚未保存, 标点保持'));
        assert.ok(doc.isDirty && config.isDirty);
        assert.strictEqual(doc.getText(), dirty);
        assert.strictEqual(await readTestFile(uri), chapter(1));
    });
    test('duplicate output directories suggest a new name and are never overwritten', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1));
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(parent, '长夜-导出'));
        await writeTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '保留.txt'), '旧结果');
        assert.strictEqual(await suggestExportFolder(parent, '长夜'), '长夜-导出-2');
        assert.strictEqual(validateExportFolderName(await suggestExportFolder(parent, '😀'.repeat(100))), undefined);
        await exportNovel();
        assert.strictEqual(await readTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '保留.txt')), '旧结果');
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledOnce);
        (vscode.window.showInputBox as sinon.SinonStub).resolves('长夜-导出-2');
        await exportNovel();
        assert.ok(await fileExists(vscode.Uri.joinPath(parent, '长夜-导出-2', '长夜.txt')));
    });
    for (const stage of ['location', 'name', 'warnings']) {
        test(`cancelling ${stage} leaves no output`, async () => {
            await writeTestFile(file('chapters', '1.md'), chapter(1, '起点', stage === 'warnings' ? '<!--? 待办 -->' : '正文'));
            if (stage === 'location') { (vscode.window.showOpenDialog as sinon.SinonStub).resolves(undefined); }
            if (stage === 'name') { (vscode.window.showInputBox as sinon.SinonStub).resolves(undefined); }
            await exportNovel();
            await assertCleanOutput();
            assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
        });
    }
    test('empty bodies and pending comments are explained once and retained chapters can be exported', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1, '起点', '<!--? 检查伏笔 -->'));
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('继续导出');
        await exportNovel();
        assert.strictEqual((vscode.window.showWarningMessage as sinon.SinonStub).callCount, 1);
        assert.deepStrictEqual((vscode.window.showWarningMessage as sinon.SinonStub).firstCall.args.slice(1),
            [{ modal: true }, '继续导出']);
        assert.strictEqual(await readTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '长夜.txt')), '长夜\n\n第1章 起点\n');
    });
    test('formatted and unformatted chapters export with the same prose indentation without changing originals', async () => {
        const formatted = chapter(1, '已格式化', '　　第一段。\n\n　　第二段。');
        const unformatted = chapter(2, '未格式化', '第一段。\n\n  第二段。\n下一行。');
        await writeTestFile(file('chapters', '1.md'), formatted);
        await writeTestFile(file('chapters', '2.md'), unformatted);
        await exportNovel();
        assert.strictEqual(await readTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '长夜.txt')),
            '长夜\n\n第1章 已格式化\n\n　　第一段。\n\n　　第二段。\n\n第2章 未格式化\n\n　　第一段。\n\n　　第二段。\n　　下一行。\n');
        assert.strictEqual(await readTestFile(file('chapters', '1.md')), formatted);
        assert.strictEqual(await readTestFile(file('chapters', '2.md')), unformatted);
    });
    for (const bad of ['正文缺少属性', '---\nchapter: 0\n---\n正文', '---\nchapter: [\n---\n正文']) {
        test(`invalid chapter blocks before showing the destination dialog: ${bad}`, async () => {
            await writeTestFile(file('chapters', '错误.md'), bad);
            (vscode.window.showErrorMessage as sinon.SinonStub).resolves('打开问题文件');
            await exportNovel();
            assert.ok((vscode.window.showOpenDialog as sinon.SinonStub).notCalled);
            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).calledWith('vscode.open', file('chapters', '错误.md')));
            await assertCleanOutput();
        });
    }
    test('missing chapters and invalid configuration stop without creating output', async () => {
        await assert.rejects(() => readManuscript(root), /没有可导出/);
        await writeTestFile(file('novel.jsonc'), '{"noveler":,}');
        await assert.rejects(() => readManuscript(root), /配置/);
        await assertCleanOutput();
    });
    for (const mode of ['global', 'volume', 'mixed']) {
        test(`numbering domain matches ${mode} mode, including prequel and main volumes`, async () => {
            await configure(true, mode);
            await addVolume('前传一-过去', 1);
            await addVolume('第01卷-初遇', 1);
            if (mode === 'global') { await assert.rejects(() => readManuscript(root), /重复章节号/); return; }
            let result = await readManuscript(root);
            assert.deepStrictEqual(result.book.volumes.map(volume => volume.type), ['prequel', 'main']);
            await addVolume('第02卷-远行', 1);
            if (mode === 'mixed') { await assert.rejects(() => readManuscript(root), /重复章节号/); return; }
            result = await readManuscript(root);
            assert.strictEqual(result.book.volumes.length, 3);
            await writeTestFile(file('chapters', '第02卷-远行', '重复.md'), chapter(1));
            await assert.rejects(() => readManuscript(root), /重复章节号/);
        });
    }
    test('flat duplicate numbers and chapters outside recognized volumes are never silently skipped', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1));
        await writeTestFile(file('chapters', '2.md'), chapter(1));
        await assert.rejects(() => readManuscript(root), /重复章节号/);
        await configure(true);
        await assert.rejects(() => readManuscript(root), /未按当前组织方式归属/);
        await vscode.workspace.fs.delete(file('chapters', '1.md'));
        await vscode.workspace.fs.delete(file('chapters', '2.md'));
        await addVolume('错误目录', 1);
        await assert.rejects(() => readManuscript(root), /无法识别/);
    });
    test('dirty volume metadata is respected and malformed metadata stops the export', async () => {
        await configure(true);
        await addVolume('第01卷-初遇', 1);
        const uri = file('chapters', '第01卷-初遇', 'volume.json');
        await writeTestFile(uri, '{"title":"新卷名"}');
        assert.strictEqual((await readManuscript(root)).book.volumes[0].title, '第1卷 新卷名');
        await writeTestFile(uri, '["损坏"]');
        await assert.rejects(() => readManuscript(root), /卷属性/);
    });
    for (const [format, expected] of [
        ['arabic', ['前传2 旧事', '第1卷 新卷名-附题_保留', '第10卷 远行', '后传3 余波', '番外4 日常']],
        ['chinese', ['前传二 旧事', '第一卷 新卷名-附题_保留', '第十卷 远行', '后传三 余波', '番外四 日常']],
        ['roman', ['前传II 旧事', '第I卷 新卷名-附题_保留', '第X卷 远行', '后传III 余波', '番外IV 日常']]
    ] as const) {
        test(`exported volume labels follow ${format} configuration without directory padding or source changes`, async () => {
            await configure(true, 'volume', format);
            for (const name of ['番外04-日常', '第十卷-远行', '前传02-旧事', '后传03-余波', '第01卷-初遇']) {
                await addVolume(name, 1);
            }
            const metadata = file('chapters', '第01卷-初遇', 'volume.json');
            const chapterUri = file('chapters', '第01卷-初遇', '章节.md');
            const originalChapter = await readTestFile(chapterUri);
            await writeTestFile(metadata, '{"title":"新卷名-附题_保留"}');
            const configBefore = await readTestFile(file('novel.jsonc'));
            const foldersBefore = await vscode.workspace.fs.readDirectory(file('chapters'));
            const snapshot = await readManuscript(root);
            assert.deepStrictEqual(snapshot.book.volumes.map(volume => volume.title), [...expected]);
            const exported = renderManuscriptTxt(snapshot.book).files[0].content;
            for (const title of expected) { assert.ok(exported.includes(`\n\n${title}\n\n`)); }
            await snapshot.assertUnchanged();
            assert.strictEqual(await readTestFile(file('novel.jsonc')), configBefore);
            assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(file('chapters')), foldersBefore);
            assert.strictEqual(await readTestFile(metadata), '{"title":"新卷名-附题_保留"}');
            assert.strictEqual(await readTestFile(chapterUri), originalChapter);
        });
    }
    test('missing number format uses unpadded Arabic volume labels and invalid formats stop export', async () => {
        await addVolume('第01卷-初遇', 1);
        await writeTestFile(file('novel.jsonc'), '{"noveler":{"volumes":{"enabled":true,"folderStructure":"nested"}}}');
        assert.strictEqual((await readManuscript(root)).book.volumes[0].title, '第1卷 初遇');
        await configure(true, 'volume', 'invalid');
        await assert.rejects(() => readManuscript(root), /分卷配置无效/);
    });
    test('read permission errors stop the export instead of producing a partial book', async () => {
        const uri = file('chapters', '1.md');
        await writeTestFile(uri, chapter(1));
        const stat = documentIO.stat;
        sandbox.stub(documentIO, 'stat').callsFake(target => target.toString() === uri.toString()
            ? Promise.reject(vscode.FileSystemError.NoPermissions('没有读取权限')) : stat(target));
        await exportNovel();
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledOnce);
        assert.ok((vscode.window.showOpenDialog as sinon.SinonStub).notCalled);
        await assertCleanOutput();
    });
    test('invalid UTF-8 input stops rather than exporting replacement characters', async () => {
        await vscode.workspace.fs.writeFile(file('chapters', '损坏.md'), Buffer.concat([Buffer.from(chapter(1)), Buffer.from([255, 254])]));
        await assert.rejects(() => readManuscript(root), /UTF-8/);
        await assertCleanOutput();
    });
    test('clean editor caches do not override more recent disk contents', async () => {
        const uri = file('chapters', '1.md');
        await writeTestFile(uri, chapter(1));
        const document = await vscode.workspace.openTextDocument(uri);
        assert.strictEqual(document.isDirty, false);
        await writeTestFile(uri, chapter(2, '外部更新'));
        const snapshot = await readManuscript(root);
        assert.strictEqual(snapshot.book.volumes[0].chapters[0].number, 2);
        assert.ok(snapshot.book.volumes[0].chapters[0].title.includes('外部更新'));
    });
    test('autosave while choosing the destination is included in the final snapshot', async () => {
        const uri = file('chapters', '1.md');
        await writeTestFile(uri, chapter(1));
        (vscode.window.showInputBox as sinon.SinonStub).callsFake(async () => {
            await writeTestFile(uri, chapter(1, '自动保存后的标题', '　　自动保存后的正文'));
            return '长夜-导出';
        });
        await exportNovel();
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).notCalled);
        const text = await readTestFile(vscode.Uri.joinPath(parent, '长夜-导出', '长夜.txt'));
        assert.ok(text.includes('自动保存后的标题\n\n　　自动保存后的正文'));
    });
    test('chapters that appear while scanning cannot be omitted from a successful export', async () => {
        await configure(true);
        await addVolume('第01卷-初遇', 1);
        const stat = documentIO.stat;
        let inserted = false;
        sandbox.stub(documentIO, 'stat').callsFake(async uri => {
            if (uri.path.endsWith('/章节.md') && !inserted) {
                inserted = true;
                await writeTestFile(file('chapters', '第01卷-初遇', '新增.md'), chapter(2));
            }
            return stat(uri);
        });
        const snapshot = await readManuscript(root);
        await assert.rejects(snapshot.assertUnchanged, /目录.*变化/);
    });
    for (const change of ['body', 'new chapter', 'config', 'deleted chapter']) {
        test(`source changes during export stop the commit: ${change}`, async () => {
            const uri = file('chapters', '1.md');
            await writeTestFile(uri, chapter(1));
            const snapshot = await readManuscript(root);
            if (change === 'body') { await writeTestFile(uri, chapter(1, '新标题')); }
            if (change === 'new chapter') { await writeTestFile(file('chapters', '2.md'), chapter(2)); }
            if (change === 'config') { await configure(true); }
            if (change === 'deleted chapter') { await vscode.workspace.fs.delete(uri); }
            await assert.rejects(() => writeManuscriptExport(root, parent, '结果', renderManuscriptTxt(snapshot.book).files, snapshot.assertUnchanged), /变化/);
            await assertCleanOutput();
        });
    }
    for (const failure of ['write', 'rename', 'cancel', 'collision', 'empty collision']) {
        test(`output failure cleans only its own staging directory: ${failure}`, async () => {
            await writeTestFile(file('chapters', '1.md'), chapter(1));
            const snapshot = await readManuscript(root);
            const token = new vscode.CancellationTokenSource();
            try {
                if (failure === 'write') { sandbox.stub(documentIO, 'writeFile').rejects(new Error('写入失败')); }
                if (failure === 'rename') { sandbox.stub(exportIO, 'rename').rejects(new Error('改名失败')); }
                const validate = async () => {
                    await snapshot.assertUnchanged();
                    if (failure === 'cancel') { token.cancel(); }
                    if (failure === 'collision' || failure === 'empty collision') {
                        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(parent, '结果'));
                        if (failure === 'collision') { await writeTestFile(vscode.Uri.joinPath(parent, '结果', '保留.txt'), '其他操作的内容'); }
                    }
                };
                await assert.rejects(() => writeManuscriptExport(root, parent, '结果', renderManuscriptTxt(snapshot.book).files, validate, token.token));
                if (failure === 'collision') {
                    assert.strictEqual(await readTestFile(vscode.Uri.joinPath(parent, '结果', '保留.txt')), '其他操作的内容');
                    assert.strictEqual(await fileExists(vscode.Uri.joinPath(parent, '结果', '长夜.txt')), false);
                } else if (failure === 'empty collision') {
                    assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(vscode.Uri.joinPath(parent, '结果')), []);
                } else { await assertCleanOutput(); }
                assert.ok((await vscode.workspace.fs.readDirectory(parent)).every(([name]) => !name.startsWith('.noveler-export-')));
                assert.strictEqual(await readTestFile(file('chapters', '1.md')), chapter(1));
            } finally { token.dispose(); }
        });
    }
    test('project directories and aliases pointing inside the project cannot be export destinations', async () => {
        await assert.rejects(() => validateExportParent(root, root), /项目之外/);
        await assert.rejects(() => validateExportParent(root, file('chapters')), /项目之外/);
        const alias = vscode.Uri.joinPath(parent, '项目别名');
        await symlink(root.fsPath, alias.fsPath, 'dir');
        await assert.rejects(() => validateExportParent(root, alias), /项目之外/);
    });
    test('shared writer preserves bytes for later binary formats without applying text encoding', async () => {
        const bytes = new Uint8Array([0, 255, 128, 65, 10]);
        const output = await writeManuscriptExport(root, parent, '二进制验证', [{ name: '验证.bin', content: bytes }], async () => undefined);
        assert.deepStrictEqual(Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(output, '验证.bin'))), Buffer.from(bytes));
    });
    test('cancellation before scanning does not read or generate a manuscript', async () => {
        const token = new vscode.CancellationTokenSource();
        token.cancel();
        try { await assert.rejects(() => readManuscript(root, token.token), error => error instanceof vscode.CancellationError); }
        finally { token.dispose(); }
        await assertCleanOutput();
    });
    test('success actions open the actual export result', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1));
        (vscode.window.showInformationMessage as sinon.SinonStub).resolves('打开文件');
        await exportNovel();
        assert.ok((vscode.commands.executeCommand as sinon.SinonStub).calledWith('vscode.open', vscode.Uri.joinPath(parent, '长夜-导出', '长夜.txt')));
    });
    test('exporting is guarded while a destination picker is open and becomes available after cancellation', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1));
        const opened = new Promise<void>(resolve => {
            (vscode.window.showOpenDialog as sinon.SinonStub).callsFake(async () => {
                resolve();
                return new Promise<vscode.Uri[] | undefined>(done => { release = done; });
            });
        });
        let release: (value: undefined) => void = () => undefined;
        const first = exportNovel();
        await opened;
        await exportNovel();
        assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).calledWith('小说正在导出，请等待完成或取消本次导出'));
        release(undefined);
        await first;
        (vscode.window.showOpenDialog as sinon.SinonStub).resolves([parent]);
        await exportNovel();
        assert.ok(await fileExists(vscode.Uri.joinPath(parent, '长夜-导出', '长夜.txt')));
    });
    test('cancelling from the progress notification leaves no output or failure message', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1));
        const cancellation = new vscode.CancellationTokenSource();
        cancellation.cancel();
        sandbox.stub(vscode.window, 'withProgress').callsFake(async (_options, task) => task({ report: () => undefined }, cancellation.token));
        try { await exportNovel(); }
        finally { cancellation.dispose(); }
        await assertCleanOutput();
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).notCalled);
    });
    test('an undismissed success notification does not block the next export', async () => {
        await writeTestFile(file('chapters', '1.md'), chapter(1));
        let release: (value: undefined) => void = () => undefined;
        let notifyReady: () => void = () => undefined;
        const notified = new Promise<void>(resolve => { notifyReady = resolve; });
        const information = vscode.window.showInformationMessage as sinon.SinonStub;
        information.onFirstCall().callsFake(async () => {
            notifyReady();
            return new Promise<undefined>(resolve => { release = resolve; });
        });
        const first = exportNovel();
        await notified;
        (vscode.window.showInputBox as sinon.SinonStub).resolves('第二次导出');
        await exportNovel();
        release(undefined);
        await first;
        assert.ok(await fileExists(vscode.Uri.joinPath(parent, '第二次导出', '长夜.txt')));
        assert.ok(information.neverCalledWith('小说正在导出，请等待完成或取消本次导出'));
    });
});
