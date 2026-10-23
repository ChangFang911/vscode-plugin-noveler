/**
 * 格式化提供器测试
 * 测试中文小说格式化功能
 */

import * as assert from 'assert';
import * as sinon from 'sinon';

import * as vscode from 'vscode';
import { ChineseNovelFormatProvider } from '../../providers/formatProvider';
import { ConfigService } from '../../services/configService';
import { MockTextDocument } from '../mocks/vscode';
import { findMarksInText } from '../../services/doubtMarkService';

const config = {
    getChineseQuoteStyle: () => '「」',
    shouldConvertQuotes: () => true,
    shouldAutoEmptyLine: () => true,
    shouldParagraphIndent: () => false
};

function formatLine(line: string, quoteStyle: string, convert: boolean): string {
    config.getChineseQuoteStyle = () => quoteStyle;
    config.shouldConvertQuotes = () => convert;
    return new ChineseNovelFormatProvider()['formatLine'](line, quoteStyle);
}

function formatParagraphSpacing(text: string, emptyLine: boolean, indent: boolean, _indentText = '　　'): string {
    config.shouldAutoEmptyLine = () => emptyLine;
    config.shouldParagraphIndent = () => indent;
    config.shouldConvertQuotes = () => false;
    return formatDocument(text);
}

function formatDocument(text: string): string {
    const document = MockTextDocument.create(text) as unknown as vscode.TextDocument;
    const edits = new ChineseNovelFormatProvider().provideDocumentFormattingEdits(document, {} as vscode.FormattingOptions, {} as vscode.CancellationToken);
    return edits[0]?.newText ?? text;
}

suite('FormatProvider Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
        config.getChineseQuoteStyle = () => '「」';
        config.shouldConvertQuotes = () => true;
        config.shouldAutoEmptyLine = () => true;
        config.shouldParagraphIndent = () => false;
        sandbox.stub(ConfigService, 'getInstance').returns(config as unknown as ConfigService);
    });

    teardown(() => {
        sandbox.restore();
    });

    suite('Quote Conversion', () => {
        test('curved quotes are a distinct selectable style and all styles preserve apostrophes', () => {
            assert.strictEqual(formatLine('「你好」 "再见"', '“”', true), '“你好” “再见”');
            assert.strictEqual(formatLine('“你好”', '「」', true), '「你好」');
            assert.strictEqual(formatLine('“你好”', '""', true), '"你好"');
            assert.strictEqual(formatLine("don't ‘改动’", '“”', true), "don't ‘改动’");
        });
        test('should convert English quotes to 「」', () => {
            const result = formatLine('"对话内容"', '「」', true);
            assert.strictEqual(result, '「对话内容」');
        });

        test('should convert 「」 to English quotes', () => {
            const result = formatLine('「对话内容」', '""', true);
            assert.strictEqual(result, '"对话内容"');
        });

        test('should not convert when disabled', () => {
            const result = formatLine('"对话内容"', '「」', false);
            assert.strictEqual(result, '"对话内容"');
        });

        test('should handle multiple quotes in one line', () => {
            const result = formatLine('"第一句""第二句"', '「」', true);
            assert.strictEqual(result, '「第一句」「第二句」');
        });

        test('should handle nested content', () => {
            const result = formatLine('"他说道"', '「」', true);
            assert.strictEqual(result, '「他说道」');
        });

        test('should preserve empty quotes', () => {
            const result = formatLine('""', '「」', true);
            assert.strictEqual(result, '「」');
        });
    });

    suite('Punctuation Normalization', () => {
        test('should convert comma after Chinese', () => {
            const result = formatLine('你好,世界', '「」', false);
            assert.strictEqual(result, '你好，世界');
        });

        test('should convert period after Chinese', () => {
            const result = formatLine('你好.世界', '「」', false);
            assert.strictEqual(result, '你好。世界');
        });

        test('should convert exclamation after Chinese', () => {
            const result = formatLine('你好!世界', '「」', false);
            assert.strictEqual(result, '你好！世界');
        });

        test('should convert question mark after Chinese', () => {
            const result = formatLine('你好?世界', '「」', false);
            assert.strictEqual(result, '你好？世界');
        });

        test('should convert comma before Chinese', () => {
            const result = formatLine('Hello,你好', '「」', false);
            assert.strictEqual(result, 'Hello，你好');
        });

        test('should convert period before Chinese', () => {
            const result = formatLine('Hello.你好', '「」', false);
            assert.strictEqual(result, 'Hello。你好');
        });

        test('should not convert pure English punctuation', () => {
            const result = formatLine('Hello, World!', '「」', false);
            assert.strictEqual(result, 'Hello, World!');
        });

        test('should handle multiple punctuation conversions', () => {
            const result = formatLine('你好,世界!再见?', '「」', false);
            assert.strictEqual(result, '你好，世界！再见？');
        });
    });

    suite('Space Removal', () => {
        test('should remove spaces between Chinese characters', () => {
            const result = formatLine('你 好 世 界', '「」', false);
            assert.strictEqual(result, '你好世界');
        });

        test('should remove multiple spaces between Chinese', () => {
            const result = formatLine('你   好', '「」', false);
            assert.strictEqual(result, '你好');
        });

        test('should preserve spaces in English', () => {
            const result = formatLine('Hello World', '「」', false);
            assert.strictEqual(result, 'Hello World');
        });

        test('should handle mixed content', () => {
            const result = formatLine('你 好 World 世 界', '「」', false);
            // Note: 你好 and 世界 will merge, but "World" stays
            assert.ok(result.includes('World'));
        });
    });

    suite('Ellipsis Normalization', () => {
        test('should convert three dots to ellipsis', () => {
            const result = formatLine('等等...', '「」', false);
            assert.strictEqual(result, '等等…');
        });

        test('should convert multiple dots to ellipsis', () => {
            const result = formatLine('等等.....', '「」', false);
            assert.strictEqual(result, '等等…');
        });

        test('should handle ellipsis in middle of text', () => {
            const result = formatLine('等等...继续', '「」', false);
            assert.strictEqual(result, '等等…继续');
        });
    });

    suite('Dash Normalization', () => {
        test('should convert double dash to em dash', () => {
            const result = formatLine('他说--不对', '「」', false);
            assert.strictEqual(result, '他说——不对');
        });

        test('should convert multiple dashes to em dash', () => {
            const result = formatLine('他说----不对', '「」', false);
            assert.strictEqual(result, '他说——不对');
        });

        test('should handle dash at start', () => {
            const result = formatLine('--开始', '「」', false);
            assert.strictEqual(result, '——开始');
        });
    });

    suite('Empty Line Handling', () => {
        test('should return empty line unchanged', () => {
            const result = formatLine('', '「」', true);
            assert.strictEqual(result, '');
        });

        test('should return whitespace-only line unchanged', () => {
            const result = formatLine('   ', '「」', true);
            assert.strictEqual(result, '   ');
        });

        test('should return tab-only line unchanged', () => {
            const result = formatLine('\t\t', '「」', true);
            assert.strictEqual(result, '\t\t');
        });
    });

    suite('Paragraph Spacing - Auto Empty Line Enabled', () => {
        const INDENT = '　　';

        test('should add empty line between paragraphs', () => {
            const input = '第一段\n第二段';
            const result = formatParagraphSpacing(input, true, false);
            assert.strictEqual(result, '第一段\n\n第二段');
        });

        test('should not add multiple empty lines', () => {
            const input = '第一段\n\n\n第二段';
            const result = formatParagraphSpacing(input, true, false);
            assert.strictEqual(result, '第一段\n\n第二段');
        });

        test('should preserve Front Matter', () => {
            const input = '---\ntitle: 测试\n---\n正文';
            const result = formatParagraphSpacing(input, true, false);
            assert.ok(result.includes('---'));
            assert.ok(result.includes('title: 测试'));
        });

        test('should handle headers correctly', () => {
            const input = '# 标题\n正文内容';
            const result = formatParagraphSpacing(input, true, false);
            assert.ok(result.includes('# 标题'));
        });

        test('should add indent at paragraph start', () => {
            const input = '第一段';
            const result = formatParagraphSpacing(input, true, true, INDENT);
            assert.strictEqual(result, INDENT + '第一段');
        });

        test('should add indent after empty line', () => {
            const input = '第一段\n\n第二段';
            const result = formatParagraphSpacing(input, true, true, INDENT);
            assert.ok(result.includes(INDENT + '第一段'));
            assert.ok(result.includes(INDENT + '第二段'));
        });
    });

    suite('Paragraph Spacing - Auto Empty Line Disabled', () => {
        test('should remove empty lines between paragraphs', () => {
            const input = '第一段\n\n第二段';
            const result = formatParagraphSpacing(input, false, false);
            assert.strictEqual(result, '第一段\n第二段');
        });

        test('should remove multiple empty lines', () => {
            const input = '第一段\n\n\n\n第二段';
            const result = formatParagraphSpacing(input, false, false);
            assert.strictEqual(result, '第一段\n第二段');
        });

        test('should preserve empty line after Front Matter', () => {
            const input = '---\ntitle: 测试\n---\n\n正文';
            const result = formatParagraphSpacing(input, false, false);
            assert.ok(result.includes('---\n\n正文') || result.includes('---\n正文'));
        });
    });

    suite('Complex Formatting Scenarios', () => {
        test('should handle typical dialogue line', () => {
            const result = formatLine('"你好,"她说,"很高兴认识你."', '「」', true);
            assert.ok(result.includes('「'));
            assert.ok(result.includes('，'));
            assert.ok(result.includes('。'));
        });

        test('should handle narrative with punctuation', () => {
            const result = formatLine('他站在那里,看着远方...', '「」', false);
            assert.ok(result.includes('，'));
            assert.ok(result.includes('…'));
        });

        test('should handle mixed dialogue and narration', () => {
            const input = '---\ntitle: 第一章\n---\n\n# 第一章\n\n"你好,"她说.\n\n他点了点头.';
            const result = formatParagraphSpacing(input, true, true, '　　');
            assert.ok(result.includes('---'));
            assert.ok(result.includes('# 第一章'));
        });
    });

    suite('Edge Cases', () => {
        test('should handle very long line', () => {
            const longLine = '测试'.repeat(1000) + ',结束.';
            const result = formatLine(longLine, '「」', false);
            assert.ok(result.includes('，'));
            assert.ok(result.includes('。'));
        });

        test('should handle special characters', () => {
            const result = formatLine('测试@#$%^&*()', '「」', false);
            assert.ok(result.includes('测试'));
        });

        test('should handle emoji', () => {
            const result = formatLine('😀你好,世界😀', '「」', false);
            assert.ok(result.includes('，'));
        });

        test('should handle numbers with Chinese', () => {
            const result = formatLine('第1章,开始.', '「」', false);
            assert.ok(result.includes('，'));
            assert.ok(result.includes('。'));
        });
    });
});

suite('Formatting Content Safety', () => {
    let sandbox: sinon.SinonSandbox;
    setup(() => {
        sandbox = sinon.createSandbox();
        config.getChineseQuoteStyle = () => '「」';
        config.shouldConvertQuotes = () => true;
        config.shouldAutoEmptyLine = () => true;
        config.shouldParagraphIndent = () => true;
        sandbox.stub(ConfigService, 'getInstance').returns(config as unknown as ConfigService);
    });
    teardown(() => sandbox.restore());

    test('inline todo remains identifiable and actionable after formatting', () => {
        const result = formatDocument('正文,等等... <!--? 检查 "伏笔" -- -->');
        assert.ok(result.includes('正文，等等…'));
        assert.ok(result.includes('<!--? 检查 "伏笔" -- -->'));
        assert.deepStrictEqual(findMarksInText(result).map(mark => mark.content), ['检查 "伏笔" --']);
    });
    test('preserves multiple inline pending and resolved markers', () => {
        const text = '正文 <!--? 一 --> 后文 <!--✓ 二 -->';
        const result = formatDocument(text);
        assert.ok(result.includes('<!--? 一 -->'));
        assert.ok(result.includes('<!--✓ 二 -->'));
    });
    test('preserves multiline comments including blank lines and indentation', () => {
        const comment = '<!--\n  "注释" -- ...\n\n  内容\n-->';
        assert.ok(formatDocument(`正文,\n${comment}\n后文.`).includes(comment));
    });
    test('preserves an unclosed comment through the end of the document', () => {
        const comment = '<!--\n  "注释" -- ...\n\n 后文.';
        assert.ok(formatDocument(`正文,\n${comment}`).endsWith(comment));
    });
    test('preserves frontmatter exactly with CRLF', () => {
        const frontMatter = '---\r\n# 元数据备注\r\ntitle: "测试 -- ..."\r\n\r\n---\r\n';
        const result = formatDocument(frontMatter + '正文, <!--? 注释 -->\r\n下一段.');
        assert.ok(result.startsWith(frontMatter));
        assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
    });
    test('an unclosed frontmatter is left unchanged', () => {
        const text = '---\ntitle: "测试"\n正文,...';
        assert.strictEqual(formatDocument(text), text);
    });
    test('a body separator does not hide subsequent paragraphs', () => {
        assert.ok(formatDocument('正文,\n---\n下一段,').includes('下一段，'));
    });
    test('formatting is idempotent with comments and indentation', () => {
        const once = formatDocument('# 标题\n正文, <!--? 检查 -->\n第二段...\n<!--\n多行 --\n-->' );
        assert.strictEqual(formatDocument(once), once);
    });
    test('placeholder-like user text is not replaced', () => {
        const text = '\uE000NOVELER0\uE001 <!--? 待办 -->';
        assert.ok(formatDocument(text).includes('\uE000NOVELER0\uE001'));
    });
});
