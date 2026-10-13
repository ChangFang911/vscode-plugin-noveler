/**
 * CodeLens 提供器测试
 * 测试章节标题上方的快捷操作
 */

import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ChapterCodeLensProvider } from '../../providers/codeLensProvider';
import { WordCountService } from '../../services/wordCountService';
import { MockTextDocument, MockUri } from '../mocks/vscode';
import { getStatusDisplayName } from '../../utils/statusHelper';

suite('CodeLensProvider Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Actual provider title placement', () => {
        test('reads completed status and target words from quoted CRLF metadata', () => {
            const document = new MockTextDocument(MockUri.file('/novel/chapters/第01章.md'), '---\r\ntitle: "开篇"\r\nstatus: "completed"\r\ntargetWords: 2500\r\n---\r\n# 开篇\r\n正文', 'markdown');
            const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
            assert.ok(lenses.some(lens => lens.command?.command === 'noveler.updateChapterStatus' && lens.command.title.includes('已完成')));
            assert.ok(lenses.some(lens => lens.command?.title.includes('2,500')));
        });
        const cases: Array<{ name: string; text: string; line: number | null }> = [
            { name: 'skips YAML comments before the chapter title', text: '---\n# 元数据备注\ntitle: 开篇\nstatus: draft\ntargetWords: 2500\n---\n# 第1章 开篇\n正文', line: 6 },
            { name: 'skips heading-like lines in YAML block values', text: '---\ndescription: |\n  # 元数据内的标题\n---\n\n# 正文标题', line: 5 },
            { name: 'skips headings inside HTML comments', text: '<!--\n# 注释标题\n-->\n# 正文标题\n正文', line: 3 },
            { name: 'keeps CRLF line positions after frontmatter and comments', text: '---\r\n# 备注\r\ntitle: 开篇\r\n---\r\n<!--\r\n# 隐藏标题\r\n-->\r\n# 正文标题', line: 7 },
            { name: 'keeps the first real title with an inline comment', text: '# 开篇 <!-- 备注 -->\n# 第二个标题', line: 0 },
            { name: 'ignores a heading consisting only of a comment', text: '# <!-- 不是章节标题 -->\n# 正文标题', line: 1 },
            { name: 'does not place actions in an unclosed comment', text: '<!--\n# 隐藏标题', line: null },
            { name: 'does not place actions in unclosed frontmatter', text: '---\n# 元数据备注\ntitle: 开篇', line: null },
            { name: 'keeps ordinary title placement without frontmatter', text: '# 开篇\n正文', line: 0 },
            { name: 'accepts empty frontmatter', text: '---\n---\n# 开篇', line: 2 },
            { name: 'skips frontmatter with a byte order mark', text: '\uFEFF---\n# 备注\ntitle: 开篇\n---\n# 正文标题', line: 4 }
        ];
        for (const item of cases) {
            test(item.name, () => {
                const document = new MockTextDocument(MockUri.file('/novel/chapters/第01章.md'), item.text, 'markdown');
                const provider = new ChapterCodeLensProvider(new WordCountService());
                const lenses = provider.provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
                if (item.line === null) {
                    assert.strictEqual(lenses.length, 0);
                    return;
                }
                assert.ok(lenses.length >= 3);
                assert.ok(lenses.every(lens => lens.range.start.line === item.line));
                assert.ok(lenses.some(lens => lens.command?.command === 'noveler.formatDocument'));
                const format = lenses.find(lens => lens.command?.command === 'noveler.formatDocument');
                assert.strictEqual(format?.command?.arguments?.[0], document.uri);
                const status = lenses.find(lens => lens.command?.command === 'noveler.updateChapterStatus');
                assert.strictEqual(status?.command?.arguments?.[0], document.uri);
            });
        }
    });

    suite('Supporting document actions', () => {
        for (const file of ['/novel/chapters/第一卷/outline.md', '/novel/chapters/第一卷/README.md',
            '/novel/chapters/第一卷/volume.md', '/novel/chapters/第一卷/OUTLINE.md',
            '/novel/drafts/大纲.md', 'C:\\novel\\chapters\\第一卷\\outline.md']) {
            test(`only formats supporting document ${file}`, () => {
                const document = new MockTextDocument(MockUri.file(file), '---\nstatus: draft\ntargetWords: 2500\n---\n# 卷资料\n正文', 'markdown');
                const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
                assert.strictEqual(lenses.length, 1);
                assert.strictEqual(lenses[0].command?.command, 'noveler.formatDocument');
                assert.strictEqual(lenses[0].command?.arguments?.[0], document.uri);
                assert.strictEqual(lenses[0].range.start.line, 4);
            });
        }
    });

    suite('Character document actions', () => {
        test('shows formatting and alias management above the real character title', () => {
            const document = new MockTextDocument(MockUri.file('/novel/characters/林舟.md'), '---\n# 人物备注\nname: 林舟\n---\n<!--\n# 隐藏标题\n-->\n# 林舟\n## 人物设定', 'markdown');
            const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
            assert.strictEqual(lenses.length, 2);
            assert.strictEqual(lenses[1].command?.command, 'noveler.manageCharacterAliases');
            assert.strictEqual(lenses[1].command?.arguments?.[0], document.uri);
            assert.strictEqual(lenses[0].range.start.line, 7);
            assert.strictEqual(lenses[0].command?.command, 'noveler.formatDocument');
            assert.strictEqual(lenses[0].command?.arguments?.[0], document.uri);
        });
        test('shows alias count and names with the correct document target', () => {
            const document = new MockTextDocument(MockUri.file('/novel/characters/王明.md'), '---\nname: 王明\naliases: [小王, William]\n---\n# 王明', 'markdown');
            const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
            assert.strictEqual(lenses[1].command?.title, '管理别名（2）');
            assert.strictEqual(lenses[1].command?.tooltip, '小王、William');
            assert.strictEqual(lenses[1].command?.arguments?.[0], document.uri);
        });
        test('does not add chapter actions to references or non-Markdown documents', () => {
            for (const [file, language] of [['/novel/references/资料.md', 'markdown'], ['/novel/characters/人物.txt', 'plaintext']]) {
                const document = new MockTextDocument(MockUri.file(file), '# 标题', language);
                const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
                assert.strictEqual(lenses.length, 0);
            }
        });
    });

    suite('Chapter Title Detection', () => {
        function findChapterTitleLine(lines: string[]): number {
            for (let i = 0; i < lines.length; i++) {
                const match = lines[i].match(/^#\s+(.+)$/);
                if (match) {
                    return i;
                }
            }
            return -1;
        }

        test('should find H1 title', () => {
            const lines = ['# 第一章 开始', '正文内容'];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, 0);
        });

        test('should not match H2 or deeper', () => {
            const lines = ['## 第一节', '### 小节'];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, -1);
        });

        test('should find title after frontmatter', () => {
            const lines = ['---', 'title: 第一章', '---', '', '# 第一章 开始'];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, 4);
        });

        test('should find first H1 only', () => {
            const lines = ['# 第一个标题', '# 第二个标题'];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, 0);
        });

        test('should require space after #', () => {
            const lines = ['#没有空格', '# 有空格'];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, 1);
        });

        test('should handle empty content', () => {
            const lines: string[] = [];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, -1);
        });

        test('should handle no title', () => {
            const lines = ['正文内容', '没有标题'];
            const index = findChapterTitleLine(lines);
            assert.strictEqual(index, -1);
        });
    });

    suite('Status Emoji Mapping', () => {
        function getStatusEmoji(status: string): string {
            const emojiMap: Record<string, string> = {
                '草稿': '📝',
                '初稿': '✏️',
                '修改中': '🔧',
                '已完成': '✅'
            };
            return emojiMap[status] || '📝';
        }

        test('should return 📝 for 草稿', () => {
            assert.strictEqual(getStatusEmoji('草稿'), '📝');
        });

        test('should return ✏️ for 初稿', () => {
            assert.strictEqual(getStatusEmoji('初稿'), '✏️');
        });

        test('should return 🔧 for 修改中', () => {
            assert.strictEqual(getStatusEmoji('修改中'), '🔧');
        });

        test('should return ✅ for 已完成', () => {
            assert.strictEqual(getStatusEmoji('已完成'), '✅');
        });

        test('should return 📝 for unknown status', () => {
            assert.strictEqual(getStatusEmoji('未知状态'), '📝');
        });

        test('should return 📝 for empty status', () => {
            assert.strictEqual(getStatusEmoji(''), '📝');
        });
    });

    suite('Status Display Name', () => {
        test('should convert draft to 草稿', () => {
            const name = getStatusDisplayName('draft');
            assert.strictEqual(name, '草稿');
        });

        test('should convert first-draft to 初稿', () => {
            const name = getStatusDisplayName('first-draft');
            assert.strictEqual(name, '初稿');
        });

        test('should convert revising to 修改中', () => {
            const name = getStatusDisplayName('revising');
            assert.strictEqual(name, '修改中');
        });

        test('should convert completed to 已完成', () => {
            const name = getStatusDisplayName('completed');
            assert.strictEqual(name, '已完成');
        });

        test('should handle unknown status gracefully', () => {
            const name = getStatusDisplayName('unknown');
            // Should return original or default
            assert.ok(typeof name === 'string');
        });
    });

    suite('Progress Calculation', () => {
        function calculateProgress(current: number, target: number): number {
            if (target <= 0) return 0;
            return Math.round((current / target) * 100);
        }

        function getProgressIcon(progress: number): string {
            if (progress >= 100) return '✅';
            if (progress >= 50) return '📈';
            return '📋';
        }

        test('should calculate 0% for 0 words', () => {
            assert.strictEqual(calculateProgress(0, 2500), 0);
        });

        test('should calculate 50% correctly', () => {
            assert.strictEqual(calculateProgress(1250, 2500), 50);
        });

        test('should calculate 100% correctly', () => {
            assert.strictEqual(calculateProgress(2500, 2500), 100);
        });

        test('should handle over 100%', () => {
            assert.strictEqual(calculateProgress(5000, 2500), 200);
        });

        test('should handle zero target', () => {
            assert.strictEqual(calculateProgress(1000, 0), 0);
        });

        test('should round to nearest integer', () => {
            assert.strictEqual(calculateProgress(333, 1000), 33);
            assert.strictEqual(calculateProgress(666, 1000), 67);
        });

        test('should return 📋 for low progress', () => {
            assert.strictEqual(getProgressIcon(25), '📋');
            assert.strictEqual(getProgressIcon(49), '📋');
        });

        test('should return 📈 for medium progress', () => {
            assert.strictEqual(getProgressIcon(50), '📈');
            assert.strictEqual(getProgressIcon(75), '📈');
            assert.strictEqual(getProgressIcon(99), '📈');
        });

        test('should return ✅ for complete', () => {
            assert.strictEqual(getProgressIcon(100), '✅');
            assert.strictEqual(getProgressIcon(150), '✅');
        });
    });

    suite('Word Count Formatting', () => {
        function formatWordCount(count: number): string {
            return count.toLocaleString();
        }

        test('should format small numbers', () => {
            assert.strictEqual(formatWordCount(100), '100');
        });

        test('should format thousands with separator', () => {
            const formatted = formatWordCount(1000);
            // toLocaleString may vary by locale, just check it's reasonable
            assert.ok(formatted.includes('1') && formatted.includes('0'));
        });

        test('should format large numbers', () => {
            const formatted = formatWordCount(1234567);
            assert.ok(formatted.length > 0);
        });

        test('should handle zero', () => {
            assert.strictEqual(formatWordCount(0), '0');
        });
    });

    suite('CodeLens Title Building', () => {
        function buildWordCountTitle(wordCount: number): string {
            return `📊 ${wordCount.toLocaleString()} 字`;
        }

        function buildProgressTitle(progress: number, target: number): string {
            const icon = progress >= 100 ? '✅' : progress >= 50 ? '📈' : '📋';
            return `${icon} ${progress}% (目标: ${target.toLocaleString()})`;
        }

        function buildStatusTitle(status: string, emoji: string): string {
            return `${emoji} ${status}`;
        }

        test('should build word count title', () => {
            const title = buildWordCountTitle(2500);
            assert.ok(title.includes('📊'));
            assert.ok(title.includes('字'));
        });

        test('should build progress title', () => {
            const title = buildProgressTitle(75, 2500);
            assert.ok(title.includes('📈'));
            assert.ok(title.includes('75%'));
            assert.ok(title.includes('目标'));
        });

        test('should build status title', () => {
            const title = buildStatusTitle('草稿', '📝');
            assert.strictEqual(title, '📝 草稿');
        });
    });

    suite('Tooltip Building', () => {
        function buildWordCountTooltip(content: number, punctuation: number): string {
            return `正文: ${content.toLocaleString()} | 标点: ${punctuation.toLocaleString()}`;
        }

        function buildProgressTooltip(current: number, target: number): string {
            return `当前进度: ${current.toLocaleString()} / ${target.toLocaleString()} 字`;
        }

        test('should build word count tooltip', () => {
            const tooltip = buildWordCountTooltip(2000, 500);
            assert.ok(tooltip.includes('正文'));
            assert.ok(tooltip.includes('标点'));
        });

        test('should build progress tooltip', () => {
            const tooltip = buildProgressTooltip(1500, 2500);
            assert.ok(tooltip.includes('当前进度'));
            assert.ok(tooltip.includes('/'));
        });
    });

    suite('Path Validation', () => {
        function isInChaptersFolder(path: string): boolean {
            return path.includes('/chapters/');
        }

        test('should detect chapters folder', () => {
            assert.strictEqual(isInChaptersFolder('/project/chapters/ch01.md'), true);
        });

        test('should detect nested chapters folder', () => {
            assert.strictEqual(isInChaptersFolder('/project/chapters/vol1/ch01.md'), true);
        });

        test('should reject non-chapters path', () => {
            assert.strictEqual(isInChaptersFolder('/project/characters/char.md'), false);
        });

        test('should reject root path', () => {
            assert.strictEqual(isInChaptersFolder('/project/readme.md'), false);
        });

        test('should handle Windows-style paths', () => {
            // The check uses /chapters/ so Windows paths would need conversion
            assert.strictEqual(isInChaptersFolder('C:\\project\\chapters\\ch01.md'.replace(/\\/g, '/')), true);
        });
    });

    suite('Language ID Validation', () => {
        function isMarkdownFile(languageId: string): boolean {
            return languageId === 'markdown';
        }

        test('should accept markdown', () => {
            assert.strictEqual(isMarkdownFile('markdown'), true);
        });

        test('should reject plaintext', () => {
            assert.strictEqual(isMarkdownFile('plaintext'), false);
        });

        test('should reject javascript', () => {
            assert.strictEqual(isMarkdownFile('javascript'), false);
        });

        test('should reject empty string', () => {
            assert.strictEqual(isMarkdownFile(''), false);
        });
    });

    suite('FrontMatter Extraction', () => {
        function extractFrontMatter(text: string): Record<string, unknown> | null {
            if (!text.startsWith('---')) return null;

            const endIndex = text.indexOf('---', 3);
            if (endIndex === -1) return null;

            const fmContent = text.substring(3, endIndex).trim();
            const result: Record<string, unknown> = {};

            fmContent.split('\n').forEach(line => {
                const colonIndex = line.indexOf(':');
                if (colonIndex > 0) {
                    const key = line.substring(0, colonIndex).trim();
                    let value: string | number = line.substring(colonIndex + 1).trim();

                    // Remove quotes
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }

                    // Parse numbers
                    if (/^\d+$/.test(value)) {
                        value = parseInt(value, 10);
                    }

                    result[key] = value;
                }
            });

            return Object.keys(result).length > 0 ? result : null;
        }

        test('should extract status field', () => {
            const text = '---\nstatus: draft\n---\n# Title';
            const fm = extractFrontMatter(text);
            assert.ok(fm);
            assert.strictEqual(fm!.status, 'draft');
        });

        test('should extract targetWords field', () => {
            const text = '---\ntargetWords: 2500\n---\n# Title';
            const fm = extractFrontMatter(text);
            assert.ok(fm);
            assert.strictEqual(fm!.targetWords, 2500);
        });

        test('should extract quoted values', () => {
            const text = '---\ntitle: "第一章"\n---\n# Title';
            const fm = extractFrontMatter(text);
            assert.ok(fm);
            assert.strictEqual(fm!.title, '第一章');
        });

        test('should handle missing frontmatter', () => {
            const text = '# Title\nContent';
            const fm = extractFrontMatter(text);
            assert.strictEqual(fm, null);
        });

        test('should handle incomplete frontmatter', () => {
            const text = '---\ntitle: Test\nNo closing';
            const fm = extractFrontMatter(text);
            assert.strictEqual(fm, null);
        });

        test('should handle multiple fields', () => {
            const text = '---\ntitle: 第一章\nchapter: 1\nstatus: draft\ntargetWords: 3000\n---\n';
            const fm = extractFrontMatter(text);
            assert.ok(fm);
            assert.strictEqual(fm!.chapter, 1);
            assert.strictEqual(fm!.status, 'draft');
            assert.strictEqual(fm!.targetWords, 3000);
        });
    });

    suite('Edge Cases', () => {
        test('should handle empty document', () => {
            const lines: string[] = [];
            const titleIndex = lines.findIndex(l => l.match(/^#\s+/));
            assert.strictEqual(titleIndex, -1);
        });

        test('should handle document with only frontmatter', () => {
            const text = '---\ntitle: Test\n---';
            const lines = text.split('\n');
            const titleIndex = lines.findIndex(l => l.match(/^#\s+/));
            assert.strictEqual(titleIndex, -1);
        });

        test('should handle very long title', () => {
            const longTitle = '# ' + '长'.repeat(1000);
            const match = longTitle.match(/^#\s+(.+)$/);
            assert.ok(match);
            assert.strictEqual(match![1].length, 1000);
        });

        test('should handle title with special characters', () => {
            const title = '# 第一章：开始！？';
            const match = title.match(/^#\s+(.+)$/);
            assert.ok(match);
            assert.strictEqual(match![1], '第一章：开始！？');
        });

        test('should handle title with emoji', () => {
            const title = '# 🌟 精彩章节';
            const match = title.match(/^#\s+(.+)$/);
            assert.ok(match);
        });
    });
});
