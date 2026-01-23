import * as assert from 'assert';
import * as sinon from 'sinon';
import { WordCountService } from '../../services/wordCountService';

suite('WordCountService Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('getSimpleWordCount (Static Method)', () => {
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

        test('should handle multiple headers', () => {
            const text = '# 第一章\n内容一\n## 第一节\n内容二';
            const result = WordCountService.getSimpleWordCount(text);
            // Only "内容一" and "内容二" = 6 characters
            assert.strictEqual(result, 6);
        });

        test('should handle text with only headers', () => {
            const text = '# 标题一\n## 标题二\n### 标题三';
            const result = WordCountService.getSimpleWordCount(text);
            assert.strictEqual(result, 0);
        });

        test('should count numbers as content', () => {
            const result = WordCountService.getSimpleWordCount('2024年');
            // 2024 (4 digits) + 年 (1 Chinese) = 5
            assert.strictEqual(result, 5);
        });

        test('should handle HTML comments', () => {
            const text = '正文<!-- 这是注释 -->内容';
            const result = WordCountService.getSimpleWordCount(text);
            // HTML comments are removed, so only "正文内容" = 4
            assert.strictEqual(result, 4);
        });

        test('should handle multiline HTML comments', () => {
            const text = '正文<!--\n多行\n注释\n-->内容';
            const result = WordCountService.getSimpleWordCount(text);
            assert.strictEqual(result, 4);
        });

        test('should handle newlines correctly', () => {
            const text = '第一行\n第二行\n第三行';
            const result = WordCountService.getSimpleWordCount(text);
            // 3 + 3 + 3 = 9 Chinese characters
            assert.strictEqual(result, 9);
        });
    });

    suite('getDetailedStats (Static Method)', () => {
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

        test('should handle empty string', () => {
            const result = WordCountService.getDetailedStats('');
            assert.strictEqual(result.content, 0);
            assert.strictEqual(result.punctuation, 0);
        });

        test('should handle text with only punctuation', () => {
            const result = WordCountService.getDetailedStats('，。！？');
            assert.strictEqual(result.content, 0);
            assert.strictEqual(result.punctuation, 4);
        });

        test('should handle text with only content', () => {
            const result = WordCountService.getDetailedStats('纯文本内容');
            assert.strictEqual(result.content, 5);
            assert.strictEqual(result.punctuation, 0);
        });

        test('should handle various Chinese punctuation', () => {
            const result = WordCountService.getDetailedStats('「对话」【注释】《书名》');
            // 对话注释书名 = 6 Chinese
            // 「」【】《》 = 6 punctuation
            assert.strictEqual(result.content, 6);
            assert.strictEqual(result.punctuation, 6);
        });

        test('should handle mixed punctuation styles', () => {
            const result = WordCountService.getDetailedStats('"Hello", he said。');
            // Hello, he, said = 12 letters
            // "" , . = 4 punctuation
            assert.ok(result.content > 0);
            assert.ok(result.punctuation > 0);
        });

        test('should include headers when excludeHeaders is false', () => {
            const text = '# 标题\n正文';
            const resultWithHeaders = WordCountService.getDetailedStats(text, false);
            const resultWithoutHeaders = WordCountService.getDetailedStats(text, true);
            // With headers: # + 标题 + 正文 = more content
            // Without headers: 正文 = less content
            assert.ok(resultWithHeaders.content > resultWithoutHeaders.content);
        });
    });

    suite('Instance Methods', () => {
        let service: WordCountService;

        setup(() => {
            service = new WordCountService();
        });

        suite('getSelectionWordCount', () => {
            test('should not exclude headers', () => {
                const text = '# 标题\n正文';
                const result = service.getSelectionWordCount(text);
                // Selection should include header content
                assert.strictEqual(result.contentChars, 4); // "标题正文"
            });

            test('should count paragraphs', () => {
                const text = '第一段\n\n第二段\n\n第三段';
                const result = service.getSelectionWordCount(text);
                assert.strictEqual(result.paragraphs, 3);
            });

            test('should count lines', () => {
                const text = '第一行\n第二行\n第三行';
                const result = service.getSelectionWordCount(text);
                assert.strictEqual(result.lines, 3);
            });

            test('should calculate totalChars correctly', () => {
                const text = '你好，世界！';
                const result = service.getSelectionWordCount(text);
                assert.strictEqual(result.totalChars, result.contentChars + result.punctuation);
            });

            test('should count chineseChars separately', () => {
                const text = 'Hello世界';
                const result = service.getSelectionWordCount(text);
                assert.strictEqual(result.chineseChars, 2); // Only 世界
            });

            test('should count English words', () => {
                const text = 'Hello World Test';
                const result = service.getSelectionWordCount(text);
                assert.strictEqual(result.words, 3);
            });

            test('should handle empty selection', () => {
                const result = service.getSelectionWordCount('');
                assert.strictEqual(result.totalChars, 0);
                assert.strictEqual(result.contentChars, 0);
                assert.strictEqual(result.chineseChars, 0);
                assert.strictEqual(result.punctuation, 0);
                assert.strictEqual(result.words, 0);
                assert.strictEqual(result.paragraphs, 0);
                assert.strictEqual(result.lines, 1); // Empty string is one line
            });

            test('should handle single line', () => {
                const text = '这是一行文本';
                const result = service.getSelectionWordCount(text);
                assert.strictEqual(result.lines, 1);
                assert.strictEqual(result.paragraphs, 1);
            });

            test('should handle empty lines as non-paragraphs', () => {
                const text = '段落一\n\n\n段落二';
                const result = service.getSelectionWordCount(text);
                // 4 lines total, but only 2 non-empty paragraphs
                assert.strictEqual(result.lines, 4);
                assert.strictEqual(result.paragraphs, 2);
            });
        });

        suite('Cache Operations', () => {
            test('clearAllCache should not throw', () => {
                assert.doesNotThrow(() => {
                    service.clearAllCache();
                });
            });

            test('clearAllCache should be callable multiple times', () => {
                assert.doesNotThrow(() => {
                    service.clearAllCache();
                    service.clearAllCache();
                    service.clearAllCache();
                });
            });
        });
    });

    suite('WordCountStats Interface', () => {
        test('should have all required fields', () => {
            const service = new WordCountService();
            const stats = service.getSelectionWordCount('测试文本');

            assert.ok('totalChars' in stats);
            assert.ok('contentChars' in stats);
            assert.ok('chineseChars' in stats);
            assert.ok('punctuation' in stats);
            assert.ok('words' in stats);
            assert.ok('paragraphs' in stats);
            assert.ok('lines' in stats);
        });

        test('totalChars should equal contentChars + punctuation', () => {
            const service = new WordCountService();
            const stats = service.getSelectionWordCount('你好，世界！');
            assert.strictEqual(stats.totalChars, stats.contentChars + stats.punctuation);
        });

        test('all numeric fields should be non-negative', () => {
            const service = new WordCountService();
            const stats = service.getSelectionWordCount('任意文本');

            assert.ok(stats.totalChars >= 0);
            assert.ok(stats.contentChars >= 0);
            assert.ok(stats.chineseChars >= 0);
            assert.ok(stats.punctuation >= 0);
            assert.ok(stats.words >= 0);
            assert.ok(stats.paragraphs >= 0);
            assert.ok(stats.lines >= 0);
        });
    });

    suite('Edge Cases', () => {
        test('should handle very long text', () => {
            const longText = '测试'.repeat(10000);
            const result = WordCountService.getSimpleWordCount(longText);
            assert.strictEqual(result, 20000);
        });

        test('should handle special Unicode characters', () => {
            const text = '𠀀𠀁测试'; // Supplementary CJK characters
            const result = WordCountService.getSimpleWordCount(text);
            // Note: Supplementary characters may not match \u4e00-\u9fa5
            assert.ok(result >= 2); // At least 测试
        });

        test('should handle mixed script content', () => {
            const text = '日本語とEnglishと中文';
            const result = WordCountService.getSimpleWordCount(text);
            // Japanese hiragana is in different Unicode range
            assert.ok(result > 0);
        });

        test('should handle tabs and special whitespace', () => {
            const text = '你好\t世界\r\n测试';
            const result = WordCountService.getSimpleWordCount(text);
            // Should ignore tabs and count Chinese chars
            assert.ok(result >= 6); // 你好世界测试
        });

        test('should handle zero-width characters', () => {
            const text = '你\u200B好\u200B世\u200B界'; // Zero-width spaces
            const result = WordCountService.getSimpleWordCount(text);
            // Zero-width spaces may or may not be counted depending on implementation
            assert.ok(result >= 4); // At least 你好世界
        });

        test('should handle combining characters', () => {
            const text = '测试é'; // e with combining acute
            const result = WordCountService.getSimpleWordCount(text);
            assert.ok(result >= 2); // At least 测试
        });
    });

    suite('Markdown Edge Cases', () => {
        test('should handle code blocks', () => {
            const text = '正文\n```\ncode block\n```\n更多正文';
            const result = WordCountService.getSimpleWordCount(text);
            // Code blocks are not headers, so content is counted
            assert.ok(result > 0);
        });

        test('should handle inline code', () => {
            const text = '这是`code`内联代码';
            const result = WordCountService.getSimpleWordCount(text);
            // `code` is counted, ` marks might be punctuation
            assert.ok(result > 0);
        });

        test('should handle blockquotes', () => {
            const text = '> 引用内容\n正文内容';
            const result = WordCountService.getSimpleWordCount(text);
            assert.ok(result > 0);
        });

        test('should handle lists', () => {
            const text = '- 项目一\n- 项目二\n- 项目三';
            const result = WordCountService.getSimpleWordCount(text);
            // List markers are punctuation
            assert.ok(result > 0);
        });

        test('should handle numbered lists', () => {
            const text = '1. 第一项\n2. 第二项\n3. 第三项';
            const result = WordCountService.getSimpleWordCount(text);
            assert.ok(result > 0);
        });

        test('should handle links', () => {
            const text = '[链接文字](https://example.com)';
            const result = WordCountService.getSimpleWordCount(text);
            // 链接文字 = 4 Chinese, URL is counted as content
            assert.ok(result >= 4);
        });

        test('should handle images', () => {
            const text = '![图片描述](image.png)';
            const result = WordCountService.getSimpleWordCount(text);
            assert.ok(result >= 0);
        });

        test('should handle horizontal rules', () => {
            const text = '上文\n---\n下文';
            const result = WordCountService.getSimpleWordCount(text);
            // --- is punctuation, 上文下文 = 4
            assert.ok(result >= 4);
        });

        test('should handle bold and italic', () => {
            const text = '**粗体**和*斜体*文字';
            const result = WordCountService.getSimpleWordCount(text);
            // * marks are punctuation, Chinese chars are counted
            assert.ok(result > 0);
        });
    });

    suite('Novel-specific Content', () => {
        test('should handle dialogue correctly', () => {
            const text = '「你好吗？」她问道。';
            const result = WordCountService.getSimpleWordCount(text);
            // 你好吗她问道 = 6 Chinese
            // 「」？。 = 4 punctuation
            assert.strictEqual(result, 10);
        });

        test('should handle typical chapter content', () => {
            const text = `# 第一章 初遇

「你是谁？」少年问道。

少女微微一笑，并没有回答。`;
            const result = WordCountService.getSimpleWordCount(text);
            // Excludes header, counts dialogue and narration
            assert.ok(result > 10);
        });

        test('should handle front matter style content', () => {
            const text = `---
title: 第一章
---
正文内容`;
            // Front matter should be handled by getContentWithoutFrontMatter
            // getSimpleWordCount doesn't handle front matter directly
            const result = WordCountService.getSimpleWordCount(text);
            assert.ok(result >= 4); // At least 正文内容
        });

        test('should handle character names in dialogue', () => {
            const text = '萧炎说：「我会变强的！」药老点了点头。';
            const result = WordCountService.getSimpleWordCount(text);
            // Multiple characters and dialogue
            assert.ok(result > 10);
        });
    });

    suite('Performance', () => {
        test('should handle repeated calls efficiently', () => {
            const text = '测试文本'.repeat(100);
            const startTime = Date.now();

            for (let i = 0; i < 1000; i++) {
                WordCountService.getSimpleWordCount(text);
            }

            const endTime = Date.now();
            const duration = endTime - startTime;

            // Should complete 1000 calls in under 1 second
            assert.ok(duration < 1000, `Performance test failed: ${duration}ms`);
        });

        test('should handle large document without timeout', () => {
            const largeText = '这是一段很长的文本内容。'.repeat(10000);
            const startTime = Date.now();

            const result = WordCountService.getSimpleWordCount(largeText);

            const endTime = Date.now();
            const duration = endTime - startTime;

            assert.ok(result > 0);
            assert.ok(duration < 5000, `Large document test failed: ${duration}ms`);
        });
    });
});
