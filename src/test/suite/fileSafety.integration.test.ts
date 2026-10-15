import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { applyDocumentChange, copyDocument, documentIO, fileExists, patchFrontMatter } from '../../utils/documentOperations';
import { renameChapter, renameCharacter, updateChapterStatusWithDialog } from '../../commands/contextMenuCommands';
import { NovelerTreeItem } from '../../views/novelerViewProvider';
import { ConfigService } from '../../services/configService';
import { ChineseNovelFormatProvider } from '../../providers/formatProvider';
import { DoubtMarkService, DoubtMark, findMarksInText } from '../../services/doubtMarkService';
import { mergeRecommendedSettings } from '../../utils/settingsHelper';
import { registerAllCommands, CommandRegistrarDeps } from '../../commands/commandRegistrar';
import { registerDoubtMarkCommands } from '../../commands/doubtMarkCommands';
import { DoubtMarkNodesProvider } from '../../views/nodes/doubtMarkNodes';
import { DoubtMarkCodeLensProvider } from '../../providers/doubtMarkCodeLensProvider';
import { createTestWorkspace, readTestFile, removeTestWorkspace, undoDocumentChange, writeTestFile } from './testWorkspace';

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

    for (const enabled of [true, false, undefined]) {
        test(`completing an inline todo honors deleteOnResolve=${enabled} and preserves the body`, async () => {
            const uri = vscode.Uri.joinPath(root, 'chapters', '待办配置.md');
            const original = '  正文 <!--? 检查伏笔 -->\n下一段';
            await writeTestFile(uri, original);
            await applyDocumentChange(uri, text => text + '\n未保存内容');
            sandbox.stub(ConfigService, 'getInstance').returns({ getConfig: () => ({ doubtMark: { deleteOnResolve: enabled } }) } as unknown as ConfigService);
            let resolve!: (mark: unknown) => Promise<void>;
            sandbox.stub(vscode.commands, 'registerCommand').callsFake((command: string, callback: (...args: unknown[]) => unknown) => {
                if (command === 'noveler.resolveDoubtMark') { resolve = callback as typeof resolve; }
                return { dispose: () => undefined };
            });
            registerDoubtMarkCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext, {} as DoubtMarkNodesProvider, () => undefined);
            await resolve({ fileUri: uri, lineNumber: 0, content: '检查伏笔', resolved: false });
            const document = await vscode.workspace.openTextDocument(uri);
            assert.strictEqual(document.getText(), enabled ? '  正文\n下一段\n未保存内容' : '  正文 <!--✓ 检查伏笔 -->\n下一段\n未保存内容');
            await vscode.window.showTextDocument(document);
            await undoDocumentChange(document, original + '\n未保存内容');
            assert.strictEqual(document.getText(), original + '\n未保存内容');
        });
    }

    test('bulk completion removes pending markers from bottom to top and preserves existing resolved ones', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '批量待办.md');
        const text = '<!--? 第一项 -->\n正文 <!--? 第二项 -->\n<!--✓ 原已完成 -->\n<!--? 第三项 -->\n结尾';
        await writeTestFile(uri, text);
        const service = DoubtMarkService.getInstance();
        sandbox.stub(service, 'getAllMarks').returns(findMarksInText(text).map(mark => ({ ...mark, fileUri: uri, fileName: '批量待办', id: String(mark.lineNumber) })));
        sandbox.stub(ConfigService, 'getInstance').returns({ getConfig: () => ({ doubtMark: { deleteOnResolve: true } }) } as unknown as ConfigService);
        let resolveAll!: () => Promise<void>;
        sandbox.stub(vscode.commands, 'registerCommand').callsFake((command: string, callback: (...args: unknown[]) => unknown) => {
            if (command === 'noveler.resolveAllDoubtMarks') { resolveAll = callback as typeof resolveAll; }
            return { dispose: () => undefined };
        });
        (vscode.window.showWarningMessage as sinon.SinonStub).resolves('确定');
        registerDoubtMarkCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext, {} as DoubtMarkNodesProvider, () => undefined);
        await resolveAll();
        assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), '正文\n<!--✓ 原已完成 -->\n结尾');
    });

    test('failed todo edits report failure and keep the pending marker', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '失败待办.md');
        const text = '正文 <!--? 检查 -->';
        await writeTestFile(uri, text);
        sandbox.stub(vscode.workspace, 'applyEdit').resolves(false);
        await assert.rejects(() => DoubtMarkService.getInstance().deleteMark({ fileUri: uri, lineNumber: 0, content: '检查', resolved: false } as never), /待办修改未完成/);
        assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), text);
    });

    test('deleting a pending marker does not delete an earlier resolved marker on the same line', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '混合待办.md');
        await writeTestFile(uri, '正文 <!--✓ 已完成 --> <!--? 待处理 -->');
        await DoubtMarkService.getInstance().deleteMark({ fileUri: uri, lineNumber: 0, content: '待处理', resolved: false } as never);
        assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), '正文 <!--✓ 已完成 -->');
    });

    test('each duplicate inline todo can be completed, reopened and deleted without changing its neighbors', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '同行待办.md');
        const original = '  正文 <!--? 重复 --> <!--✓ 已完成 --> <!--? 重复 -->\n结尾';
        await writeTestFile(uri, original);
        const document = await vscode.workspace.openTextDocument(uri);
        const marks = (): DoubtMark[] => findMarksInText(document.getText()).map(mark => ({ ...mark,
            fileUri: uri, fileName: '同行待办', id: `${mark.lineNumber}:${mark.startCharacter}`, documentVersion: document.version }));
        const service = DoubtMarkService.getInstance();
        await service.resolveMark(marks()[2]);
        assert.strictEqual(document.getText(), '  正文 <!--? 重复 --> <!--✓ 已完成 --> <!--✓ 重复 -->\n结尾');
        await service.reopenMark(marks()[2]);
        assert.strictEqual(document.getText(), original);
        await service.deleteMark(marks()[2]);
        assert.strictEqual(document.getText(), '  正文 <!--? 重复 --> <!--✓ 已完成 -->\n结尾');
        await vscode.window.showTextDocument(document);
        await undoDocumentChange(document, original);
        assert.strictEqual(document.getText(), original);
    });

    for (const autoDelete of [false, true]) {
        test(`bulk completion handles multiple markers on a line with autoDelete=${autoDelete}`, async () => {
            const uri = vscode.Uri.joinPath(root, 'chapters', '批量同行待办.md');
            const original = '正文 <!--? 第一项 --> <!--✓ 保留 --> <!--? 第三项 -->\n<!--? 第四项 --> <!--? 第五项 -->\n结尾';
            await writeTestFile(uri, original);
            const document = await vscode.workspace.openTextDocument(uri);
            const service = DoubtMarkService.getInstance();
            sandbox.stub(service, 'getAllMarks').callsFake(() => findMarksInText(document.getText()).map(mark => ({ ...mark,
                fileUri: uri, fileName: '批量同行待办', id: `${mark.lineNumber}:${mark.startCharacter}`, documentVersion: document.version })));
            await service.resolveAll(autoDelete);
            assert.strictEqual(document.getText(), autoDelete ? '正文 <!--✓ 保留 -->\n结尾'
                : '正文 <!--✓ 第一项 --> <!--✓ 保留 --> <!--✓ 第三项 -->\n<!--✓ 第四项 --> <!--✓ 第五项 -->\n结尾');
            await vscode.window.showTextDocument(document);
            await undoDocumentChange(document, original);
            assert.strictEqual(document.getText(), original);
        });
    }

    test('bulk cleanup removes only resolved markers and keeps pending markers and prose', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '清理同行待办.md');
        const original = '正文 <!--? 保留 --> <!--✓ 删除一 --> <!--✓ 删除二 --> 结尾\n<!--✓ 独立一 --> <!--✓ 独立二 -->\n末段';
        await writeTestFile(uri, original);
        const document = await vscode.workspace.openTextDocument(uri);
        const service = DoubtMarkService.getInstance();
        sandbox.stub(service, 'getAllMarks').returns(findMarksInText(original).map(mark => ({ ...mark,
            fileUri: uri, fileName: '清理同行待办', id: `${mark.lineNumber}:${mark.startCharacter}`, documentVersion: document.version })));
        await service.deleteAllResolved();
        assert.strictEqual(document.getText(), '正文 <!--? 保留 --> 结尾\n末段');
        await vscode.window.showTextDocument(document);
        await undoDocumentChange(document, original);
        assert.strictEqual(document.getText(), original);
    });

    test('stale todo actions refuse to modify another marker after document changes', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '过期待办.md');
        const original = '正文 <!--? 第一项 --> <!--? 第二项 -->';
        await writeTestFile(uri, original);
        const document = await vscode.workspace.openTextDocument(uri);
        const position = findMarksInText(original)[1];
        const mark = { ...position, fileUri: uri, fileName: '过期待办', id: 'second', documentVersion: document.version };
        await applyDocumentChange(uri, text => '新增文字' + text);
        await assert.rejects(() => DoubtMarkService.getInstance().deleteMark(mark), /待办位置已变化/);
        assert.strictEqual(document.getText(), '新增文字' + original);
    });

    test('old CodeLens buttons can complete multiple todos consecutively without waiting for refresh', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '连续完成.md');
        await writeTestFile(uri, '正文 <!--? 重复 --> <!--? 重复 -->\n另一段 <!--? 第三项 -->');
        const document = await vscode.workspace.openTextDocument(uri);
        const marks = new DoubtMarkCodeLensProvider().provideCodeLenses(document, {} as vscode.CancellationToken)
            .filter(lens => lens.command?.command === 'noveler.resolveDoubtMark').map(lens => lens.command!.arguments![0] as DoubtMark);
        const service = DoubtMarkService.getInstance();
        for (const mark of marks) { await service.resolveMark(mark); }
        assert.strictEqual(document.getText(), '正文 <!--✓ 重复 --> <!--✓ 重复 -->\n另一段 <!--✓ 第三项 -->');
        const version = document.version;
        await service.resolveMark(marks[0]);
        assert.strictEqual(document.version, version);
    });

    test('concurrent clicks complete different inline todos without overwriting one another', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '并发完成.md');
        await writeTestFile(uri, '正文 <!--? 第一项 --> <!--? 第二项 --> <!--? 第三项 -->');
        const document = await vscode.workspace.openTextDocument(uri);
        const marks = new DoubtMarkCodeLensProvider().provideCodeLenses(document, {} as vscode.CancellationToken)
            .filter(lens => lens.command?.command === 'noveler.resolveDoubtMark').map(lens => lens.command!.arguments![0] as DoubtMark);
        await Promise.all(marks.map(mark => DoubtMarkService.getInstance().resolveMark(mark)));
        assert.strictEqual(document.getText(), '正文 <!--✓ 第一项 --> <!--✓ 第二项 --> <!--✓ 第三项 -->');
    });

    test('a rejected queued operation does not block the following valid operation', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '失败后继续.md');
        await writeTestFile(uri, '正文 <!--? 第一项 --> <!--? 第二项 -->');
        const document = await vscode.workspace.openTextDocument(uri);
        const provider = new DoubtMarkCodeLensProvider();
        const stale = provider.provideCodeLenses(document, {} as vscode.CancellationToken)
            .find(lens => lens.command?.command === 'noveler.resolveDoubtMark')!.command!.arguments![0] as DoubtMark;
        await applyDocumentChange(uri, text => '新增' + text);
        const valid = provider.provideCodeLenses(document, {} as vscode.CancellationToken)
            .filter(lens => lens.command?.command === 'noveler.resolveDoubtMark')[1].command!.arguments![0] as DoubtMark;
        const service = DoubtMarkService.getInstance();
        const results = await Promise.allSettled([service.resolveMark(stale), service.resolveMark(valid)]);
        assert.deepStrictEqual(results.map(result => result.status), ['rejected', 'fulfilled']);
        assert.strictEqual(document.getText(), '新增正文 <!--? 第一项 --> <!--✓ 第二项 -->');
    });

    test('a stale marker in a second file prevents the entire batch from modifying either file', async () => {
        const first = vscode.Uri.joinPath(root, 'chapters', '批量第一份.md');
        const second = vscode.Uri.joinPath(root, 'chapters', '批量第二份.md');
        await writeTestFile(first, '第一份 <!--? 第一项 -->');
        await writeTestFile(second, '第二份 <!--? 第二项 -->');
        const provider = new DoubtMarkCodeLensProvider();
        const marks: DoubtMark[] = [];
        for (const uri of [first, second]) {
            const doc = await vscode.workspace.openTextDocument(uri);
            marks.push(provider.provideCodeLenses(doc, {} as vscode.CancellationToken)
                .find(lens => lens.command?.command === 'noveler.resolveDoubtMark')!.command!.arguments![0]);
        }
        await applyDocumentChange(second, text => '新增' + text);
        const service = DoubtMarkService.getInstance();
        sandbox.stub(service, 'getAllMarks').returns(marks);
        await assert.rejects(() => service.resolveAll(), /待办位置已变化/);
        assert.strictEqual((await vscode.workspace.openTextDocument(first)).getText(), '第一份 <!--? 第一项 -->');
        assert.strictEqual((await vscode.workspace.openTextDocument(second)).getText(), '新增第二份 <!--? 第二项 -->');
    });

    test('typing in unrelated paragraphs does not replace unchanged todo entries', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '待办刷新范围.md');
        await writeTestFile(uri, '正文 <!--? 检查 -->\n其他段落');
        const service = DoubtMarkService.getInstance();
        await service.initialize();
        await applyDocumentChange(uri, text => text + '\n初始正文');
        const before = service.getMarksByFile().get(uri.toString())![0];
        await applyDocumentChange(uri, text => text.replace('初始正文', '继续写正文'));
        assert.strictEqual(service.getMarksByFile().get(uri.toString())![0], before);
        await applyDocumentChange(uri, text => '新增' + text);
        const after = service.getMarksByFile().get(uri.toString())![0];
        assert.notStrictEqual(after, before);
        assert.strictEqual(after.startCharacter, before.startCharacter! + 2);
    });

    test('unrelated metadata edits do not prevent completing an unchanged todo', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '自动保存待办.md');
        await writeTestFile(uri, '---\nmodified: 原时间\n---\n正文 <!--? 检查 -->');
        const document = await vscode.workspace.openTextDocument(uri);
        const mark = new DoubtMarkCodeLensProvider().provideCodeLenses(document, {} as vscode.CancellationToken)
            .find(lens => lens.command?.command === 'noveler.resolveDoubtMark')!.command!.arguments![0] as DoubtMark;
        await applyDocumentChange(uri, text => text.replace('原时间', '新时间'));
        await DoubtMarkService.getInstance().resolveMark(mark);
        assert.strictEqual(document.getText(), '---\nmodified: 新时间\n---\n正文 <!--✓ 检查 -->');
    });

    test('a removed duplicate is not confused with an identical marker shifted into its old position', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '重复位置保护.md');
        await writeTestFile(uri, '<!--? 重复 --><!--? 重复 -->');
        const document = await vscode.workspace.openTextDocument(uri);
        const mark = new DoubtMarkCodeLensProvider().provideCodeLenses(document, {} as vscode.CancellationToken)
            .find(lens => lens.command?.command === 'noveler.resolveDoubtMark')!.command!.arguments![0] as DoubtMark;
        await applyDocumentChange(uri, text => text.replace('<!--? 重复 -->', ''));
        await assert.rejects(() => DoubtMarkService.getInstance().resolveMark(mark), /待办位置已变化/);
        assert.strictEqual(document.getText(), '<!--? 重复 -->');
    });

    test('ambiguous legacy todo positions stop instead of modifying the first duplicate', async () => {
        const uri = vscode.Uri.joinPath(root, 'chapters', '重复待办.md');
        const text = '正文 <!--? 重复 --> <!--? 重复 -->';
        await writeTestFile(uri, text);
        await assert.rejects(() => DoubtMarkService.getInstance().resolveMark({ fileUri: uri, lineNumber: 0, content: '重复', resolved: false } as DoubtMark), /待办位置已变化/);
        assert.strictEqual((await vscode.workspace.openTextDocument(uri)).getText(), text);
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
        await writeTestFile(source, '前一段,\n正文, <!--? 检查 "伏笔" --> <!--? 第二项 -->\n后一段.');
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
        const scanned = DoubtMarkService.getInstance().getMarksByFile().get(source.toString())!;
        assert.strictEqual(scanned.length, 2);
        assert.strictEqual(new Set(scanned.map(mark => mark.id)).size, 2);
        assert.ok(scanned[1].startCharacter! > scanned[0].startCharacter!);
        const nodes = new DoubtMarkNodesProvider(DoubtMarkService.getInstance()).getMarkItemNodes({ fileUriStr: source.toString() } as never);
        assert.strictEqual(nodes.length, 2);
        assert.strictEqual(new Set(nodes.map(node => node.id)).size, 2);
        const mark = { ...position, id: 'test', fileUri: source, fileName: '待办' };
        await DoubtMarkService.getInstance().resolveMark(mark);
        assert.ok(document.getText().includes('<!--✓ 检查 "伏笔" -->'));
        await DoubtMarkService.getInstance().reopenMark({ ...mark, resolved: true });
        assert.ok(document.getText().includes('<!--? 检查 "伏笔" -->'));
        await DoubtMarkService.getInstance().deleteMark(mark);
        assert.ok(!document.getText().includes('<!--? 检查'));
        assert.ok(document.getText().includes('<!--? 第二项 -->'));
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
        await undoDocumentChange(document, before);
        assert.strictEqual(document.getText(), before);
    });
});
