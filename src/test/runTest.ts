import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';

async function main() {
    const workspace = await mkdtemp(path.join(tmpdir(), 'noveler-tests-'));
    try {
        await mkdir(path.join(workspace, '.vscode'));
        await writeFile(path.join(workspace, '.vscode', 'settings.json'), JSON.stringify({
            'workbench.localHistory.enabled': false,
            'files.autoSave': 'off'
        }));
        // The folder containing the Extension Manifest package.json
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

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
