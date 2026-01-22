import * as assert from 'assert';
import { getStatusDisplayName, getStatusOptions, getStatusDisplayOptions } from '../../utils/statusHelper';

suite('StatusHelper Test Suite', () => {

    suite('getStatusDisplayName', () => {

        suite('English to Chinese mapping', () => {
            test('should convert draft to 草稿', () => {
                assert.strictEqual(getStatusDisplayName('draft'), '草稿');
            });

            test('should convert first-draft to 初稿', () => {
                assert.strictEqual(getStatusDisplayName('first-draft'), '初稿');
            });

            test('should convert revising to 修改中', () => {
                assert.strictEqual(getStatusDisplayName('revising'), '修改中');
            });

            test('should convert completed to 已完成', () => {
                assert.strictEqual(getStatusDisplayName('completed'), '已完成');
            });
        });

        suite('Chinese passthrough', () => {
            test('should pass through 草稿', () => {
                assert.strictEqual(getStatusDisplayName('草稿'), '草稿');
            });

            test('should pass through 初稿', () => {
                assert.strictEqual(getStatusDisplayName('初稿'), '初稿');
            });

            test('should pass through 修改中', () => {
                assert.strictEqual(getStatusDisplayName('修改中'), '修改中');
            });

            test('should pass through 已完成', () => {
                assert.strictEqual(getStatusDisplayName('已完成'), '已完成');
            });
        });

        suite('Default and edge cases', () => {
            test('should return 草稿 for undefined', () => {
                assert.strictEqual(getStatusDisplayName(undefined), '草稿');
            });

            test('should return 草稿 for empty string', () => {
                // Empty string is falsy, returns default
                assert.strictEqual(getStatusDisplayName(''), '草稿');
            });

            test('should return original for unknown status', () => {
                assert.strictEqual(getStatusDisplayName('unknown-status'), 'unknown-status');
            });

            test('should return original for custom status', () => {
                assert.strictEqual(getStatusDisplayName('自定义状态'), '自定义状态');
            });
        });
    });

    suite('getStatusOptions', () => {
        test('should return array of English status values', () => {
            const options = getStatusOptions();
            assert.deepStrictEqual(options, ['draft', 'first-draft', 'revising', 'completed']);
        });

        test('should return 4 options', () => {
            assert.strictEqual(getStatusOptions().length, 4);
        });

        test('should include draft', () => {
            assert.ok(getStatusOptions().includes('draft'));
        });

        test('should include completed', () => {
            assert.ok(getStatusOptions().includes('completed'));
        });
    });

    suite('getStatusDisplayOptions', () => {
        test('should return array of Chinese status names', () => {
            const options = getStatusDisplayOptions();
            assert.deepStrictEqual(options, ['草稿', '初稿', '修改中', '已完成']);
        });

        test('should return 4 options', () => {
            assert.strictEqual(getStatusDisplayOptions().length, 4);
        });

        test('should include 草稿', () => {
            assert.ok(getStatusDisplayOptions().includes('草稿'));
        });

        test('should include 已完成', () => {
            assert.ok(getStatusDisplayOptions().includes('已完成'));
        });
    });

    suite('Consistency between functions', () => {
        test('status options should map to display options', () => {
            const options = getStatusOptions();
            const displayOptions = getStatusDisplayOptions();

            for (let i = 0; i < options.length; i++) {
                const mapped = getStatusDisplayName(options[i]);
                assert.strictEqual(mapped, displayOptions[i],
                    `${options[i]} should map to ${displayOptions[i]}, got ${mapped}`);
            }
        });

        test('display options should map to themselves', () => {
            const displayOptions = getStatusDisplayOptions();

            for (const option of displayOptions) {
                assert.strictEqual(getStatusDisplayName(option), option);
            }
        });
    });
});
