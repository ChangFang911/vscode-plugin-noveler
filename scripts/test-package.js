const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'noveler-package-test-'));
function run(command, args, env = process.env) {
    const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
    if (result.error) { throw result.error; }
    if (result.status !== 0) { throw new Error(`${command} 运行失败，退出码 ${result.status}，信号 ${result.signal}`); }
}
try {
    const archive = path.join(temporary, 'Noveler-test.vsix');
    const vsce = process.env.NOVELER_VSCE_PATH;
    run(vsce ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx',
        vsce ? [vsce, 'package', '--out', archive] : ['--yes', '@vscode/vsce@3.9.2', 'package', '--out', archive]);
    run('unzip', ['-q', archive, '-d', temporary]);
    for (const version of ['', '0.3.0', '0.6.1']) {
        console.log(`验证打包插件：${version ? '升级配置 ' + version : '全新项目'}`);
        run(process.execPath, [path.join(root, 'out/test/runTest.js')], {
            ...process.env,
            NOVELER_TEST_EXTENSION_PATH: path.join(temporary, 'extension'),
            NOVELER_TEST_SMOKE_ONLY: '1',
            NOVELER_TEST_LEGACY_VERSION: version
        });
    }
} finally {
    fs.rmSync(temporary, { recursive: true, force: true });
}
