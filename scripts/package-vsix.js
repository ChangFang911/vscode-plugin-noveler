const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function cleanReleases(directory, currentVersion) {
    const packages = fs.readdirSync(directory).flatMap(name => {
        const match = /^(?:Noveler|chinese-novel-writer)-(\d+)\.(\d+)\.(\d+)(-[\da-zA-Z.-]+)?\.vsix$/.exec(name);
        if (!match || !fs.statSync(path.join(directory, name)).isFile()) { return []; }
        return [{ name, version: `${match[1]}.${match[2]}.${match[3]}${match[4] || ''}`, numbers: match.slice(1, 4).map(Number), preview: match[4] || '' }];
    });
    packages.sort((a, b) => {
        for (let i = 0; i < 3; i++) {
            if (a.numbers[i] !== b.numbers[i]) { return b.numbers[i] - a.numbers[i]; }
        }
        if (!a.preview || !b.preview) { return a.preview ? 1 : b.preview ? -1 : 0; }
        return b.preview.localeCompare(a.preview, 'en', { numeric: true });
    });
    const versions = [...new Set(packages.map(item => item.version))];
    const keep = new Set([currentVersion, ...versions.filter(version => version !== currentVersion).slice(0, 2)]);
    for (const item of packages) {
        if (!keep.has(item.version)) {
            fs.unlinkSync(path.join(directory, item.name));
            console.log(`清理旧安装包：${item.name}`);
        }
    }
    for (const name of fs.readdirSync(directory)) {
        if (/^(?:Noveler|chinese-novel-writer)-\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?\.vsix\.sha256$/.test(name)
            && fs.statSync(path.join(directory, name)).isFile()) {
            fs.unlinkSync(path.join(directory, name));
        }
    }
}

function main() {
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
    const temporary = path.join('releases', `.Noveler-${manifest.version}-${process.pid}.vsix`);
    fs.mkdirSync(path.join(root, 'releases'), { recursive: true });
    const localVSCE = process.env.NOVELER_VSCE_PATH;
    const command = localVSCE ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
    const args = localVSCE ? [localVSCE, 'package', '--out', temporary]
        : ['--yes', '@vscode/vsce@3.9.2', 'package', '--out', temporary];
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) {
        fs.rmSync(path.join(root, temporary), { force: true });
        if (result.error) { throw result.error; }
        process.exit(result.status ?? 1);
    }
    fs.renameSync(path.join(root, temporary), path.join(root, output));
    cleanReleases(path.join(root, 'releases'), manifest.version);
    console.log(`图标检查通过：${width} × ${height}`);
    console.log(`安装包：${output}（保留最近三个版本，不生成校验文件）`);
}

if (require.main === module) { main(); }
