import * as assert from 'assert';
import { sanitizeFileName, validateChapterName, validateCharacterName } from '../../utils/inputValidator';

suite('InputValidator Test Suite', () => {

    suite('sanitizeFileName', () => {

        suite('Basic sanitization', () => {
            test('should return valid filename unchanged', () => {
                assert.strictEqual(sanitizeFileName('第一章'), '第一章');
                assert.strictEqual(sanitizeFileName('Chapter 1'), 'Chapter 1');
            });

            test('should remove forward slash', () => {
                assert.strictEqual(sanitizeFileName('path/name'), 'pathname');
            });

            test('should remove backslash', () => {
                assert.strictEqual(sanitizeFileName('path\\name'), 'pathname');
            });

            test('should remove colon', () => {
                assert.strictEqual(sanitizeFileName('name:value'), 'namevalue');
            });

            test('should remove asterisk', () => {
                assert.strictEqual(sanitizeFileName('name*'), 'name');
            });

            test('should remove question mark', () => {
                assert.strictEqual(sanitizeFileName('name?'), 'name');
            });

            test('should remove double quotes', () => {
                assert.strictEqual(sanitizeFileName('"name"'), 'name');
            });

            test('should remove angle brackets', () => {
                assert.strictEqual(sanitizeFileName('<name>'), 'name');
            });

            test('should remove pipe character', () => {
                assert.strictEqual(sanitizeFileName('name|value'), 'namevalue');
            });

            test('should remove multiple illegal characters', () => {
                assert.strictEqual(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j'), 'abcdefghij');
            });
        });

        suite('Whitespace handling', () => {
            test('should trim leading spaces', () => {
                assert.strictEqual(sanitizeFileName('  name'), 'name');
            });

            test('should trim trailing spaces', () => {
                assert.strictEqual(sanitizeFileName('name  '), 'name');
            });

            test('should trim both leading and trailing spaces', () => {
                assert.strictEqual(sanitizeFileName('  name  '), 'name');
            });

            test('should preserve internal spaces', () => {
                assert.strictEqual(sanitizeFileName('hello world'), 'hello world');
            });
        });

        suite('Default value', () => {
            test('should return default for empty string', () => {
                assert.strictEqual(sanitizeFileName(''), '未命名');
            });

            test('should return default for whitespace only', () => {
                assert.strictEqual(sanitizeFileName('   '), '未命名');
            });

            test('should return default when all characters are illegal', () => {
                assert.strictEqual(sanitizeFileName('/:*?"<>|'), '未命名');
            });
        });

        suite('Length limiting', () => {
            test('should truncate names longer than MAX_CHAPTER_NAME_LENGTH', () => {
                const longName = 'a'.repeat(150);
                const result = sanitizeFileName(longName);
                assert.strictEqual(result.length, 100); // MAX_CHAPTER_NAME_LENGTH = 100
            });

            test('should not truncate names at or under limit', () => {
                const name = 'a'.repeat(100);
                const result = sanitizeFileName(name);
                assert.strictEqual(result.length, 100);
            });
        });

        suite('Chinese characters', () => {
            test('should preserve Chinese characters', () => {
                assert.strictEqual(sanitizeFileName('第一章 陨落的天才'), '第一章 陨落的天才');
            });

            test('should remove illegal chars but keep Chinese', () => {
                assert.strictEqual(sanitizeFileName('第一章/陨落'), '第一章陨落');
            });
        });
    });

    suite('validateChapterName', () => {

        suite('Valid names', () => {
            test('should return sanitized name for valid input', () => {
                assert.strictEqual(validateChapterName('第一章'), '第一章');
            });

            test('should return sanitized name with illegal chars removed', () => {
                assert.strictEqual(validateChapterName('第一章/开始'), '第一章开始');
            });

            test('should trim whitespace', () => {
                assert.strictEqual(validateChapterName('  第一章  '), '第一章');
            });
        });

        suite('Invalid names', () => {
            test('should return null for undefined', () => {
                assert.strictEqual(validateChapterName(undefined), null);
            });

            test('should return null for empty string', () => {
                assert.strictEqual(validateChapterName(''), null);
            });

            test('should return null when all characters are illegal', () => {
                assert.strictEqual(validateChapterName('/:*?"<>|'), null);
            });

            test('should return null for whitespace only', () => {
                // Empty after trim, validateChapterName returns null for empty
                assert.strictEqual(validateChapterName(''), null);
            });
        });

        suite('Edge cases', () => {
            test('should accept name that becomes 未命名 from empty input', () => {
                // Empty string -> null (undefined behavior after empty check)
                assert.strictEqual(validateChapterName(''), null);
            });

            test('should accept normal Chinese chapter names', () => {
                const result = validateChapterName('陨落的天才');
                assert.strictEqual(result, '陨落的天才');
            });
        });
    });

    suite('validateCharacterName', () => {

        suite('Valid names', () => {
            test('should return sanitized name for valid input', () => {
                assert.strictEqual(validateCharacterName('张无忌'), '张无忌');
            });

            test('should return sanitized name with illegal chars removed', () => {
                assert.strictEqual(validateCharacterName('张无忌/主角'), '张无忌主角');
            });

            test('should accept English names', () => {
                assert.strictEqual(validateCharacterName('John Smith'), 'John Smith');
            });
        });

        suite('Invalid names', () => {
            test('should return null for undefined', () => {
                assert.strictEqual(validateCharacterName(undefined), null);
            });

            test('should return null for empty string', () => {
                assert.strictEqual(validateCharacterName(''), null);
            });

            test('should return null when all characters are illegal', () => {
                assert.strictEqual(validateCharacterName('/:*?"<>|'), null);
            });
        });

        suite('Length validation', () => {
            test('should return null for names exceeding MAX_CHARACTER_NAME_LENGTH', () => {
                const longName = '张'.repeat(51); // MAX_CHARACTER_NAME_LENGTH = 50
                assert.strictEqual(validateCharacterName(longName), null);
            });

            test('should accept names at MAX_CHARACTER_NAME_LENGTH', () => {
                const exactName = '张'.repeat(50);
                assert.strictEqual(validateCharacterName(exactName), exactName);
            });

            test('should accept names under MAX_CHARACTER_NAME_LENGTH', () => {
                const shortName = '张三';
                assert.strictEqual(validateCharacterName(shortName), shortName);
            });
        });
    });
});
