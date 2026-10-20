import { CharacterNodesProvider } from '../../views/nodes/characterNodes';
import { renameCharacter } from '../../commands/contextMenuCommands';
import { NovelHighlightProvider } from '../../providers/highlightProvider';
import { manageCharacterAliases } from '../../commands/manageCharacterAliases';
import { getCharacterAliases } from '../../utils/characterAliases';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { parse } from 'jsonc-parser';
import { createDocument, applyDocumentChange, documentIO, fileExists, patchFrontMatter } from '../../utils/documentOperations';
import { parseFrontMatter } from '../../utils/frontMatterParser';
import { patchJsoncFields } from '../../utils/settingsHelper';
import { writeAndOpenChapter, runChapterCreation } from '../../commands/createChapter';
import { createCharacter } from '../../commands/createCharacter';
import { initProject } from '../../commands/initProject';
import { renameVolume, editVolumeProperties, deleteVolume } from '../../commands/volumeCommands';
import { updateReadme } from '../../utils/readmeUpdater';
import { initTemplateLoader } from '../../utils/templateLoader';
import { ConfigService } from '../../services/configService';
import { VolumeService } from '../../services/volumeService';
import { VolumeInfo } from '../../types/volume';
import { NovelerTreeItem, NovelerViewProvider } from '../../views/novelerViewProvider';
import { createTestWorkspace, readTestFile, removeTestWorkspace, writeTestFile, undoDocumentChange } from './testWorkspace';

suite('Phase Two Data Safety Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    const file = (...parts: string[]) => vscode.Uri.joinPath(root, ...parts);
    const item = (volume: VolumeInfo) => ({ metadata: volume } as NovelerTreeItem);
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, name: '临时验证', index: 0 });
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(ConfigService, 'getInstance').returns({ getVolumesConfig: () => ({ enabled: true, folderStructure: 'nested', numberFormat: 'arabic', chapterNumbering: 'volume' }), isVolumesEnabled: () => false, getReadmeAutoUpdateMode: () => 'always' } as unknown as ConfigService);
        const execute = vscode.commands.executeCommand.bind(vscode.commands);
        sandbox.stub(vscode.commands, 'executeCommand').callsFake((command: string, ...args: unknown[]) =>
            command === 'noveler.refresh' ? Promise.resolve(undefined) : execute(command, ...args));
        initTemplateLoader({ extensionUri: vscode.Uri.file(__dirname + '/../../..') } as vscode.ExtensionContext);
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function volumeFixture(name = '第01卷-起点', volumeType: VolumeInfo['volumeType'] = 'main', number = 1): Promise<VolumeInfo> {
        const folder = file('chapters', name);
        await vscode.workspace.fs.createDirectory(folder);
        await writeTestFile(vscode.Uri.joinPath(folder, 'volume.json'), `{
 // 卷备注必须保留
 "volume": ${number}, "volumeType": "${volumeType}", "title": "起点", "status": "planning",
 "description": "原描述", "custom": 42,
}`);
        return { folderName: name, folderPath: folder.fsPath, volume: number, volumeType, title: '起点',
            status: 'planning', chapters: [], stats: { chapterCount: 0, totalWords: 0, completedChapters: 0 } } as VolumeInfo;
    }
    function stubReadmeConfig() {
        (ConfigService.getInstance as sinon.SinonStub).returns({ isVolumesEnabled: () => false,
            getReadmeAutoUpdateMode: () => 'always' } as unknown as ConfigService);
    }
    async function readmeFixture(text: string) {
        stubReadmeConfig();
        await vscode.workspace.fs.createDirectory(file('characters'));
        await writeTestFile(file('chapters', '第01章.md'), '---\ntitle: 开篇\nchapter: 1\nwordCount: 120\nstatus: completed\n---\n正文');
        await writeTestFile(file('README.md'), text);
    }
    const readme = '# 小说\n\n## 目录\n旧目录\n\n## 写作进度\n旧进度\n\n## 人物设定\n旧人物\n\n## 备注\n原备注\n';

    test('chapter titles preserve hash marks and YAML punctuation', async () => {
        await writeAndOpenChapter({ folderUri: file('chapters'), fileName: '第01章-终章.md', chapterTitle: '第1章 终章 # 伏笔', chapterNumber: 1, targetWords: 2500 });
        assert.strictEqual(parseFrontMatter(await readTestFile(file('chapters', '第01章-终章.md'))).data.title, '终章 # 伏笔');
    });
    test('numeric character names remain strings', async () => {
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: '主角' } as unknown as vscode.QuickPickItem);
        await createCharacter('123');
        const data = parseFrontMatter(await readTestFile(file('characters', '123.md'))).data;
        assert.strictEqual(data.name, '123');
        assert.deepStrictEqual(data.aliases, []);
    });
    async function aliasFixture(text = '---\r\n# 人物备注\r\nname: 王明\r\n---\r\n# 王明\r\n正文') {
        await vscode.workspace.fs.createDirectory(file('characters'));
        const uri = file('characters', '王明.md');
        await writeTestFile(uri, text);
        return uri;
    }
    async function openAliasPanel(uri: vscode.Uri) {
        type AliasItem = vscode.QuickPickItem & { alias?: string; action?: string };
        const change = new vscode.EventEmitter<string>();
        const accept = new vscode.EventEmitter<void>();
        const hide = new vscode.EventEmitter<void>();
        const button = new vscode.EventEmitter<vscode.QuickPickItemButtonEvent<AliasItem>>();
        let value = '';
        const picker = {
            items: [] as AliasItem[], activeItems: [] as AliasItem[], busy: false, enabled: true, shown: false, disposed: false,
            get value() { return value; },
            set value(input: string) { value = input; change.fire(input); },
            onDidChangeValue: change.event, onDidAccept: accept.event,
            onDidHide: hide.event, onDidTriggerItemButton: button.event,
            show() { this.shown = true; },
            dispose() { this.disposed = true; this.shown = false; }
        };
        sandbox.stub(vscode.window, 'createQuickPick').returns(picker as unknown as vscode.QuickPick<vscode.QuickPickItem>);
        const pending = manageCharacterAliases({ resourceUri: uri });
        const waitFor = async (condition: () => boolean) => {
            const deadline = Date.now() + 3000;
            while (!condition() && Date.now() < deadline) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
            assert.ok(condition(), '别名面板未完成预期操作');
        };
        await waitFor(() => picker.shown);
        return {
            picker, hide, accept,
            async add(alias: string) {
                picker.value = alias;
                accept.fire();
                await waitFor(() => !picker.busy || picker.disposed);
            },
            async click(alias: string, tooltip: string) {
                const item = picker.items.find(item => item.alias === alias)!;
                assert.ok(item, `缺少别名：${alias}`);
                const selectedButton = item.buttons?.find(button => button.tooltip === tooltip);
                assert.ok(selectedButton);
                button.fire({ item, button: selectedButton });
                await waitFor(() => !picker.busy || picker.disposed);
            },
            async close() {
                hide.fire();
                await pending;
                change.dispose(); accept.dispose(); hide.dispose(); button.dispose();
            }
        };
    }
    test('alias insertion into an old profile preserves dirty prose, comments and CRLF and is undoable', async () => {
        const uri = await aliasFixture();
        const document = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(document);
        await applyDocumentChange(uri, text => text + '\r\n未保存正文');
        const original = document.getText();
        const input = sandbox.spy(vscode.window, 'showInputBox');
        const panel = await openAliasPanel(uri);
        await panel.add(' William ');
        assert.strictEqual(input.called, false);
        assert.strictEqual(panel.picker.value, '');
        assert.strictEqual(panel.picker.disposed, false);
        assert.deepStrictEqual(getCharacterAliases(document.getText()), ['William']);
        assert.ok(document.getText().includes('# 人物备注\r\n'));
        assert.ok(document.getText().endsWith('# 王明\r\n正文\r\n未保存正文'));
        assert.ok(!/(?<!\r)\n/.test(document.getText()));
        assert.ok(!getCharacterAliases(await readTestFile(uri)).length);
        await panel.close();
        await vscode.window.showTextDocument(document);
        await undoDocumentChange(document, original);
        assert.strictEqual(document.getText(), original);
    });
    test('alias edits merge changes made during input and do not edit the active other profile', async () => {
        const uri = await aliasFixture();
        const other = file('characters', '别人.md');
        await writeTestFile(other, '# 别人\n保留正文');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(other));
        const panel = await openAliasPanel(uri);
        panel.picker.value = 'William';
        await applyDocumentChange(uri, text => patchFrontMatter(text, { aliases: ['小王'] }) + '\r\n新增正文');
        await panel.add('William');
        assert.deepStrictEqual(getCharacterAliases((await vscode.workspace.openTextDocument(uri)).getText()), ['小王', 'William']);
        assert.ok((await vscode.workspace.openTextDocument(uri)).getText().endsWith('新增正文'));
        assert.strictEqual((await vscode.workspace.openTextDocument(other)).getText(), '# 别人\n保留正文');
        await panel.close();
    });
    test('existing aliases can be renamed and deleted through item buttons without changing prose', async () => {
        const uri = await aliasFixture('---\nname: 王明\naliases: [小王, William]\n---\n# 王明\n小王遇见 William');
        const panel = await openAliasPanel(uri);
        sandbox.stub(vscode.window, 'showInputBox').callsFake(async () => { panel.hide.fire(); return '老王'; });
        await panel.click('小王', '修改别名');
        const document = await vscode.workspace.openTextDocument(uri);
        assert.deepStrictEqual(getCharacterAliases(document.getText()), ['老王', 'William']);
        assert.strictEqual(panel.picker.disposed, false);
        await panel.click('William', '删除别名');
        assert.deepStrictEqual(getCharacterAliases(document.getText()), ['老王']);
        assert.ok(document.getText().endsWith('小王遇见 William'));
        await panel.close();
    });
    for (const alias of ['王明', '小王', '   ']) {
        test(`rejects invalid or duplicate alias ${JSON.stringify(alias)} without changing the profile`, async () => {
            const original = '---\nname: 王明\naliases: [小王]\n---\n# 王明\n正文';
            const uri = await aliasFixture(original);
            const panel = await openAliasPanel(uri);
            await panel.add(alias);
            assert.strictEqual(panel.picker.items[0].action, undefined);
            assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), original);
            if (alias.trim()) { assert.ok(panel.picker.items[0].label.includes(alias === '王明' ? '本名' : '已存在')); }
            await panel.close();
        });
    }
    test('closing unsubmitted alias input does not insert a field into an old profile', async () => {
        const uri = await aliasFixture();
        const document = await vscode.workspace.openTextDocument(uri);
        const original = document.getText();
        const panel = await openAliasPanel(uri);
        panel.picker.value = '尚未确认';
        await panel.close();
        assert.strictEqual(document.getText(), original);
        assert.strictEqual(document.isDirty, false);
    });
    test('one panel supports consecutive additions and cancelling an edit keeps existing aliases', async () => {
        const uri = await aliasFixture();
        const panel = await openAliasPanel(uri);
        await panel.add('小王');
        await panel.add('William');
        sandbox.stub(vscode.window, 'showInputBox').callsFake(async () => { panel.hide.fire(); return undefined; });
        await panel.click('小王', '修改别名');
        assert.deepStrictEqual(getCharacterAliases((await vscode.workspace.openTextDocument(uri)).getText()), ['小王', 'William']);
        assert.strictEqual(panel.picker.disposed, false);
        await panel.close();
    });
    test('rapid Enter and closing during an addition write once and finish the confirmed edit', async () => {
        const uri = await aliasFixture();
        const panel = await openAliasPanel(uri);
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        let release!: () => void;
        const gate = new Promise<void>(resolve => { release = resolve; });
        const edit = sandbox.stub(vscode.workspace, 'applyEdit').callsFake(async changes => {
            await gate;
            return apply(changes);
        });
        const adding = panel.add('小王');
        panel.accept.fire();
        const closing = panel.close();
        release();
        await Promise.all([adding, closing]);
        assert.strictEqual(edit.callCount, 1);
        assert.deepStrictEqual(getCharacterAliases((await vscode.workspace.openTextDocument(uri)).getText()), ['小王']);
        assert.strictEqual(panel.picker.disposed, true);
    });
    for (const metadata of ['aliases: broken', 'aliases: [123]', 'aliases: [未闭合']) {
        test(`malformed alias metadata is never overwritten: ${metadata}`, async () => {
            const original = `---\nname: 王明\n${metadata}\n---\n# 王明\n正文`;
            const uri = await aliasFixture(original);
            const panel = await openAliasPanel(uri);
            await panel.add('小王');
            assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), original);
            assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).called);
            await panel.close();
        });
    }
    test('highlighting uses dirty aliases, prefers longer names and drops removed aliases after undo', async () => {
        const uri = await aliasFixture('---\nname: 王明\naliases: [小王]\n---\n# 王明');
        const character = await vscode.workspace.openTextDocument(uri);
        const original = character.getText();
        await vscode.window.showTextDocument(character);
        (ConfigService.getInstance as sinon.SinonStub).returns({ getHighlightStyle: () => ({}), getCharacters: () => [] } as unknown as ConfigService);
        const chapterUri = file('chapters', '别名高亮.md');
        await writeTestFile(chapterUri, '王明 小王 小王子 William <!-- 小王 --> 「小王」');
        const chapter = await vscode.workspace.openTextDocument(chapterUri);
        const decorations = sinon.spy();
        const editor = { document: chapter, setDecorations: decorations } as unknown as vscode.TextEditor;
        const provider = new NovelHighlightProvider();
        const refresh = async () => {
            await provider.refreshCharacterNames();
            decorations.resetHistory();
            await provider.updateHighlights(editor);
            return (decorations.lastCall.args[1] as vscode.Range[]).map(range => chapter.getText(range));
        };
        try {
            assert.deepStrictEqual(await refresh(), ['王明', '小王', '小王']);
            await applyDocumentChange(uri, text => patchFrontMatter(text, { aliases: ['小王', '小王子', 'William'] }));
            assert.deepStrictEqual(await refresh(), ['王明', '小王', '小王子', 'William']);
            assert.deepStrictEqual(getCharacterAliases(await readTestFile(uri)), ['小王']);
            await undoDocumentChange(character, original);
            assert.deepStrictEqual(await refresh(), ['王明', '小王', '小王']);
            await applyDocumentChange(uri, text => patchFrontMatter(text, { aliases: [] }));
            assert.deepStrictEqual(await refresh(), ['王明']);
        } finally { provider.dispose(); }
    });
    test('a character refresh waits for newer overlapping loads before returning', async () => {
        const uri = await aliasFixture('---\nname: 王明\naliases: [小王]\n---\n# 王明');
        (ConfigService.getInstance as sinon.SinonStub).returns({ getHighlightStyle: () => ({}), getCharacters: () => [] } as unknown as ConfigService);
        const provider = new NovelHighlightProvider();
        await provider.refreshCharacterNames();
        let firstStarted!: () => void;
        let newestStarted!: () => void;
        let releaseFirst!: () => void;
        let releaseNewest!: () => void;
        const first = new Promise<void>(resolve => { firstStarted = resolve; });
        const newest = new Promise<void>(resolve => { newestStarted = resolve; });
        const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
        const newestGate = new Promise<void>(resolve => { releaseNewest = resolve; });
        const read = documentIO.readFile;
        let reads = 0;
        sandbox.stub(documentIO, 'readFile').callsFake(async candidate => {
            const bytes = await read(candidate);
            if (candidate.toString() === uri.toString()) {
                if (++reads === 1) { firstStarted(); await firstGate; }
                else { newestStarted(); await newestGate; }
            }
            return bytes;
        });
        let completed = false;
        const earlier = provider.refreshCharacterNames().then(() => { completed = true; });
        let later: Promise<void> | undefined;
        try {
            await first;
            await writeTestFile(uri, '---\nname: 王明\naliases: [小王子]\n---\n# 王明');
            later = provider.refreshCharacterNames();
            await newest;
            releaseFirst();
            await new Promise<void>(resolve => setImmediate(resolve));
            assert.strictEqual(completed, false, '刷新必须等待更新一轮的加载完成');
            releaseNewest();
            await Promise.all([earlier, later]);
            const chapterUri = file('chapters', '并发高亮.md');
            await writeTestFile(chapterUri, '小王子 小王');
            const chapter = await vscode.workspace.openTextDocument(chapterUri);
            const decorations = sinon.spy();
            await provider.updateHighlights({ document: chapter, setDecorations: decorations } as unknown as vscode.TextEditor);
            assert.deepStrictEqual((decorations.lastCall.args[1] as vscode.Range[]).map(range => chapter.getText(range)), ['小王子']);
        } finally {
            releaseFirst(); releaseNewest();
            await Promise.all([earlier, later]);
            provider.dispose();
        }
    });
    test('sidebar tooltip reflects unsaved aliases without adding extra people', async () => {
        const uri = await aliasFixture();
        await applyDocumentChange(uri, text => patchFrontMatter(text, { aliases: ['小王', 'William'] }));
        const items = await new CharacterNodesProvider().getItems();
        assert.strictEqual(items.length, 1);
        assert.strictEqual(items[0].label, '王明');
        assert.ok(items[0].tooltip?.includes('别名：小王、William'));
        assert.strictEqual(items[0].resourceUri?.toString(), uri.toString());
        const shown = NovelerViewProvider.prototype.getTreeItem.call({} as NovelerViewProvider, items[0]);
        assert.strictEqual(shown.resourceUri, undefined);
        assert.strictEqual(shown.tooltip, items[0].tooltip);
        assert.strictEqual(shown.command?.arguments?.[0].toString(), uri.toString());
        assert.strictEqual(shown.contextValue, 'character');
        assert.strictEqual(items[0].resourceUri?.toString(), uri.toString());
        assert.strictEqual((shown.iconPath as vscode.ThemeIcon).id, 'circle-filled');
    });
    test('character renaming preserves aliases and does not add the old name automatically', async () => {
        const uri = await aliasFixture('---\nname: 王明\naliases: [小王, William]\n---\n# 王明\n正文');
        sandbox.stub(vscode.window, 'showInputBox').resolves('王亮');
        await renameCharacter({ resourceUri: uri } as NovelerTreeItem);
        const text = (await vscode.workspace.openTextDocument(file('characters', '王亮.md'))).getText();
        assert.strictEqual(parseFrontMatter(text).data.name, '王亮');
        assert.deepStrictEqual(getCharacterAliases(text), ['小王', 'William']);
    });
    test('a stale alias selection cannot overwrite subsequent alias changes', async () => {
        const uri = await aliasFixture('---\nname: 王明\naliases: [小王]\n---\n# 王明');
        const panel = await openAliasPanel(uri);
        sandbox.stub(vscode.window, 'showInputBox').callsFake(async () => {
            panel.hide.fire();
            await applyDocumentChange(uri, text => patchFrontMatter(text, { aliases: ['老王'] }));
            return 'William';
        });
        await panel.click('小王', '修改别名');
        assert.deepStrictEqual(getCharacterAliases((await vscode.workspace.openTextDocument(uri)).getText()), ['老王']);
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).called);
        await panel.close();
    });
    test('a rejected alias edit leaves the original document intact and reports failure', async () => {
        const uri = await aliasFixture();
        const document = await vscode.workspace.openTextDocument(uri);
        const original = document.getText();
        const panel = await openAliasPanel(uri);
        sandbox.stub(vscode.workspace, 'applyEdit').resolves(false);
        await panel.add('小王');
        assert.strictEqual(document.getText(), original);
        assert.strictEqual(panel.picker.value, '小王');
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).called);
        await panel.close();
    });
    test('creation refuses an existing file without changing it', async () => {
        const uri = file('chapters', '已有.md');
        await writeTestFile(uri, '原正文');
        await assert.rejects(() => createDocument(uri, '新正文'), /未覆盖/);
        assert.strictEqual(await readTestFile(uri), '原正文');
    });
    test('creation stops on permission errors without attempting an edit', async () => {
        sandbox.stub(documentIO, 'stat').rejects(Object.assign(new Error('没有权限'), { code: 'NoPermissions' }));
        const edit = sandbox.spy(vscode.workspace, 'applyEdit');
        await assert.rejects(() => createDocument(file('chapters', '新增.md'), '正文'));
        assert.strictEqual(edit.called, false);
    });
    test('creation refuses a file that appears between validation and the edit', async () => {
        const uri = file('chapters', '竞争.md');
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(async edit => {
            await writeTestFile(uri, '其他操作创建的文件');
            return apply(edit);
        });
        await assert.rejects(() => createDocument(uri, '不能覆盖'));
        assert.strictEqual(await readTestFile(uri), '其他操作创建的文件');
    });
    test('simultaneous chapter creation is refused and the guard is released', async () => {
        let release!: () => void;
        const pending = runChapterCreation(() => new Promise<void>(resolve => { release = resolve; }));
        const action = sinon.spy(async () => undefined);
        await runChapterCreation(action);
        assert.strictEqual(action.called, false);
        release(); await pending;
        await runChapterCreation(action);
        assert.strictEqual(action.calledOnce, true);
    });
    test('initialization escapes the project name and preserves existing word libraries', async () => {
        await vscode.workspace.fs.delete(file('novel.jsonc'));
        await vscode.workspace.fs.createDirectory(file('.noveler', 'sensitive-words'));
        await writeTestFile(file('.noveler', 'sensitive-words', 'custom-words.jsonc'), '{"words":["自定义词"]}');
        await writeTestFile(file('.noveler', 'sensitive-words', 'whitelist.jsonc'), '{"words":["白名单词"]}');
        await vscode.workspace.fs.createDirectory(file('references'));
        await writeTestFile(file('references', '参考资料.md'), '已有参考资料必须保留');
        sandbox.stub(vscode.window, 'showInputBox').resolves('我的"小说" $&');
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: false } as unknown as vscode.QuickPickItem);
        await initProject({ extensionUri: vscode.Uri.file(__dirname + '/../../..') } as vscode.ExtensionContext);
        assert.strictEqual(parse(await readTestFile(file('novel.jsonc'))).name, '我的"小说" $&');
        assert.ok((await readTestFile(file('README.md'))).includes('我的"小说" $&'));
        assert.strictEqual(await readTestFile(file('.noveler', 'sensitive-words', 'custom-words.jsonc')), '{"words":["自定义词"]}');
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('重新初始化');
        await initProject({ extensionUri: vscode.Uri.file(__dirname + '/../../..') } as vscode.ExtensionContext);
        assert.strictEqual(await readTestFile(file('.noveler', 'sensitive-words', 'custom-words.jsonc')), '{"words":["自定义词"]}');
        assert.strictEqual(await readTestFile(file('.noveler', 'sensitive-words', 'whitelist.jsonc')), '{"words":["白名单词"]}');
        assert.strictEqual(await readTestFile(file('references', '参考资料.md')), '已有参考资料必须保留');
    });

    test('volume rename saves dirty documents and preserves JSONC comments and custom fields', async () => {
        const volume = await volumeFixture();
        const metadata = file('chapters', volume.folderName, 'volume.json');
        await applyDocumentChange(metadata, text => text.replace('原描述', '未保存描述'));
        const chapter = file('chapters', volume.folderName, '第01章.md');
        await writeTestFile(chapter, '旧正文');
        await applyDocumentChange(chapter, () => '未保存正文');
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        const text = await readTestFile(file('chapters', '第01卷-新卷', 'volume.json'));
        assert.ok(text.includes('// 卷备注必须保留'));
        assert.strictEqual(parse(text).description, '未保存描述');
        assert.strictEqual(parse(text).custom, 42);
        assert.strictEqual(parse(text).title, '新卷');
        assert.strictEqual(await readTestFile(file('chapters', '第01卷-新卷', '第01章.md')), '未保存正文');
        assert.strictEqual(await fileExists(file('chapters', volume.folderName)), false);
    });
    test('volume type conflicts do not change metadata', async () => {
        const volume = await volumeFixture();
        await vscode.workspace.fs.createDirectory(file('chapters', '前传01-起点'));
        const uri = file('chapters', volume.folderName, 'volume.json');
        const original = await readTestFile(uri);
        sandbox.stub(vscode.window, 'showQuickPick').onFirstCall().resolves({ action: 'type' } as unknown as vscode.QuickPickItem).onSecondCall().resolves({ type: 'prequel' } as unknown as vscode.QuickPickItem);
        await editVolumeProperties(item(volume));
        assert.strictEqual(await readTestFile(uri), original);
        assert.ok(await fileExists(file('chapters', volume.folderName)));
    });
    test('volume status updates retain unsaved descriptions and JSONC comments', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        await applyDocumentChange(uri, text => text.replace('原描述', '最新描述'));
        sandbox.stub(vscode.window, 'showQuickPick').onFirstCall().resolves({ action: 'status' } as unknown as vscode.QuickPickItem)
            .onSecondCall().resolves({ status: 'writing' } as unknown as vscode.QuickPickItem);
        await editVolumeProperties(item(volume));
        const text = await readTestFile(uri);
        assert.strictEqual(parse(text).status, 'writing');
        assert.strictEqual(parse(text).description, '最新描述');
        assert.ok(text.includes('// 卷备注必须保留'));
    });
    test('volume type changes keep directory and metadata numbering consistent', async () => {
        const volume = await volumeFixture();
        sandbox.stub(vscode.window, 'showQuickPick').onFirstCall().resolves({ action: 'type' } as unknown as vscode.QuickPickItem)
            .onSecondCall().resolves({ type: 'extra' } as unknown as vscode.QuickPickItem);
        await editVolumeProperties(item(volume));
        const metadata = parse(await readTestFile(file('chapters', '番外01-起点', 'volume.json')));
        assert.strictEqual(metadata.volumeType, 'extra');
        assert.strictEqual(metadata.volume, 2001);
        assert.strictEqual(await fileExists(file('chapters', volume.folderName)), false);
    });
    test('invalid volume metadata stops rather than replacing it with defaults', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        await writeTestFile(uri, '{invalid');
        sandbox.stub(vscode.window, 'showQuickPick').onFirstCall().resolves({ action: 'status' } as unknown as vscode.QuickPickItem).onSecondCall().resolves({ status: 'writing' } as unknown as vscode.QuickPickItem);
        await editVolumeProperties(item(volume));
        assert.strictEqual(await readTestFile(uri), '{invalid');
    });
    test('cancelled document saves stop a volume rename', async () => {
        const volume = await volumeFixture();
        await applyDocumentChange(file('chapters', volume.folderName, 'volume.json'), text => text.replace('原描述', '未保存描述'));
        sandbox.stub(documentIO, 'save').resolves(false);
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        assert.ok(await fileExists(file('chapters', volume.folderName)));
        assert.strictEqual(await fileExists(file('chapters', '第01卷-新卷')), false);
    });
    test('failed directory rename restores original metadata', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        const original = await readTestFile(uri);
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(edit => edit.entries().length ? apply(edit) : Promise.resolve(false));
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        assert.strictEqual(await readTestFile(uri), original);
        assert.ok(await fileExists(file('chapters', volume.folderName)));
        assert.strictEqual((vscode.window.showInformationMessage as sinon.SinonStub).called, false);
    });
    test('metadata save failure restores the original and does not rename the directory', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        const original = await readTestFile(uri);
        const save = documentIO.save;
        sandbox.stub(documentIO, 'save').onFirstCall().resolves(false).callsFake(document => save(document));
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        assert.strictEqual(await readTestFile(uri), original);
        assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), original);
        assert.strictEqual(await fileExists(file('chapters', '第01卷-新卷')), false);
        assert.strictEqual((vscode.window.showInformationMessage as sinon.SinonStub).called, false);
    });
    test('failed restoration leaves a recovery copy of the original metadata', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        const original = await readTestFile(uri);
        sandbox.stub(documentIO, 'save').resolves(false);
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        const entries = await vscode.workspace.fs.readDirectory(file('.noveler', 'backups'));
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(await readTestFile(file('.noveler', 'backups', entries[0][0])), original);
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).lastCall.args[0].includes(entries[0][0]));
    });
    test('restoration preserves edits made while a rename fails', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        const original = await readTestFile(uri);
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(async edit => {
            if (edit.entries().length) { return apply(edit); }
            await applyDocumentChange(uri, text => text.replace('原描述', '操作期间的新修改'));
            return false;
        });
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        assert.ok((await vscode.workspace.openTextDocument(uri)).getText().includes('操作期间的新修改'));
        const entries = await vscode.workspace.fs.readDirectory(file('.noveler', 'backups'));
        assert.strictEqual(await readTestFile(file('.noveler', 'backups', entries[0][0])), original);
    });
    test('restoration rechecks content after asynchronously opening the document', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        const original = await readTestFile(uri);
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        const open = vscode.workspace.openTextDocument.bind(vscode.workspace);
        let failing = false;
        let recoveryReads = 0;
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(edit => {
            if (edit.entries().length) { return apply(edit); }
            failing = true;
            return Promise.resolve(false);
        });
        sandbox.stub(vscode.workspace, 'openTextDocument').callsFake(async (input: unknown) => {
            const candidate = input as vscode.Uri;
            const document = await open(candidate);
            if (failing && candidate.toString() === uri.toString() && ++recoveryReads === 2) {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
                    document.getText().replace('原描述', '恢复期间的新修改'));
                await apply(edit);
            }
            return document;
        });
        sandbox.stub(vscode.window, 'showInputBox').resolves('新卷');
        await renameVolume(item(volume));
        assert.ok((await open(uri)).getText().includes('恢复期间的新修改'));
        const entries = await vscode.workspace.fs.readDirectory(file('.noveler', 'backups'));
        assert.strictEqual(await readTestFile(file('.noveler', 'backups', entries[0][0])), original);
    });
    test('volume deletion requests trash and never falls back to permanent deletion', async () => {
        const volume = await volumeFixture();
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('删除');
        const deleted = sandbox.stub(documentIO, 'delete').rejects(new Error('当前不支持废纸篓'));
        await deleteVolume(item(volume));
        assert.strictEqual(deleted.calledOnce, true);
        assert.deepStrictEqual(deleted.firstCall.args[1], { recursive: true, useTrash: true });
        assert.ok(await fileExists(file('chapters', volume.folderName)));
    });
    test('volume deletion stops when a dirty document cannot be saved', async () => {
        const volume = await volumeFixture();
        const uri = file('chapters', volume.folderName, 'volume.json');
        await applyDocumentChange(uri, text => text.replace('原描述', '未保存资料'));
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('删除');
        sandbox.stub(documentIO, 'save').resolves(false);
        const deleted = sandbox.spy(documentIO, 'delete');
        await deleteVolume(item(volume));
        assert.strictEqual(deleted.called, false);
        assert.ok((await vscode.workspace.openTextDocument(uri)).getText().includes('未保存资料'));
        assert.ok(await fileExists(file('chapters', volume.folderName)));
    });
    test('trash confirmation provides a mouse entrance to the recovery directory', async () => {
        const volume = await volumeFixture();
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('删除');
        (vscode.window.showInformationMessage as sinon.SinonStub).resolves('定位恢复目录');
        sandbox.stub(documentIO, 'delete').resolves();
        const execute = vscode.commands.executeCommand as sinon.SinonStub;
        execute.withArgs('revealFileInOS').resolves();
        await deleteVolume(item(volume));
        const call = execute.getCalls().find(entry => entry.args[0] === 'revealFileInOS');
        assert.ok(call);
        assert.strictEqual(call.args[1].toString(), file('chapters').toString());
        assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).lastCall.args[0].includes('整个卷文件夹'));
    });

    test('README update preserves dirty remarks and can be undone', async () => {
        await readmeFixture(readme);
        const uri = file('README.md');
        await applyDocumentChange(uri, text => text + '未保存备注ABC123\n');
        const document = await vscode.workspace.openTextDocument(uri);
        const before = document.getText();
        await vscode.window.showTextDocument(document);
        await updateReadme(true);
        assert.ok(document.getText().includes('未保存备注ABC123'));
        assert.ok(document.getText().includes('[开篇](chapters/第01章.md)'));
        await undoDocumentChange(document, before);
        assert.strictEqual(document.getText(), before);
    });
    test('README example headings, comments and unrelated sections are preserved', async () => {
        const examples = '# 小说\n```md\n<!--\n## 目录\n```\n<!--\n## 写作进度\n-->\n\n';
        await readmeFixture(examples + readme.replace('## 写作进度', '## 自定义说明\n不能删除\n\n## 写作进度'));
        await updateReadme(true);
        const text = await readTestFile(file('README.md'));
        assert.ok(text.startsWith(examples));
        assert.ok(text.includes('## 自定义说明\n不能删除'));
        assert.ok(text.includes('[开篇](chapters/第01章.md)'));
    });
    test('README duplicate managed headings stop without writes', async () => {
        await readmeFixture(readme + '\n## 目录\n不能删除\n');
        const original = await readTestFile(file('README.md'));
        await updateReadme(true);
        assert.strictEqual(await readTestFile(file('README.md')), original);
    });
    test('README update preserves CRLF and remains idempotent', async () => {
        await readmeFixture(readme.replace(/\n/g, '\r\n'));
        await updateReadme(true);
        const once = await readTestFile(file('README.md'));
        assert.ok(!once.replace(/\r\n/g, '').includes('\n'));
        await updateReadme(true);
        assert.strictEqual(await readTestFile(file('README.md')), once);
    });
    test('cancelling missing README sections leaves the document unchanged', async () => {
        (ConfigService.getInstance as sinon.SinonStub).returns({ getReadmeAutoUpdateMode: () => 'ask' } as unknown as ConfigService);
        const original = '# 自定义项目说明\n不允许修改\n';
        await writeTestFile(file('README.md'), original);
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('取消');
        await updateReadme();
        assert.strictEqual(await readTestFile(file('README.md')), original);
        assert.strictEqual((vscode.window.showInformationMessage as sinon.SinonStub).called, false);
    });
    test('JSONC patches preserve comments, trailing commas and reject invalid roots', () => {
        const source = '{\r\n // 备注\r\n "status": "planning", "custom": 42,\r\n}';
        const result = patchJsoncFields(source, { status: 'writing' });
        assert.ok(result.includes('// 备注'));
        assert.strictEqual(parse(result).custom, 42);
        assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
        for (const text of ['{bad', '[]', 'null']) { assert.throws(() => patchJsoncFields(text, { status: 'writing' })); }
    });

    for (const mode of ['volume', 'global', 'mixed']) {
        test(`next chapter number uses the maximum in ${mode} mode`, async () => {
            const first = await volumeFixture();
            const second = await volumeFixture('第02卷-转折', 'main', 2);
            const extra = await volumeFixture('番外01-附录', 'extra', 2001);
            await writeTestFile(file('chapters', first.folderName, '第01章-A.md'), '---\nchapter: 1\n---\n正文');
            await writeTestFile(file('chapters', first.folderName, '第三章-C.md'), '---\nchapter: 3\n---\n正文');
            await writeTestFile(file('chapters', second.folderName, '第08章-H.md'), '---\nchapter: 8\n---\n正文');
            await writeTestFile(file('chapters', extra.folderName, '第20章-T.md'), '---\nchapter: 20\n---\n正文');
            const config = { enabled: true, folderStructure: 'nested', chapterNumbering: mode };
            (ConfigService.getInstance as sinon.SinonStub).returns({ getVolumesConfig: () => config } as unknown as ConfigService);
            const service = Object.create(VolumeService.prototype) as VolumeService;
            Object.assign(service, { configService: ConfigService.getInstance(), volumes: [], cacheTimestamp: 0 });
            assert.strictEqual(await service.calculateNextChapterNumber(first), mode === 'volume' ? 4 : mode === 'global' ? 21 : 9);
            const uri = file('chapters', first.folderName, '第01章-A.md');
            await applyDocumentChange(uri, text => text.replace('chapter: 1', 'chapter: 25'));
            assert.strictEqual(await service.calculateNextChapterNumber(first), 26);
        });
    }
    test('flat numbering reads legacy Chinese and Roman filenames and metadata', async () => {
        (ConfigService.getInstance as sinon.SinonStub).returns({ getVolumesConfig: () => ({ enabled: false }) } as unknown as ConfigService);
        const service = Object.create(VolumeService.prototype) as VolumeService;
        Object.assign(service, { configService: ConfigService.getInstance() });
        await writeTestFile(file('chapters', '第L章-旧稿.md'), '正文');
        await writeTestFile(file('chapters', '自定义标题.md'), '---\nchapter: 60\n---\n正文');
        assert.strictEqual(await service.calculateNextChapterNumber(), 61);
    });
    test('legacy Chinese chapter numbers above ninety-nine are recognized', async () => {
        (ConfigService.getInstance as sinon.SinonStub).returns({ getVolumesConfig: () => ({ enabled: false }) } as unknown as ConfigService);
        const service = Object.create(VolumeService.prototype) as VolumeService;
        Object.assign(service, { configService: ConfigService.getInstance() });
        for (const [name, expected] of [['一百二十', 121], ['一千零一', 1002], ['一万零三十', 10031]] as const) {
            await writeTestFile(file('chapters', `第${name}章-旧稿.md`), '正文');
            assert.strictEqual(await service.calculateNextChapterNumber(), expected);
        }
    });
});
