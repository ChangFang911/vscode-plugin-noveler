import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { parse } from 'jsonc-parser';
import { ChapterMove, migrateChapters } from '../../utils/chapterMigration';
import { applyDocumentChange, documentIO, fileExists } from '../../utils/documentOperations';
import { ConfigService } from '../../services/configService';
import { migrateToVolumeStructure } from '../../commands/migrationWizard';
import { VolumeService } from '../../services/volumeService';
import { createTestWorkspace, readTestFile, removeTestWorkspace, writeTestFile } from './testWorkspace';

suite('Chapter Migration Safety Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    const file = (...segments: string[]) => vscode.Uri.joinPath(root, 'chapters', ...segments);
    const backups = () => vscode.Uri.joinPath(root, '.noveler', 'backups');
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function movePlan(): Promise<ChapterMove[]> {
        const moves = [
            { source: file('第01卷-原卷', 'A.md'), target: file('A.md') },
            { source: file('第02卷-原卷', 'B.md'), target: file('B.md') }
        ];
        for (const move of moves) {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(move.source, '..'));
            await writeTestFile(move.source, `正文 ${move.source.path}`);
        }
        return moves;
    }
    test('flat migration preserves volume assets and removes temporary backups', async () => {
        const moves = await movePlan();
        const outline = file('第01卷-原卷', 'outline.md');
        const metadata = file('第01卷-原卷', 'volume.json');
        const attachment = file('第01卷-原卷', '资料.bin');
        await writeTestFile(outline, '改过的卷大纲');
        await writeTestFile(metadata, '{"description":"改过的描述"}');
        await writeTestFile(attachment, '附件');
        const original = await readTestFile(moves[0].source);
        await migrateChapters(root, moves, [], 'flat');
        assert.strictEqual(await readTestFile(moves[0].target), original);
        assert.strictEqual(await readTestFile(outline), '改过的卷大纲');
        assert.strictEqual(await readTestFile(metadata), '{"description":"改过的描述"}');
        assert.strictEqual(await readTestFile(attachment), '附件');
        const configText = await readTestFile(vscode.Uri.joinPath(root, 'novel.jsonc'));
        const config = parse(configText);
        assert.strictEqual(config.noveler.volumes.folderStructure, 'flat');
        assert.strictEqual(config.noveler.eyeCareMode.enabled, false);
        assert.ok(configText.includes('// 原配置注释'));
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(backups()), []);
    });
    test('checks all target conflicts before moving any file', async () => {
        const moves = await movePlan();
        await writeTestFile(moves[1].target, '已有章节');
        const config = await readTestFile(vscode.Uri.joinPath(root, 'novel.jsonc'));
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /目标章节已存在/);
        assert.ok(await fileExists(moves[0].source));
        assert.strictEqual(await fileExists(moves[0].target), false);
        assert.strictEqual(await readTestFile(moves[1].target), '已有章节');
        assert.strictEqual(await readTestFile(vscode.Uri.joinPath(root, 'novel.jsonc')), config);
    });
    test('invalid configuration stops before backups or moves', async () => {
        const moves = await movePlan();
        const configUri = vscode.Uri.joinPath(root, 'novel.jsonc');
        await writeTestFile(configUri, '{"noveler":');
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /格式无效/);
        assert.ok(await fileExists(moves[0].source));
        assert.strictEqual(await readTestFile(configUri), '{"noveler":');
        assert.strictEqual(await fileExists(backups()), false);
    });
    test('new volume assets are saved and backups are cleaned on success', async () => {
        const source = file('章节.md');
        const target = file('第01卷-新卷', '章节.md');
        const outline = file('第01卷-新卷', 'outline.md');
        const metadata = file('第01卷-新卷', 'volume.json');
        await writeTestFile(source, '正文');
        await migrateChapters(root, [{ source, target }], [
            { uri: outline, content: '卷大纲\n' }, { uri: metadata, content: '{"title":"新卷"}' }
        ], 'nested');
        assert.strictEqual(await readTestFile(target), '正文');
        assert.strictEqual(await readTestFile(outline), '卷大纲\n');
        assert.deepStrictEqual(parse(await readTestFile(metadata)), { title: '新卷' });
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(backups()), []);
    });
    test('failed new-volume migration removes only assets created by this operation', async () => {
        const source = file('章节.md');
        const target = file('第01卷-新卷', '章节.md');
        const outline = file('第01卷-新卷', 'outline.md');
        await writeTestFile(source, '正文');
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        let calls = 0;
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(edit => ++calls === 2 ? Promise.resolve(false) : apply(edit));
        await assert.rejects(() => migrateChapters(root, [{ source, target }], [{ uri: outline, content: '卷大纲\n' }], 'nested'), /无法移动章节/);
        assert.strictEqual(await readTestFile(source), '正文');
        assert.strictEqual(await fileExists(vscode.Uri.joinPath(target, '..')), false);
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(backups()), []);
    });
    test('duplicate targets across volumes stop the entire migration', async () => {
        const moves = await movePlan();
        moves[1].target = moves[0].target;
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /重复章节/);
        assert.ok(await fileExists(moves[0].source));
        assert.ok(await fileExists(moves[1].source));
    });
    test('missing sources stop before any move', async () => {
        const moves = await movePlan();
        await vscode.workspace.fs.delete(moves[1].source);
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'));
        assert.ok(await fileExists(moves[0].source));
        assert.strictEqual(await fileExists(moves[0].target), false);
    });
    test('saves relevant dirty documents before taking backups', async () => {
        const moves = await movePlan();
        await applyDocumentChange(moves[0].source, text => text + '\n未保存的正文');
        await migrateChapters(root, moves, [], 'flat');
        assert.ok((await readTestFile(moves[0].target)).endsWith('未保存的正文'));
    });
    test('a cancelled or failed save stops before changing the layout', async () => {
        const moves = await movePlan();
        await applyDocumentChange(moves[0].source, text => text + '未保存');
        sandbox.stub(documentIO, 'save').resolves(false);
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /未保存/);
        assert.ok(await fileExists(moves[0].source));
        assert.strictEqual(await fileExists(moves[0].target), false);
    });
    test('backup write failure prevents all chapter moves', async () => {
        const moves = await movePlan();
        const write = documentIO.writeFile;
        sandbox.stub(documentIO, 'writeFile').callsFake((uri, content) => {
            if (uri.path.includes('/.noveler/backups/')) { return Promise.reject(new Error('模拟备份失败')); }
            return write(uri, content);
        });
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /模拟备份失败/);
        assert.ok(await fileExists(moves[0].source));
        assert.strictEqual(await fileExists(moves[0].target), false);
    });
    test('midway move failure restores already moved chapters and cleans backups', async () => {
        const moves = await movePlan();
        const original = await readTestFile(moves[0].source);
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        let calls = 0;
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(edit => ++calls === 2 ? Promise.resolve(false) : apply(edit));
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /无法移动章节/);
        assert.strictEqual(await readTestFile(moves[0].source), original);
        assert.ok(await fileExists(moves[1].source));
        assert.strictEqual(await fileExists(moves[0].target), false);
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(backups()), []);
    });
    test('configuration save failure restores chapters and original configuration', async () => {
        const moves = await movePlan();
        const configUri = vscode.Uri.joinPath(root, 'novel.jsonc');
        const original = await readTestFile(configUri);
        const save = documentIO.save;
        let configSaves = 0;
        sandbox.stub(documentIO, 'save').callsFake(document => {
            if (document.uri.toString() === configUri.toString() && ++configSaves === 1) {
                return Promise.resolve(false);
            }
            return save(document);
        });
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /配置未保存/);
        assert.ok(await fileExists(moves[0].source));
        assert.strictEqual(await readTestFile(configUri), original);
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(backups()), []);
    });
    test('failed restoration preserves the backup and does not overwrite new content', async () => {
        const moves = await movePlan();
        const original = await readTestFile(moves[0].source);
        const apply = vscode.workspace.applyEdit.bind(vscode.workspace);
        let calls = 0;
        sandbox.stub(vscode.workspace, 'applyEdit').callsFake(async edit => {
            if (++calls === 2) {
                await writeTestFile(moves[0].target, '迁移期间外部修改');
                return false;
            }
            return apply(edit);
        });
        await assert.rejects(() => migrateChapters(root, moves, [], 'flat'), /恢复未完成.*备份保留/s);
        assert.strictEqual(await readTestFile(moves[0].target), '迁移期间外部修改');
        const entries = await vscode.workspace.fs.readDirectory(backups());
        assert.strictEqual(entries.length, 1);
        assert.strictEqual(await readTestFile(vscode.Uri.joinPath(backups(), entries[0][0], 'file-0')), original);
    });
    test('re-entering volume mode preserves existing modified assets and accepts a new grouping', async () => {
        const moves = await movePlan();
        const outline = file('第01卷-原卷', 'outline.md');
        const metadata = file('第01卷-原卷', 'volume.json');
        await writeTestFile(outline, '第一卷原大纲');
        await writeTestFile(metadata, '{"description":"原设置"}');
        await migrateChapters(root, moves, [], 'flat');
        await writeTestFile(outline, '扁平模式下修改的大纲');
        const regrouped = [
            { source: moves[0].target, target: moves[0].source },
            { source: moves[1].target, target: file('第01卷-原卷', 'B.md') }
        ];
        await migrateChapters(root, regrouped, [{ uri: outline, content: '不应覆盖的大纲' }, { uri: metadata, content: '{}' }], 'nested');
        assert.ok(await fileExists(file('第01卷-原卷', 'B.md')));
        assert.strictEqual(await fileExists(moves[1].source), false);
        assert.strictEqual(await readTestFile(outline), '扁平模式下修改的大纲');
        assert.strictEqual(await readTestFile(metadata), '{"description":"原设置"}');
        assert.deepStrictEqual(await vscode.workspace.fs.readDirectory(backups()), []);
    });
    test('the migration wizard uses current grouping instead of old chapter volume fields', async () => {
        const moves = await movePlan();
        await migrateChapters(root, moves, [], 'flat');
        await writeTestFile(moves[1].target, '---\ntitle: 第二卷原章节\nchapter: 2\nvolume: 2\n---\n正文');
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([{ uri: root, name: '测试', index: 0 }]);
        sandbox.stub(ConfigService, 'getInstance').returns({
            isVolumesEnabled: () => false,
            getVolumesConfig: () => ({ enabled: false, folderStructure: 'flat', numberFormat: 'arabic' }),
            reloadConfig: async () => undefined
        } as unknown as ConfigService);
        sandbox.stub(VolumeService, 'getInstance').returns({ scanVolumes: async () => [] } as unknown as VolumeService);
        sandbox.stub(vscode.window, 'showQuickPick').callsFake(async items => (await items)[(await items).length - 1]);
        sandbox.stub(vscode.window, 'showInputBox').resolves('原卷');
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('继续');
        (sandbox.stub(vscode.window, 'showInformationMessage') as sinon.SinonStub).resolves('确认');
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.commands, 'executeCommand').resolves();
        await migrateToVolumeStructure();
        assert.ok(await fileExists(file('第01卷-原卷', 'B.md')));
        assert.strictEqual(await fileExists(file('第02卷-原卷', 'B.md')), false);
        assert.strictEqual((vscode.window.showErrorMessage as sinon.SinonStub).called, false);
    });
});
