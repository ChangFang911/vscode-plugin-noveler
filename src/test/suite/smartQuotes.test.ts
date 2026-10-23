import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import { findQuoteExit, proseQuoteLine, quoteInput } from '../../utils/smartQuotes';

suite('Smart quote matching', () => {
    test('Tab binding yields to composition, completions, snippets, focus navigation and selections', () => {
        const manifest = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8'));
        const binding = manifest.contributes.keybindings.find((item: { command: string }) => item.command === 'noveler.jumpOutOfQuote');
        assert.strictEqual(binding.key, 'tab');
        for (const condition of ['noveler.canJumpQuote', '!isComposing', '!suggestWidgetVisible', '!inlineSuggestionVisible',
            '!inSnippetMode', '!editorTabMovesFocus', '!editorReadonly', '!editorHasSelection', '!editorHasMultipleSelections']) {
            assert.ok(binding.when.split(' && ').includes(condition), condition);
        }
    });
    for (const [open, close] of [['“', '”'], ['「', '」'], ['‘', '’'], ['『', '』'], ['《', '》'], ['〈', '〉'], ['"', '"'], ["'", "'"]]) {
        test(`pairs ${open}${close} and finds existing closing punctuation`, () => {
            assert.deepStrictEqual(quoteInput('', 0, open), { text: open + close });
            const line = `甲${open}你好${close}乙`;
            assert.strictEqual(findQuoteExit(line, 3), 4);
            assert.deepStrictEqual(quoteInput(line, 4, close), { text: close });
        });
    }
    test('jumps through inner and outer pairs without confusing adjacent dialogue', () => {
        const line = '「他说：“你好”。」「再见」';
        assert.strictEqual(findQuoteExit(line, 6), 7);
        assert.strictEqual(findQuoteExit(line, 8), 9);
        assert.strictEqual(findQuoteExit(line, 10), undefined);
        assert.strictEqual(findQuoteExit(line, 12), 13);
    });
    test('English apostrophes and escaped quotes remain ordinary text', () => {
        assert.deepStrictEqual(quoteInput('dont', 3, "'"), { text: "'" });
        assert.deepStrictEqual(quoteInput('I', 1, "'"), { text: "'" });
        assert.strictEqual(findQuoteExit("'don't stop'", 5), 11);
        assert.strictEqual(findQuoteExit('“don’t stop”', 5), 11);
        assert.deepStrictEqual(quoteInput('\\', 1, '"'), { text: '"' });
        assert.strictEqual(findQuoteExit('"a\\"b"', 2), 5);
    });
    test('incomplete or mismatched pairs do not jump and existing closers are not duplicated', () => {
        for (const line of ['“未闭合', '“错误」', '「外层“内层”']) { assert.strictEqual(findQuoteExit(line, 3), undefined); }
        assert.deepStrictEqual(quoteInput('”', 0, '“'), { text: '“' });
        assert.deepStrictEqual(quoteInput('已有正文', 0, '“'), { text: '“' });
        assert.deepStrictEqual(quoteInput('', 0, '粘贴多字符'), { text: '粘贴多字符' });
    });
    test('only prose is eligible, with YAML, comments, code, lists and tables protected', () => {
        for (const source of ['---\ntitle: “属性”\n---', '---\nchapter: 1\n“未闭合属性”',
            '# “标题”', '- “列表”', '> “引用块”', '    “缩进代码”', '```\n“代码”\n```',
            '<!--\n“注释”\n-->', '正文 `“行内代码”` 结尾', '正文 <span title="“属性”">文字</span>',
            '| “表头” |', '| “表头” | 乙 |\n| --- | --- |\n|甲|乙|']) {
            const offset = source.indexOf('“') + 1;
            assert.strictEqual(proseQuoteLine(source, offset), undefined, source);
        }
        const source = '\uFEFF---\r\nchapter: 1\r\n---\r\n\r\n　　“正文”';
        assert.deepStrictEqual(proseQuoteLine(source, source.indexOf('正文')), { line: '　　“正文”', column: 3 });
        assert.deepStrictEqual(proseQuoteLine('', 0), { line: '', column: 0 });
        assert.deepStrictEqual(proseQuoteLine('\n正文', 0), { line: '', column: 0 });
        assert.strictEqual(proseQuoteLine('```\n', 4), undefined);
        assert.strictEqual(proseQuoteLine('~~~\n\n', 5), undefined);
        assert.strictEqual(proseQuoteLine('- 项目\n    ', 9), undefined);
    });
    test('comment and code punctuation cannot capture a prose quote', () => {
        const source = '“前文<!-- “注释” -->后文 `“代码”` 结尾”';
        const context = proseQuoteLine(source, 2)!;
        assert.strictEqual(findQuoteExit(context.line, context.column), source.length - 1);
        assert.strictEqual(proseQuoteLine('正文<!-- 未闭合', '正文<!-- 未闭合'.length), undefined);
        for (const source of ['```\n<!-- 代码字面量\n```\n\n“正文”', '`<!-- 行内字面量` “正文”']) {
            const context = proseQuoteLine(source, source.indexOf('正文'))!;
            assert.ok(context);
            assert.strictEqual(findQuoteExit(context.line, context.column), context.line.length - 1);
        }
        const commentedTick = '前文<!-- 注释里的 ` -->“正文”`';
        const contextAfterComment = proseQuoteLine(commentedTick, commentedTick.indexOf('正文'))!;
        assert.strictEqual(findQuoteExit(contextAfterComment.line, contextAfterComment.column), commentedTick.indexOf('”'));
    });
});
