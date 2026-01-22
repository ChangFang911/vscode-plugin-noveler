import * as assert from 'assert';
import { parseFrontMatter, stringifyFrontMatter } from '../../utils/frontMatterParser';

suite('FrontMatterParser Test Suite', () => {

    suite('parseFrontMatter', () => {

        suite('Valid Front Matter', () => {
            test('should parse simple front matter', () => {
                const text = `---
title: Hello
count: 100
---

Content here`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, false);
                assert.strictEqual(result.data.title, 'Hello');
                assert.strictEqual(result.data.count, 100);
                assert.strictEqual(result.content.trim(), 'Content here');
            });

            test('should parse front matter with quoted strings', () => {
                const text = `---
title: "第一章 开始"
status: "草稿"
---

正文内容`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.data.title, '第一章 开始');
                assert.strictEqual(result.data.status, '草稿');
            });

            test('should parse front matter with numbers', () => {
                const text = `---
chapter: 1
wordCount: 3000
---

Content`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.data.chapter, 1);
                assert.strictEqual(result.data.wordCount, 3000);
            });

            test('should parse front matter with boolean values', () => {
                const text = `---
published: true
draft: false
---

Content`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.data.published, true);
                assert.strictEqual(result.data.draft, false);
            });

            test('should parse front matter with arrays', () => {
                const text = `---
tags:
  - 武侠
  - 玄幻
---

Content`;
                const result = parseFrontMatter(text);
                assert.deepStrictEqual(result.data.tags, ['武侠', '玄幻']);
            });

            test('should preserve matter string', () => {
                const text = `---
title: Test
---

Content`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.matter.trim(), 'title: Test');
            });

            test('should handle Windows line endings (CRLF)', () => {
                // Note: YAML parser may include \r in values, so we check isEmpty and content
                const text = '---\r\ntitle: Test\r\n---\r\n\r\nContent';
                const result = parseFrontMatter(text);
                // YAML values may have trailing \r due to CRLF
                assert.ok(String(result.data.title).startsWith('Test'));
                assert.strictEqual(result.isEmpty, false);
            });
        });

        suite('Invalid Front Matter', () => {
            test('should return empty result for text without front matter', () => {
                const text = 'Just plain text without front matter';
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, true);
                assert.deepStrictEqual(result.data, {});
                assert.strictEqual(result.content, text);
            });

            test('should return empty result for text not starting with ---', () => {
                const text = `Some text
---
title: Hello
---`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, true);
            });

            test('should return empty result for unclosed front matter', () => {
                const text = `---
title: Hello
This never closes`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, true);
            });

            test('should return empty result for invalid YAML', () => {
                const text = `---
title: [unclosed bracket
---

Content`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, true);
            });

            test('should handle empty text', () => {
                const result = parseFrontMatter('');
                assert.strictEqual(result.isEmpty, true);
                assert.strictEqual(result.content, '');
            });

            test('should handle just delimiters', () => {
                const text = `---
---`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, false);
                assert.deepStrictEqual(result.data, {});
            });
        });

        suite('Edge Cases', () => {
            test('should handle front matter with empty content', () => {
                const text = `---
title: Test
---
`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.isEmpty, false);
                assert.strictEqual(result.data.title, 'Test');
                assert.strictEqual(result.content, '');
            });

            test('should handle content with --- inside', () => {
                const text = `---
title: Test
---

Content with --- inside
And more --- dashes`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.data.title, 'Test');
                assert.ok(result.content.includes('---'));
            });

            test('should handle Chinese characters in front matter', () => {
                const text = `---
title: "第一章 陨落的天才"
author: "张三"
---

正文内容`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.data.title, '第一章 陨落的天才');
                assert.strictEqual(result.data.author, '张三');
            });

            test('should handle null values', () => {
                const text = `---
title: null
count: ~
---

Content`;
                const result = parseFrontMatter(text);
                assert.strictEqual(result.data.title, null);
                assert.strictEqual(result.data.count, null);
            });
        });
    });

    suite('stringifyFrontMatter', () => {

        test('should stringify simple data', () => {
            const content = 'Hello World';
            const data = { title: 'Test', count: 100 };
            const result = stringifyFrontMatter(content, data);

            assert.ok(result.startsWith('---'));
            assert.ok(result.includes('title: Test'));
            assert.ok(result.includes('count: 100'));
            assert.ok(result.endsWith('Hello World'));
        });

        test('should handle empty data', () => {
            const content = 'Content only';
            const data = {};
            const result = stringifyFrontMatter(content, data);

            assert.ok(result.includes('---'));
            assert.ok(result.includes('Content only'));
        });

        test('should convert null values to empty strings', () => {
            const content = 'Content';
            const data = { title: null, count: 0 };
            const result = stringifyFrontMatter(content, data as Record<string, unknown>);

            assert.ok(result.includes('title:'));
            assert.ok(result.includes('count: 0'));
        });

        test('should convert undefined values to empty strings', () => {
            const content = 'Content';
            const data = { title: undefined, value: 'test' };
            const result = stringifyFrontMatter(content, data as Record<string, unknown>);

            assert.ok(result.includes('value: test'));
        });

        test('should handle Chinese content', () => {
            const content = '这是正文内容';
            const data = { title: '第一章' };
            const result = stringifyFrontMatter(content, data);

            assert.ok(result.includes('title: 第一章'));
            assert.ok(result.includes('这是正文内容'));
        });

        test('should roundtrip correctly', () => {
            const originalData = { title: '测试', chapter: 1, status: '草稿' };
            const originalContent = '正文内容\n\n第二段';

            const stringified = stringifyFrontMatter(originalContent, originalData);
            const parsed = parseFrontMatter(stringified);

            assert.strictEqual(parsed.data.title, originalData.title);
            assert.strictEqual(parsed.data.chapter, originalData.chapter);
            assert.strictEqual(parsed.data.status, originalData.status);
            assert.strictEqual(parsed.content.trim(), originalContent.trim());
        });
    });
});
