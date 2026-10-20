import * as assert from 'assert';
import * as path from 'path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { parse, ParseError } from 'jsonc-parser';
import { ConfigService } from '../../services/configService';
import { MigrationService } from '../../services/migrationService';
import { CURRENT_CONFIG_VERSION } from '../../constants';
import { applyDocumentChange, documentIO } from '../../utils/documentOperations';
import { createTestWorkspace, readTestFile, removeTestWorkspace } from './testWorkspace';

suite('Configuration Write and Upgrade Safety Integration', () => {
    let root: vscode.Uri;
    let sandbox: sinon.SinonSandbox;
    let config: ConfigService;
    const context = { extensionUri: vscode.Uri.file(path.resolve(__dirname, '../../..')) } as vscode.ExtensionContext;
    const file = () => vscode.Uri.joinPath(root, 'novel.jsonc');
    setup(async () => {
        root = await createTestWorkspace();
        sandbox = sinon.createSandbox();
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: root, name: '配置安全验证', index: 0 });
        sandbox.stub(vscode.window, 'showInformationMessage').resolves();
        sandbox.stub(vscode.window, 'showWarningMessage').resolves();
        sandbox.stub(vscode.window, 'showErrorMessage').resolves();
        config = Object.create(ConfigService.prototype) as ConfigService;
        config['setDefaultConfig']();
        sandbox.stub(config, 'reloadConfig').resolves();
        sandbox.stub(config as unknown as { loadConfig(): Promise<void> }, 'loadConfig').resolves();
    });
    teardown(async () => {
        sandbox.restore();
        await removeTestWorkspace(root);
    });
    async function replace(text: string) {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(file()), { preview: false });
        const eol = new vscode.WorkspaceEdit();
        eol.set(file(), [vscode.TextEdit.setEndOfLine(text.includes('\r\n') ? vscode.EndOfLine.CRLF : vscode.EndOfLine.LF)]);
        assert.ok(await vscode.workspace.applyEdit(eol));
        await applyDocumentChange(file(), () => text);
        const document = await vscode.workspace.openTextDocument(file());
        assert.ok(await document.save());
        return document;
    }
    function read(text: string) {
        const errors: ParseError[] = [];
        const value = parse(text, errors, { allowTrailingComma: true });
        assert.deepStrictEqual(errors, []);
        return value;
    }
    test('settings use dirty JSONC, preserve comments and CRLF, and can insert multiple missing siblings', async () => {
        const document = await replace('{\r\n // 用户备注\r\n "noveler": {},\r\n "extra": "磁盘值",\r\n}\r\n');
        await applyDocumentChange(file(), text => text.replace('磁盘值', '未保存值'));
        await config.updateConfig(draft => { draft.noveler = { ...draft.noveler, focusMode: { typewriter: true, typingSound: 'mechanical' } }; });
        const result = document.getText();
        assert.strictEqual(read(result).extra, '未保存值');
        assert.deepStrictEqual(read(result).noveler.focusMode, { typewriter: true, typingSound: 'mechanical' });
        assert.ok(result.includes('// 用户备注\r\n'));
        assert.ok(!/(?<!\r)\n/.test(result));
        assert.strictEqual(await readTestFile(file()), result);
    });
    test('concurrent settings changes merge rather than losing a previous update', async () => {
        await replace('{"noveler":{}}');
        await Promise.all([
            config.updateConfig(draft => { draft.noveler = { ...draft.noveler, targetWords: { default: 3210 } }; }),
            config.updateConfig(draft => { draft.noveler = { ...draft.noveler, paragraphIndent: { value: false } }; })
        ]);
        const result = read(await readTestFile(file())).noveler;
        assert.strictEqual(result.targetWords.default, 3210);
        assert.strictEqual(result.paragraphIndent.value, false);
    });
    test('confirming a value already present in a dirty document still saves the setting', async () => {
        const document = await replace('{"noveler":{"targetWords":{"default":2500}}}');
        await applyDocumentChange(file(), text => text.replace('2500', '3000'));
        await config.updateConfig(draft => { draft.noveler!.targetWords = { default: 3000 }; });
        assert.strictEqual(read(await readTestFile(file())).noveler.targetWords.default, 3000);
        assert.strictEqual(document.isDirty, false);
    });
    for (const invalid of ['{"noveler":{}, broken', '[]', 'null', '{"noveler": []}']) {
        test(`invalid configuration stops writes: ${invalid}`, async () => {
            const document = await replace(invalid);
            await assert.rejects(config.updateConfig(draft => { draft.noveler = { targetWords: { default: 3000 } }; }));
            assert.strictEqual(document.getText(), invalid);
            assert.strictEqual(await readTestFile(file()), invalid);
        });
    }
    test('failed saves reject the settings change and the queue accepts later valid changes', async () => {
        const original = '{"noveler":{"targetWords":{"default":2500}}}';
        const document = await replace(original);
        const save = sandbox.stub(documentIO, 'save').resolves(false);
        await assert.rejects(config.updateConfig(draft => { draft.noveler!.targetWords = { default: 3000 }; }), /保存/);
        assert.strictEqual(await readTestFile(file()), original);
        assert.ok(document.isDirty);
        save.restore();
        await config.updateConfig(draft => { draft.noveler!.paragraphIndent = { value: false }; });
        assert.strictEqual(read(await readTestFile(file())).noveler.paragraphIndent.value, false);
    });
    test('rejected editor edits do not write a settings file', async () => {
        const text = '{"noveler":{}}';
        const document = await replace(text);
        sandbox.stub(vscode.workspace, 'applyEdit').resolves(false);
        await assert.rejects(config.updateConfig(draft => { draft.noveler!.targetWords = { default: 3000 }; }));
        assert.strictEqual(document.getText(), text);
        assert.strictEqual(await readTestFile(file()), text);
    });
    for (const version of [undefined, '0.3.0', '0.4.0', '0.6.1', '0.6.2', '0.6.3']) {
        test(`upgrade from ${version || 'unversioned'} preserves dirty values and is idempotent`, async () => {
            const document = await replace(`{\r\n // 升级前备注\r\n ${version ? '"version": "' + version + '",' : ''}\r\n "noveler": {"targetWords":{"default":4321},"paragraphIndent":{"value":false}},\r\n "custom": "原值",\r\n}\r\n`);
            await applyDocumentChange(file(), text => text.replace('原值', '未保存值'));
            assert.strictEqual(await MigrationService.checkAndMigrate(context), true);
            const result = document.getText();
            const upgraded = read(result);
            assert.strictEqual(upgraded.version, CURRENT_CONFIG_VERSION);
            assert.strictEqual(upgraded.custom, '未保存值');
            assert.strictEqual(upgraded.noveler.targetWords.default, 4321);
            assert.strictEqual(upgraded.noveler.paragraphIndent.value, false);
            assert.strictEqual(upgraded.noveler.volumes.enabled, false);
            assert.strictEqual(upgraded.noveler.volumes.folderStructure, 'flat');
            assert.ok(result.includes('// 升级前备注\r\n'));
            assert.ok(!/(?<!\r)\n/.test(result));
            assert.strictEqual(await readTestFile(file()), result);
            assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).calledWith(
                '小说项目配置已更新，原有设置已保留。', '查看配置', '查看更新日志'));
            assert.strictEqual(await MigrationService.checkAndMigrate(context), false);
            assert.strictEqual(document.getText(), result);
        });
    }
    test('legacy sensitive levels and existing nested volume settings are preserved', async () => {
        await replace('{"version":"0.3.0","noveler":{"volumes":{"enabled":true,"folderStructure":"nested","chapterNumbering":"volume"},"sensitiveWords":{"levels":{"high":false,"medium":true}}}}');
        assert.ok(await MigrationService.checkAndMigrate(context));
        const result = read(await readTestFile(file())).noveler;
        assert.strictEqual(result.volumes.enabled, true);
        assert.strictEqual(result.volumes.folderStructure, 'nested');
        assert.strictEqual(result.volumes.chapterNumbering, 'volume');
        assert.strictEqual(result.sensitiveWords.builtInLibrary.levels.high, false);
        assert.strictEqual(result.sensitiveWords.builtInLibrary.levels.medium, true);
    });
    test('current and future configurations are untouched', async () => {
        for (const version of [CURRENT_CONFIG_VERSION, '99.0.0']) {
            const text = `{"version":"${version}","noveler":{}}`;
            await replace(text);
            assert.strictEqual(await MigrationService.checkAndMigrate(context), false);
            assert.strictEqual(await readTestFile(file()), text);
        }
    });
    test('invalid configuration cannot be upgraded or reported successful', async () => {
        const text = '{"version":"0.3.0","noveler":{}, broken';
        const document = await replace(text);
        assert.strictEqual(await MigrationService.checkAndMigrate(context), false);
        assert.strictEqual(await readTestFile(file()), text);
        assert.strictEqual(document.getText(), text);
        assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
        assert.strictEqual((vscode.window.showErrorMessage as sinon.SinonStub).lastCall.args[1], '打开配置');
    });
    test('a failed upgrade save retains the original version and original disk content', async () => {
        const text = '{"version":"0.3.0","noveler":{}}';
        const document = await replace(text);
        sandbox.stub(documentIO, 'save').resolves(false);
        assert.strictEqual(await MigrationService.checkAndMigrate(context), false);
        assert.strictEqual(await readTestFile(file()), text);
        assert.strictEqual(document.getText(), text);
        assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
    });
    test('missing or unreadable templates do not change the project', async () => {
        const text = '{"version":"0.3.0","noveler":{}}';
        const document = await replace(text);
        const readFile = documentIO.readFile;
        sandbox.stub(documentIO, 'readFile').callsFake(uri => uri.path.endsWith('default-config.jsonc')
            ? Promise.reject(vscode.FileSystemError.NoPermissions('模板不可读')) : readFile(uri));
        assert.strictEqual(await MigrationService.checkAndMigrate(context), false);
        assert.strictEqual(document.getText(), text);
        assert.strictEqual(await readTestFile(file()), text);
    });
    test('upgrade reads edits made while the template is loading', async () => {
        await replace('{"version":"0.3.0","custom":"原值","noveler":{}}');
        const originalRead = documentIO.readFile;
        sandbox.stub(documentIO, 'readFile').callsFake(async uri => {
            const bytes = await originalRead(uri);
            if (uri.path.endsWith('default-config.jsonc')) {
                await applyDocumentChange(file(), text => text.replace('原值', '加载期间的新值'));
            }
            return bytes;
        });
        assert.ok(await MigrationService.checkAndMigrate(context));
        assert.strictEqual(read(await readTestFile(file())).custom, '加载期间的新值');
    });
    test('failed upgrade restoration never overwrites edits made during saving', async () => {
        const text = '{"version":"0.3.0","noveler":{}}';
        const document = await replace(text);
        sandbox.stub(documentIO, 'save').callsFake(async () => {
            await applyDocumentChange(file(), current => current + '\n// 保存期间新增备注');
            return false;
        });
        assert.strictEqual(await MigrationService.checkAndMigrate(context), false);
        assert.ok(document.getText().endsWith('// 保存期间新增备注'));
        assert.strictEqual(await readTestFile(file()), text);
        assert.ok((vscode.window.showInformationMessage as sinon.SinonStub).notCalled);
    });
});
