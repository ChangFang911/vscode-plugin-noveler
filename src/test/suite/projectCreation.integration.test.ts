import * as assert from 'assert';
import * as path from 'path';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { parse, ParseError } from 'jsonc-parser';
import { initProject } from '../../commands/initProject';
import { ConfigService } from '../../services/configService';
import { VolumeService } from '../../services/volumeService';
import { documentIO } from '../../utils/documentOperations';
import { initTemplateLoader } from '../../utils/templateLoader';
import { PROJECT_DIRECTORIES, CURRENT_CONFIG_VERSION } from '../../constants';
import { readTestFile, writeTestFile, removeTestWorkspace } from './testWorkspace';

suite('Project Creation Real Files Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    const context = { extensionUri: vscode.Uri.file(path.resolve(__dirname, '../../..')) } as vscode.ExtensionContext;
    const file = (...parts: string[]) => vscode.Uri.joinPath(root, ...parts);
    setup(async () => {
        root = vscode.Uri.file(await mkdtemp(path.join(process.env.NOVELER_TEST_WORKSPACE || tmpdir(), 'noveler-empty-')));
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, name: '空目录测试', index: 0 });
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        const backgroundConfig = Object.create(ConfigService.prototype) as ConfigService;
        backgroundConfig['setDefaultConfig']();
        backgroundConfig['config'].autoUpdateReadmeOnCreate = { value: 'never' };
        sandbox.stub(ConfigService, 'getInstance').returns(backgroundConfig);
        const execute = vscode.commands.executeCommand.bind(vscode.commands);
        sandbox.stub(vscode.commands, 'executeCommand').callsFake((command: string, ...args: unknown[]) =>
            command === 'noveler.refresh' ? Promise.resolve(undefined) : execute(command, ...args));
        initTemplateLoader(context);
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function initialize(enabled: boolean, numberFormat = 'arabic') {
        sandbox.stub(vscode.window, 'showInputBox').resolves('空目录中的小说');
        const choices = sandbox.stub(vscode.window, 'showQuickPick');
        choices.onFirstCall().resolves({ value: enabled } as unknown as vscode.QuickPickItem);
        choices.onSecondCall().resolves({ value: numberFormat } as unknown as vscode.QuickPickItem);
        await initProject(context);
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).notCalled);
        const errors: ParseError[] = [];
        const config = parse(await readTestFile(file('novel.jsonc')), errors);
        assert.deepStrictEqual(errors, []);
        return config;
    }

    for (const [enabled, format] of [[false, 'arabic'], [true, 'arabic'], [true, 'chinese'], [true, 'roman']] as const) {
        test(`empty folder initialization creates usable ${enabled ? 'volume' : 'chapter'} mode with ${format} numbering`, async () => {
            assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(root), []);
            const config = await initialize(enabled, format);
            assert.strictEqual(config.name, '空目录中的小说');
            assert.strictEqual(config.version, CURRENT_CONFIG_VERSION);
            assert.strictEqual(config.noveler.volumes.enabled, enabled);
            assert.strictEqual(config.noveler.volumes.folderStructure, enabled ? 'nested' : 'flat');
            assert.strictEqual(config.noveler.volumes.numberFormat, format);
            const template = parse(await readTestFile(vscode.Uri.joinPath(context.extensionUri, 'templates', 'default-config.jsonc')));
            const unrelated = { ...config.noveler };
            const expectedUnrelated = { ...template.noveler };
            delete unrelated.volumes;
            delete expectedUnrelated.volumes;
            assert.deepStrictEqual(unrelated, expectedUnrelated, '选择组织方式不能改动护眼、敏感词等其他配置');
            for (const dir of PROJECT_DIRECTORIES) {
                assert.strictEqual((await vscode.workspace.fs.stat(file(dir))).type, vscode.FileType.Directory);
            }
            assert.ok((await readTestFile(file('README.md'))).includes(config.name));
            assert.ok((await readTestFile(file('drafts', '大纲.md'))).includes(config.name));
            assert.ok((await readTestFile(file('references', '参考资料.md'))).length > 0);
            for (const library of ['custom-words.jsonc', 'whitelist.jsonc']) {
                assert.deepStrictEqual(parse(await readTestFile(file('.noveler', 'sensitive-words', library))).words, []);
            }
            const settings = parse(await readTestFile(file('.vscode', 'settings.json')));
            assert.strictEqual(settings['files.autoSave'], 'afterDelay');
            assert.strictEqual(settings['files.autoSaveDelay'], 2000);
            const active = vscode.window.activeTextEditor?.document;
            assert.strictEqual(active?.uri.toString(), file('README.md').toString());
            assert.strictEqual(active?.isDirty, false);
        });
    }
    for (const stage of ['name', 'mode', 'number'] as const) {
        test(`cancelling ${stage} leaves the empty directory untouched`, async () => {
            sandbox.stub(vscode.window, 'showInputBox').resolves(stage === 'name' ? undefined : '取消测试');
            const choices = sandbox.stub(vscode.window, 'showQuickPick');
            choices.onFirstCall().resolves(stage === 'mode' ? undefined : { value: true } as unknown as vscode.QuickPickItem);
            choices.onSecondCall().resolves(undefined);
            await initProject(context);
            assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(root), []);
            assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).notCalled);
        });
    }
    test('dismissing the folder guidance does not open a picker or write files', async () => {
        (documentIO.workspaceFolder as sinon.SinonStub).returns(undefined);
        const picker = sandbox.stub(vscode.window, 'showOpenDialog').resolves();
        await initProject(context);
        assert.ok(picker.notCalled);
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(root), []);
    });

    test('generated autosave settings save an edited document to disk without a save command', async () => {
        await initialize(false);
        const recommended = parse(await readTestFile(file('.vscode', 'settings.json')));
        const config = vscode.workspace.getConfiguration('files');
        const previousMode = config.inspect<string>('autoSave')?.workspaceValue;
        const previousDelay = config.inspect<number>('autoSaveDelay')?.workspaceValue;
        let listener: vscode.Disposable | undefined;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            await config.update('autoSaveDelay', recommended['files.autoSaveDelay'], vscode.ConfigurationTarget.Workspace);
            await config.update('autoSave', recommended['files.autoSave'], vscode.ConfigurationTarget.Workspace);
            const uri = file('chapters', '自动保存验证.md');
            await writeTestFile(uri, '原正文');
            const document = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(document, { preview: false });
            const saved = new Promise<void>((resolve, reject) => {
                listener = vscode.workspace.onDidSaveTextDocument(candidate => {
                    if (candidate.uri.toString() === uri.toString()) { resolve(); }
                });
                timer = setTimeout(() => reject(new Error('推荐的自动保存配置未在 8 秒内保存正文')), 8000);
            });
            assert.ok(await editor.edit(edit => edit.insert(document.positionAt(document.getText().length), '\n自动保存内容')));
            await saved;
            assert.strictEqual(document.isDirty, false);
            assert.strictEqual(await readTestFile(uri), '原正文\n自动保存内容');
        } finally {
            listener?.dispose();
            if (timer) { clearTimeout(timer); }
            await config.update('autoSave', previousMode, vscode.ConfigurationTarget.Workspace);
            await config.update('autoSaveDelay', previousDelay, vscode.ConfigurationTarget.Workspace);
        }
    });

    test('real volume scan excludes outlines, orders chapters and computes completion at the boundary', async () => {
        const config = await initialize(true);
        const serviceConfig = Object.create(ConfigService.prototype) as ConfigService;
        serviceConfig['config'] = config.noveler;
        const service = Object.create(VolumeService.prototype) as VolumeService;
        service['configService'] = serviceConfig;
        service['volumes'] = [];
        service['cacheTimestamp'] = 0;
        const folder = file('chapters', '第01卷-起点');
        await vscode.workspace.fs.createDirectory(folder);
        await writeTestFile(vscode.Uri.joinPath(folder, 'outline.md'), '# 不应计为章节');
        await writeTestFile(vscode.Uri.joinPath(folder, 'README.md'), '# 说明');
        await writeTestFile(vscode.Uri.joinPath(folder, 'A.md'), '---\nchapter: 2\n---\n' + '文'.repeat(101));
        await writeTestFile(vscode.Uri.joinPath(folder, 'Z.md'), '---\nchapter: 1\n---\n' + '字'.repeat(100));
        const volumes = await service.scanVolumes(true);
        assert.strictEqual(volumes.length, 1);
        assert.deepStrictEqual(volumes[0].chapters, ['Z.md', 'A.md']);
        assert.deepStrictEqual(volumes[0].stats, { totalWords: 201, chapterCount: 2, completedChapters: 1 });
        assert.strictEqual(service.getVolumeForChapter(vscode.Uri.joinPath(folder, 'A.md').fsPath), volumes[0]);
        assert.strictEqual(await service.scanVolumes(), volumes);
        service.invalidateCache();
        await writeTestFile(vscode.Uri.joinPath(folder, 'C.md'), '---\nchapter: 3\n---\n新增');
        assert.strictEqual((await service.scanVolumes())[0].chapters.length, 3);
    });
});
