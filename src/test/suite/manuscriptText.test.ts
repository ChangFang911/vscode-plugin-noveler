import * as assert from 'assert';
import { markdownToText, parseChapterSource, exportFileName, validateExportFolderName, renderManuscriptTxt } from '../../utils/manuscriptText';
import { compareChapterOrder } from '../../utils/volumeHelper';
import { Manuscript } from '../../types/manuscript';

suite('Manuscript text and validation', () => {
    test('valid properties preserve attributes and raw Markdown, including CRLF and BOM', () => {
        const parsed = parseChapterSource('\uFEFF---\r\nchapter: 2\r\nstatus: 草稿\r\n---\r\n# 第二章\r\n正文');
        assert.strictEqual(parsed.attributes.chapter, 2);
        assert.strictEqual(parsed.attributes.status, '草稿');
        assert.strictEqual(parsed.body, '# 第二章\r\n正文');
    });
    for (const source of ['正文', '---\nchapter: 1', '---\nchapter: [\n---\n正文', '---\n- chapter\n---\n正文',
        '---\nchapter: 1\nchapter: 2\n---', '---\ntitle: 无章号\n---', ...[0, -1, 1.5, '"2"', 'true', 'null', '9007199254740992'].map(value => `---\nchapter: ${value}\n---`)]) {
        test(`rejects missing, malformed or invalid chapter properties ${JSON.stringify(source)}`, () => {
            assert.throws(() => parseChapterSource(source));
        });
    }
    const cases: [string, string, string | undefined][] = [
        ['# 第一章 **初遇**\n\n　　“你好。” <!--? 伏笔 -->\n下一段', '　　“你好。”\n下一段', '第一章 初遇'],
        ['<!-- 提示 -->\n\n# 第一章\n\n正文\n\n## 回忆\n\n另一段', '正文\n\n回忆\n\n另一段', '第一章'],
        ['正文\n\n# 正文中的标题', '正文\n\n正文中的标题', undefined],
        ['**加粗**与*强调*、[名字](https://example.com)、\\*字面星号\\*、`a_b`', '加粗与强调、名字、*字面星号*、a_b', undefined],
        ['姓名***，数值 1_000，符号 # 和 < 与 >。\n\n***\n\n下一幕', '姓名***，数值 1_000，符号 # 和 < 与 >。\n\n***\n\n下一幕', undefined],
        ['正文<!--✓ 同行 -->结尾\n\n<!-- 多行\n私密大纲\n-->\n\n末段', '正文结尾\n\n末段', undefined],
        ['```text\n<!-- 代码字面量 -->\n**保留**\n```', '<!-- 代码字面量 -->\n**保留**', undefined],
        ['<!-- 全部隐藏 -->', '', undefined],
        ['# 第一章\r\n\r\n　　甲\r\n　　乙', '　　甲\n　　乙', '第一章'],
        ['甲 &amp; 乙', '甲 & 乙', undefined],
        ['<div>\n正文<!-- 私密注释 -->结尾\n</div>', '<div>\n正文结尾\n</div>', undefined],
        ['  正文\n   下一行', '  正文\n   下一行', undefined],
        ['    四个空格\n    原样保留', '    四个空格\n    原样保留', undefined],
        ['`<!-- 未闭合字面量` 与 \\<!-- 字面量', '<!-- 未闭合字面量 与 <!-- 字面量', undefined]
    ];
    for (const [source, body, title] of cases) {
        test(`converts Markdown without losing visible content ${source.slice(0, 35)}`, () => {
            const result = markdownToText(source);
            assert.strictEqual(result.title, title);
            assert.strictEqual(result.body, body);
        });
    }
    test('unclosed comments stop rather than truncating the rest of the chapter', () => {
        assert.throws(() => markdownToText('正文\n\n<!-- 私密注释\n后续正文'), /未闭合/);
        assert.throws(() => markdownToText('正文 <!-- 私密注释\n后续正文'), /未闭合/);
        assert.throws(() => markdownToText('正文 <!-- 已闭合 --> <!-- 未闭合'), /未闭合/);
    });
    test('export prose indentation is consistent across plain, ASCII and full-width indents and CRLF', () => {
        const source = '# 第一章\r\n\r\n无缩进\r\n  半角缩进\r\n　　全角缩进\r\n\r\n　　\r\n\r\n末段***';
        const result = markdownToText(source, true);
        assert.strictEqual(result.title, '第一章');
        assert.strictEqual(result.body, '　　无缩进\n　　半角缩进\n　　全角缩进\n\n　　末段***');
        assert.strictEqual(markdownToText('<!--? 待办 -->', true).body, '');
    });
    test('prose indentation keeps headings, lists, image captions, tables and code layout intact', () => {
        const source = '# 第一章\n\n正文\n\n## 小标题\n\n- 条目\n\n![图片说明](a.png)\n\n|甲|乙|\n|---|---|\n|一|二|\n\n```\n  代码\n<!-- 字面量 -->\n```';
        assert.strictEqual(markdownToText(source, true).body,
            '　　正文\n\n小标题\n\n• 条目\n\n图片说明\n\n|甲|乙|\n|---|---|\n|一|二|\n\n  代码\n<!-- 字面量 -->');
    });
    test('images and tables retain explanatory text and produce explicit warnings', () => {
        const result = markdownToText('![山水](image.png)\n\n|甲|乙|\n|---|---|\n|一|二|');
        assert.ok(result.body.includes('山水'));
        assert.ok(result.body.includes('一|二'));
        assert.strictEqual(result.warnings.length, 2);
    });
    test('pending comments warn while resolved comments and code literals do not', () => {
        assert.strictEqual(markdownToText('正文<!--? 未处理 -->').warnings.length, 1);
        assert.strictEqual(markdownToText('正文<!--✓ 已处理 --> `<!--? 字面量 -->`').warnings.length, 0);
    });
    test('chapter sorting is independent of directory order with missing or duplicate numbers', () => {
        const entries = [{ name: 'A.md', number: 3 }, { name: 'B10.md', number: null },
            { name: 'C.md', number: 1 }, { name: 'B2.md', number: null }, { name: 'D.md', number: 1 }];
        const expected = ['C.md', 'D.md', 'A.md', 'B2.md', 'B10.md'];
        for (const order of [entries, [...entries].reverse(), [...entries.slice(2), ...entries.slice(0, 2)]]) {
            assert.deepStrictEqual(order.slice().sort(compareChapterOrder).map(item => item.name), expected);
        }
    });
    test('portable file names avoid traversal, reserved device names and excessive UTF-8 lengths', () => {
        assert.strictEqual(exportFileName('../书名/坏:名字?'), '..书名坏名字');
        assert.strictEqual(exportFileName('CON'), '小说-CON');
        assert.strictEqual(exportFileName('...'), '未命名小说');
        assert.ok(Buffer.byteLength(exportFileName('😀'.repeat(100)), 'utf8') <= 180);
        for (const value of ['../章节', '.', '..', '名字.', ' 名字', 'CON', '', '😀'.repeat(100)]) {
            assert.ok(validateExportFolderName(value), value);
        }
        assert.strictEqual(validateExportFolderName('长夜-导出-2'), undefined);
    });
    test('whole-book rendering preserves volume order, strips title once, includes draft bodies and warns for empty chapters', () => {
        const book: Manuscript = { title: '长夜', volumes: [{ title: '第一卷 初遇', chapters: [
            { number: 1, title: '第一章', body: '# 第一章\n\n　　正文', attributes: { status: 'draft' }, source: 'a' },
            { number: 2, title: '第二章', body: '# 第二章', attributes: {}, source: 'b' }
        ] }] };
        const rendered = renderManuscriptTxt(book);
        assert.strictEqual(rendered.files[0].name, '长夜.txt');
        assert.strictEqual(rendered.files[0].content, '长夜\n\n第一卷 初遇\n\n第一章\n\n　　正文\n\n第二章\n');
        assert.deepStrictEqual(rendered.warnings, ['第二章：正文为空']);
        assert.strictEqual(book.volumes[0].chapters[0].body, '# 第一章\n\n　　正文');
    });
    test('large manuscript conversion keeps every chapter and can run without UI', function() {
        this.timeout(10000);
        const book: Manuscript = { title: '长篇', volumes: [{ chapters: Array.from({ length: 1000 }, (_, index) => ({
            number: index + 1, title: `第${index + 1}章`, body: '# 标题\n\n' + '中文正文。'.repeat(300), attributes: {}, source: `${index}`
        })) }] };
        const result = renderManuscriptTxt(book);
        assert.strictEqual(result.warnings.length, 0);
        assert.ok(result.files[0].content.endsWith('中文正文。\n'));
        assert.ok(result.files[0].content.includes('第1000章'));
    });
});
