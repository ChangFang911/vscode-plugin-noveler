import * as assert from 'assert';
import { extractContentWithoutFrontmatterForMatching, getFrontmatterEndOffsetForMatching } from '../../utils/frontMatterHelper';

suite('FrontMatterHelper Test Suite', () => {

    suite('extractContentWithoutFrontmatterForMatching', () => {

        suite('With Front Matter', () => {
            test('should extract content and offset from text with front matter', () => {
                const text = `---
title: Test
---

Content here`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, 'Content here');
                assert.ok(result.offset > 0);
            });

            test('should correctly calculate offset', () => {
                const text = `---
title: Test
---

Content`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                // Verify offset points to content start
                assert.strictEqual(text.substring(result.offset), result.text);
            });

            test('should handle multi-line front matter', () => {
                const text = `---
title: "第一章"
chapter: 1
wordCount: 3000
status: "草稿"
---

正文内容`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, '正文内容');
            });

            test('should skip blank lines after front matter', () => {
                const text = `---
title: Test
---


Content after blank lines`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, 'Content after blank lines');
            });

            test('should handle front matter with no trailing newlines', () => {
                const text = `---
title: Test
---
Content`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, 'Content');
            });
        });

        suite('Without Front Matter', () => {
            test('should return original text and zero offset', () => {
                const text = 'Just plain text';
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, text);
                assert.strictEqual(result.offset, 0);
            });

            test('should return original for text not starting with ---', () => {
                const text = `Some text
---
title: Test
---`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, text);
                assert.strictEqual(result.offset, 0);
            });

            test('should return original for unclosed front matter', () => {
                const text = `---
title: Test
No closing delimiter`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, text);
                assert.strictEqual(result.offset, 0);
            });

            test('should handle empty text', () => {
                const result = extractContentWithoutFrontmatterForMatching('');
                assert.strictEqual(result.text, '');
                assert.strictEqual(result.offset, 0);
            });
        });

        suite('Edge Cases', () => {
            test('should handle content with --- inside', () => {
                const text = `---
title: Test
---

Content with --- inside text`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.ok(result.text.includes('---'));
            });

            test('should handle Windows line endings', () => {
                const text = '---\r\ntitle: Test\r\n---\r\n\r\nContent';
                const result = extractContentWithoutFrontmatterForMatching(text);
                // Should handle CRLF and skip them
                assert.strictEqual(result.text, 'Content');
            });

            test('should handle multiple blank lines', () => {
                const text = `---
title: Test
---



Content after many blanks`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, 'Content after many blanks');
            });

            test('should handle empty front matter', () => {
                const text = `---
---

Content`;
                const result = extractContentWithoutFrontmatterForMatching(text);
                assert.strictEqual(result.text, 'Content');
            });
        });
    });

    suite('getFrontmatterEndOffsetForMatching', () => {

        test('should return correct offset for text with front matter', () => {
            const text = `---
title: Test
---

Content`;
            const offset = getFrontmatterEndOffsetForMatching(text);
            assert.ok(offset > 0);
            assert.strictEqual(text.substring(offset), 'Content');
        });

        test('should return 0 for text without front matter', () => {
            const text = 'No front matter here';
            const offset = getFrontmatterEndOffsetForMatching(text);
            assert.strictEqual(offset, 0);
        });

        test('should return 0 for empty text', () => {
            assert.strictEqual(getFrontmatterEndOffsetForMatching(''), 0);
        });

        test('should match extractContentWithoutFrontmatterForMatching offset', () => {
            const text = `---
title: Test
chapter: 1
---

正文内容`;
            const offset = getFrontmatterEndOffsetForMatching(text);
            const extracted = extractContentWithoutFrontmatterForMatching(text);
            assert.strictEqual(offset, extracted.offset);
        });
    });
});
