import * as assert from 'assert';
import { patchFrontMatter } from '../../utils/documentOperations';

suite('Frontmatter Edit Safety', () => {
    test('preserves YAML comments and body while changing one field', () => {
        const text = '---\n# 标题备注\ntitle: "原名" # 保留\nstatus: 草稿\n---\n\n# 原名\n正文 <!--? 伏笔 -->\n';
        const result = patchFrontMatter(text, { status: '已完成' });
        assert.ok(result.includes('# 标题备注'));
        assert.ok(result.includes('# 保留'));
        assert.ok(result.endsWith('\n\n# 原名\n正文 <!--? 伏笔 -->\n'));
        assert.ok(result.includes('status: 已完成'));
    });
    test('preserves CRLF and null values unrelated to the edit', () => {
        const text = '---\r\ntitle: 原名\r\nother: null\r\n---\r\n正文\r\n';
        const result = patchFrontMatter(text, { title: '新名' });
        assert.ok(result.includes('other: null'));
        assert.ok(result.endsWith('正文\r\n'));
        assert.ok(!result.replace(/\r\n/g, '').includes('\n'));
    });
    test('invalid and unclosed YAML are rejected without creating another header', () => {
        for (const text of ['---\ntitle: [\n---\n正文', '---\ntitle: 未闭合', '---\n- 列表\n---\n正文']) {
            assert.throws(() => patchFrontMatter(text, { title: '新名' }), /Front Matter/);
        }
    });
    test('a body separator is not interpreted as frontmatter', () => {
        const body = '正文\n---\n分隔后正文';
        const result = patchFrontMatter(body, { status: '草稿' });
        assert.ok(result.endsWith(body));
    });
});
