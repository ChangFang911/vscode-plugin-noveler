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
