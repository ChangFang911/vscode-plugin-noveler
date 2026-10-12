import * as assert from 'assert';
import { parse } from 'jsonc-parser';
import { mergeRecommendedSettings } from '../../utils/settingsHelper';

suite('Settings Merge Safety', () => {
    const defaults = { 'editor.fontSize': 14, 'files.autoSave': 'afterDelay', 'files.exclude': { '**/.DS_Store': true, '**/.noveler': true } };
    test('preserves comments, trailing commas and existing settings', () => {
        const source = '{\n // 用户设置\n "editor.fontSize": 18,\n "files.exclude": { "**/.noveler": false, "custom": true },\n}';
        const result = mergeRecommendedSettings(source, defaults);
        assert.ok(result.includes('// 用户设置'));
        const settings = parse(result);
        assert.strictEqual(settings['editor.fontSize'], 18);
        assert.strictEqual(settings['files.exclude']['**/.noveler'], false);
        assert.strictEqual(settings['files.exclude'].custom, true);
        assert.strictEqual(settings['files.exclude']['**/.DS_Store'], true);
        assert.strictEqual(settings['files.autoSave'], 'afterDelay');
    });
    test('multiple missing keys are inserted without overlapping edits', () => {
        assert.deepStrictEqual(parse(mergeRecommendedSettings('{}', defaults)), defaults);
    });
    test('repeated merges leave the text unchanged', () => {
        const once = mergeRecommendedSettings('{}', defaults);
        assert.strictEqual(mergeRecommendedSettings(once, defaults), once);
    });
    test('invalid JSONC and non-object roots are rejected', () => {
        for (const source of ['{"editor.fontSize": }', '[]', 'null', 'true']) {
            assert.throws(() => mergeRecommendedSettings(source, defaults), /格式无效/);
        }
    });
    test('preserves CRLF and existing scalar values for nested settings', () => {
        const source = '{\r\n "files.exclude": false\r\n}';
        const result = mergeRecommendedSettings(source, defaults);
        assert.strictEqual(parse(result)['files.exclude'], false);
        assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
    });
});
