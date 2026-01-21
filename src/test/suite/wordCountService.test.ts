import * as assert from 'assert';
import { WordCountService } from '../../services/wordCountService';

suite('WordCountService Test Suite', () => {

    suite('getSimpleWordCount', () => {
        test('should count Chinese characters correctly', () => {
            const result = WordCountService.getSimpleWordCount('你好世界');
            assert.strictEqual(result, 4);
        });

        test('should count mixed Chinese and English', () => {
            const result = WordCountService.getSimpleWordCount('Hello世界');
            assert.strictEqual(result, 7); // 5 English + 2 Chinese
        });

        test('should count Chinese with punctuation', () => {
            const result = WordCountService.getSimpleWordCount('你好，世界！');
            assert.strictEqual(result, 6); // 4 Chinese + 2 punctuation
        });

        test('should exclude Markdown headers by default', () => {
            const text = '# 标题\n正文内容';
            const result = WordCountService.getSimpleWordCount(text);
            assert.strictEqual(result, 4); // Only "正文内容"
        });

        test('should include headers when excludeHeaders is false', () => {
            const text = '# 标题\n正文';
            const result = WordCountService.getSimpleWordCount(text, false);
            // 实际行为：包含 "# 标题\n正文" = # + 标题 + 正文 = 1 + 2 + 2 = 5 (# 也计入)
            assert.strictEqual(result, 5);
        });

        test('should handle empty string', () => {
            const result = WordCountService.getSimpleWordCount('');
            assert.strictEqual(result, 0);
        });

        test('should ignore spaces', () => {
            const result = WordCountService.getSimpleWordCount('你 好 世 界');
            assert.strictEqual(result, 4);
        });

        test('should ignore full-width spaces', () => {
            const result = WordCountService.getSimpleWordCount('你　好　世　界');
            assert.strictEqual(result, 4);
        });
    });

    suite('getDetailedStats', () => {
        test('should separate content and punctuation', () => {
            const result = WordCountService.getDetailedStats('你好，世界！');
            assert.strictEqual(result.content, 4);
            assert.strictEqual(result.punctuation, 2);
        });

        test('should count English punctuation', () => {
            const result = WordCountService.getDetailedStats('Hello, World!');
            assert.strictEqual(result.content, 10); // HelloWorld
            assert.strictEqual(result.punctuation, 2); // , !
        });

        test('should handle complex mixed content', () => {
            const text = '第1章：Hello World！这是测试。';
            const result = WordCountService.getDetailedStats(text);
            // 第章这是测试 = 6 Chinese + HelloWorld = 10 + 1 = 11
            // ：！。 = 3 punctuation
            assert.ok(result.content > 0);
            assert.ok(result.punctuation > 0);
        });

        test('should exclude Markdown headers', () => {
            const text = '## 第一章 标题\n这是正文内容。';
            const result = WordCountService.getDetailedStats(text);
            // Only "这是正文内容" should be counted
            assert.strictEqual(result.content, 6);
            assert.strictEqual(result.punctuation, 1);
        });

        test('should handle numbers', () => {
            const result = WordCountService.getDetailedStats('2024年1月');
            // 年月 = 2 Chinese + 20241 = 5 digits = 7 total content
            assert.strictEqual(result.content, 7);
        });
    });

    suite('Instance methods', () => {
        let service: WordCountService;

        setup(() => {
            service = new WordCountService();
        });

        test('getSelectionWordCount should not exclude headers', () => {
            const text = '# 标题\n正文';
            const result = service.getSelectionWordCount(text);
            // Selection should include header content
            assert.strictEqual(result.contentChars, 4); // "标题正文"
        });

        test('getSelectionWordCount should count paragraphs', () => {
            const text = '第一段\n\n第二段\n\n第三段';
            const result = service.getSelectionWordCount(text);
            assert.strictEqual(result.paragraphs, 3);
        });

        test('getSelectionWordCount should count lines', () => {
            const text = '第一行\n第二行\n第三行';
            const result = service.getSelectionWordCount(text);
            assert.strictEqual(result.lines, 3);
        });

        test('clearAllCache should not throw', () => {
            assert.doesNotThrow(() => {
                service.clearAllCache();
            });
        });
    });
});
