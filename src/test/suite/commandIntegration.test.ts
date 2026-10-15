import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';

suite('Command manifest contracts', () => {
    const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
    const commands = manifest.contributes.commands as { command: string; icon?: unknown; title: string }[];
    test('actual contributed command IDs are unique and follow the public namespace', () => {
        const ids = commands.map(item => item.command);
        assert.strictEqual(new Set(ids).size, ids.length);
        assert.ok(ids.every(id => /^noveler\.[a-z][a-zA-Z]*$/.test(id)));
        assert.ok(commands.every(item => item.title.trim().length > 0));
    });
    test('every menu and keybinding references a contributed or built-in command', () => {
        const declared = new Set(commands.map(item => item.command));
        const entries = [...Object.values(manifest.contributes.menus).flat(), ...(manifest.contributes.keybindings || [])] as { command?: string }[];
        for (const item of entries) {
            if (item.command?.startsWith('noveler.')) {
                assert.ok(declared.has(item.command), `Undeclared command: ${item.command}`);
            }
        }
    });
    test('formatting has mouse entrances restricted to Markdown editors', () => {
        for (const menu of ['editor/title', 'editor/context']) {
            const item = manifest.contributes.menus[menu].find((entry: { command: string }) => entry.command === 'noveler.formatDocument');
            assert.ok(item, `Missing formatting entrance: ${menu}`);
            assert.strictEqual(item.when, 'editorLangId == markdown');
        }
        assert.ok(commands.find(item => item.command === 'noveler.formatDocument')?.icon);
    });
});
