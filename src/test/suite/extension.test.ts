import * as assert from 'assert';
import * as sinon from 'sinon';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { createRequire } from 'module';
import * as vscode from 'vscode';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';
import { parse } from 'jsonc-parser';
import { CURRENT_CONFIG_VERSION } from '../../constants';

suite('Extension Test Suite', () => {
    if (process.env.NOVELER_TEST_LEGACY_VERSION) {
        test('packaged extension upgrades a legacy project without losing user settings', async () => {
            const ext = vscode.extensions.getExtension('chang.chinese-novel-writer');
            assert.ok(ext);
            await ext.activate();
            const folder = vscode.workspace.workspaceFolders?.[0];
            assert.ok(folder);
            const text = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.joinPath(folder.uri, 'novel.jsonc'))).toString('utf8');
            const result = parse(text);
            assert.strictEqual(result.version, CURRENT_CONFIG_VERSION);
            assert.strictEqual(result.custom, '必须保留');
            assert.strictEqual(result.noveler.targetWords.default, 4321);
            assert.strictEqual(result.noveler.paragraphIndent.value, false);
            assert.strictEqual(result.noveler.volumes.enabled, false);
            assert.strictEqual(result.noveler.volumes.folderStructure, 'flat');
            assert.strictEqual(result.noveler.sensitiveWords.builtInLibrary.levels.high, false);
            assert.strictEqual(result.noveler.sensitiveWords.builtInLibrary.levels.medium, true);
            assert.ok(text.includes('// 打包升级验证备注'));
        });
    }
    test('Extension should be present', () => {
        // 使用正确的扩展 ID: publisher.name
        assert.ok(vscode.extensions.getExtension('chang.chinese-novel-writer'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('chang.chinese-novel-writer');
        assert.ok(ext, 'Extension missing');
        await ext.activate();
        assert.ok(ext.isActive);
    });

    test('all contributed commands are registered by the running extension', async () => {
        const ext = vscode.extensions.getExtension('chang.chinese-novel-writer');
        assert.ok(ext);
        await ext.activate();
        const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        const registered = new Set(await vscode.commands.getCommands(true));
        for (const { command } of manifest.contributes.commands) {
            assert.ok(registered.has(command), `Command not registered: ${command}`);
        }
    });

    test('running extension has the expected identity and all shipped writing resources', () => {
        const ext = vscode.extensions.getExtension('chang.chinese-novel-writer');
        assert.ok(ext);
        const expected = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        assert.strictEqual(ext.packageJSON.version, expected.version);
        if (process.env.NOVELER_TEST_EXTENSION_PATH) {
            assert.strictEqual(path.resolve(ext.extensionPath), path.resolve(process.env.NOVELER_TEST_EXTENSION_PATH));
            for (const excluded of ['coverage', '.c8-temp', '.nyc_output', '.vscode-test', 'src/test']) {
                assert.ok(!existsSync(path.join(ext.extensionPath, excluded)), `Development files in package: ${excluded}`);
            }
        }
        assert.ok(['CHANGELOG.md', 'changelog.md'].some(name => existsSync(path.join(ext.extensionPath, name))), 'Missing release notes');
        for (const resource of [ext.packageJSON.main, 'templates/default-config.jsonc',
            'templates/default-templates.json', ...['chapter', 'character', 'outline', 'readme', 'reference'].map(name => `templates/${name}.md`),
            ...['metadata', 'level-high', 'level-medium', 'level-low'].map(name => `templates/sensitive-words/${name}.json`),
            ...['chinese-surnames', 'chinese-given-names', 'english-names', 'japanese-names', 'fantasy-syllables', 'western-fantasy-names']
                .map(name => `src/data/${name}.json`)]) {
            assert.ok(existsSync(path.join(ext.extensionPath, resource)), `Missing packaged resource: ${resource}`);
        }
        const icon = readFileSync(path.join(ext.extensionPath, ext.packageJSON.icon));
        assert.ok(icon.length >= 24);
        assert.ok(icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
        assert.ok(icon.readUInt32BE(16) > 0 && icon.readUInt32BE(16) <= 1024);
        assert.ok(icon.readUInt32BE(20) > 0 && icon.readUInt32BE(20) <= 1024);
    });
    if (process.env.NOVELER_TEST_SMOKE_ONLY === '1') {
        test('packaged TXT export runs through the registered command without changing the original', async () => {
            const sandbox = sinon.createSandbox();
            const folder = await mkdtemp(path.join(tmpdir(), 'noveler-vsix-export-'));
            try {
                const root = vscode.workspace.workspaceFolders![0].uri;
                const chapters = vscode.Uri.joinPath(root, 'chapters');
                await vscode.workspace.fs.createDirectory(chapters);
                await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'novel.jsonc'), Buffer.from(JSON.stringify({
                    version: CURRENT_CONFIG_VERSION, name: '安装包验证', noveler: { volumes: { enabled: false, folderStructure: 'flat' } }
                })));
                const original = '---\nchapter: 1\ntitle: 初遇\nstatus: 草稿\n---\n\n# 第一章 初遇\n\n　　正文<!--✓ 不导出注释 -->';
                const chapter = vscode.Uri.joinPath(chapters, '第一章.md');
                await vscode.workspace.fs.writeFile(chapter, Buffer.from(original));
                const extension = vscode.extensions.getExtension('chang.chinese-novel-writer')!;
                await extension.activate();
                const api = createRequire(path.join(extension.extensionPath, 'package.json'))('vscode') as typeof vscode;
                sandbox.stub(api.window, 'showOpenDialog').resolves([vscode.Uri.file(folder)]);
                sandbox.stub(api.window, 'showInputBox').resolves('验收导出');
                sandbox.stub(api.window, 'showWarningMessage').resolves();
                sandbox.stub(api.window, 'showInformationMessage').resolves();
                const errors = sandbox.stub(api.window, 'showErrorMessage').resolves();
                await vscode.commands.executeCommand('noveler.exportNovel');
                assert.ok(errors.notCalled, errors.firstCall?.args[0]);
                const output = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(folder, '验收导出', '安装包验证.txt')));
                assert.strictEqual(Buffer.from(output).toString('utf8'), '安装包验证\n\n第一章 初遇\n\n　　正文\n');
                assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(chapter)).toString('utf8'), original);
                const secondVolume = vscode.Uri.joinPath(chapters, '第02卷-远行');
                const firstVolume = vscode.Uri.joinPath(chapters, '第01卷-初遇');
                await vscode.workspace.fs.createDirectory(secondVolume);
                await vscode.workspace.fs.createDirectory(firstVolume);
                const movedChapter = vscode.Uri.joinPath(firstVolume, '第一章.md');
                await vscode.workspace.fs.rename(chapter, movedChapter, { overwrite: false });
                const secondChapter = vscode.Uri.joinPath(secondVolume, '第一章.md');
                const secondOriginal = original.replace(/初遇/g, '远行').replace('正文', '第二卷正文');
                await vscode.workspace.fs.writeFile(secondChapter, Buffer.from(secondOriginal));
                await vscode.workspace.fs.writeFile(vscode.Uri.joinPath(root, 'novel.jsonc'), Buffer.from(JSON.stringify({
                    version: CURRENT_CONFIG_VERSION, name: '安装包验证', noveler: {
                        volumes: { enabled: true, folderStructure: 'nested', chapterNumbering: 'volume' }
                    }
                })));
                (api.window.showInputBox as sinon.SinonStub).resolves('分卷验收');
                await vscode.commands.executeCommand('noveler.exportNovel');
                assert.ok(errors.notCalled, errors.firstCall?.args[0]);
                const nestedOutput = await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(folder, '分卷验收', '安装包验证.txt')));
                assert.strictEqual(Buffer.from(nestedOutput).toString('utf8'),
                    '安装包验证\n\n第1卷 初遇\n\n第一章 初遇\n\n　　正文\n\n第2卷 远行\n\n第一章 远行\n\n　　第二卷正文\n');
                assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(movedChapter)).toString('utf8'), original);
                assert.strictEqual(Buffer.from(await vscode.workspace.fs.readFile(secondChapter)).toString('utf8'), secondOriginal);
                assert.deepStrictEqual(await vscode.workspace.fs.readFile(vscode.Uri.file(path.join(folder, '验收导出', '安装包验证.txt'))), output);
            } finally {
                sandbox.restore();
                await rm(folder, { recursive: true, force: true });
            }
        });
    }

});
