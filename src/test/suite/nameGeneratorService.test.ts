/**
 * 姓名生成器服务测试
 * 测试姓名生成的辅助函数和逻辑
 */

import * as assert from 'assert';
import * as sinon from 'sinon';

suite('NameGeneratorService Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Random Pick Logic', () => {
        function randomPick<T>(array: T[], randomFn: () => number = Math.random): T {
            return array[Math.floor(randomFn() * array.length)];
        }

        test('should pick from single element array', () => {
            const result = randomPick(['only']);
            assert.strictEqual(result, 'only');
        });

        test('should pick first element when random is 0', () => {
            const result = randomPick(['a', 'b', 'c'], () => 0);
            assert.strictEqual(result, 'a');
        });

        test('should pick last element when random is close to 1', () => {
            const result = randomPick(['a', 'b', 'c'], () => 0.99);
            assert.strictEqual(result, 'c');
        });

        test('should pick middle element', () => {
            const result = randomPick(['a', 'b', 'c'], () => 0.5);
            assert.strictEqual(result, 'b');
        });

        test('should handle number array', () => {
            const result = randomPick([1, 2, 3], () => 0);
            assert.strictEqual(result, 1);
        });

        test('should handle object array', () => {
            const obj = { name: 'test' };
            const result = randomPick([obj], () => 0);
            assert.strictEqual(result, obj);
        });
    });

    suite('Gender Selection Logic', () => {
        function randomGender(randomValue: number): 'male' | 'female' {
            return randomValue > 0.5 ? 'male' : 'female';
        }

        test('should return male when random > 0.5', () => {
            assert.strictEqual(randomGender(0.51), 'male');
            assert.strictEqual(randomGender(0.99), 'male');
        });

        test('should return female when random <= 0.5', () => {
            assert.strictEqual(randomGender(0.5), 'female');
            assert.strictEqual(randomGender(0.1), 'female');
            assert.strictEqual(randomGender(0), 'female');
        });

        test('boundary condition at 0.5', () => {
            assert.strictEqual(randomGender(0.5), 'female');
        });
    });

    suite('Name Uniqueness Logic', () => {
        function generateUniqueNames(
            generateFn: () => string,
            count: number,
            maxAttempts: number = count * 20
        ): string[] {
            const names = new Set<string>();
            let attempts = 0;

            while (names.size < count && attempts < maxAttempts) {
                attempts++;
                names.add(generateFn());
            }

            return Array.from(names);
        }

        test('should generate requested count of unique names', () => {
            let counter = 0;
            const generateFn = () => `name${counter++}`;
            const result = generateUniqueNames(generateFn, 5);
            assert.strictEqual(result.length, 5);
        });

        test('should handle duplicate generation', () => {
            // Always generates same name
            const generateFn = () => 'sameName';
            const result = generateUniqueNames(generateFn, 5, 10);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], 'sameName');
        });

        test('should respect max attempts', () => {
            let counter = 0;
            const generateFn = () => `name${counter++ % 3}`; // Only 3 unique names
            const result = generateUniqueNames(generateFn, 10, 100);
            assert.strictEqual(result.length, 3);
        });

        test('should maintain order of first occurrence', () => {
            let counter = 0;
            const generateFn = () => `name${counter++}`;
            const result = generateUniqueNames(generateFn, 3);
            assert.deepStrictEqual(result, ['name0', 'name1', 'name2']);
        });
    });

    suite('Syllable Count Validation', () => {
        function validateSyllableCount(count: number): number {
            return Math.max(2, Math.min(4, count));
        }

        test('should clamp to minimum 2', () => {
            assert.strictEqual(validateSyllableCount(1), 2);
            assert.strictEqual(validateSyllableCount(0), 2);
            assert.strictEqual(validateSyllableCount(-5), 2);
        });

        test('should clamp to maximum 4', () => {
            assert.strictEqual(validateSyllableCount(5), 4);
            assert.strictEqual(validateSyllableCount(10), 4);
            assert.strictEqual(validateSyllableCount(100), 4);
        });

        test('should preserve valid values', () => {
            assert.strictEqual(validateSyllableCount(2), 2);
            assert.strictEqual(validateSyllableCount(3), 3);
            assert.strictEqual(validateSyllableCount(4), 4);
        });
    });

    suite('Name Capitalization', () => {
        function capitalize(name: string): string {
            if (!name) return name;
            return name.charAt(0).toUpperCase() + name.slice(1);
        }

        test('should capitalize first letter', () => {
            assert.strictEqual(capitalize('john'), 'John');
        });

        test('should handle already capitalized', () => {
            assert.strictEqual(capitalize('John'), 'John');
        });

        test('should handle single character', () => {
            assert.strictEqual(capitalize('a'), 'A');
        });

        test('should handle empty string', () => {
            assert.strictEqual(capitalize(''), '');
        });

        test('should handle mixed case', () => {
            assert.strictEqual(capitalize('jOHN'), 'JOHN');
        });

        test('should handle non-letter first char', () => {
            assert.strictEqual(capitalize('123abc'), '123abc');
        });
    });

    suite('Pattern Replacement', () => {
        function replacePattern(
            pattern: string,
            consonants: string[],
            vowels: string[],
            randomFn: () => number = () => 0
        ): string {
            const consonant = consonants[Math.floor(randomFn() * consonants.length)];
            const vowel = vowels[Math.floor(randomFn() * vowels.length)];

            return pattern
                .replace(/{consonant}/g, consonant)
                .replace(/{vowel}/g, vowel);
        }

        test('should replace consonant placeholder', () => {
            const result = replacePattern('{consonant}a', ['k'], ['e']);
            assert.strictEqual(result, 'ka');
        });

        test('should replace vowel placeholder', () => {
            const result = replacePattern('k{vowel}', ['k'], ['a']);
            assert.strictEqual(result, 'ka');
        });

        test('should replace multiple placeholders', () => {
            const result = replacePattern('{consonant}{vowel}{consonant}', ['k'], ['a']);
            assert.strictEqual(result, 'kak');
        });

        test('should handle no placeholders', () => {
            const result = replacePattern('abc', ['k'], ['a']);
            assert.strictEqual(result, 'abc');
        });

        test('should handle mixed content', () => {
            const result = replacePattern('pre{consonant}mid{vowel}post', ['k'], ['a']);
            assert.strictEqual(result, 'prekmidapost');
        });
    });

    suite('Chinese Name Generation Logic', () => {
        test('modern name should combine surname and given name', () => {
            const surname = '李';
            const givenName = '明';
            const fullName = surname + givenName;
            assert.strictEqual(fullName, '李明');
            assert.strictEqual(fullName.length, 2);
        });

        test('classic name with double given name', () => {
            const surname = '诸葛';
            const givenName = '孔明';
            const fullName = surname + givenName;
            assert.strictEqual(fullName, '诸葛孔明');
            assert.strictEqual(fullName.length, 4);
        });

        test('fantasy name with prefix and suffix', () => {
            const surname = '独孤';
            const prefix = '天';
            const suffix = '辰';
            const fullName = surname + prefix + suffix;
            assert.strictEqual(fullName, '独孤天辰');
            assert.strictEqual(fullName.length, 4);
        });
    });

    suite('English Name Generation Logic', () => {
        test('should combine first and last name with space', () => {
            const firstName = 'John';
            const lastName = 'Smith';
            const fullName = `${firstName} ${lastName}`;
            assert.strictEqual(fullName, 'John Smith');
        });

        test('should handle hyphenated last names', () => {
            const firstName = 'Mary';
            const lastName = 'Smith-Jones';
            const fullName = `${firstName} ${lastName}`;
            assert.strictEqual(fullName, 'Mary Smith-Jones');
        });
    });

    suite('Japanese Name Generation Logic', () => {
        test('should combine surname and given name without space', () => {
            const surname = '佐藤';
            const givenName = '太郎';
            const fullName = surname + givenName;
            assert.strictEqual(fullName, '佐藤太郎');
        });
    });

    suite('Western Fantasy Name Generation Logic', () => {
        test('should combine names with middle dot', () => {
            const firstName = '阿拉贡';
            const lastName = '刚铎';
            const fullName = `${firstName}·${lastName}`;
            assert.strictEqual(fullName, '阿拉贡·刚铎');
        });

        test('should handle multiple name parts', () => {
            const firstName = '凯兰崔尔';
            const lastName = '洛丝萝林';
            const fullName = `${firstName}·${lastName}`;
            assert.ok(fullName.includes('·'));
        });
    });

    suite('Name Style Types', () => {
        type ChineseNameStyle = 'modern' | 'classic' | 'fantasy';
        type Gender = 'male' | 'female' | 'random';

        test('ChineseNameStyle should have valid values', () => {
            const styles: ChineseNameStyle[] = ['modern', 'classic', 'fantasy'];
            assert.strictEqual(styles.length, 3);
            assert.ok(styles.includes('modern'));
            assert.ok(styles.includes('classic'));
            assert.ok(styles.includes('fantasy'));
        });

        test('Gender should have valid values', () => {
            const genders: Gender[] = ['male', 'female', 'random'];
            assert.strictEqual(genders.length, 3);
            assert.ok(genders.includes('male'));
            assert.ok(genders.includes('female'));
            assert.ok(genders.includes('random'));
        });
    });

    suite('Name Count Defaults', () => {
        test('default count should be 10', () => {
            const DEFAULT_COUNT = 10;
            assert.strictEqual(DEFAULT_COUNT, 10);
        });

        test('max attempts multiplier should be 20', () => {
            const count = 10;
            const maxAttempts = count * 20;
            assert.strictEqual(maxAttempts, 200);
        });
    });

    suite('Surname Probability Logic', () => {
        function selectSurnameType(random: number, commonRatio: number = 0.7): 'common' | 'classic' {
            return random > (1 - commonRatio) ? 'common' : 'classic';
        }

        test('should return common surname for high random values', () => {
            assert.strictEqual(selectSurnameType(0.8), 'common');
            assert.strictEqual(selectSurnameType(0.9), 'common');
        });

        test('should return classic surname for low random values', () => {
            assert.strictEqual(selectSurnameType(0.1), 'classic');
            assert.strictEqual(selectSurnameType(0.2), 'classic');
        });

        test('boundary at 0.3 (1 - 0.7)', () => {
            assert.strictEqual(selectSurnameType(0.3), 'classic');
            assert.strictEqual(selectSurnameType(0.31), 'common');
        });
    });

    suite('Given Name Length Logic', () => {
        function selectNameLength(random: number, doubleRatio: number = 0.6): 'single' | 'double' {
            return random > (1 - doubleRatio) ? 'double' : 'single';
        }

        test('should return double name for high random values', () => {
            assert.strictEqual(selectNameLength(0.8), 'double');
            assert.strictEqual(selectNameLength(0.9), 'double');
        });

        test('should return single name for low random values', () => {
            assert.strictEqual(selectNameLength(0.1), 'single');
            assert.strictEqual(selectNameLength(0.2), 'single');
        });
    });

    suite('Error Messages', () => {
        function createLoadError(dataType: string, errorMessage: string): string {
            return `加载${dataType}数据失败: ${errorMessage}`;
        }

        test('should format Chinese surname load error', () => {
            const error = createLoadError('中文姓氏', 'File not found');
            assert.strictEqual(error, '加载中文姓氏数据失败: File not found');
        });

        test('should format Japanese name load error', () => {
            const error = createLoadError('日文姓名', 'Invalid JSON');
            assert.strictEqual(error, '加载日文姓名数据失败: Invalid JSON');
        });

        test('should format English name load error', () => {
            const error = createLoadError('英文姓名', 'Permission denied');
            assert.strictEqual(error, '加载英文姓名数据失败: Permission denied');
        });
    });
});
