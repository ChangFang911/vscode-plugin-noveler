import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { NovelHighlightProvider } from '../../providers/highlightProvider';
import { ConfigService } from '../../services/configService';
import { MockTextDocument } from '../mocks/vscode';

suite('HighlightProvider actual decoration ranges', () => {
    async function highlight(text: string, files: string[], configured: string[] = [], languageId = 'markdown') {
        const provider = Object.create(NovelHighlightProvider.prototype) as NovelHighlightProvider;
        provider['configService'] = { getCharacters: () => configured } as ConfigService;
        provider['characterNamesCache'] = files;
        provider['lastCacheUpdate'] = Date.now();
        const document = MockTextDocument.create(text, languageId) as unknown as vscode.TextDocument;
        const decorate = sinon.spy();
        await provider.updateHighlights({ document, setDecorations: decorate } as unknown as vscode.TextEditor);
        return { calls: decorate.callCount, ranges: decorate.getCalls().map(call =>
            (call.args[1] as vscode.Range[]).map(range => document.getText(range))) };
    }

    test('excludes YAML, dialogue and comments from character decorations', async () => {
        const result = await highlight('---\nname: 王明\n---\n王明说：「王明你好」。\n<!-- 王明 -->\n王明走了。', ['王明']);
        assert.strictEqual(result.calls, 2);
        assert.deepStrictEqual(result.ranges, [['「王明你好」'], ['王明', '王明']]);
    });
    test('nested dialogue includes every closing quote and preserves adjacent dialogue', async () => {
        for (const text of ['“「他说：“你好”。」”', '「他说：“你好”。」', '『她说：「你好」。』', '“外层‘内层’结束”']) {
            assert.deepStrictEqual((await highlight(text, [])).ranges[0], [text]);
        }
        assert.deepStrictEqual((await highlight('「甲」「乙」正文“丙”', [])).ranges[0], ['「甲」', '「乙」', '“丙”']);
    });
    test('English contractions and possessives do not hide prose or character names', async () => {
        const result = await highlight("don't，王明说 I'm here. don’t，I’m，James' book.", ['王明']);
        assert.deepStrictEqual(result.ranges, [[], ['王明']]);
        const quoted = "'don't stop'";
        assert.deepStrictEqual((await highlight(quoted, [])).ranges[0], [quoted]);
        assert.deepStrictEqual((await highlight('‘don’t stop’', [])).ranges[0], ['‘don’t stop’']);
    });
    test('quotes in YAML and comments cannot steal a later dialogue boundary', async () => {
        const text = '---\r\ntitle: “未闭合\r\n---\r\n<!-- 「注释 -->𠮷野说：“你好<!-- ”注释 -->呀”。';
        assert.deepStrictEqual((await highlight(text, ['𠮷野'])).ranges, [['“你好<!-- ”注释 -->呀”'], ['𠮷野']]);
        assert.deepStrictEqual((await highlight('正文<!-- “未闭合注释', [])).ranges, [[], []]);
    });
    test('book titles stay plain and incomplete quotes do not hide later valid dialogue', async () => {
        const result = await highlight('《书名》〈章节〉 “错配」正文「正常」', []);
        assert.deepStrictEqual(result.ranges[0], ['「正常」']);
        assert.deepStrictEqual((await highlight('“第一行\n第二行”', [])).ranges[0], ['“第一行\n第二行”']);
        assert.deepStrictEqual((await highlight('“未闭合', [])).ranges[0], []);
    });
    test('merges configured names, matches literal punctuation and prefers the longer name', async () => {
        const result = await highlight('小王子遇见小王和A+B。', ['小王', '小王子'], ['小王', 'A+B']);
        assert.deepStrictEqual(result.ranges[1], ['小王子', '小王', 'A+B']);
    });
    test('handles supplementary characters without shifting later ranges', async () => {
        const result = await highlight('𠮷野遇见王明，𠮷野。', ['𠮷野', '王明']);
        assert.deepStrictEqual(result.ranges[1], ['𠮷野', '王明', '𠮷野']);
    });
    test('empty name lists clear character decorations and non-Markdown is ignored', async () => {
        assert.deepStrictEqual((await highlight('「对话」正文', [])).ranges, [['「对话」'], []]);
        assert.strictEqual((await highlight('王明', ['王明'], [], 'plaintext')).calls, 0);
    });
    test('real matching handles a long chapter with overlapping names', async () => {
        const result = await highlight('小王子与小王。'.repeat(1000), ['小王', '小王子']);
        assert.strictEqual(result.ranges[1].length, 2000);
        assert.deepStrictEqual(result.ranges[1].slice(0, 4), ['小王子', '小王', '小王子', '小王']);
    });
});
