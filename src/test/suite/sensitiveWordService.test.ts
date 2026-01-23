import * as assert from 'assert';
import * as sinon from 'sinon';
import { TrieTree } from '../../utils/trieTree';

/**
 * SensitiveWordService 测试套件
 * 由于该服务是单例且依赖 VSCode API，我们主要测试：
 * 1. TrieTree 核心检测逻辑
 * 2. 白名单过滤逻辑
 * 3. 配置处理逻辑
 */
suite('SensitiveWordService Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('TrieTree Core Detection', () => {
        let trie: TrieTree;

        setup(() => {
            trie = new TrieTree();
        });

        test('should insert and search single word', () => {
            trie.insert('敏感词', 'high');
            const matches = trie.search('这是一个敏感词测试');
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0].word, '敏感词');
            assert.strictEqual(matches[0].level, 'high');
        });

        test('should find multiple matches', () => {
            trie.insert('敏感', 'high');
            trie.insert('词语', 'medium');
            const matches = trie.search('敏感词语测试');
            assert.ok(matches.length >= 1);
        });

        test('should handle empty text', () => {
            trie.insert('敏感词', 'high');
            const matches = trie.search('');
            assert.strictEqual(matches.length, 0);
        });

        test('should handle text without matches', () => {
            trie.insert('敏感词', 'high');
            const matches = trie.search('正常文本内容');
            assert.strictEqual(matches.length, 0);
        });

        test('should handle batch insert', () => {
            trie.insertBatch(['词语一', '词语二', '词语三'], 'high');
            assert.strictEqual(trie.getWordCount(), 3);
        });

        test('should return correct position', () => {
            trie.insert('测试', 'high');
            const text = '这是测试文本';
            const matches = trie.search(text);
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0].start, 2);
            assert.strictEqual(matches[0].end, 4);
            assert.strictEqual(text.substring(matches[0].start, matches[0].end), '测试');
        });

        test('should handle overlapping matches', () => {
            trie.insert('测试', 'high');
            trie.insert('测试文本', 'medium');
            const matches = trie.search('这是测试文本');
            // Should find longer match or both depending on implementation
            assert.ok(matches.length >= 1);
        });

        test('should handle repeated words in text', () => {
            trie.insert('敏感', 'high');
            const matches = trie.search('敏感词敏感字敏感');
            // Should find all occurrences
            assert.strictEqual(matches.length, 3);
        });

        test('should clear all words', () => {
            trie.insertBatch(['词一', '词二', '词三'], 'high');
            assert.strictEqual(trie.getWordCount(), 3);
            trie.clear();
            assert.strictEqual(trie.getWordCount(), 0);
        });

        test('should handle Chinese punctuation in text', () => {
            trie.insert('敏感词', 'high');
            const matches = trie.search('「敏感词」测试');
            assert.strictEqual(matches.length, 1);
        });

        test('should handle mixed Chinese and English', () => {
            trie.insert('test敏感', 'high');
            const matches = trie.search('这是test敏感内容');
            assert.strictEqual(matches.length, 1);
        });
    });

    suite('Whitelist Filtering Logic', () => {
        test('should filter out whitelisted words', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            trie.insert('白名单词', 'high');

            const whitelist = new Set(['白名单词']);
            const matches = trie.search('敏感词和白名单词');

            // Filter whitelist manually (as the service does)
            const filtered = matches.filter(m => !whitelist.has(m.word));
            assert.strictEqual(filtered.length, 1);
            assert.strictEqual(filtered[0].word, '敏感词');
        });

        test('should handle empty whitelist', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');

            const whitelist = new Set<string>();
            const matches = trie.search('敏感词测试');
            const filtered = matches.filter(m => !whitelist.has(m.word));

            assert.strictEqual(filtered.length, 1);
        });

        test('should handle whitelist with all matched words', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');

            const whitelist = new Set(['敏感词']);
            const matches = trie.search('敏感词测试');
            const filtered = matches.filter(m => !whitelist.has(m.word));

            assert.strictEqual(filtered.length, 0);
        });

        test('should handle case-sensitive whitelist', () => {
            const trie = new TrieTree();
            trie.insert('Sensitive', 'high');

            const whitelist = new Set(['sensitive']); // lowercase
            const matches = trie.search('This is Sensitive content');
            const filtered = matches.filter(m => !whitelist.has(m.word));

            // Original word is not in whitelist (case mismatch)
            assert.strictEqual(filtered.length, 1);
        });
    });

    suite('Config Processing Logic', () => {
        test('should merge default config with user config', () => {
            const defaultConfig = {
                enabled: true,
                builtInLibrary: {
                    enabled: true,
                    levels: { high: true, medium: false, low: false }
                },
                checkOnType: true,
                checkOnSave: true
            };

            const userConfig: {
                enabled?: boolean;
                builtInLibrary?: { enabled?: boolean; levels?: { high?: boolean; medium?: boolean; low?: boolean } };
            } = {
                enabled: false,
                builtInLibrary: {
                    levels: { medium: true }
                }
            };

            // Merge logic simulation
            const merged = {
                enabled: userConfig.enabled !== undefined ? userConfig.enabled : defaultConfig.enabled,
                builtInLibrary: {
                    enabled: userConfig.builtInLibrary?.enabled !== undefined
                        ? userConfig.builtInLibrary.enabled
                        : defaultConfig.builtInLibrary.enabled,
                    levels: {
                        ...defaultConfig.builtInLibrary.levels,
                        ...userConfig.builtInLibrary?.levels
                    }
                },
                checkOnType: defaultConfig.checkOnType,
                checkOnSave: defaultConfig.checkOnSave
            };

            assert.strictEqual(merged.enabled, false);
            assert.strictEqual(merged.builtInLibrary.enabled, true);
            assert.strictEqual(merged.builtInLibrary.levels.high, true);
            assert.strictEqual(merged.builtInLibrary.levels.medium, true);
            assert.strictEqual(merged.builtInLibrary.levels.low, false);
        });

        test('should handle undefined user config', () => {
            const defaultConfig = {
                enabled: true,
                checkOnType: true
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const userConfig: any = undefined;

            const enabled = userConfig?.enabled !== undefined ? userConfig.enabled : defaultConfig.enabled;
            assert.strictEqual(enabled, true);
        });

        test('should recognize valid severity levels', () => {
            const validLevels = ['Error', 'Warning', 'Information'];
            assert.ok(validLevels.includes('Warning'));
            assert.ok(validLevels.includes('Error'));
            assert.ok(validLevels.includes('Information'));
            assert.ok(!validLevels.includes('Hint'));
        });

        test('should recognize valid sensitive levels', () => {
            const validLevels = ['high', 'medium', 'low'];
            assert.ok(validLevels.includes('high'));
            assert.ok(validLevels.includes('medium'));
            assert.ok(validLevels.includes('low'));
        });
    });

    suite('SensitiveMatch Interface', () => {
        test('should have all required fields', () => {
            const match = {
                word: '敏感词',
                start: 0,
                end: 3,
                level: 'high' as const,
                inWhitelist: false
            };

            assert.ok('word' in match);
            assert.ok('start' in match);
            assert.ok('end' in match);
            assert.ok('level' in match);
        });

        test('should calculate correct word length from positions', () => {
            const match = {
                word: '敏感词',
                start: 5,
                end: 8,
                level: 'high' as const
            };

            assert.strictEqual(match.end - match.start, match.word.length);
        });
    });

    suite('Offset Calculation Logic', () => {
        test('should adjust match positions with offset', () => {
            const offset = 100; // Simulating frontmatter offset
            const originalMatches = [
                { word: '敏感', start: 0, end: 2, level: 'high' as const },
                { word: '词语', start: 10, end: 12, level: 'medium' as const }
            ];

            const adjustedMatches = originalMatches.map(m => ({
                ...m,
                start: m.start + offset,
                end: m.end + offset
            }));

            assert.strictEqual(adjustedMatches[0].start, 100);
            assert.strictEqual(adjustedMatches[0].end, 102);
            assert.strictEqual(adjustedMatches[1].start, 110);
            assert.strictEqual(adjustedMatches[1].end, 112);
        });

        test('should handle zero offset', () => {
            const offset = 0;
            const match = { word: '敏感', start: 5, end: 7, level: 'high' as const };
            const adjusted = { ...match, start: match.start + offset, end: match.end + offset };

            assert.strictEqual(adjusted.start, 5);
            assert.strictEqual(adjusted.end, 7);
        });
    });

    suite('Path Resolution Logic', () => {
        test('should resolve .jsonc to .json fallback path', () => {
            const configuredPath = '.noveler/sensitive-words/custom-words.jsonc';
            const fallbackPath = configuredPath.replace(/\.jsonc$/, '.json');

            assert.strictEqual(fallbackPath, '.noveler/sensitive-words/custom-words.json');
        });

        test('should resolve .json to .jsonc fallback path', () => {
            const configuredPath = '.noveler/sensitive-words/custom-words.json';
            const fallbackPath = configuredPath.replace(/\.json$/, '.jsonc');

            assert.strictEqual(fallbackPath, '.noveler/sensitive-words/custom-words.jsonc');
        });

        test('should handle path without extension', () => {
            const configuredPath = '.noveler/sensitive-words/custom-words';
            let fallbackPath: string | null = null;

            if (configuredPath.endsWith('.jsonc')) {
                fallbackPath = configuredPath.replace(/\.jsonc$/, '.json');
            } else if (configuredPath.endsWith('.json')) {
                fallbackPath = configuredPath.replace(/\.json$/, '.jsonc');
            }

            assert.strictEqual(fallbackPath, null);
        });
    });

    suite('Statistics Logic', () => {
        test('should return correct word count', () => {
            const trie = new TrieTree();
            trie.insertBatch(['词一', '词二', '词三', '词四', '词五'], 'high');

            assert.strictEqual(trie.getWordCount(), 5);
        });

        test('should return correct whitelist size', () => {
            const whitelist = new Set(['白名单词一', '白名单词二']);
            assert.strictEqual(whitelist.size, 2);
        });

        test('should handle empty trie', () => {
            const trie = new TrieTree();
            assert.strictEqual(trie.getWordCount(), 0);
        });

        test('should handle duplicate insertions', () => {
            const trie = new TrieTree();
            trie.insert('测试', 'high');
            trie.insert('测试', 'high'); // Duplicate
            trie.insert('测试', 'medium'); // Same word, different level

            // Behavior depends on implementation
            // Typically should either update or ignore duplicates
            assert.ok(trie.getWordCount() >= 1);
        });
    });

    suite('Edge Cases', () => {
        test('should handle very long words', () => {
            const trie = new TrieTree();
            const longWord = '测'.repeat(100);
            trie.insert(longWord, 'high');

            const matches = trie.search(`包含${longWord}的文本`);
            assert.strictEqual(matches.length, 1);
        });

        test('should handle single character words', () => {
            const trie = new TrieTree();
            trie.insert('某', 'high');

            const matches = trie.search('某人某事某物');
            assert.strictEqual(matches.length, 3);
        });

        test('should handle special characters in words', () => {
            const trie = new TrieTree();
            trie.insert('特殊@词', 'high');

            const matches = trie.search('这是特殊@词测试');
            assert.strictEqual(matches.length, 1);
        });

        test('should handle emoji in text', () => {
            const trie = new TrieTree();
            trie.insert('敏感', 'high');

            const matches = trie.search('😀敏感😀测试');
            assert.strictEqual(matches.length, 1);
        });

        test('should handle newlines in text', () => {
            const trie = new TrieTree();
            trie.insert('敏感', 'high');

            const matches = trie.search('第一行\n敏感\n第三行');
            assert.strictEqual(matches.length, 1);
        });

        test('should handle tabs in text', () => {
            const trie = new TrieTree();
            trie.insert('敏感', 'high');

            const matches = trie.search('前面\t敏感\t后面');
            assert.strictEqual(matches.length, 1);
        });
    });

    suite('Performance', () => {
        test('should handle large word library efficiently', () => {
            const trie = new TrieTree();
            const words: string[] = [];

            // Generate 10000 unique words
            for (let i = 0; i < 10000; i++) {
                words.push(`敏感词${i}`);
            }

            const startInsert = Date.now();
            trie.insertBatch(words, 'high');
            const insertTime = Date.now() - startInsert;

            assert.strictEqual(trie.getWordCount(), 10000);
            assert.ok(insertTime < 5000, `Insert took too long: ${insertTime}ms`);
        });

        test('should search large text efficiently', () => {
            const trie = new TrieTree();
            trie.insertBatch(['敏感', '词语', '测试'], 'high');

            const largeText = '这是一段很长的文本内容，其中包含敏感词语和测试内容。'.repeat(1000);

            const startSearch = Date.now();
            const matches = trie.search(largeText);
            const searchTime = Date.now() - startSearch;

            assert.ok(matches.length > 0);
            assert.ok(searchTime < 5000, `Search took too long: ${searchTime}ms`);
        });

        test('should handle concurrent-like operations', () => {
            const trie = new TrieTree();
            trie.insertBatch(['敏感', '词语'], 'high');

            const results: number[] = [];

            // Simulate multiple searches
            for (let i = 0; i < 100; i++) {
                const matches = trie.search(`测试敏感词语内容${i}`);
                results.push(matches.length);
            }

            // All should have found matches
            assert.ok(results.every(r => r >= 2));
        });
    });
});
