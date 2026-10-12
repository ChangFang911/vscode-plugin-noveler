import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { applyDocumentChange, copyDocument, documentIO, fileExists, patchFrontMatter } from '../../utils/documentOperations';
import { renameChapter, renameCharacter, updateChapterStatusWithDialog } from '../../commands/contextMenuCommands';
import { NovelerTreeItem } from '../../views/novelerViewProvider';
import { ConfigService } from '../../services/configService';
import { ChineseNovelFormatProvider } from '../../providers/formatProvider';
import { DoubtMarkService, findMarksInText } from '../../services/doubtMarkService';
import { mergeRecommendedSettings } from '../../utils/settingsHelper';
import { registerAllCommands, CommandRegistrarDeps } from '../../commands/commandRegistrar';
import { createTestWorkspace, readTestFile, removeTestWorkspace, writeTestFile } from './testWorkspace';

suite('File Safety Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        const execute = vscode.commands.executeCommand.bind(vscode.commands);
        sandbox.stub(vscode.commands, 'executeCommand').callsFake((command: string, ...args: unknown[]) =>
            command === 'noveler.refresh' ? Promise.resolve(undefined) : execute(command, ...args)
        );
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });

    test('formatting uses the clicked document even when another editor is active', async () => {
        const target = vscode.Uri.joinPath(root, 'characters', '林舟.md');
        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(root, 'characters'));
        await writeTestFile(target, '---\n# 备注\nname: 林舟\n---\n# 林舟\n中文,正文');
        const other = vscode.Uri.joinPath(root, 'chapters', '其他章节.md');
        await writeTestFile(other, '# 其他章节\n另一段,正文');
        const activeDocument = await vscode.workspace.openTextDocument(other);
        await vscode.window.showTextDocument(activeDocument);
        let format: ((...args: unknown[]) => unknown) | undefined;
        sandbox.stub(vscode.commands, 'registerCommand').callsFake((command: string, callback: (...args: unknown[]) => unknown) => {
            if (command === 'noveler.formatDocument') { format = callback; }
            return { dispose: () => undefined };
        });
        sandbox.stub(ConfigService, 'getInstance').returns({
            getChineseQuoteStyle: () => '「」', shouldConvertQuotes: () => true,
            shouldAutoEmptyLine: () => true, shouldParagraphIndent: () => false
        } as unknown as ConfigService);
        registerAllCommands({ context: { subscriptions: [] }, novelerViewProvider: {} } as unknown as CommandRegistrarDeps);
        assert.ok(format);
        await format(target);
        const formatted = await vscode.workspace.openTextDocument(target);
        assert.ok(formatted.getText().includes('中文，正文'));
        assert.ok(formatted.getText().includes('# 备注'));
        assert.strictEqual(activeDocument.getText(), '# 其他章节\n另一段,正文');
    });

    test('rename preserves unsaved content, YAML comments and chapter number', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '第001章-原名.md');
        const target = vscode.Uri.joinPath(root, 'chapters', '第001章-新名.md');
        await writeTestFile(source, '---\ntitle: 原名 # 保留备注\nchapter: 1\n---\n# 原名\n正文');
        await applyDocumentChange(source, text => text + '\n未保存的最新正文');
        sandbox.stub(vscode.window, 'showInputBox').resolves('新名');
        await renameChapter({ resourceUri: source } as NovelerTreeItem);
        const document = await vscode.workspace.openTextDocument(target);
        assert.ok(document.getText().includes('未保存的最新正文'));
        assert.ok(document.getText().includes('# 保留备注'));
        assert.ok(document.getText().includes('# 新名'));
        assert.strictEqual(await fileExists(source), false);
        assert.strictEqual(await fileExists(target), true);
    });
    test('rename refuses existing targets and leaves source content intact', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '第001章-原名.md');
        const target = vscode.Uri.joinPath(root, 'chapters', '第001章-新名.md');
        const text = '---\ntitle: 原名\n---\n源正文';
        await writeTestFile(source, text);
        await writeTestFile(target, '已有目标正文');
        sandbox.stub(vscode.window, 'showInputBox').resolves('新名');
        await renameChapter({ resourceUri: source } as NovelerTreeItem);
        assert.strictEqual(await readTestFile(source), text);
        assert.strictEqual(await readTestFile(target), '已有目标正文');
        assert.ok((vscode.window.showErrorMessage as sinon.SinonStub).called);
    });
    test('character rename also refuses existing targets', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '甲.md');
        const target = vscode.Uri.joinPath(root, 'chapters', '乙.md');
        await writeTestFile(source, '---\nname: 甲\n---\n甲的设定');
        await writeTestFile(target, '乙的设定');
        sandbox.stub(vscode.window, 'showInputBox').resolves('乙');
        await renameCharacter({ resourceUri: source } as NovelerTreeItem);
        assert.ok(await fileExists(source));
        assert.strictEqual(await readTestFile(target), '乙的设定');
    });
    test('reads edits made while the rename dialog is open', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '第002章-原名.md');
        await writeTestFile(source, '---\ntitle: 原名\n---\n正文');
        sandbox.stub(vscode.window, 'showInputBox').callsFake(async () => {
            await applyDocumentChange(source, text => text + '\n等待输入时的新内容');
            return '新名';
        });
        await renameChapter({ resourceUri: source } as NovelerTreeItem);
        const target = vscode.Uri.joinPath(root, 'chapters', '第002章-新名.md');
        assert.ok((await vscode.workspace.openTextDocument(target)).getText().includes('等待输入时的新内容'));
    });
    test('status updates preserve unsaved body and comments', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '章节.md');
        await writeTestFile(source, '---\nstatus: 草稿 # 备注\n---\n正文');
        await applyDocumentChange(source, text => text + '未保存');
        sandbox.stub(vscode.window, 'showQuickPick').callsFake(async () => ({ label: '已完成', value: '已完成' }));
        await updateChapterStatusWithDialog(source);
        const text = (await vscode.workspace.openTextDocument(source)).getText();
        assert.ok(text.includes('status: 已完成'));
        assert.ok(text.includes('# 备注'));
        assert.ok(text.endsWith('正文未保存'));
    });
    test('copy uses unsaved content without modifying the source', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '源.md');
        const target = vscode.Uri.joinPath(root, 'chapters', '目标.md');
        await writeTestFile(source, '正文');
        await applyDocumentChange(source, text => text + '未保存');
        await copyDocument(source, target, text => text + '副本');
        assert.strictEqual((await vscode.workspace.openTextDocument(target)).getText(), '正文未保存副本');
        assert.strictEqual(await readTestFile(target), '正文未保存副本');
        assert.strictEqual((await vscode.workspace.openTextDocument(source)).getText(), '正文未保存');
    });
    test('failed edits do not delete source files or report success', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '源.md');
        const target = vscode.Uri.joinPath(root, 'chapters', '目标.md');
        await writeTestFile(source, '正文');
        sandbox.stub(vscode.workspace, 'applyEdit').resolves(false);
        await assert.rejects(() => applyDocumentChange(source, text => text + '修改', target), /未完成/);
        assert.strictEqual(await readTestFile(source), '正文');
        assert.strictEqual(await fileExists(target), false);
    });
    test('permission errors are not treated as missing target files', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '源.md');
        const target = vscode.Uri.joinPath(root, 'chapters', '目标.md');
        await writeTestFile(source, '正文');
        sandbox.stub(documentIO, 'stat').rejects(Object.assign(new Error('拒绝访问'), { code: 'NoPermissions' }));
        await assert.rejects(() => applyDocumentChange(source, text => text, target), /拒绝访问/);
        assert.strictEqual(await readTestFile(source), '正文');
    });
    test('invalid YAML stops the edit without changing the original', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '损坏.md');
        const text = '---\ntitle: [\n---\n正文';
        await writeTestFile(source, text);
        await assert.rejects(() => applyDocumentChange(source, value => patchFrontMatter(value, { title: '新名' })), /格式无效/);
        assert.strictEqual((await vscode.workspace.openTextDocument(source)).getText(), text);
    });
    test('formatting keeps todo resolution and reopening usable', async () => {
        const source = vscode.Uri.joinPath(root, 'chapters', '待办.md');
        await writeTestFile(source, '前一段,\n正文, <!--? 检查 "伏笔" -->\n后一段.');
        sandbox.stub(ConfigService, 'getInstance').returns({
            getChineseQuoteStyle: () => '「」', shouldConvertQuotes: () => true,
            shouldAutoEmptyLine: () => true, shouldParagraphIndent: () => true
        } as unknown as ConfigService);
        const document = await vscode.workspace.openTextDocument(source);
        await DoubtMarkService.getInstance().initialize();
        const edits = new ChineseNovelFormatProvider().provideDocumentFormattingEdits(document, {} as vscode.FormattingOptions, {} as vscode.CancellationToken);
        const edit = new vscode.WorkspaceEdit();
        edit.set(source, edits);
        assert.ok(await vscode.workspace.applyEdit(edit));
        const position = findMarksInText(document.getText())[0];
        assert.ok(position);
        assert.strictEqual(position.lineNumber, 2);
        assert.strictEqual(DoubtMarkService.getInstance().getMarksByFile().get(source.toString())?.[0].lineNumber, position.lineNumber);
        const mark = { ...position, id: 'test', fileUri: source, fileName: '待办' };
        await DoubtMarkService.getInstance().resolveMark(mark);
        assert.ok(document.getText().includes('<!--✓ 检查 "伏笔" -->'));
        await DoubtMarkService.getInstance().reopenMark({ ...mark, resolved: true });
        assert.ok(document.getText().includes('<!--? 检查 "伏笔" -->'));
        await DoubtMarkService.getInstance().deleteMark(mark);
        assert.ok(!document.getText().includes('<!--?'));
        assert.ok(document.getText().includes('正文，'));
    });
    test('settings merge uses the dirty document and is undoable', async () => {
        const source = vscode.Uri.joinPath(root, 'settings.json');
        await writeTestFile(source, '{\n // 用户配置\n "editor.fontSize": 18,\n}');
        await applyDocumentChange(source, text => text.replace('18', '20'));
        const document = await vscode.workspace.openTextDocument(source);
        const before = document.getText();
        await vscode.window.showTextDocument(document);
        await applyDocumentChange(source, text => mergeRecommendedSettings(text, { 'editor.fontSize': 14, 'files.autoSave': 'afterDelay' }));
        assert.ok(document.getText().includes('20'));
        assert.ok(document.getText().includes('// 用户配置'));
        await vscode.commands.executeCommand('undo');
        assert.strictEqual(document.getText(), before);
    });
});
