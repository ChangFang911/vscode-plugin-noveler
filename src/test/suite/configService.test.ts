import * as assert from 'assert';
import { ConfigService, NovelConfig } from '../../services/configService';

suite('ConfigService actual accessors', () => {
    let service: ConfigService;
    setup(() => {
        service = Object.create(ConfigService.prototype) as ConfigService;
        service['setDefaultConfig']();
    });

    test('production defaults agree with user-facing settings', () => {
        assert.strictEqual(service.getTargetWords(), 2500);
        assert.strictEqual(service.getChineseQuoteStyle(), '「」');
        assert.strictEqual(service.shouldAutoFormat(), true);
        assert.strictEqual(service.shouldConvertQuotes(), true);
        assert.strictEqual(service.shouldAutoEmptyLine(), true);
        assert.strictEqual(service.shouldParagraphIndent(), true);
        assert.strictEqual(service.shouldShowWordCountInStatusBar(), true);
        assert.strictEqual(service.getReadmeAutoUpdateMode(), 'always');
        assert.deepStrictEqual(service.getCharacters(), []);
        assert.deepStrictEqual(service.getVolumesConfig(), {
            enabled: false, folderStructure: 'flat', numberFormat: 'arabic', chapterNumbering: 'volume'
        });
        assert.strictEqual(service.isVolumesEnabled(), false);
    });

    test('explicit false settings are respected instead of replaced by defaults', () => {
        service['config'] = {
            format: { autoFormat: false, convertQuotes: false, smartQuotes: false, chineseQuoteStyle: '“”' },
            wordCount: { showInStatusBar: false }, autoEmptyLine: { value: false },
            paragraphIndent: { value: false }, autoUpdateReadmeOnCreate: { value: 'never' },
            targetWords: { default: 4000 }, characters: { list: ['王明', '小王'] }
        };
        assert.strictEqual(service.shouldAutoFormat(), false);
        assert.strictEqual(service.shouldConvertQuotes(), false);
        assert.strictEqual(service.shouldSmartQuotes(), false);
        assert.strictEqual(service.shouldAutoEmptyLine(), false);
        assert.strictEqual(service.shouldParagraphIndent(), false);
        assert.strictEqual(service.shouldShowWordCountInStatusBar(), false);
        assert.strictEqual(service.getChineseQuoteStyle(), '“”');
        assert.strictEqual(service.getReadmeAutoUpdateMode(), 'never');
        assert.strictEqual(service.getTargetWords(), 4000);
        assert.deepStrictEqual(service.getCharacters(), ['王明', '小王']);
    });

    test('empty and partial settings use the actual accessor fallbacks', () => {
        service['config'] = {};
        assert.strictEqual(service.getTargetWords(), 2500);
        assert.strictEqual(service.shouldAutoFormat(), true);
        assert.strictEqual(service.shouldParagraphIndent(), false);
        assert.deepStrictEqual(service.getHighlightStyle('character'), {});
        service['config'] = { highlight: { dialogue: { color: '#fff' } } };
        assert.deepStrictEqual(service.getHighlightStyle('dialogue'), { color: '#fff' });
        assert.deepStrictEqual(service.getHighlightStyle('character'), {});
        assert.deepStrictEqual(service.getEyeCareMode(), { enabled: false, backgroundColor: '#C7EDCC' });
    });

    for (const [enabled, structure, expected] of [
        [true, 'nested', true], [false, 'nested', false], [true, 'flat', false], [false, 'flat', false]
    ] as const) {
        test(`volume mode requires enabled=${enabled} and structure=${structure}`, () => {
            service['config'] = { volumes: { enabled, folderStructure: structure,
                numberFormat: 'chinese', chapterNumbering: 'global' } };
            assert.strictEqual(service.isVolumesEnabled(), expected);
            assert.deepStrictEqual(service.getVolumesConfig(), service.getConfig().volumes);
        });
    }

    test('eye care settings are read from real configuration', () => {
        const config: NovelConfig = { eyeCareMode: { enabled: true, backgroundColor: '#123456' } };
        service['config'] = config;
        assert.strictEqual(service.isEyeCareModeEnabled(), true);
        assert.deepStrictEqual(service.getEyeCareMode(), { enabled: true, backgroundColor: '#123456' });
    });
});
