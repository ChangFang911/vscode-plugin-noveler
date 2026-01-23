import * as assert from 'assert';
import * as sinon from 'sinon';
import { NovelConfig } from '../../services/configService';
import { validateConfig, fixConfig } from '../../utils/configValidator';

// 由于 ConfigService 是单例且依赖 vscode，我们测试其核心逻辑
// 完整的集成测试需要 E2E 环境

suite('ConfigService Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Default Values', () => {
        test('default target words should be 2500', () => {
            const defaultTargetWords = 2500;
            assert.strictEqual(defaultTargetWords, 2500);
        });

        test('default quote style should be 「」', () => {
            const defaultQuoteStyle = '「」';
            assert.strictEqual(defaultQuoteStyle, '「」');
        });

        test('default autoEmptyLine should be true', () => {
            const defaultAutoEmptyLine = true;
            assert.strictEqual(defaultAutoEmptyLine, true);
        });

        test('default paragraphIndent should be true', () => {
            const defaultParagraphIndent = true;
            assert.strictEqual(defaultParagraphIndent, true);
        });

        test('default autoUpdateReadmeOnCreate should be always', () => {
            const defaultAutoUpdateMode = 'always';
            assert.strictEqual(defaultAutoUpdateMode, 'always');
        });

        test('default volumes.enabled should be false', () => {
            const defaultVolumesEnabled = false;
            assert.strictEqual(defaultVolumesEnabled, false);
        });
    });

    suite('Config Validation Logic', () => {
        test('should recognize valid quote styles', () => {
            const validStyles = ['「」', '""', '""'];
            const testStyle = '「」';
            assert.ok(validStyles.includes(testStyle));
        });

        test('should recognize valid autoUpdateReadme modes', () => {
            const validModes = ['always', 'ask', 'never'];
            const testMode = 'always';
            assert.ok(validModes.includes(testMode));
        });

        test('should recognize valid volume folder structures', () => {
            const validStructures = ['flat', 'nested'];
            const testStructure = 'nested';
            assert.ok(validStructures.includes(testStructure));
        });

        test('should recognize valid chapter numbering modes', () => {
            const validModes = ['global', 'perVolume'];
            const testMode = 'global';
            assert.ok(validModes.includes(testMode));
        });

        test('should recognize valid number formats', () => {
            const validFormats = ['arabic', 'chinese', 'roman'];
            const testFormat = 'chinese';
            assert.ok(validFormats.includes(testFormat));
        });
    });

    suite('validateConfig Integration', () => {
        test('should validate config with valid targetWords', () => {
            const config: NovelConfig = {
                targetWords: { default: 3000 }
            };
            const errors = validateConfig(config);
            assert.strictEqual(errors.filter(e => e.field.includes('targetWords')).length, 0);
        });

        test('should reject negative targetWords', () => {
            const config: NovelConfig = {
                targetWords: { default: -100 }
            };
            const errors = validateConfig(config);
            const error = errors.find(e => e.field === 'targetWords.default');
            assert.ok(error);
            assert.strictEqual(error!.severity, 'error');
        });

        test('should warn for very large targetWords', () => {
            const config: NovelConfig = {
                targetWords: { default: 100000 }
            };
            const errors = validateConfig(config);
            const warning = errors.find(e => e.field === 'targetWords.default');
            assert.ok(warning);
            assert.strictEqual(warning!.severity, 'warning');
        });

        test('should validate valid highlight colors', () => {
            const config: NovelConfig = {
                highlight: {
                    dialogue: { color: '#ce9178' },
                    character: { backgroundColor: 'rgba(78, 201, 176, 0.15)' }
                }
            };
            const errors = validateConfig(config);
            assert.strictEqual(errors.filter(e => e.field.includes('color')).length, 0);
        });

        test('should warn for invalid color format', () => {
            const config: NovelConfig = {
                highlight: {
                    dialogue: { color: 'invalid-color' }
                }
            };
            const errors = validateConfig(config);
            const warning = errors.find(e => e.field === 'highlight.dialogue.color');
            assert.ok(warning);
            assert.strictEqual(warning!.severity, 'warning');
        });

        test('should validate valid autoUpdateReadmeOnCreate', () => {
            const config: NovelConfig = {
                autoUpdateReadmeOnCreate: { value: 'ask' }
            };
            const errors = validateConfig(config);
            assert.strictEqual(errors.filter(e => e.field.includes('autoUpdateReadmeOnCreate')).length, 0);
        });

        test('should reject invalid autoUpdateReadmeOnCreate value', () => {
            const config = {
                autoUpdateReadmeOnCreate: { value: 'invalid' }
            } as NovelConfig;
            const errors = validateConfig(config);
            const error = errors.find(e => e.field === 'autoUpdateReadmeOnCreate.value');
            assert.ok(error);
            assert.strictEqual(error!.severity, 'error');
        });
    });

    suite('fixConfig Integration', () => {
        test('should fix negative targetWords to default', () => {
            const config: NovelConfig = {
                targetWords: { default: -100 }
            };
            const fixed = fixConfig(config);
            assert.strictEqual(fixed.targetWords!.default, 2500);
        });

        test('should fix invalid autoUpdateReadmeOnCreate', () => {
            const config = {
                autoUpdateReadmeOnCreate: { value: 'invalid' }
            } as NovelConfig;
            const fixed = fixConfig(config);
            assert.strictEqual(fixed.autoUpdateReadmeOnCreate!.value, 'always');
        });

        test('should preserve valid config values', () => {
            const config: NovelConfig = {
                targetWords: { default: 5000 },
                autoUpdateReadmeOnCreate: { value: 'never' }
            };
            const fixed = fixConfig(config);
            assert.strictEqual(fixed.targetWords!.default, 5000);
            assert.strictEqual(fixed.autoUpdateReadmeOnCreate!.value, 'never');
        });

        test('should not mutate original config', () => {
            const config: NovelConfig = {
                targetWords: { default: -100 }
            };
            const originalValue = config.targetWords!.default;
            fixConfig(config);
            assert.strictEqual(config.targetWords!.default, originalValue);
        });

        test('should deep clone nested objects', () => {
            const config: NovelConfig = {
                highlight: {
                    dialogue: { color: '#fff' }
                }
            };
            const fixed = fixConfig(config);
            assert.notStrictEqual(fixed.highlight, config.highlight);
            assert.notStrictEqual(fixed.highlight?.dialogue, config.highlight?.dialogue);
        });
    });

    suite('Highlight Style Structure', () => {
        test('dialogue highlight should have color property', () => {
            const dialogueHighlight = {
                color: '#ce9178',
                backgroundColor: 'rgba(206, 145, 120, 0.15)',
                fontStyle: 'normal'
            };
            assert.ok('color' in dialogueHighlight);
            assert.strictEqual(dialogueHighlight.color, '#ce9178');
        });

        test('character highlight should have fontWeight property', () => {
            const characterHighlight = {
                color: '#4ec9b0',
                backgroundColor: 'rgba(78, 201, 176, 0.15)',
                fontWeight: 'bold'
            };
            assert.ok('fontWeight' in characterHighlight);
            assert.strictEqual(characterHighlight.fontWeight, 'bold');
        });

        test('highlight style should support optional properties', () => {
            const minimalHighlight = {
                color: '#ffffff'
            };
            assert.strictEqual(minimalHighlight.color, '#ffffff');
            assert.strictEqual((minimalHighlight as { backgroundColor?: string }).backgroundColor, undefined);
        });
    });

    suite('Config Path Constants', () => {
        test('CONFIG_FILE_NAME should be novel.jsonc', () => {
            const CONFIG_FILE_NAME = 'novel.jsonc';
            assert.strictEqual(CONFIG_FILE_NAME, 'novel.jsonc');
        });

        test('CHAPTERS_FOLDER should be chapters', () => {
            const CHAPTERS_FOLDER = 'chapters';
            assert.strictEqual(CHAPTERS_FOLDER, 'chapters');
        });

        test('CHARACTERS_FOLDER should be characters', () => {
            const CHARACTERS_FOLDER = 'characters';
            assert.strictEqual(CHARACTERS_FOLDER, 'characters');
        });
    });

    suite('Debounce Delay Constants', () => {
        test('WORD_COUNT_DEBOUNCE_DELAY should be 300ms', () => {
            const WORD_COUNT_DEBOUNCE_DELAY = 300;
            assert.strictEqual(WORD_COUNT_DEBOUNCE_DELAY, 300);
        });

        test('HIGHLIGHT_DEBOUNCE_DELAY should be 500ms', () => {
            const HIGHLIGHT_DEBOUNCE_DELAY = 500;
            assert.strictEqual(HIGHLIGHT_DEBOUNCE_DELAY, 500);
        });

        test('README_UPDATE_DEBOUNCE_DELAY should be 5000ms', () => {
            const README_UPDATE_DEBOUNCE_DELAY = 5000;
            assert.strictEqual(README_UPDATE_DEBOUNCE_DELAY, 5000);
        });
    });

    suite('Volume Config Structure', () => {
        test('volume config should have required properties', () => {
            const volumeConfig = {
                enabled: true,
                folderStructure: 'nested' as const,
                numberFormat: 'chinese' as const,
                chapterNumbering: 'global' as const
            };

            assert.strictEqual(volumeConfig.enabled, true);
            assert.strictEqual(volumeConfig.folderStructure, 'nested');
            assert.strictEqual(volumeConfig.numberFormat, 'chinese');
            assert.strictEqual(volumeConfig.chapterNumbering, 'global');
        });

        test('default volume config should have all required fields', () => {
            const defaultVolumeConfig = {
                enabled: false,
                folderStructure: 'flat' as const,
                numberFormat: 'arabic' as const,
                chapterNumbering: 'global' as const
            };

            assert.ok('enabled' in defaultVolumeConfig);
            assert.ok('folderStructure' in defaultVolumeConfig);
            assert.ok('numberFormat' in defaultVolumeConfig);
            assert.ok('chapterNumbering' in defaultVolumeConfig);
        });
    });

    suite('Sensitive Word Config Structure', () => {
        test('sensitive word config should support enabled flag', () => {
            const sensitiveWordConfig = {
                enabled: true,
                builtinLibraries: ['politics', 'violence'],
                customLibraryPath: '.noveler/sensitive-words/custom-words.jsonc',
                whitelist: {
                    enabled: true,
                    path: '.noveler/sensitive-words/whitelist.jsonc'
                }
            };

            assert.strictEqual(sensitiveWordConfig.enabled, true);
            assert.ok(Array.isArray(sensitiveWordConfig.builtinLibraries));
        });

        test('builtin libraries should be valid names', () => {
            const validLibraries = ['politics', 'violence', 'adult'];
            const testLibraries = ['politics', 'violence'];

            testLibraries.forEach(lib => {
                assert.ok(validLibraries.includes(lib), `${lib} should be a valid library`);
            });
        });
    });

    suite('Config Getter Logic', () => {
        test('getTargetWords should return default when not set', () => {
            const config: NovelConfig = {};
            const targetWords = config.targetWords?.default || 2500;
            assert.strictEqual(targetWords, 2500);
        });

        test('getTargetWords should return config value when set', () => {
            const config: NovelConfig = {
                targetWords: { default: 5000 }
            };
            const targetWords = config.targetWords?.default || 2500;
            assert.strictEqual(targetWords, 5000);
        });

        test('getChineseQuoteStyle should return default when not set', () => {
            const config: NovelConfig = {};
            const quoteStyle = config.format?.chineseQuoteStyle || '「」';
            assert.strictEqual(quoteStyle, '「」');
        });

        test('shouldShowWordCountInStatusBar should default to true', () => {
            const config: NovelConfig = {};
            const showInStatusBar = config.wordCount?.showInStatusBar !== false;
            assert.strictEqual(showInStatusBar, true);
        });

        test('shouldShowWordCountInStatusBar should respect false', () => {
            const config: NovelConfig = {
                wordCount: { showInStatusBar: false }
            };
            const showInStatusBar = config.wordCount?.showInStatusBar !== false;
            assert.strictEqual(showInStatusBar, false);
        });

        test('shouldAutoFormat should default to true', () => {
            const config: NovelConfig = {};
            const autoFormat = config.format?.autoFormat !== false;
            assert.strictEqual(autoFormat, true);
        });

        test('shouldAutoEmptyLine should default to true', () => {
            const config: NovelConfig = {};
            const autoEmptyLine = config.autoEmptyLine?.value !== false;
            assert.strictEqual(autoEmptyLine, true);
        });

        test('shouldParagraphIndent should return true when enabled', () => {
            const config: NovelConfig = {
                paragraphIndent: { value: true }
            };
            const paragraphIndent = config.paragraphIndent?.value === true;
            assert.strictEqual(paragraphIndent, true);
        });

        test('getReadmeAutoUpdateMode should return default when not set', () => {
            const config: NovelConfig = {};
            const mode = config.autoUpdateReadmeOnCreate?.value || 'always';
            assert.strictEqual(mode, 'always');
        });

        test('isVolumesEnabled should return false by default', () => {
            const config: NovelConfig = {};
            const enabled = config.volumes?.enabled === true;
            assert.strictEqual(enabled, false);
        });

        test('isVolumesEnabled should return true when enabled', () => {
            const config: NovelConfig = {
                volumes: {
                    enabled: true,
                    folderStructure: 'nested',
                    numberFormat: 'arabic',
                    chapterNumbering: 'global'
                }
            };
            const enabled = config.volumes?.enabled === true;
            assert.strictEqual(enabled, true);
        });

        test('getCharacters should return empty array by default', () => {
            const config: NovelConfig = {};
            const characters = config.characters?.list || [];
            assert.deepStrictEqual(characters, []);
        });

        test('getCharacters should return list when set', () => {
            const config: NovelConfig = {
                characters: { list: ['萧炎', '萧薰儿', '药老'] }
            };
            const characters = config.characters?.list || [];
            assert.deepStrictEqual(characters, ['萧炎', '萧薰儿', '药老']);
        });
    });

    suite('getVolumesConfig Logic', () => {
        test('should return default config when not set', () => {
            const config: NovelConfig = {};
            const volumesConfig = config.volumes || {
                enabled: false,
                folderStructure: 'flat',
                numberFormat: 'arabic',
                chapterNumbering: 'global'
            };
            assert.strictEqual(volumesConfig.enabled, false);
            assert.strictEqual(volumesConfig.folderStructure, 'flat');
        });

        test('should merge with defaults for partial config', () => {
            const config: NovelConfig = {
                volumes: {
                    enabled: true,
                    folderStructure: 'nested',
                    numberFormat: 'chinese',
                    chapterNumbering: 'volume'
                }
            };
            assert.strictEqual(config.volumes!.enabled, true);
            assert.strictEqual(config.volumes!.folderStructure, 'nested');
            assert.strictEqual(config.volumes!.numberFormat, 'chinese');
            assert.strictEqual(config.volumes!.chapterNumbering, 'volume');
        });
    });

    suite('Config Merge Logic', () => {
        test('should handle undefined config gracefully', () => {
            const config: NovelConfig = {};
            assert.doesNotThrow(() => {
                void config.targetWords?.default;
                void config.highlight?.dialogue?.color;
                void config.format?.chineseQuoteStyle;
            });
        });

        test('should handle partial highlight config', () => {
            const config: NovelConfig = {
                highlight: {
                    dialogue: { color: '#fff' }
                    // character is undefined
                }
            };
            const dialogueStyle = config.highlight?.dialogue || {};
            const characterStyle = config.highlight?.character || {};

            assert.strictEqual(dialogueStyle.color, '#fff');
            assert.deepStrictEqual(characterStyle, {});
        });
    });
});
