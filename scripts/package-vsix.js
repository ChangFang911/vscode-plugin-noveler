const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const icon = fs.readFileSync(path.join(root, manifest.icon));
if (!icon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || icon.length < 24) {
    throw new Error('插件图标必须为有效的 PNG 文件');
}
const width = icon.readUInt32BE(16);
const height = icon.readUInt32BE(20);
if (!width || !height || width > 1024 || height > 1024) {
    throw new Error(`插件图标为 ${width} × ${height}，发布上限为 1024 × 1024，请先缩小原图`);
}
if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(manifest.version)) {
    throw new Error('插件版本号无效');
}
const output = path.join('releases', `Noveler-${manifest.version}.vsix`);
fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
const localVSCE = process.env.NOVELER_VSCE_PATH;
const command = localVSCE ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = localVSCE ? [localVSCE, 'package', '--out', output]
    : ['--yes', '@vscode/vsce@3.9.2', 'package', '--out', output];
const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
if (result.error) { throw result.error; }
if (result.status !== 0) { process.exit(result.status ?? 1); }
const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, output))).digest('hex');
fs.writeFileSync(path.join(root, output + '.sha256'), `${digest}  ${path.basename(output)}\n`);
console.log(`安装包：${output}`);
