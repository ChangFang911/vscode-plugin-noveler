import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
    vscode.window.showInformationMessage('Start all tests.');

    test('Extension should be present', () => {
        // 使用正确的扩展 ID: publisher.name
        assert.ok(vscode.extensions.getExtension('chang.chinese-novel-writer'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('chang.chinese-novel-writer');
        if (ext) {
            await ext.activate();
            assert.ok(ext.isActive);
        }
    });
});
