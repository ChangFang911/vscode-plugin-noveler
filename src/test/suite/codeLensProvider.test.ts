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

suite('CodeLensProvider Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Actual provider title placement', () => {
        for (const [status, display] of [['draft', '草稿'], ['first-draft', '初稿'], ['revising', '修改中'],
            ['completed', '已完成'], ['草稿', '草稿'], ['自定义', '自定义']]) {
            test(`renders actual chapter status ${status}`, () => {
                const document = new MockTextDocument(MockUri.file('/novel/chapters/状态.md'),
                    `---\nstatus: ${status}\n---\n# 标题\n正文`, 'markdown');
                const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(
                    document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
                assert.ok(lenses.find(lens => lens.command?.command === 'noveler.updateChapterStatus')?.command?.title.includes(display));
            });
        }
        for (const [count, target, expected] of [[0, 10, '0%'], [5, 10, '50%'], [10, 10, '100%'], [15, 10, '150%'], [2, 3, '67%']] as const) {
            test(`renders actual word count ${count} and progress toward ${target}`, () => {
                const document = new MockTextDocument(MockUri.file('/novel/chapters/进度.md'),
                    `---\ntargetWords: ${target}\n---\n# 标题\n${'文'.repeat(count)}`, 'markdown');
                const lenses = new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(
                    document as unknown as vscode.TextDocument, {} as vscode.CancellationToken) as vscode.CodeLens[];
                assert.ok(lenses.some(lens => lens.command?.title.includes(expected)));
                assert.ok(lenses.some(lens => lens.command?.title.includes(`${count} 字`)));
            });
        }
        test('does not generate chapter actions for empty documents or secondary headings', () => {
            for (const text of ['', '正文', '## 次级标题', '#没有空格']) {
                const document = new MockTextDocument(MockUri.file('/novel/chapters/无标题.md'), text, 'markdown');
                assert.deepStrictEqual(new ChapterCodeLensProvider(new WordCountService()).provideCodeLenses(
                    document as unknown as vscode.TextDocument, {} as vscode.CancellationToken), []);
            }
        });
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
            assert.strictEqual(lenses.length, 3);
            assert.strictEqual(lenses[2].command?.command, 'noveler.setCharacterImportance');
            assert.strictEqual(lenses[2].command?.arguments?.[0], document.uri);
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

});
