import * as assert from 'assert';
import { TrieTree } from '../../utils/trieTree';

suite('TrieTree Test Suite', () => {

    suite('Basic operations', () => {
        test('should insert and find word', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            assert.strictEqual(trie.has('敏感词'), true);
        });

        test('should return false for non-existent word', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            assert.strictEqual(trie.has('不存在'), false);
        });

        test('should not find partial word', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            assert.strictEqual(trie.has('敏感'), false);
        });

        test('should count words correctly', () => {
            const trie = new TrieTree();
            trie.insert('词1', 'high');
            trie.insert('词2', 'medium');
            trie.insert('词3', 'low');
            assert.strictEqual(trie.getWordCount(), 3);
        });

        test('should not double count same word', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            trie.insert('敏感词', 'high');
            assert.strictEqual(trie.getWordCount(), 1);
        });
    });

    suite('Batch insert', () => {
        test('should insert multiple words', () => {
            const trie = new TrieTree();
            trie.insertBatch(['词1', '词2', '词3'], 'high');
            assert.strictEqual(trie.has('词1'), true);
            assert.strictEqual(trie.has('词2'), true);
            assert.strictEqual(trie.has('词3'), true);
            assert.strictEqual(trie.getWordCount(), 3);
        });

        test('should handle empty array', () => {
            const trie = new TrieTree();
            trie.insertBatch([], 'high');
            assert.strictEqual(trie.getWordCount(), 0);
        });
    });

    suite('Search', () => {
        test('should find word in text', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            const results = trie.search('这是一个敏感词测试');
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].word, '敏感词');
            assert.strictEqual(results[0].start, 4);
            assert.strictEqual(results[0].end, 7);
            assert.strictEqual(results[0].level, 'high');
        });

        test('should find multiple words', () => {
            const trie = new TrieTree();
            trie.insert('词1', 'high');
            trie.insert('词2', 'medium');
            const results = trie.search('这里有词1和词2');
            assert.strictEqual(results.length, 2);
        });

        test('should prefer longer match', () => {
            const trie = new TrieTree();
            trie.insert('敏感', 'medium');
            trie.insert('敏感词', 'high');
            const results = trie.search('敏感词测试');
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].word, '敏感词');
        });

        test('should return empty array for no matches', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            const results = trie.search('这是正常文本');
            assert.strictEqual(results.length, 0);
        });

        test('should handle empty text', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            const results = trie.search('');
            assert.strictEqual(results.length, 0);
        });

        test('should handle empty trie', () => {
            const trie = new TrieTree();
            const results = trie.search('任何文本');
            assert.strictEqual(results.length, 0);
        });
    });

    suite('Clear', () => {
        test('should clear all data', () => {
            const trie = new TrieTree();
            trie.insert('敏感词', 'high');
            assert.strictEqual(trie.getWordCount(), 1);
            trie.clear();
            assert.strictEqual(trie.getWordCount(), 0);
            assert.strictEqual(trie.has('敏感词'), false);
        });
    });

    suite('Edge cases', () => {
        test('should handle empty word insert', () => {
            const trie = new TrieTree();
            trie.insert('', 'high');
            assert.strictEqual(trie.getWordCount(), 0);
        });

        test('should handle single character word', () => {
            const trie = new TrieTree();
            trie.insert('禁', 'high');
            const results = trie.search('禁止通行');
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].word, '禁');
        });

        test('should handle overlapping matches correctly', () => {
            const trie = new TrieTree();
            trie.insert('AB', 'high');
            trie.insert('BC', 'high');
            const results = trie.search('ABC');
            // Should find AB first, then skip to C, missing BC
            assert.strictEqual(results.length, 1);
            assert.strictEqual(results[0].word, 'AB');
        });

        test('should handle consecutive matches', () => {
            const trie = new TrieTree();
            trie.insert('敏感', 'high');
            trie.insert('词汇', 'high');
            const results = trie.search('敏感词汇');
            assert.strictEqual(results.length, 2);
        });
    });
});
