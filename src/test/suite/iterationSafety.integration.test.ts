import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { parse } from 'jsonc-parser';
import { ConfigService } from '../../services/configService';
import { ProjectStatsService } from '../../services/projectStatsService';
import { VolumeService } from '../../services/volumeService';
import { SensitiveWordService } from '../../services/sensitiveWordService';
import { TrieTree } from '../../utils/trieTree';
import { documentIO } from '../../utils/documentOperations';
import { scanChapters } from '../../utils/readmeUpdater';
import { createVolume } from '../../commands/createVolume';
import { migrateToVolumeStructure } from '../../commands/migrationWizard';
import { createTestWorkspace, writeTestFile, readTestFile, removeTestWorkspace } from './testWorkspace';

suite('Iteration Safety Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    let config: ConfigService;
    let volume: VolumeService;
    let changes: vscode.EventEmitter<unknown>;
    const disposables: vscode.Disposable[] = [];
    const file = (...parts: string[]) => vscode.Uri.joinPath(root, ...parts);
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, index: 0, name: '验证' });
        config = Object.create(ConfigService.prototype) as ConfigService;
        config['setDefaultConfig']();
        changes = new vscode.EventEmitter();
        Object.defineProperty(config, 'onDidChangeConfig', { value: changes.event });
        sandbox.stub(ConfigService, 'getInstance').returns(config);
        sandbox.stub(config, 'reloadConfig').callsFake(async () => {
            config['config'] = parse(await readTestFile(file('novel.jsonc'))).noveler;
        });
        volume = Object.create(VolumeService.prototype) as VolumeService;
        volume['configService'] = config;
        volume['volumes'] = [];
        volume['cacheTimestamp'] = 0;
        sandbox.stub(VolumeService, 'getInstance').returns(volume);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(vscode.commands, 'executeCommand').resolves();
    });
    teardown(async () => {
        disposables.splice(0).forEach(item => item.dispose());
        changes.dispose();
        sandbox.restore();
        await removeTestWorkspace(root);
    });

    test('volume, project and README agree on explicit completion and exclude supporting documents', async () => {
        await config.reloadConfig();
        const folder = file('chapters', '第01卷-起点');
        await vscode.workspace.fs.createDirectory(folder);
        const statuses = ['草稿', 'completed', '已完成', '修改中', undefined];
        for (let i = 0; i < statuses.length; i++) {
            await writeTestFile(vscode.Uri.joinPath(folder, `${i}.md`),
                `---\nchapter: ${i + 1}\n${statuses[i] ? `status: ${statuses[i]}\n` : ''}---\n${'文'.repeat(i === 0 ? 500 : i === 2 ? 0 : 1)}`);
        }
        for (const name of ['Outline.md', 'readme.md', 'VOLUME.md']) {
            await writeTestFile(vscode.Uri.joinPath(folder, name), '---\nchapter: 99\nstatus: 已完成\n---\n不计入章节');
        }
        await vscode.workspace.fs.createDirectory(file('characters'));
        await writeTestFile(file('characters', 'volume.md'), '# 人物');
        const volumes = await volume.scanVolumes(true);
        const project = await new ProjectStatsService().getStats();
        const readme = await scanChapters();
        assert.strictEqual(volumes[0].stats.completedChapters, 2);
        assert.strictEqual(project?.completedChapters, 2);
        assert.strictEqual(readme.completedChapters, 2);
        assert.strictEqual(volumes[0].stats.chapterCount, 5);
        assert.strictEqual(await volume.calculateNextChapterNumber(volumes[0]), 6);
        assert.strictEqual(project?.chapterCount, 5);
        assert.strictEqual(readme.totalChapters, 5);
        assert.strictEqual(project?.completionRate, 40);
        assert.strictEqual(project?.characterCount, 1);
        assert.strictEqual(project?.totalWords, 503);
        assert.strictEqual(volumes[0].stats.totalWords, 503);
        await writeTestFile(vscode.Uri.joinPath(folder, '1.md'), '---\nchapter: 2\nstatus: 草稿\n---\n正文');
        assert.strictEqual((await volume.scanVolumes(true))[0].stats.completedChapters, 1);
        assert.strictEqual((await new ProjectStatsService().getStats())?.completedChapters, 1);
        assert.strictEqual((await scanChapters()).completedChapters, 1);
    });

    for (const enabled of [false, true]) {
        test(`flat create-volume entry delegates safely to the migration wizard with enabled=${enabled}`, async () => {
            config['config'].volumes = { ...config.getVolumesConfig(), enabled, folderStructure: 'flat' };
            const original = await readTestFile(file('novel.jsonc'));
            const prompt = vscode.window.showWarningMessage as sinon.SinonStub;
            await createVolume();
            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).notCalled);
            prompt.resolves('开始切换');
            await createVolume();
            assert.ok((vscode.commands.executeCommand as sinon.SinonStub).calledOnceWithExactly('noveler.migrateToVolumeStructure'));
            assert.strictEqual(await readTestFile(file('novel.jsonc')), original);
        });
    }

    test('empty project mode switch uses transactional migration and preserves unrelated settings', async () => {
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('继续');
        await migrateToVolumeStructure();
        const updated = parse(await readTestFile(file('novel.jsonc')));
        assert.strictEqual(updated.noveler.volumes.enabled, true);
        assert.strictEqual(updated.noveler.volumes.folderStructure, 'nested');
        assert.strictEqual(updated.noveler.eyeCareMode.enabled, false);
        assert.ok((await readTestFile(file('novel.jsonc'))).includes('// 原配置注释'));
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(file('.noveler', 'backups')), []);
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).notCalled);
    });

    test('cancelled wizard and failed configuration save preserve empty project configuration', async () => {
        const original = await readTestFile(file('novel.jsonc'));
        await migrateToVolumeStructure();
        assert.strictEqual(await readTestFile(file('novel.jsonc')), original);
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('继续');
        sandbox.stub(documentIO, 'save').resolves(false);
        await migrateToVolumeStructure();
        assert.strictEqual(await readTestFile(file('novel.jsonc')), original);
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).calledOnce);
    });

    async function wordsService() {
        config['config'].sensitiveWords = {
            enabled: true, builtInLibrary: { enabled: false, levels: { high: false, medium: false, low: false } },
            customLibrary: { enabled: true, path: '词库/custom.jsonc' },
            whitelist: { enabled: true, path: '词库/white.json' }
        };
        await vscode.workspace.fs.createDirectory(file('词库'));
        await writeTestFile(file('词库', 'custom.json'), '{"words":["测试词"]}');
        const service = Object.create(SensitiveWordService.prototype) as SensitiveWordService;
        service['trie'] = new TrieTree();
        service['whitelist'] = new Set();
        await service.reload();
        return service;
    }
    const matches = (service: SensitiveWordService) => service.detect({ languageId: 'markdown', getText: () => '测试词另一个' } as vscode.TextDocument).map(match => match.word);

    test('configured fallback library saves automatically refresh real detection', async function() {
        this.timeout(15000);
        const service = await wordsService();
        assert.deepStrictEqual(matches(service), ['测试词']);
        const reloaded = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('自定义词库保存后未自动刷新')), 10000);
            disposables.push(service.watchLibraries(() => {
                if (matches(service).includes('另一个')) { clearTimeout(timer); resolve(); }
            }));
        });
        await writeTestFile(file('词库', 'custom.json'), '{"words":["另一个"]}');
        await reloaded;
        assert.deepStrictEqual(matches(service), ['另一个']);
    });

    test('library create/delete, whitelist fallback, path changes and disposal update the actual service', async () => {
        const service = await wordsService();
        const watchers: { parent: string; events: vscode.EventEmitter<vscode.Uri>[]; disposed: boolean }[] = [];
        sandbox.stub(vscode.workspace, 'createFileSystemWatcher').callsFake(pattern => {
            const watcher = { parent: (pattern as vscode.RelativePattern).baseUri.fsPath,
                events: [new vscode.EventEmitter<vscode.Uri>(), new vscode.EventEmitter<vscode.Uri>(), new vscode.EventEmitter<vscode.Uri>()], disposed: false };
            watchers.push(watcher);
            return { onDidCreate: watcher.events[0].event, onDidChange: watcher.events[1].event,
                onDidDelete: watcher.events[2].event, dispose: () => { watcher.disposed = true; watcher.events.forEach(event => event.dispose()); } } as vscode.FileSystemWatcher;
        });
        let completed = 0;
        const subscription = service.watchLibraries(() => completed++);
        disposables.push(subscription);
        const flush = async () => {
            await service['reloadQueue'];
            await Promise.resolve();
        };
        await writeTestFile(file('词库', 'white.jsonc'), '{"words":["测试词"]}');
        watchers[0].events[0].fire(file('词库', 'white.jsonc'));
        await flush();
        assert.deepStrictEqual(matches(service), []);
        await vscode.workspace.fs.delete(file('词库', 'white.jsonc'));
        watchers[0].events[2].fire(file('词库', 'white.jsonc'));
        await flush();
        assert.deepStrictEqual(matches(service), ['测试词']);
        await writeTestFile(file('词库', 'other.jsonc'), '{"words":["另一个"]}');
        config['config'].sensitiveWords!.customLibrary!.path = '词库/other.jsonc';
        changes.fire(undefined);
        await flush();
        assert.ok(watchers[0].disposed);
        assert.deepStrictEqual(matches(service), ['另一个']);
        const before = completed;
        watchers[1].events[1].fire(file('词库', 'custom.json'));
        await flush();
        assert.strictEqual(completed, before);
        subscription.dispose();
        assert.ok(watchers.every(watcher => watcher.disposed));
        changes.fire(undefined);
        await flush();
        assert.strictEqual(completed, before);
    });

    test('a configured library created in a new directory is detected without restarting', async function() {
        this.timeout(15000);
        const service = await wordsService();
        let ready: (() => void) | undefined;
        const changed = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('新建词库目录未被监听')), 10000);
            ready = () => { clearTimeout(timer); resolve(); };
        });
        disposables.push(service.watchLibraries(() => {
            if (matches(service).includes('另一个')) { ready?.(); }
        }));
        config['config'].sensitiveWords!.customLibrary!.path = '新目录/嵌套/new.json';
        changes.fire(undefined);
        await service['reloadQueue'];
        await vscode.workspace.fs.createDirectory(file('新目录', '嵌套'));
        await writeTestFile(file('新目录', '嵌套', 'new.jsonc'), '{"words":["另一个"]}');
        await changed;
        assert.deepStrictEqual(matches(service), ['另一个']);
    });
});
