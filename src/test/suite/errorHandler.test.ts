import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ErrorSeverity, handleError, handleSuccess } from '../../utils/errorHandler';
import { Logger } from '../../utils/logger';

suite('ErrorHandler actual notifications', () => {
    let sandbox: sinon.SinonSandbox;
    setup(() => { sandbox = sinon.createSandbox(); });
    teardown(() => sandbox.restore());
    for (const [value, expected] of [[new Error('失败'), '失败'], ['文本', '文本'], [null, 'null'], [7, '7']] as const) {
        test(`error notifications render ${expected}`, () => {
            const show = sandbox.replace(vscode.window, 'showErrorMessage', sinon.stub().resolves());
            const log = sandbox.stub(Logger, 'error');
            handleError('保存失败', value);
            assert.strictEqual(show.firstCall.args[0], `Noveler: 保存失败 - ${expected}`);
            assert.strictEqual(log.firstCall.args[1], value);
        });
    }
    test('warning and silent errors use their intended channels', () => {
        const error = sandbox.replace(vscode.window, 'showErrorMessage', sinon.stub().resolves());
        const warning = sandbox.replace(vscode.window, 'showWarningMessage', sinon.stub().resolves());
        const log = sandbox.stub(Logger, 'warn');
        const debug = sandbox.stub(Logger, 'debug');
        handleError('检查', '警告', ErrorSeverity.Warning);
        assert.strictEqual(warning.firstCall.args[0], 'Noveler: 检查 - 警告');
        assert.ok(log.calledOnce);
        handleError('检查', '静默', ErrorSeverity.Silent);
        assert.ok(debug.calledOnce);
        assert.ok(error.notCalled);
        assert.ok(warning.calledOnce);
    });
    test('success notifications honor silent mode', () => {
        const show = sandbox.replace(vscode.window, 'showInformationMessage', sinon.stub().resolves());
        const log = sandbox.stub(Logger, 'info');
        handleSuccess('已保存');
        handleSuccess('后台保存', true);
        assert.strictEqual(show.firstCall.args[0], 'Noveler: 已保存');
        assert.ok(show.calledOnce);
        assert.ok(log.calledTwice);
    });
});
