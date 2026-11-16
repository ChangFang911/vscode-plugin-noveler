import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { addDoubtMark } from '../../commands/addDoubtMark';
import { MockTextDocument, MockUri } from '../mocks/vscode';

suite('Todo insertion failure safety', () => {
    let sandbox: sinon.SinonSandbox;
    let editor: vscode.TextEditor;
    let edit: sinon.SinonStub;
    let error: sinon.SinonStub;
    let info: sinon.SinonStub;
    setup(() => {
        sandbox = sinon.createSandbox();
        const document = new MockTextDocument(MockUri.file('/novel/chapters/章节.md'), '正文', 'markdown');
        const selection = new vscode.Selection(0, 1, 0, 1);
        edit = sinon.stub().resolves(false);
        editor = { document, selection, selections: [selection], edit } as unknown as vscode.TextEditor;
        sandbox.stub(vscode.window, 'activeTextEditor').value(editor);
        sandbox.replace(vscode.window, 'showInputBox', sinon.stub().resolves('备注'));
        error = sinon.stub().resolves();
        info = sinon.stub().resolves();
        sandbox.replace(vscode.window, 'showErrorMessage', error);
        sandbox.replace(vscode.window, 'showInformationMessage', info);
    });
    teardown(() => sandbox.restore());
    for (const rejection of [false, true]) {
        test(`an ${rejection ? 'exception' : 'unsuccessful edit'} preserves the original content and selection`, async () => {
            if (rejection) { edit.rejects(new Error('只读文档')); }
            const selection = editor.selection;
            await addDoubtMark();
            assert.ok(edit.calledOnce && error.calledOnce && info.notCalled);
            assert.strictEqual(editor.document.getText(), '正文');
            assert.strictEqual(editor.selection, selection);
        });
    }
});
