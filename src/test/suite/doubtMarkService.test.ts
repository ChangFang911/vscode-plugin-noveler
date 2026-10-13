import * as assert from 'assert';
import * as vscode from 'vscode';
import { findMarksInText } from '../../services/doubtMarkService';
import { DoubtMarkCodeLensProvider } from '../../providers/doubtMarkCodeLensProvider';
import { DoubtMarkDecorationProvider } from '../../providers/doubtMarkDecorationProvider';
import { MockTextDocument, MockUri } from '../mocks/vscode';

suite('Multiple Todos Per Line', () => {
    test('finds pending and resolved markers in source order, including duplicate text', () => {
        const text = '正文 <!--? 重复 --> <!--✓ 完成 --> <!--? 重复 -->';
        const marks = findMarksInText(text);
        assert.deepStrictEqual(marks.map(mark => [mark.content, mark.resolved]), [['重复', false], ['完成', true], ['重复', false]]);
        assert.strictEqual(new Set(marks.map(mark => mark.startCharacter)).size, 3);
        assert.deepStrictEqual(marks.map(mark => text.slice(mark.startCharacter, mark.endCharacter)), ['<!--? 重复 -->', '<!--✓ 完成 -->', '<!--? 重复 -->']);
    });
    test('tracks UTF-16 columns with emoji and CRLF and recognizes empty markers', () => {
        const text = '前一段\r\n人物🙂 <!--? --> <!--✓ 已完成 -->';
        const marks = findMarksInText(text);
        assert.strictEqual(marks.length, 2);
        assert.ok(marks.every(mark => mark.lineNumber === 1));
        assert.strictEqual(marks[0].startCharacter, '人物🙂 '.length);
        assert.strictEqual(marks[0].content, '');
        assert.strictEqual(marks[1].resolved, true);
    });
    test('CodeLens commands carry distinct marker positions and recognizable labels', () => {
        const text = '正文 <!--? 第一项 --> <!--✓ 第二项 --> <!--? 第一项 -->';
        const document = new MockTextDocument(MockUri.file('/novel/chapters/第一章.md'), text, 'markdown');
        const lenses = new DoubtMarkCodeLensProvider().provideCodeLenses(document as unknown as vscode.TextDocument, {} as vscode.CancellationToken);
        assert.strictEqual(lenses.length, 9);
        const deletes = lenses.filter(lens => lens.command?.command === 'noveler.deleteDoubtMark');
        assert.strictEqual(new Set(deletes.map(lens => lens.command?.arguments?.[0].id)).size, 3);
        for (const lens of deletes) {
            const mark = lens.command!.arguments![0];
            assert.strictEqual(lens.range.start.character, mark.startCharacter);
            assert.strictEqual(lens.range.end.character, mark.endCharacter);
            assert.strictEqual(mark.documentVersion, document.version);
        }
        assert.ok(lenses.some(lens => lens.command?.title.includes('第一项')));
        assert.ok(lenses.some(lens => lens.command?.title.includes('第二项')));
    });
    test('a mixed-state line keeps the pending highlight and fades only completed markers', () => {
        const document = new MockTextDocument(MockUri.file('/novel/chapters/第一章.md'), '正文 <!--? 待处理 --> <!--✓ 完成 -->\n<!--✓ 完成一 --> <!--✓ 完成二 -->', 'markdown');
        const pending = {};
        const resolved = {};
        const decorations = new Map<object, vscode.Range[]>();
        const provider = Object.assign(Object.create(DoubtMarkDecorationProvider.prototype), {
            unresolvedDecoration: pending, resolvedDecoration: resolved
        }) as DoubtMarkDecorationProvider;
        provider.updateDecorations({ document, setDecorations: (style: object, ranges: vscode.Range[]) => decorations.set(style, ranges) } as unknown as vscode.TextEditor);
        assert.deepStrictEqual(decorations.get(pending)?.map(range => range.start.line), [0]);
        assert.deepStrictEqual(decorations.get(resolved)?.map(range => range.start.line), [0, 1, 1]);
        assert.deepStrictEqual(decorations.get(resolved)?.map(range => document.getText(range)), ['<!--✓ 完成 -->', '<!--✓ 完成一 -->', '<!--✓ 完成二 -->']);
    });
    test('completing an inline todo never fades the surrounding prose and reopening clears the fading', () => {
        const document = new MockTextDocument(MockUri.file('/novel/chapters/第一章.md'), '前文 <!--✓ 已完成 --> 后文', 'markdown');
        const pending = {};
        const resolved = {};
        const decorations = new Map<object, vscode.Range[]>();
        const provider = Object.assign(Object.create(DoubtMarkDecorationProvider.prototype), {
            unresolvedDecoration: pending, resolvedDecoration: resolved
        }) as DoubtMarkDecorationProvider;
        const editor = { document, setDecorations: (style: object, ranges: vscode.Range[]) => decorations.set(style, ranges) } as unknown as vscode.TextEditor;
        provider.updateDecorations(editor);
        assert.strictEqual(decorations.get(pending)?.length, 0);
        assert.deepStrictEqual(decorations.get(resolved)?.map(range => document.getText(range)), ['<!--✓ 已完成 -->']);
        document._updateContent('前文 <!--? 已完成 --> 后文');
        provider.updateDecorations(editor);
        assert.strictEqual(decorations.get(resolved)?.length, 0);
        assert.strictEqual(decorations.get(pending)?.length, 1);
        document._updateContent('前文 后文');
        provider.updateDecorations(editor);
        assert.strictEqual(decorations.get(resolved)?.length, 0);
        assert.strictEqual(decorations.get(pending)?.length, 0);
    });
});
