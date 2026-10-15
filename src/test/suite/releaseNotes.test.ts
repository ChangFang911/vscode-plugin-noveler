import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import { readFileSync } from 'fs';
import * as path from 'path';
import { compareVersions, getReleaseUpdates, parseReleaseNotes, ReleaseNotes, renderReleaseNotes } from '../../utils/releaseNotes';
import { WelcomeWebviewProvider } from '../../views/welcomeWebviewProvider';
import { documentIO } from '../../utils/documentOperations';

const log = `# 更新日志
## [Unreleased]
### 新增
- 尚未发布的人物别名
## [0.10.0] - 2026-10-15
### 新增
- 最新功能
### 修复
- 修复最新问题
## [0.9.0] - 2026-10-14
### 优化
- 简化交互
### Bug 修复
- 修复问题
### 测试
- 内部测试细节
## [0.8.8] - 2026-06-08
### 新增功能
- 写作待办
  - 行内操作
### 文档
- 内部文档
## [未来计划]
### 新增
- 不属于发布日志
`;

suite('Version release notes', () => {
    test('parses versioned features and fixes while excluding unreleased, planning and internal entries from upgrades', () => {
        const releases = parseReleaseNotes(log.replace(/\n/g, '\r\n'));
        assert.deepStrictEqual(releases.map(release => release.version), ['Unreleased', '0.10.0', '0.9.0', '0.8.8']);
        const updates = getReleaseUpdates(releases, '0.8.8', '0.10.0');
        assert.deepStrictEqual(updates.map(release => release.version), ['0.10.0', '0.9.0']);
        assert.deepStrictEqual(updates[1].changes, [{ title: '优化', items: ['简化交互'] }, { title: '修复', items: ['修复问题'] }]);
    });
    test('compares numeric versions and prereleases without lexical version mistakes', () => {
        assert.strictEqual(compareVersions('0.10.0', '0.9.9'), 1);
        assert.strictEqual(compareVersions('1.0.0-beta.10', '1.0.0-beta.2'), 1);
        assert.strictEqual(compareVersions('1.0.0-beta', '1.0.0'), -1);
        assert.strictEqual(compareVersions('1.0.0+build', '1.0.0'), 0);
        assert.strictEqual(compareVersions('bad', '1.0.0'), undefined);
    });
    test('does not introduce duplicate reminders for the same version, downgrade or future releases', () => {
        const releases = parseReleaseNotes(log);
        assert.deepStrictEqual(getReleaseUpdates(releases, '0.10.0', '0.10.0'), []);
        assert.deepStrictEqual(getReleaseUpdates(releases, '0.10.0', '0.9.0'), []);
        assert.deepStrictEqual(getReleaseUpdates(releases, undefined, '0.9.0').map(release => release.version), ['0.9.0']);
        assert.deepStrictEqual(getReleaseUpdates(releases, 'bad', '0.9.0').map(release => release.version), ['0.9.0']);
    });
    test('code blocks cannot create fake versions or release entries', () => {
        const releases = parseReleaseNotes('## [1.0.0]\n### 新增\n```md\n## [9.0.0]\n- 假条目\n```\n- 实际功能');
        assert.deepStrictEqual(releases.map(release => release.version), ['1.0.0']);
        assert.deepStrictEqual(releases[0].changes[0].items, ['实际功能']);
    });
    test('renders safe HTML with version groups and readable inline formatting', () => {
        const html = renderReleaseNotes([{ version: '1.0.0', changes: [{ title: '新增', items: ['<script>恶意内容</script>', '**别名**存储在 `aliases`'] }] }]);
        assert.ok(!html.includes('<script>'));
        assert.ok(html.includes('&lt;script&gt;'));
        assert.ok(html.includes('<strong>别名</strong>'));
        assert.ok(html.includes('<code>aliases</code>'));
        assert.ok(html.includes('v1.0.0'));
    });
    test('shows a short preview and keeps all remaining changes and technical details in a closed section', () => {
        const releases = parseReleaseNotes('## [1.0.0]\n### 新增\n- **人物别名**：输入后回车添加。\n  - 保留 YAML 注释和未保存正文。\n- **功能二**：说明二。\n- **功能三**：说明三。\n- **功能四**：说明四。');
        assert.strictEqual(releases[0].changes[0].items.length, 4);
        const html = renderReleaseNotes(releases);
        const preview = html.split('<details class="release-details">')[0];
        assert.ok(preview.includes('<strong>人物别名</strong>'));
        assert.ok(preview.includes('功能三'));
        assert.ok(!preview.includes('功能四'));
        assert.ok(!preview.includes('YAML'));
        assert.ok(html.includes('功能四'));
        assert.ok(html.includes('保留 YAML 注释和未保存正文'));
        assert.ok(html.includes('查看完整改动（4 项）'));
        assert.ok(!/<details class="release-details"[^>]*open/.test(html));
    });
    test('the current packaged version has concise release notes and unreleased changes never enter an upgrade', () => {
        const markdown = readFileSync(path.resolve(__dirname, '../../../CHANGELOG.md'), 'utf8');
        const version = JSON.parse(readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')).version as string;
        const releases = parseReleaseNotes(markdown);
        const current = releases.find(release => release.version === version);
        assert.ok(current, '插件版本必须有对应的发布日志');
        assert.ok(current.changes.some(group => group.items.some(item => item.includes('别名'))));
        for (const change of current.changes) {
            for (const item of change.items) {
                assert.ok(/^\*\*[^*]+\*\*/.test(item));
                assert.ok(item.split('\n')[0].length <= 70);
            }
        }
        const updates = getReleaseUpdates(releases, '0.8.8', version);
        assert.ok(updates.some(release => release.version === version));
        assert.ok(updates.every(release => release.version !== 'Unreleased'));
    });
});

suite('Update notifications and guide', () => {
    let sandbox: sinon.SinonSandbox;
    let state: Map<string, unknown>;
    let context: vscode.ExtensionContext;
    let provider: WelcomeWebviewProvider;
    let read: sinon.SinonStub;
    let panel: vscode.WebviewPanel;
    let disposed: vscode.EventEmitter<void>;
    let previousPanel: vscode.WebviewPanel | undefined;
    setup(() => {
        const panels = WelcomeWebviewProvider as unknown as { currentPanel?: vscode.WebviewPanel };
        previousPanel = panels.currentPanel;
        panels.currentPanel = undefined;
        sandbox = sinon.createSandbox();
        state = new Map();
        context = { extensionUri: vscode.Uri.file('/extension'), extension: { packageJSON: { version: '0.10.0' } },
            extensionMode: vscode.ExtensionMode.Production, subscriptions: [],
            globalState: { get: (key: string, fallback?: unknown) => state.has(key) ? state.get(key) : fallback,
                update: async (key: string, value: unknown) => { state.set(key, value); } }
        } as unknown as vscode.ExtensionContext;
        provider = new WelcomeWebviewProvider(context);
        read = sandbox.stub(provider as unknown as { readReleaseNotes(): Promise<ReleaseNotes[]> }, 'readReleaseNotes').resolves(parseReleaseNotes(log));
        sandbox.stub(documentIO, 'workspaceFolder').returns({ uri: vscode.Uri.file('/novel'), name: '小说', index: 0 });
        sandbox.stub(documentIO, 'stat').resolves({ type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 });
        sandbox.replace(vscode.window, 'showInformationMessage', sinon.stub().resolves(undefined));
        disposed = new vscode.EventEmitter<void>();
        panel = { webview: { html: '', asWebviewUri: (uri: vscode.Uri) => uri,
            onDidReceiveMessage: () => ({ dispose: () => undefined }) }, reveal: sandbox.spy(),
            onDidDispose: disposed.event, dispose: () => disposed.fire()
        } as unknown as vscode.WebviewPanel;
        sandbox.replace(vscode.window, 'createWebviewPanel', sinon.stub().returns(panel));
    });
    teardown(() => {
        panel?.dispose(); disposed?.dispose();
        context?.subscriptions.forEach(subscription => subscription.dispose());
        (WelcomeWebviewProvider as unknown as { currentPanel?: vscode.WebviewPanel }).currentPanel = previousPanel;
        sandbox.restore();
    });
    test('new users record their initial version without an extra update notification', async () => {
        await provider.checkForUpdates(true);
        assert.strictEqual(state.get('noveler.lastNotifiedVersion'), '0.10.0');
        assert.strictEqual((vscode.window.showInformationMessage as sinon.SinonStub).called, false);
        assert.strictEqual(read.called, false);
    });
    test('upgrades count changes across skipped versions, dismiss once and persist across provider instances', async () => {
        state.set('noveler.lastNotifiedVersion', '0.8.8');
        await provider.checkForUpdates(false);
        const notification = vscode.window.showInformationMessage as sinon.SinonStub;
        assert.strictEqual(notification.callCount, 1);
        assert.ok(notification.firstCall.args[0].includes('修复'));
        assert.ok(notification.firstCall.args[0].includes('优化'));
        await provider.checkForUpdates(false);
        await new WelcomeWebviewProvider(context).checkForUpdates(false);
        assert.strictEqual(notification.callCount, 1);
    });
    test('legacy users without a tracked version see only the current release', async () => {
        await provider.checkForUpdates(false);
        const message = (vscode.window.showInformationMessage as sinon.SinonStub).firstCall.args[0];
        assert.ok(message.includes('新增'));
        assert.ok(message.includes('修复'));
        assert.ok(!message.includes('优化'));
    });
    test('viewing the notification opens the guide with the exact upgrade range and current version', async () => {
        state.set('noveler.lastNotifiedVersion', '0.8.8');
        (vscode.window.showInformationMessage as sinon.SinonStub).resolves('查看更新');
        await provider.checkForUpdates(false);
        assert.ok(panel.webview.html.includes('本次更新'));
        assert.ok(panel.webview.html.includes('v0.10.0'));
        assert.ok(panel.webview.html.includes('v0.9.0'));
        assert.ok(!panel.webview.html.includes('v0.8.8'));
        assert.ok(!panel.webview.html.includes('尚未发布'));
        assert.ok(panel.webview.html.includes('scrollIntoView'));
        assert.strictEqual(state.get('noveler.welcomeShown'), undefined);
    });
    test('the guide reuses its existing panel and derives content from the log, including development previews', async () => {
        await provider.show();
        assert.ok(panel.webview.html.includes('最新功能'));
        assert.ok(!panel.webview.html.includes('未发布（开发预览）'));
        (context as unknown as { extensionMode: vscode.ExtensionMode }).extensionMode = vscode.ExtensionMode.Development;
        await provider.show();
        assert.strictEqual((vscode.window.createWebviewPanel as sinon.SinonStub).callCount, 1);
        assert.ok(panel.webview.html.includes('未发布（开发预览）'));
        assert.ok(panel.webview.html.includes('人物别名'));
        assert.ok(panel.webview.html.includes('新建小说项目'));
        assert.ok(panel.webview.html.includes('打开现有项目'));
    });
    test('a downgrade does not replace the remembered newer version', async () => {
        state.set('noveler.lastNotifiedVersion', '1.0.0');
        await provider.checkForUpdates(false);
        assert.strictEqual(state.get('noveler.lastNotifiedVersion'), '1.0.0');
        assert.strictEqual(read.called, false);
    });
    test('non-novel workspaces do not consume an update reminder', async () => {
        (documentIO.stat as sinon.SinonStub).rejects({ code: 'FileNotFound' });
        await provider.checkForUpdates(false);
        assert.strictEqual(state.get('noveler.lastNotifiedVersion'), undefined);
        assert.strictEqual(read.called, false);
    });
    test('read failures leave update state intact, and manual guide shows a useful fallback', async () => {
        read.rejects(new Error('读取失败'));
        await assert.rejects(() => provider.checkForUpdates(false), /读取失败/);
        assert.strictEqual(state.get('noveler.lastNotifiedVersion'), undefined);
        await provider.show();
        assert.ok(panel.webview.html.includes('更新日志暂时无法读取'));
        assert.ok(panel.webview.html.includes('新建小说项目'));
    });
    test('reads the lowercase changelog filename produced by VSIX packaging on case-sensitive systems', async () => {
        read.restore();
        const fileRead = sandbox.stub(documentIO, 'readFile');
        fileRead.onFirstCall().rejects({ code: 'FileNotFound' });
        fileRead.onSecondCall().resolves(Buffer.from(log));
        await provider.show();
        assert.ok(fileRead.firstCall.args[0].path.endsWith('/CHANGELOG.md'));
        assert.ok(fileRead.secondCall.args[0].path.endsWith('/changelog.md'));
        assert.ok(panel.webview.html.includes('最新功能'));
    });
    test('permission errors do not fall back to a different changelog file or consume the reminder', async () => {
        read.restore();
        const fileRead = sandbox.stub(documentIO, 'readFile').rejects(Object.assign(new Error('没有读取权限'), { code: 'NoPermissions' }));
        await assert.rejects(() => provider.checkForUpdates(false), /读取权限/);
        assert.strictEqual(fileRead.callCount, 1);
        assert.strictEqual(state.get('noveler.lastNotifiedVersion'), undefined);
    });
});
