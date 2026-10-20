import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';

suite('Package workflow safety', () => {
    let root: string;
    const workflow = path.resolve(__dirname, '../../../scripts/package-vsix.js');
    setup(() => {
        root = fs.mkdtempSync(path.join(tmpdir(), 'noveler-package-'));
        fs.mkdirSync(path.join(root, 'releases'));
        fs.mkdirSync(path.join(root, 'scripts'));
        fs.copyFileSync(workflow, path.join(root, 'scripts', 'package-vsix.js'));
        const icon = Buffer.alloc(24);
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(icon);
        icon.writeUInt32BE(1024, 16);
        icon.writeUInt32BE(1024, 20);
        fs.writeFileSync(path.join(root, 'icon.png'), icon);
        fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '1.10.0', icon: 'icon.png' }));
    });
    teardown(() => fs.rmSync(root, { recursive: true, force: true }));
    const release = (name: string) => path.join(root, 'releases', name);
    function run(success: boolean) {
        const vsce = path.join(root, 'vsce.js');
        fs.writeFileSync(vsce, `require('fs').writeFileSync(process.argv[process.argv.indexOf('--out')+1], 'new package'); process.exit(${success ? 0 : 1});`);
        return spawnSync(process.execPath, [path.join(root, 'scripts', 'package-vsix.js')], {
            env: { ...process.env, NOVELER_VSCE_PATH: vsce }, encoding: 'utf8'
        });
    }
    test('successful packaging retains three numeric versions, cleans sidecars and preserves unrelated files', () => {
        for (const name of ['Noveler-1.9.0.vsix', 'Noveler-1.8.0.vsix', 'chinese-novel-writer-1.7.0.vsix',
            'Noveler-1.8.0.vsix.sha256', 'Noveler-0.1.0.vsix.sha256', 'notes.txt', 'personal.vsix']) {
            fs.writeFileSync(release(name), name);
        }
        const result = run(true);
        assert.strictEqual(result.status, 0, result.stderr);
        assert.deepStrictEqual(fs.readdirSync(path.join(root, 'releases')).sort(), [
            'Noveler-1.10.0.vsix', 'Noveler-1.8.0.vsix', 'Noveler-1.9.0.vsix', 'notes.txt', 'personal.vsix'
        ]);
    });
    test('failed packaging preserves the previous package and all historical files', () => {
        fs.writeFileSync(release('Noveler-1.10.0.vsix'), 'existing package');
        fs.writeFileSync(release('Noveler-1.0.0.vsix'), 'rollback package');
        const result = run(false);
        assert.strictEqual(result.status, 1);
        assert.strictEqual(fs.readFileSync(release('Noveler-1.10.0.vsix'), 'utf8'), 'existing package');
        assert.deepStrictEqual(fs.readdirSync(path.join(root, 'releases')).sort(), ['Noveler-1.0.0.vsix', 'Noveler-1.10.0.vsix']);
    });
    test('oversized icon is rejected before packaging or cleanup', () => {
        const icon = fs.readFileSync(path.join(root, 'icon.png'));
        icon.writeUInt32BE(1025, 16);
        fs.writeFileSync(path.join(root, 'icon.png'), icon);
        fs.writeFileSync(release('Noveler-1.0.0.vsix'), 'keep');
        const result = run(true);
        assert.notStrictEqual(result.status, 0);
        assert.deepStrictEqual(fs.readdirSync(path.join(root, 'releases')), ['Noveler-1.0.0.vsix']);
    });
});
