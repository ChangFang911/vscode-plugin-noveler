import * as assert from 'assert';
import * as vscode from 'vscode';
import { readFileSync, existsSync } from 'fs';
import * as path from 'path';

suite('Extension Test Suite', () => {
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
});
