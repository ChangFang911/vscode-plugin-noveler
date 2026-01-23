import * as assert from 'assert';
import { validateConfig, fixConfig } from '../../utils/configValidator';
import { NovelConfig } from '../../services/configService';

suite('ConfigValidator Test Suite', () => {

    suite('validateConfig', () => {

        suite('targetWords validation', () => {
            test('should pass for valid targetWords', () => {
                const config: NovelConfig = {
                    targetWords: { default: 2500 }
                };
                const errors = validateConfig(config);
                const targetWordsErrors = errors.filter(e => e.field.includes('targetWords'));
                assert.strictEqual(targetWordsErrors.length, 0);
            });

            test('should error for non-number targetWords', () => {
                const config = {
                    targetWords: { default: 'abc' as unknown as number }
                };
                const errors = validateConfig(config);
                const error = errors.find(e => e.field === 'targetWords.default');
                assert.ok(error);
                assert.strictEqual(error!.severity, 'error');
                assert.ok(error!.message.includes('必须是数字'));
            });

            test('should error for zero targetWords', () => {
                const config: NovelConfig = {
                    targetWords: { default: 0 }
                };
                const errors = validateConfig(config);
                const error = errors.find(e => e.field === 'targetWords.default');
                assert.ok(error);
                assert.strictEqual(error!.severity, 'error');
                assert.ok(error!.message.includes('大于 0'));
            });

            test('should error for negative targetWords', () => {
                const config: NovelConfig = {
                    targetWords: { default: -100 }
                };
                const errors = validateConfig(config);
                const error = errors.find(e => e.field === 'targetWords.default');
                assert.ok(error);
                assert.strictEqual(error!.severity, 'error');
            });

            test('should warn for targetWords over 50000', () => {
                const config: NovelConfig = {
                    targetWords: { default: 60000 }
                };
                const errors = validateConfig(config);
                const warning = errors.find(e => e.field === 'targetWords.default');
                assert.ok(warning);
                assert.strictEqual(warning!.severity, 'warning');
                assert.ok(warning!.message.includes('50000'));
            });

            test('should pass for targetWords at 50000', () => {
                const config: NovelConfig = {
                    targetWords: { default: 50000 }
                };
                const errors = validateConfig(config);
                const targetWordsErrors = errors.filter(e => e.field.includes('targetWords'));
                assert.strictEqual(targetWordsErrors.length, 0);
            });
        });

        suite('highlight color validation', () => {
            test('should pass for valid hex color #fff', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { color: '#fff' }
                    }
                };
                const errors = validateConfig(config);
                const colorErrors = errors.filter(e => e.field.includes('color'));
                assert.strictEqual(colorErrors.length, 0);
            });

            test('should pass for valid hex color #ffffff', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { color: '#ffffff' }
                    }
                };
                const errors = validateConfig(config);
                const colorErrors = errors.filter(e => e.field.includes('color'));
                assert.strictEqual(colorErrors.length, 0);
            });

            test('should pass for valid hex color uppercase', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { color: '#AABBCC' }
                    }
                };
                const errors = validateConfig(config);
                const colorErrors = errors.filter(e => e.field.includes('color'));
                assert.strictEqual(colorErrors.length, 0);
            });

            test('should pass for valid rgb color', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { color: 'rgb(255, 128, 0)' }
                    }
                };
                const errors = validateConfig(config);
                const colorErrors = errors.filter(e => e.field.includes('color'));
                assert.strictEqual(colorErrors.length, 0);
            });

            test('should pass for valid rgba color', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { backgroundColor: 'rgba(255, 128, 0, 0.5)' }
                    }
                };
                const errors = validateConfig(config);
                const colorErrors = errors.filter(e => e.field.includes('color'));
                assert.strictEqual(colorErrors.length, 0);
            });

            test('should warn for invalid color format', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { color: 'red' }
                    }
                };
                const errors = validateConfig(config);
                const warning = errors.find(e => e.field === 'highlight.dialogue.color');
                assert.ok(warning);
                assert.strictEqual(warning!.severity, 'warning');
            });

            test('should warn for invalid hex format', () => {
                const config: NovelConfig = {
                    highlight: {
                        dialogue: { color: '#gggggg' }
                    }
                };
                const errors = validateConfig(config);
                const warning = errors.find(e => e.field === 'highlight.dialogue.color');
                assert.ok(warning);
            });

            test('should warn for invalid backgroundColor', () => {
                const config: NovelConfig = {
                    highlight: {
                        character: { backgroundColor: 'invalid-color' }
                    }
                };
                const errors = validateConfig(config);
                const warning = errors.find(e => e.field === 'highlight.character.backgroundColor');
                assert.ok(warning);
                assert.strictEqual(warning!.severity, 'warning');
            });
        });

        suite('format.chineseQuoteStyle validation', () => {
            test('should pass for valid quote style 「」', () => {
                const config: NovelConfig = {
                    format: { chineseQuoteStyle: '「」' }
                };
                const errors = validateConfig(config);
                const quoteErrors = errors.filter(e => e.field.includes('chineseQuoteStyle'));
                assert.strictEqual(quoteErrors.length, 0);
            });

            test('should pass for valid quote style ""', () => {
                const config: NovelConfig = {
                    format: { chineseQuoteStyle: '""' }
                };
                const errors = validateConfig(config);
                const quoteErrors = errors.filter(e => e.field.includes('chineseQuoteStyle'));
                assert.strictEqual(quoteErrors.length, 0);
            });

            test('should pass for valid quote style ""', () => {
                const config: NovelConfig = {
                    format: { chineseQuoteStyle: '""' }
                };
                const errors = validateConfig(config);
                const quoteErrors = errors.filter(e => e.field.includes('chineseQuoteStyle'));
                assert.strictEqual(quoteErrors.length, 0);
            });

            test('should warn for invalid quote style', () => {
                const config: NovelConfig = {
                    format: { chineseQuoteStyle: '《》' }
                };
                const errors = validateConfig(config);
                const warning = errors.find(e => e.field === 'format.chineseQuoteStyle');
                assert.ok(warning);
                assert.strictEqual(warning!.severity, 'warning');
            });
        });

        suite('autoUpdateReadmeOnCreate validation', () => {
            test('should pass for value "always"', () => {
                const config: NovelConfig = {
                    autoUpdateReadmeOnCreate: { value: 'always' }
                };
                const errors = validateConfig(config);
                const readmeErrors = errors.filter(e => e.field.includes('autoUpdateReadmeOnCreate'));
                assert.strictEqual(readmeErrors.length, 0);
            });

            test('should pass for value "ask"', () => {
                const config: NovelConfig = {
                    autoUpdateReadmeOnCreate: { value: 'ask' }
                };
                const errors = validateConfig(config);
                const readmeErrors = errors.filter(e => e.field.includes('autoUpdateReadmeOnCreate'));
                assert.strictEqual(readmeErrors.length, 0);
            });

            test('should pass for value "never"', () => {
                const config: NovelConfig = {
                    autoUpdateReadmeOnCreate: { value: 'never' }
                };
                const errors = validateConfig(config);
                const readmeErrors = errors.filter(e => e.field.includes('autoUpdateReadmeOnCreate'));
                assert.strictEqual(readmeErrors.length, 0);
            });

            test('should error for invalid value', () => {
                const config = {
                    autoUpdateReadmeOnCreate: { value: 'invalid' }
                } as NovelConfig;
                const errors = validateConfig(config);
                const error = errors.find(e => e.field === 'autoUpdateReadmeOnCreate.value');
                assert.ok(error);
                assert.strictEqual(error!.severity, 'error');
            });
        });

        suite('Empty and minimal configs', () => {
            test('should pass for empty config', () => {
                const config: NovelConfig = {};
                const errors = validateConfig(config);
                assert.strictEqual(errors.length, 0);
            });

            test('should pass for undefined fields', () => {
                const config: NovelConfig = {
                    targetWords: undefined,
                    highlight: undefined,
                    format: undefined
                };
                const errors = validateConfig(config);
                assert.strictEqual(errors.length, 0);
            });
        });

        suite('Multiple errors', () => {
            test('should collect multiple errors', () => {
                const config = {
                    targetWords: { default: -1 },
                    highlight: {
                        dialogue: { color: 'invalid' }
                    },
                    autoUpdateReadmeOnCreate: { value: 'invalid' }
                } as NovelConfig;
                const errors = validateConfig(config);
                assert.ok(errors.length >= 3);
            });
        });
    });

    suite('fixConfig', () => {

        suite('targetWords fixes', () => {
            test('should fix negative targetWords to default', () => {
                const config: NovelConfig = {
                    targetWords: { default: -100 }
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.targetWords!.default, 2500);
            });

            test('should fix zero targetWords to default', () => {
                const config: NovelConfig = {
                    targetWords: { default: 0 }
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.targetWords!.default, 2500);
            });

            test('should fix non-number targetWords to default', () => {
                const config = {
                    targetWords: { default: 'abc' as unknown as number }
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.targetWords!.default, 2500);
            });

            test('should not change valid targetWords', () => {
                const config: NovelConfig = {
                    targetWords: { default: 3000 }
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.targetWords!.default, 3000);
            });
        });

        suite('autoUpdateReadmeOnCreate fixes', () => {
            test('should fix invalid value to "always"', () => {
                const config = {
                    autoUpdateReadmeOnCreate: { value: 'invalid' }
                } as NovelConfig;
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.autoUpdateReadmeOnCreate!.value, 'always');
            });

            test('should not change valid value "ask"', () => {
                const config: NovelConfig = {
                    autoUpdateReadmeOnCreate: { value: 'ask' }
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.autoUpdateReadmeOnCreate!.value, 'ask');
            });

            test('should not change valid value "never"', () => {
                const config: NovelConfig = {
                    autoUpdateReadmeOnCreate: { value: 'never' }
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.autoUpdateReadmeOnCreate!.value, 'never');
            });
        });

        suite('Immutability', () => {
            test('should not mutate original config (deep clone)', () => {
                const config: NovelConfig = {
                    targetWords: { default: -100 }
                };
                const originalDefault = config.targetWords!.default;
                const fixed = fixConfig(config);
                // 修复后的配置应该有正确的值
                assert.strictEqual(fixed.targetWords!.default, 2500);
                // 原对象应该保持不变（深拷贝）
                assert.strictEqual(config.targetWords!.default, originalDefault);
            });

            test('should return new object', () => {
                const config: NovelConfig = {
                    targetWords: { default: 2500 }
                };
                const fixed = fixConfig(config);
                assert.notStrictEqual(fixed, config);
            });

            test('should deep clone nested objects', () => {
                const config: NovelConfig = {
                    targetWords: { default: 3000 }
                };
                const fixed = fixConfig(config);
                // 嵌套对象也应该是不同的引用
                assert.notStrictEqual(fixed.targetWords, config.targetWords);
            });
        });

        suite('Edge cases', () => {
            test('should handle empty config', () => {
                const config: NovelConfig = {};
                const fixed = fixConfig(config);
                assert.deepStrictEqual(fixed, {});
            });

            test('should handle config with undefined values', () => {
                const config: NovelConfig = {
                    targetWords: undefined,
                    autoUpdateReadmeOnCreate: undefined
                };
                const fixed = fixConfig(config);
                assert.strictEqual(fixed.targetWords, undefined);
                assert.strictEqual(fixed.autoUpdateReadmeOnCreate, undefined);
            });
        });
    });
});
