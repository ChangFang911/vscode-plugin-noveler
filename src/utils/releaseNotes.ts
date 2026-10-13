export interface ReleaseNotes {
    version: string;
    date?: string;
    changes: { title: string; items: string[] }[];
}

export function compareVersions(left: string, right: string): number | undefined {
    const parse = (value: string) => /^(\d+)\.(\d+)\.(\d+)(?:-([\da-zA-Z.-]+))?(?:\+[\da-zA-Z.-]+)?$/.exec(value);
    const a = parse(left), b = parse(right);
    if (!a || !b) { return undefined; }
    for (let index = 1; index <= 3; index++) {
        const difference = Number(a[index]) - Number(b[index]);
        if (difference) { return Math.sign(difference); }
    }
    if (a[4] === b[4]) { return 0; }
    if (!a[4]) { return 1; }
    if (!b[4]) { return -1; }
    const partsA = a[4].split('.'), partsB = b[4].split('.');
    for (let index = 0; index < Math.max(partsA.length, partsB.length); index++) {
        const x = partsA[index], y = partsB[index];
        if (x === undefined) { return -1; }
        if (y === undefined) { return 1; }
        if (x === y) { continue; }
        const numericX = /^\d+$/.test(x), numericY = /^\d+$/.test(y);
        if (numericX && numericY) { return Math.sign(Number(x) - Number(y)); }
        if (numericX !== numericY) { return numericX ? -1 : 1; }
        return x < y ? -1 : 1;
    }
    return 0;
}

export function parseReleaseNotes(markdown: string): ReleaseNotes[] {
    const releases: ReleaseNotes[] = [];
    let release: ReleaseNotes | undefined;
    let category: string | undefined;
    let fenced = false;
    for (const line of markdown.split(/\r?\n/)) {
        if (/^\s*(```|~~~)/.test(line)) { fenced = !fenced; continue; }
        if (fenced) { continue; }
        const heading = /^##\s+\[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/.exec(line);
        if (heading) {
            category = undefined;
            release = heading[1] === 'Unreleased' || compareVersions(heading[1], heading[1]) === 0
                ? { version: heading[1], date: heading[2], changes: [] } : undefined;
            if (release) { releases.push(release); }
            continue;
        }
        const section = /^###\s+(.+)/.exec(line);
        if (section) {
            const title = section[1];
            category = /文档|测试|技术|代码|架构|文件|效果/.test(title) ? undefined
                : /新增|新功能/.test(title) ? '新增'
                    : /修复|bug/i.test(title) ? '修复'
                        : /优化|改进|增强|变更|移除/.test(title) ? '优化' : undefined;
            continue;
        }
        const item = /^(\s*)[-*]\s+(.+)/.exec(line);
        if (release && category && item) {
            let group = release.changes.find(change => change.title === category);
            if (!group) { group = { title: category, items: [] }; release.changes.push(group); }
            if (item[1] && group.items.length) {
                group.items[group.items.length - 1] += '\n' + item[2];
            } else {
                group.items.push(item[2]);
            }
        }
    }
    return releases;
}

export function getReleaseUpdates(releases: ReleaseNotes[], previous: string | undefined, current: string): ReleaseNotes[] {
    return releases.filter(release => {
        const upper = compareVersions(release.version, current);
        const lower = previous ? compareVersions(release.version, previous) : undefined;
        return upper !== undefined && upper <= 0 && release.changes.length > 0
            && (lower === undefined ? upper === 0 : lower > 0);
    }).sort((a, b) => compareVersions(b.version, a.version) ?? 0);
}

export function escapeReleaseText(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function renderReleaseNotes(releases: ReleaseNotes[], heading = '版本更新'): string {
    const inline = (text: string) => escapeReleaseText(text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'))
        .replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    const renderItem = (item: string, full: boolean) => {
        const [summary, ...details] = item.split('\n');
        return `<li>${inline(summary)}${full && details.length
            ? `<ul class="change-details">${details.map(detail => `<li>${inline(detail)}</li>`).join('')}</ul>` : ''}</li>`;
    };
    const renderChanges = (release: ReleaseNotes, full: boolean) => release.changes.map(change =>
        `<h3>${escapeReleaseText(change.title)}</h3><ul>${(full ? change.items : change.items.slice(0, 3))
            .map(item => renderItem(item, full)).join('')}</ul>`).join('');
    return `<section class="release-notes" id="release-notes"><h2>${escapeReleaseText(heading)}</h2>
        ${releases.length ? releases.map((release, index) => `<details ${index === 0 ? 'open' : ''}>
            <summary>${release.version === 'Unreleased' ? '未发布（开发预览）' : `v${escapeReleaseText(release.version)}`}${release.date ? ` · ${escapeReleaseText(release.date)}` : ''}</summary>
            ${renderChanges(release, false)}
            ${release.changes.some(change => change.items.length > 3 || change.items.some(item => item.includes('\n')))
                ? `<details class="release-details"><summary>查看完整改动（${release.changes.reduce((count, change) => count + change.items.length, 0)} 项）</summary>${renderChanges(release, true)}</details>` : ''}
        </details>`).join('') : '<p>暂无可展示的版本更新。</p>'}</section>`;
}
