import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

async function main() {
    if (process.platform === 'darwin' && process.env.CODEX_SANDBOX === 'seatbelt') {
        console.error('无法在当前 macOS 受限沙箱中启动 VS Code 图形测试宿主。请从桌面终端运行 npm test；当前环境可运行 npm run test:unit。此次未启动扩展宿主，测试未执行。');
        process.exitCode = 1;
        return;
    }
    const workspace = await mkdtemp(path.join(tmpdir(), 'noveler-tests-'));
    try {
        await mkdir(path.join(workspace, '.vscode'));
        await writeFile(path.join(workspace, '.vscode', 'settings.json'), JSON.stringify({
            'workbench.localHistory.enabled': false,
            'files.autoSave': 'off'
        }));
        if (process.env.NOVELER_TEST_LEGACY_VERSION) {
            await writeFile(path.join(workspace, 'novel.jsonc'), `{
 // 打包升级验证备注
 "version": ${JSON.stringify(process.env.NOVELER_TEST_LEGACY_VERSION)},
 "custom": "必须保留",
 "noveler": {"targetWords":{"default":4321},"paragraphIndent":{"value":false},
 "sensitiveWords":{"levels":{"high":false,"medium":true}}}
}`);
        }
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = process.env.NOVELER_TEST_EXTENSION_PATH || path.resolve(__dirname, '../../');

        // The path to the extension test script
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip it and run the integration test
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            vscodeExecutablePath: process.env.NOVELER_TEST_VSCODE_EXECUTABLE,
            extensionTestsEnv: { NOVELER_TEST_WORKSPACE: workspace },
            launchArgs: [workspace, '--disable-extensions', '--skip-welcome', '--skip-release-notes']
        });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exitCode = 1;
    } finally {
        await rm(workspace, { recursive: true, force: true });
    }
}

main();
