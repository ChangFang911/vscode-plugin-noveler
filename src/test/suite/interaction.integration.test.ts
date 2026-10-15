import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { readFileSync } from 'fs';
import * as path from 'path';
import { CharacterNodesProvider } from '../../views/nodes/characterNodes';
import { ChapterNodesProvider } from '../../views/nodes/chapterNodes';
import { NovelerViewProvider, NovelerTreeItem } from '../../views/novelerViewProvider';
import { setCharacterImportance } from '../../commands/contextMenuCommands';
import { createCharacter } from '../../commands/createCharacter';
import { initProject } from '../../commands/initProject';
import { openSensitiveWordsConfig } from '../../commands/openSensitiveWordsConfigCommand';
import { ChapterCodeLensProvider } from '../../providers/codeLensProvider';
import { ConfigService } from '../../services/configService';
import { SensitiveWordService } from '../../services/sensitiveWordService';
import { VolumeService } from '../../services/volumeService';
import { WordCountService } from '../../services/wordCountService';
import { VolumeInfo } from '../../types/volume';
import { applyDocumentChange, documentIO, fileExists } from '../../utils/documentOperations';
import { parseFrontMatter } from '../../utils/frontMatterParser';
import { initTemplateLoader } from '../../utils/templateLoader';
import { createTestWorkspace, removeTestWorkspace, writeTestFile, readTestFile, undoDocumentChange } from './testWorkspace';

suite('Simple Writing Interactions Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    const file = (...parts: string[]) => vscode.Uri.joinPath(root, ...parts);
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, name: '交互验证', index: 0 });
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        initTemplateLoader({ extensionUri: vscode.Uri.file(path.resolve(__dirname, '../../..')) } as vscode.ExtensionContext);
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function character(filename: string, content: string) {
        await vscode.workspace.fs.createDirectory(file('characters'));
        const uri = file('characters', filename + '.md');
        await writeTestFile(uri, content);
        return uri;
    }
    function nodes() { return new CharacterNodesProvider().getItems(); }

    test('importance sorting keeps names compact, stars only protagonists and preserves details in hover', async () => {
        const entries = [
            ['a', 'Z主角', '主角'], ['z', 'A主角', '主角'], ['b', '重要人物', '重要配角'],
            ['c', '次要人物', '次要配角'], ['d', '普通人物', '路人'], ['e', '自定义人物', '反派'], ['f', '旧人物', '']
        ];
        for (const [filename, name, importance] of entries) {
            await character(filename, `---\nname: ${name}\n${importance ? `importance: ${importance}\n` : ''}role: 剑修\naliases: [小名]\n---\n# ${name}`);
        }
        const items = await nodes();
        assert.deepStrictEqual(items.map(item => item.label), ['A主角', 'Z主角', '重要人物', '次要人物', '普通人物',
            ...['旧人物', '自定义人物'].sort((a, b) => a.localeCompare(b, 'zh-CN'))]);
        for (const item of items) {
            assert.strictEqual(item.description, undefined);
            const shown = NovelerViewProvider.prototype.getTreeItem.call({} as NovelerViewProvider, item);
            assert.strictEqual(shown.resourceUri, undefined);
            const icons: Record<string, string> = { 'A主角': 'star-full', 'Z主角': 'star-full',
                '重要人物': 'debug-stop', '次要人物': 'triangle-up', '普通人物': 'person' };
            assert.strictEqual((shown.iconPath as vscode.ThemeIcon).id, icons[item.label] ?? 'person');
            assert.strictEqual(shown.id, item.resourceUri?.toString());
            assert.ok(item.tooltip?.includes('身份：剑修'));
            assert.ok(item.tooltip?.includes('别名：小名'));
            assert.strictEqual(item.command?.arguments?.[0], item.resourceUri);
        }
        assert.ok(items.find(item => item.label === '旧人物')!.tooltip?.includes('定位：未设置'));
        assert.ok(!(await readTestFile(file('characters', 'f.md'))).includes('importance:'));
    });
    test('older sidebar scans cannot restore protagonist order after a demotion', async () => {
        await character('00', '# 临时');
        await character('99', '# 临时');
        const names = (await vscode.workspace.fs.readDirectory(file('characters'))).map(([name]) => name);
        const protagonist = file('characters', names[0]);
        const supporting = file('characters', names[1]);
        await writeTestFile(protagonist, '---\nname: 原主角\nimportance: 主角\n---\n# 原主角');
        await writeTestFile(supporting, '---\nname: 重要人物\nimportance: 重要配角\n---\n# 重要人物');
        await vscode.workspace.openTextDocument(protagonist);
        let started!: () => void;
        let release!: () => void;
        const reading = new Promise<void>(resolve => { started = resolve; });
        const gate = new Promise<void>(resolve => { release = resolve; });
        const read = documentIO.readFile;
        let blocked = false;
        sandbox.stub(documentIO, 'readFile').callsFake(async uri => {
            const bytes = await read(uri);
            if (uri.toString() === supporting.toString() && !blocked) {
                blocked = true; started(); await gate;
            }
            return bytes;
        });
        const provider = new CharacterNodesProvider();
        const older = provider.getItems();
        try {
            await reading;
            await applyDocumentChange(protagonist, text => text.replace('importance: 主角', 'importance: 路人'));
            const current = await provider.getItems();
            assert.deepStrictEqual(current.map(item => item.label), ['重要人物', '原主角']);
            release();
            assert.deepStrictEqual((await older).map(item => item.label), ['重要人物', '原主角']);
        } finally { release(); await older; }
    });
    test('changing an old profile via its title targets that file, preserves dirty prose and comments, and undo restores sorting', async () => {
        const uri = await character('旧人物', '---\r\n# 备注\r\nname: 旧人物\r\naliases: [旧称]\r\nrole: 剑修\r\n---\r\n# 旧人物\r\n正文');
        await character('配角', '---\nname: 配角\nimportance: 重要配角\n---\n# 配角');
        await applyDocumentChange(uri, text => text + '\r\n未保存正文');
        const document = await vscode.workspace.openTextDocument(uri);
        const before = document.getText();
        const other = await character('另一人', '# 另一人');
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(other));
        const lens = (await new ChapterCodeLensProvider({} as WordCountService).provideCodeLenses(document, {} as vscode.CancellationToken))
            .find(lens => lens.command?.command === 'noveler.setCharacterImportance');
        assert.ok(lens);
        assert.strictEqual(lens.command?.title, '定位：未设置');
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: '主角' } as unknown as vscode.QuickPickItem);
        await setCharacterImportance(lens.command!.arguments![0]);
        assert.strictEqual((await nodes())[0].label, '旧人物');
        assert.strictEqual(parseFrontMatter(document.getText()).data.importance, '主角');
        assert.ok(document.getText().includes('# 备注\r\n'));
        assert.ok(document.getText().endsWith('正文\r\n未保存正文'));
        assert.ok(!document.getText().replace(/\r\n/g, '').includes('\n'));
        assert.strictEqual(await readTestFile(other), '# 另一人');
        await undoDocumentChange(document, before);
        assert.strictEqual((await nodes())[0].label, '配角');
        const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        assert.ok(manifest.contributes.menus['view/item/context'].some((entry: { command: string; when: string }) =>
            entry.command === 'noveler.setCharacterImportance' && entry.when.includes('viewItem == character')));
    });
    test('demoting a protagonist immediately reorders the list and the notification can undo only that change', async () => {
        const uri = await character('主角', '---\r\n# 保留注释\r\nname: 原主角\r\nimportance: 主角\r\naliases: [旧称]\r\n---\r\n# 原主角\r\n正文');
        await character('配角', '---\nname: 重要人物\nimportance: 重要配角\n---\n# 重要人物');
        const document = await vscode.workspace.openTextDocument(uri);
        const before = document.getText();
        const order: string[][] = [];
        const refreshes: Promise<void>[] = [];
        const refresh = () => { refreshes.push(nodes().then(items => { order.push(items.map(item => item.label)); })); };
        const choose = sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: '路人' } as unknown as vscode.QuickPickItem);
        (vscode.window.showInformationMessage as sinon.SinonStub).callsFake(async () => {
            await Promise.all(refreshes);
            assert.deepStrictEqual(order[0], ['重要人物', '原主角']);
            assert.strictEqual(((await nodes())[1].iconPath as vscode.ThemeIcon).id, 'person');
            return '撤销';
        });
        await setCharacterImportance(uri, refresh);
        await Promise.all(refreshes);
        assert.strictEqual(document.getText(), before);
        assert.deepStrictEqual(order[1], ['原主角', '重要人物']);
        assert.strictEqual(((await nodes())[0].iconPath as vscode.ThemeIcon).id, 'star-full');
        choose.resolves({ value: '次要配角' } as unknown as vscode.QuickPickItem);
        (vscode.window.showInformationMessage as sinon.SinonStub).resolves();
        await setCharacterImportance(uri);
        assert.strictEqual(((await nodes())[1].iconPath as vscode.ThemeIcon).id, 'triangle-up');
    });
    test('undoing importance insertion restores an old profile exactly without adding an empty field', async () => {
        const uri = await character('旧人物', '# 旧人物\n正文');
        const document = await vscode.workspace.openTextDocument(uri);
        const before = document.getText();
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: '主角' } as unknown as vscode.QuickPickItem);
        (vscode.window.showInformationMessage as sinon.SinonStub).resolves('撤销');
        await setCharacterImportance(uri);
        assert.strictEqual(document.getText(), before);
    });
    test('a stale undo notification never overwrites new prose or a newer importance change', async () => {
        const uri = await character('人物', '---\nname: 人物\nimportance: 主角\n---\n# 人物');
        const choose = sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: '路人' } as unknown as vscode.QuickPickItem);
        const notification = vscode.window.showInformationMessage as sinon.SinonStub;
        notification.callsFake(async () => {
            await applyDocumentChange(uri, text => text + '\n期间编辑');
            return '撤销';
        });
        await setCharacterImportance(uri);
        const document = await vscode.workspace.openTextDocument(uri);
        assert.ok(document.getText().endsWith('期间编辑'));
        assert.strictEqual(parseFrontMatter(document.getText()).data.importance, '路人');
        choose.resolves({ value: '主角' } as unknown as vscode.QuickPickItem);
        notification.callsFake(async () => {
            await applyDocumentChange(uri, text => text.replace('importance: 主角', 'importance: 重要配角'));
            return '撤销';
        });
        await setCharacterImportance(uri);
        assert.strictEqual(parseFrontMatter(document.getText()).data.importance, '重要配角');
        assert.strictEqual((vscode.window.showWarningMessage as sinon.SinonStub).callCount, 2);
    });
    test('same-name character IDs remain unique and stable when their order changes', async () => {
        const first = await character('甲', '---\nname: 同名\nimportance: 主角\n---\n# 同名');
        const second = await character('乙', '---\nname: 同名\nimportance: 重要配角\n---\n# 同名');
        const before = await nodes();
        assert.deepStrictEqual(before.map(item => item.id), [first.toString(), second.toString()]);
        await applyDocumentChange(first, text => text.replace('importance: 主角', 'importance: 路人'));
        assert.deepStrictEqual((await nodes()).map(item => item.id), [second.toString(), first.toString()]);
    });
    test('cancelled importance changes and cancelled character creation leave profiles unchanged', async () => {
        const uri = await character('旧人物', '# 旧人物');
        sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);
        await setCharacterImportance({ resourceUri: uri });
        await createCharacter('取消创建');
        assert.strictEqual(await readTestFile(uri), '# 旧人物');
        assert.strictEqual(await fileExists(file('characters', '取消创建.md')), false);
        assert.strictEqual((vscode.window.showInformationMessage as sinon.SinonStub).called, false);
    });
    test('stale importance dialogs merge unrelated edits but refuse overwriting a newer importance', async () => {
        const uri = await character('旧人物', '---\nname: 旧人物\nimportance: 路人\n---\n# 旧人物');
        const choice = sandbox.stub(vscode.window, 'showQuickPick').callsFake(async () => {
            await applyDocumentChange(uri, text => text + '\n期间编辑');
            return { value: '主角' } as unknown as vscode.QuickPickItem;
        });
        await setCharacterImportance(uri);
        const document = await vscode.workspace.openTextDocument(uri);
        assert.ok(document.getText().endsWith('期间编辑'));
        assert.strictEqual(parseFrontMatter(document.getText()).data.importance, '主角');
        choice.callsFake(async () => {
            await applyDocumentChange(uri, text => text.replace('importance: 主角', 'importance: 次要配角'));
            return { value: '路人' } as unknown as vscode.QuickPickItem;
        });
        await setCharacterImportance(uri);
        assert.strictEqual(parseFrontMatter(document.getText()).data.importance, '次要配角');
        assert.strictEqual((vscode.window.showErrorMessage as sinon.SinonStub).calledOnce, true);
    });
    test('invalid metadata and chapter targets cannot be changed into character profiles', async () => {
        const uri = await character('坏档案', '---\nname: [\n---\n# 旧人物');
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ value: '主角' } as unknown as vscode.QuickPickItem);
        await setCharacterImportance(uri);
        assert.strictEqual(await readTestFile(uri), '---\nname: [\n---\n# 旧人物');
        const chapter = file('chapters', '正文.md');
        await writeTestFile(chapter, '# 正文');
        await setCharacterImportance(chapter);
        assert.strictEqual(await readTestFile(chapter), '# 正文');
    });
    test('empty lists route creation to the correct command and the exact selected volume', async () => {
        await vscode.workspace.fs.createDirectory(file('characters'));
        assert.strictEqual((await nodes())[0].command?.command, 'noveler.createCharacter');
        const config = { isVolumesEnabled: () => false } as ConfigService;
        const provider = new ChapterNodesProvider({ scanVolumes: async () => [] } as unknown as VolumeService, config);
        assert.strictEqual((await provider.getChapterItems())[0].command?.command, 'noveler.createChapter');
        config.isVolumesEnabled = () => true;
        assert.strictEqual((await provider.getChapterItems())[0].command?.command, 'noveler.createVolume');
        await vscode.workspace.fs.createDirectory(file('chapters', '第02卷-目标卷'));
        await writeTestFile(file('chapters', '第02卷-目标卷', 'outline.md'), '# 卷大纲');
        const volume = { metadata: { folderName: '第02卷-目标卷', title: '目标卷', chapters: [] } as unknown as VolumeInfo } as NovelerTreeItem;
        const volumeItems = await provider.getVolumeChapterItems(volume);
        assert.ok(volumeItems.some(item => item.label === '卷大纲'));
        const empty = volumeItems.find(item => item.command?.command === 'noveler.createChapterInVolume')!;
        assert.ok(empty);
        assert.strictEqual(empty.command?.command, 'noveler.createChapterInVolume');
        assert.strictEqual(empty.command?.arguments?.[0], volume);
    });
    test('no-folder project creation offers a folder picker and never initializes the current context', async () => {
        (documentIO.workspaceFolder as sinon.SinonStub).returns(undefined);
        (vscode.window.showInformationMessage as sinon.SinonStub).resolves('选择小说文件夹');
        const open = sandbox.stub(vscode.window, 'showOpenDialog').resolves([root]);
        const execute = sandbox.stub(vscode.commands, 'executeCommand').resolves();
        await initProject({} as vscode.ExtensionContext);
        assert.ok(open.firstCall.args[0]?.canSelectFolders);
        assert.strictEqual(execute.firstCall.args[0], 'vscode.openFolder');
        assert.strictEqual(execute.firstCall.args[1], root);
        open.resolves(undefined);
        execute.resetHistory();
        await initProject({} as vscode.ExtensionContext);
        assert.strictEqual(execute.called, false);
    });
    test('advanced word library entrances honor configuration and JSON fallback without writing files', async () => {
        const config = { whitelist: { path: 'references/我的白名单.jsonc' } };
        sandbox.stub(SensitiveWordService, 'getInstance').returns({ getConfig: () => config } as unknown as SensitiveWordService);
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ action: 'whitelist' } as unknown as vscode.QuickPickItem);
        await vscode.workspace.fs.createDirectory(file('references'));
        const uri = file('references', '我的白名单.json');
        await writeTestFile(uri, '{ "words": [] }');
        await openSensitiveWordsConfig();
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), uri.toString());
        assert.strictEqual(await readTestFile(uri), '{ "words": [] }');
        const stat = documentIO.stat;
        sandbox.stub(documentIO, 'stat').callsFake(candidate => candidate.fsPath.includes('我的白名单')
            ? Promise.reject(vscode.FileSystemError.NoPermissions('拒绝访问')) : stat(candidate));
        await openSensitiveWordsConfig();
        assert.strictEqual((vscode.window.showErrorMessage as sinon.SinonStub).calledOnce, true);
        assert.strictEqual((vscode.window.showWarningMessage as sinon.SinonStub).called, false);
    });
});
