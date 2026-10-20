import { Node, Parser } from 'commonmark';
import YAML from 'yaml';
import { Manuscript, ExportFile, ManuscriptError } from '../types/manuscript';

export function parseChapterSource(text: string): { attributes: Record<string, unknown>; body: string } {
    const match = /^\uFEFF?---[^\S\r\n]*\r?\n([\s\S]*?)^---[^\S\r\n]*(?:\r?\n|$)/m.exec(text);
    if (!match || match.index !== 0) { throw new Error('章节属性缺失或未闭合，请修复章节号和属性'); }
    const parsed = YAML.parseDocument(match[1]);
    if (parsed.errors.length || !YAML.isMap(parsed.contents)) { throw new Error('章节属性格式无效'); }
    const attributes = parsed.toJSON() as Record<string, unknown>;
    if (!Number.isSafeInteger(attributes.chapter) || Number(attributes.chapter) <= 0) {
        throw new Error('章节号必须为正整数，请修复章节属性中的 chapter');
    }
    return { attributes, body: text.slice(match[0].length) };
}

export function markdownToText(markdown: string, indentParagraphs = false): { title?: string; body: string; warnings: string[] } {
    const source = markdown.replace(/\r\n?/g, '\n');
    const tree = new Parser().parse(source);
    const warnings = new Set<string>();
    const lines = source.split('\n');
    const checkedLines = lines.slice();
    const walker = tree.walker();
    let event;
    while ((event = walker.next())) {
        if (event.entering && event.node.type === 'code_block') {
            for (let line = event.node.sourcepos[0][0] - 1; line < event.node.sourcepos[1][0]; line++) {
                checkedLines[line] = ' '.repeat(checkedLines[line].length);
            }
        }
    }
    const checked = checkedLines.join('\n');
    for (let index = 0; index < checked.length;) {
        if (checked[index] === '\\') { index += 2; continue; }
        if (checked.startsWith('<!--', index)) {
            const end = checked.indexOf('-->', index + 4);
            if (end < 0) { throw new Error('正文存在未闭合注释，请修复后导出'); }
            index = end + 3;
        } else if (checked[index] === '`') {
            const start = index;
            while (checked[index] === '`') { index++; }
            const length = index - start;
            const runs = /`+/g;
            runs.lastIndex = index;
            let closing;
            while ((closing = runs.exec(checked))) {
                if (closing[0].length === length) { index = runs.lastIndex; break; }
            }
        } else { index++; }
    }
    function render(node: Node): string {
        const children = () => {
            const result: string[] = [];
            for (let child = node.firstChild; child; child = child.next) { result.push(render(child)); }
            return result.join('');
        };
        switch (node.type) {
            case 'text': case 'code': return node.literal || '';
            case 'code_block': {
                const original = lines.slice(node.sourcepos[0][0] - 1, node.sourcepos[1][0]);
                const fenced = /^[ \t]{0,3}(?:`{3,}|~{3,})/.test(original[0]);
                return (fenced ? node.literal || '' : original.join('\n')).replace(/\n+$/, '') + '\n\n';
            }
            case 'softbreak': case 'linebreak': return '\n';
            case 'html_inline': case 'html_block': {
                const literal = node.literal || '';
                if (/<!--\?/.test(literal)) { warnings.add('存在未处理待办，导出时隐藏标记'); }
                const visible = literal.replace(/<!--[\s\S]*?-->/g, '');
                if (!visible.trim()) { return ''; }
                if (/^<br\s*\/?\s*>$/i.test(visible)) { return '\n'; }
                if (/<\/?[a-z]/i.test(visible)) { warnings.add('HTML 内容按原文保留'); }
                return visible + (node.type === 'html_block' ? '\n\n' : '');
            }
            case 'image': warnings.add('图片仅保留说明文字，TXT 不包含图片'); return children();
            case 'thematic_break': return lines[node.sourcepos[0][0] - 1].trim() + '\n\n';
            case 'paragraph': {
                let content = children();
                if (node.parent?.type === 'document') {
                    const original = lines.slice(node.sourcepos[0][0] - 1, node.sourcepos[1][0]);
                    const rendered = content.split('\n');
                    const table = /^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(original.join('\n'));
                    const image = node.firstChild?.type === 'image' && !node.firstChild.next;
                    content = rendered.map((line, index) => {
                        if (indentParagraphs && !table && !image) {
                            return line.trim() ? '　　' + line.replace(/^[^\S\r\n]*/, '') : '';
                        }
                        if (index > 0 && rendered.length !== original.length) { return line; }
                        const indent = original[index]?.match(/^[^\S\r\n]*/)?.[0] || '';
                        return indent + line.replace(/^[^\S\r\n]*/, '');
                    }).join('\n');
                }
                return content + '\n\n';
            }
            case 'heading': return children() + '\n\n';
            case 'item': {
                const list = node.parent;
                let index = list?.listStart || 1;
                for (let previous = node.prev; previous; previous = previous.prev) { index++; }
                const marker = list?.listType === 'ordered' ? `${index}${list.listDelimiter || '.'} ` : '• ';
                return marker + children().replace(/\n+$/, '') + '\n';
            }
            case 'list': return children() + '\n';
            default: return children();
        }
    }
    let title: string | undefined;
    let firstVisible = true;
    const result: string[] = [];
    for (let node = tree.firstChild; node; node = node.next) {
        const rendered = render(node);
        if (firstVisible && node.type === 'heading' && node.level === 1) {
            title = rendered.trim();
        } else {
            result.push(rendered);
        }
        if (rendered.trim()) { firstVisible = false; }
    }
    if (/^\s*\|?.+\|.+\n\s*\|?\s*:?-{3,}/m.test(checked)) {
        warnings.add('表格按文字保留，TXT 不保留表格排版');
    }
    const body = result.join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
    return { title, body, warnings: [...warnings] };
}

export function exportFileName(value: string): string {
    const cleaned = Array.from(value).filter(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
        .join('').replace(/[<>:"/\\|?*]/g, '').trim().replace(/[. ]+$/g, '');
    const letters = Array.from(cleaned).slice(0, 70);
    while (Buffer.byteLength(letters.join(''), 'utf8') > 180) { letters.pop(); }
    const short = letters.join('');
    return !short || /^\.+$/.test(short) ? '未命名小说'
        : /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(short) ? `小说-${short}` : short;
}

export function validateExportFolderName(value: string): string | undefined {
    if (!value.trim()) { return '请输入文件夹名称'; }
    if (value !== value.trim() || value !== exportFileName(value)) { return '名称不能含特殊字符、首尾空格或句点，最长 70 个字符'; }
    return undefined;
}

export function renderManuscriptTxt(book: Manuscript): { files: (ExportFile & { content: string })[]; warnings: string[] } {
    const parts = [book.title];
    const warnings: string[] = [];
    for (const volume of book.volumes) {
        if (volume.title) { parts.push(volume.title); }
        for (const chapter of volume.chapters) {
            try {
                const converted = markdownToText(chapter.body, true);
                parts.push(chapter.title, converted.body);
                for (const message of converted.warnings) { warnings.push(`${chapter.title}：${message}`); }
                if (!converted.body.trim()) { warnings.push(`${chapter.title}：正文为空`); }
            } catch (error) {
                throw new ManuscriptError(`${chapter.title}：${String(error)}`, chapter.source);
            }
        }
    }
    return { files: [{ name: `${exportFileName(book.title)}.txt`, content: parts.filter(Boolean).join('\n\n') + '\n' }], warnings };
}
