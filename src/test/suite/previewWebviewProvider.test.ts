import * as assert from 'assert';
import * as vscode from 'vscode';
import { PreviewWebviewProvider } from '../../views/previewWebviewProvider';

suite('Phone Preview Content Safety', () => {
    const provider = new PreviewWebviewProvider({ globalState: { get: () => undefined } } as unknown as vscode.ExtensionContext) as unknown as {
        parseContent(content: string): { title: string; body: string };
        getParagraphIndexFromLine(content: string, line: number): number;
    };
    test('hides inline, resolved and multiline comments without changing the source', () => {
        const text = '# 开篇\n正文<!--? 伏笔 -->结尾\n<!--✓ 完成 -->\n<!--\n秘密资料\n-->\n第二段';
        const preview = provider.parseContent(text);
        assert.strictEqual(preview.body, '<p>正文结尾</p>\n<p>第二段</p>');
        assert.ok(text.includes('<!--? 伏笔 -->'));
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 1), 0);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 4), -1);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 6), 1);
    });
    test('keeps one rendered paragraph per nonempty source line', () => {
        const text = '# 标题\n第一段\n第二段\n\n第三段';
        assert.strictEqual(provider.parseContent(text).body.split('\n').length, 3);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 0), -1);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 1), 0);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 2), 1);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 3), -1);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 4), 2);
    });
    test('handles BOM, CRLF and quoted YAML titles without leaking metadata', () => {
        const text = '\uFEFF---\r\n# 元数据备注\r\ntitle: "开篇 # 伏笔"\r\n---\r\n# 正文标题\r\n正文 <!--? 备注 -->\r\n第二段';
        assert.deepStrictEqual(provider.parseContent(text), { title: '开篇 # 伏笔', body: '<p>正文</p>\n<p>第二段</p>' });
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 1), -1);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 5), 0);
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 6), 1);
    });
    test('hides an unclosed comment and escapes visible HTML', () => {
        const text = '正文 <script>alert(1)</script>\n<!--? 秘密\n后续注释';
        assert.strictEqual(provider.parseContent(text).body, '<p>正文 &lt;script&gt;alert(1)&lt;/script&gt;</p>');
        assert.strictEqual(provider.getParagraphIndexFromLine(text, 2), -1);
    });
});
