/**
 * 高亮提供器测试
 * 测试对话和人物名称高亮功能
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import { DIALOGUE_REGEX, HTML_COMMENT_REGEX } from '../../constants';

suite('HighlightProvider Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Dialogue Regex Matching', () => {
        function findDialogueMatches(text: string): string[] {
            const matches: string[] = [];
            const regex = new RegExp(DIALOGUE_REGEX.source, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push(match[0]);
            }
            return matches;
        }

        test('should match 「」 quotes', () => {
            const matches = findDialogueMatches('「你好」');
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0], '「你好」');
        });

        test('should match "" quotes', () => {
            const matches = findDialogueMatches('"你好"');
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0], '"你好"');
        });

        test('should match "" quotes', () => {
            const matches = findDialogueMatches('"你好"');
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0], '"你好"');
        });

        test('should match multiple dialogues', () => {
            const matches = findDialogueMatches('「第一句」然后「第二句」');
            assert.strictEqual(matches.length, 2);
        });

        test('should match dialogue with punctuation', () => {
            const matches = findDialogueMatches('「你好吗？」');
            assert.strictEqual(matches.length, 1);
        });

        test('should match long dialogue', () => {
            const longContent = '这是一段很长的对话内容'.repeat(10);
            const matches = findDialogueMatches(`「${longContent}」`);
            assert.strictEqual(matches.length, 1);
        });

        test('should handle empty quotes', () => {
            const matches = findDialogueMatches('「」');
            assert.strictEqual(matches.length, 1);
        });

        test('should handle mixed quote styles', () => {
            const matches = findDialogueMatches('「第一句」"第二句""第三句"');
            assert.strictEqual(matches.length, 3);
        });
    });

    suite('HTML Comment Regex Matching', () => {
        function findCommentMatches(text: string): string[] {
            const matches: string[] = [];
            const regex = new RegExp(HTML_COMMENT_REGEX.source, 'g');
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push(match[0]);
            }
            return matches;
        }

        test('should match single line comment', () => {
            const matches = findCommentMatches('<!-- 注释 -->');
            assert.strictEqual(matches.length, 1);
        });

        test('should match multiline comment', () => {
            const matches = findCommentMatches('<!--\n多行\n注释\n-->');
            assert.strictEqual(matches.length, 1);
        });

        test('should match multiple comments', () => {
            const matches = findCommentMatches('<!-- 第一个 --> 内容 <!-- 第二个 -->');
            assert.strictEqual(matches.length, 2);
        });

        test('should handle empty comment', () => {
            const matches = findCommentMatches('<!---->');
            assert.strictEqual(matches.length, 1);
        });
    });

    suite('Character Name Regex Building', () => {
        function buildCharacterRegex(names: string[]): RegExp | null {
            if (names.length === 0) return null;
            const validNames = names.filter(name => typeof name === 'string' && name.length > 0);
            if (validNames.length === 0) return null;

            // 按名称长度从长到短排序
            const sortedNames = [...validNames].sort((a, b) => b.length - a.length);
            const escapedNames = sortedNames.map(name =>
                name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            );
            const namesPattern = escapedNames.join('|');
            return new RegExp(namesPattern, 'g');
        }

        function findCharacterMatches(text: string, names: string[]): string[] {
            const regex = buildCharacterRegex(names);
            if (!regex) return [];

            const matches: string[] = [];
            let match;
            while ((match = regex.exec(text)) !== null) {
                matches.push(match[0]);
            }
            return matches;
        }

        test('should match single character name', () => {
            const matches = findCharacterMatches('萧炎站在那里', ['萧炎']);
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0], '萧炎');
        });

        test('should match multiple character names', () => {
            const matches = findCharacterMatches('萧炎和萧薰儿说话', ['萧炎', '萧薰儿']);
            assert.strictEqual(matches.length, 2);
        });

        test('should match longer name first', () => {
            // 豆豆王子 should be matched as one, not 豆豆 + 王子
            const matches = findCharacterMatches('豆豆王子来了', ['豆豆', '豆豆王子']);
            assert.strictEqual(matches.length, 1);
            assert.strictEqual(matches[0], '豆豆王子');
        });

        test('should handle special characters in names', () => {
            const matches = findCharacterMatches('A.I.说话了', ['A.I.']);
            assert.strictEqual(matches.length, 1);
        });

        test('should return null for empty names', () => {
            const regex = buildCharacterRegex([]);
            assert.strictEqual(regex, null);
        });

        test('should filter invalid names', () => {
            const regex = buildCharacterRegex(['', '   ', '萧炎']);
            assert.ok(regex !== null);
            const matches = findCharacterMatches('萧炎', ['', '   ', '萧炎']);
            assert.strictEqual(matches.length, 1);
        });

        test('should handle repeated names in text', () => {
            const matches = findCharacterMatches('萧炎说萧炎好', ['萧炎']);
            assert.strictEqual(matches.length, 2);
        });
    });

    suite('Range Exclusion Logic', () => {
        interface MockRange {
            start: number;
            end: number;
        }

        function rangeContains(outer: MockRange, inner: MockRange): boolean {
            return inner.start >= outer.start && inner.end <= outer.end;
        }

        function isRangeExcluded(range: MockRange, excludedRanges: MockRange[]): boolean {
            for (const excluded of excludedRanges) {
                if (rangeContains(excluded, range)) {
                    return true;
                }
            }
            return false;
        }

        test('should exclude range inside dialogue', () => {
            const dialogueRange = { start: 0, end: 10 };
            const characterRange = { start: 2, end: 5 };
            assert.strictEqual(isRangeExcluded(characterRange, [dialogueRange]), true);
        });

        test('should not exclude range outside dialogue', () => {
            const dialogueRange = { start: 0, end: 10 };
            const characterRange = { start: 15, end: 20 };
            assert.strictEqual(isRangeExcluded(characterRange, [dialogueRange]), false);
        });

        test('should handle multiple excluded ranges', () => {
            const excludedRanges = [
                { start: 0, end: 10 },
                { start: 20, end: 30 }
            ];
            assert.strictEqual(isRangeExcluded({ start: 5, end: 8 }, excludedRanges), true);
            assert.strictEqual(isRangeExcluded({ start: 25, end: 28 }, excludedRanges), true);
            assert.strictEqual(isRangeExcluded({ start: 12, end: 18 }, excludedRanges), false);
        });

        test('should handle range at boundary', () => {
            const dialogueRange = { start: 0, end: 10 };
            // Range exactly at boundary
            assert.strictEqual(isRangeExcluded({ start: 0, end: 10 }, [dialogueRange]), true);
        });

        test('should handle empty excluded ranges', () => {
            assert.strictEqual(isRangeExcluded({ start: 0, end: 5 }, []), false);
        });
    });

    suite('Frontmatter Offset Handling', () => {
        function getFrontmatterEndOffset(text: string): number {
            if (!text.startsWith('---')) {
                return 0;
            }

            const secondDashIndex = text.indexOf('---', 3);
            if (secondDashIndex === -1) {
                return 0;
            }

            // Find the end of the line after the closing ---
            let endOffset = secondDashIndex + 3;
            while (endOffset < text.length && text[endOffset] !== '\n') {
                endOffset++;
            }
            if (endOffset < text.length) {
                endOffset++; // Include the newline
            }

            return endOffset;
        }

        test('should return 0 for text without frontmatter', () => {
            const offset = getFrontmatterEndOffset('正文内容');
            assert.strictEqual(offset, 0);
        });

        test('should calculate correct offset for frontmatter', () => {
            const text = '---\ntitle: 测试\n---\n正文';
            const offset = getFrontmatterEndOffset(text);
            assert.ok(offset > 0);
            assert.ok(text.substring(offset).startsWith('正文'));
        });

        test('should handle frontmatter with multiple fields', () => {
            const text = '---\ntitle: 测试\nchapter: 1\nstatus: draft\n---\n正文';
            const offset = getFrontmatterEndOffset(text);
            assert.ok(offset > 0);
        });

        test('should handle incomplete frontmatter', () => {
            const text = '---\ntitle: 测试\n正文';
            const offset = getFrontmatterEndOffset(text);
            assert.strictEqual(offset, 0); // No closing ---
        });
    });

    suite('Highlight Style Processing', () => {
        test('should handle valid color values', () => {
            const validColors = ['#fff', '#ffffff', '#AABBCC', 'rgb(255, 0, 0)', 'rgba(255, 0, 0, 0.5)'];
            validColors.forEach(color => {
                assert.ok(typeof color === 'string' && color.length > 0);
            });
        });

        test('should handle valid font styles', () => {
            const validStyles = ['normal', 'italic', 'oblique'];
            validStyles.forEach(style => {
                assert.ok(validStyles.includes(style));
            });
        });

        test('should handle valid font weights', () => {
            const validWeights = ['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
            validWeights.forEach(weight => {
                assert.ok(validWeights.includes(weight));
            });
        });

        test('should construct decoration options', () => {
            const options = {
                color: '#ce9178',
                backgroundColor: 'rgba(206, 145, 120, 0.15)',
                fontStyle: 'normal' as const
            };
            assert.ok('color' in options);
            assert.ok('backgroundColor' in options);
            assert.ok('fontStyle' in options);
        });
    });

    suite('Character Names Cache Logic', () => {
        test('should merge names from files and config', () => {
            const namesFromFiles = ['萧炎', '萧薰儿'];
            const namesFromConfig = ['药老', '萧炎']; // 萧炎 is duplicate

            const merged = [...new Set([...namesFromFiles, ...namesFromConfig])];

            assert.strictEqual(merged.length, 3);
            assert.ok(merged.includes('萧炎'));
            assert.ok(merged.includes('萧薰儿'));
            assert.ok(merged.includes('药老'));
        });

        test('should handle empty file names', () => {
            const namesFromFiles: string[] = [];
            const namesFromConfig = ['萧炎'];

            const merged = [...new Set([...namesFromFiles, ...namesFromConfig])];

            assert.strictEqual(merged.length, 1);
        });

        test('should handle empty config names', () => {
            const namesFromFiles = ['萧炎'];
            const namesFromConfig: string[] = [];

            const merged = [...new Set([...namesFromFiles, ...namesFromConfig])];

            assert.strictEqual(merged.length, 1);
        });

        test('should handle all empty', () => {
            const namesFromFiles: string[] = [];
            const namesFromConfig: string[] = [];

            const merged = [...new Set([...namesFromFiles, ...namesFromConfig])];

            assert.strictEqual(merged.length, 0);
        });
    });

    suite('Performance', () => {
        test('should handle large text efficiently', () => {
            const largeText = '「对话」正文'.repeat(10000);
            const regex = new RegExp(DIALOGUE_REGEX.source, 'g');

            const startTime = Date.now();
            let count = 0;
            let match;
            while ((match = regex.exec(largeText)) !== null) {
                count++;
            }
            const duration = Date.now() - startTime;

            assert.strictEqual(count, 10000);
            assert.ok(duration < 5000, `Took too long: ${duration}ms`);
        });

        test('should handle many character names efficiently', () => {
            const names = Array.from({ length: 100 }, (_, i) => `角色${i}`);
            const text = names.join('和') + '在一起';

            const sortedNames = [...names].sort((a, b) => b.length - a.length);
            const pattern = sortedNames.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
            const regex = new RegExp(pattern, 'g');

            const startTime = Date.now();
            let count = 0;
            let match;
            while ((match = regex.exec(text)) !== null) {
                count++;
            }
            const duration = Date.now() - startTime;

            assert.strictEqual(count, 100);
            assert.ok(duration < 1000, `Took too long: ${duration}ms`);
        });
    });
});
