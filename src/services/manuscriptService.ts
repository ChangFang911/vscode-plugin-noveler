import * as vscode from 'vscode';
import { createHash } from 'crypto';
import { TextDecoder } from 'util';
import { Manuscript, ManuscriptChapter, ManuscriptError, ManuscriptVolume } from '../types/manuscript';
import { VolumeService } from './volumeService';
import { isChapterFile, compareChapterOrder, convertToRomanNumber } from '../utils/volumeHelper';
import { convertToChineseNumber } from '../utils/chineseNumber';
import { VOLUME_TYPE_NAMES, VOLUME_TYPE_OFFSETS } from '../constants';
import { markdownToText, parseChapterSource } from '../utils/manuscriptText';
import { parseJsoncObject } from '../utils/settingsHelper';
import { documentIO } from '../utils/documentOperations';

export function checkExportCancelled(token?: vscode.CancellationToken): void {
    if (token?.isCancellationRequested) { throw new vscode.CancellationError(); }
}

export async function readManuscript(root: vscode.Uri, token?: vscode.CancellationToken,
    report?: (message: string) => void): Promise<{ book: Manuscript; assertUnchanged: () => Promise<void> }> {
    const files = new Map<string, string>();
    const directories = new Map<string, string>();
    const digest = (text: string) => createHash('sha256').update(text).digest('hex');
    async function currentText(uri: vscode.Uri): Promise<string> {
        const stat = await documentIO.stat(uri);
        if (stat.type !== vscode.FileType.File) { throw new Error('不是普通文件'); }
        const document = vscode.workspace.textDocuments.find(item => item.uri.toString() === uri.toString());
        if (document?.isDirty) { return document.getText(); }
        const bytes = await vscode.workspace.fs.readFile(uri);
        try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch { throw new Error('文件不是有效的 UTF-8 文本，请检查文件编码后重试'); }
    }
    async function read(uri: vscode.Uri): Promise<string> {
        checkExportCancelled(token);
        try {
            const text = await currentText(uri);
            files.set(uri.toString(), digest(text));
            return text;
        } catch (error) {
            throw new ManuscriptError(`无法读取 ${uri.fsPath}：${error instanceof Error ? error.message : String(error)}`, uri.toString());
        }
    }
    const signature = (entries: [string, vscode.FileType][]) => JSON.stringify(entries.slice().sort(([a], [b]) => a.localeCompare(b)));
    async function directory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
        checkExportCancelled(token);
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            const previous = directories.get(uri.toString());
            if (previous !== undefined && previous !== signature(entries)) { throw new Error('目录已变化'); }
            directories.set(uri.toString(), signature(entries));
            return entries;
        } catch {
            throw new ManuscriptError(`无法读取目录：${uri.fsPath}`, uri.toString());
        }
    }
    const configUri = vscode.Uri.joinPath(root, 'novel.jsonc');
    let config: Record<string, unknown>;
    try { config = parseJsoncObject(await read(configUri)); }
    catch (error) { if (error instanceof vscode.CancellationError) { throw error; } throw new ManuscriptError(`小说配置无法读取或格式无效：${String(error)}`, configUri.toString()); }
    const settings = config.noveler as Record<string, unknown> | undefined;
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
        throw new ManuscriptError('小说配置缺少有效的 noveler 设置', configUri.toString());
    }
    const volumes = (settings.volumes ?? {}) as Record<string, unknown>;
    if (!volumes || typeof volumes !== 'object' || Array.isArray(volumes)
        || (volumes.enabled !== undefined && typeof volumes.enabled !== 'boolean')
        || (volumes.folderStructure !== undefined && !['flat', 'nested'].includes(String(volumes.folderStructure)))
        || (volumes.numberFormat !== undefined && !['arabic', 'chinese', 'roman'].includes(volumes.numberFormat as string))
        || (volumes.chapterNumbering !== undefined && !['global', 'volume', 'mixed'].includes(String(volumes.chapterNumbering)))) {
        throw new ManuscriptError('分卷配置无效，请检查组织方式和编号设置', configUri.toString());
    }
    const nested = volumes.enabled === true && volumes.folderStructure === 'nested';
    const numbering = volumes.chapterNumbering ?? 'volume';
    const chaptersRoot = vscode.Uri.joinPath(root, 'chapters');
    const candidates: vscode.Uri[] = [];
    const rootEntries = await directory(chaptersRoot);
    async function walk(folder: vscode.Uri, entries: [string, vscode.FileType][]): Promise<void> {
        for (const [name, type] of entries) {
            const uri = vscode.Uri.joinPath(folder, name);
            if ((type & vscode.FileType.SymbolicLink) !== 0) {
                throw new ManuscriptError(`章节目录包含链接，请改为实际章节文件：${uri.fsPath}`, uri.toString());
            }
            if (type === vscode.FileType.Directory) { await walk(uri, await directory(uri)); }
            else if (type === vscode.FileType.File && isChapterFile(name)) { candidates.push(uri); }
        }
    }
    await walk(chaptersRoot, rootEntries);
    const volumeByFolder = new Map<string, ManuscriptVolume>();
    const seen = new Map<string, Set<number>>();
    for (const uri of candidates) {
        checkExportCancelled(token);
        report?.(`读取章节：${uri.path.split('/').pop()}`);
        const relative = uri.path.slice(chaptersRoot.path.length + 1).split('/');
        if ((!nested && relative.length !== 1) || (nested && relative.length !== 2)) {
            throw new ManuscriptError(`章节未按当前组织方式归属，请先整理：${relative.join('/')}`, uri.toString());
        }
        const key = nested ? relative[0] : '';
        let volume = volumeByFolder.get(key);
        if (!volume) {
            if (nested) {
                const identity = VolumeService.getInstance().parseVolumeName(key);
                if (!identity) { throw new ManuscriptError(`无法识别章节所属卷：${key}`, uri.toString()); }
                volume = { title: identity.title, number: identity.volume, type: identity.volumeType, chapters: [] };
                const metadata = rootEntries.find(([name, type]) => name === key && type === vscode.FileType.Directory);
                if (!metadata) { throw new ManuscriptError(`卷目录已变化：${key}`, uri.toString()); }
                const folderUri = vscode.Uri.joinPath(chaptersRoot, key);
                const entries = await directory(folderUri);
                if (entries.some(([name]) => name === 'volume.json')) {
                    const metadataUri = vscode.Uri.joinPath(folderUri, 'volume.json');
                    try {
                        const data = JSON.parse(await read(metadataUri));
                        if (!data || typeof data !== 'object' || Array.isArray(data)
                            || (data.title !== undefined && typeof data.title !== 'string')) { throw new Error('卷属性格式无效'); }
                        if (data.title?.trim()) { volume.title = data.title.trim(); }
                    } catch (error) { throw new ManuscriptError(`卷属性无法读取：${String(error)}`, metadataUri.toString()); }
                }
                const number = Math.abs(identity.volume) - VOLUME_TYPE_OFFSETS[identity.volumeType];
                const label = volumes.numberFormat === 'chinese' ? convertToChineseNumber(number)
                    : volumes.numberFormat === 'roman' ? convertToRomanNumber(number) : String(number);
                const prefix = identity.volumeType === 'main' ? `第${label}卷` : `${VOLUME_TYPE_NAMES[identity.volumeType]}${label}`;
                volume.title = `${prefix} ${volume.title}`;
            } else { volume = { chapters: [] }; }
            volumeByFolder.set(key, volume);
        }
        try {
            const { attributes, body } = parseChapterSource(await read(uri));
            const number = attributes.chapter as number;
            const domain = !nested || numbering === 'global' ? 'global'
                : numbering === 'mixed' && volume.type === 'main' ? 'main' : key;
            const numbers = seen.get(domain) ?? new Set<number>();
            if (numbers.has(number)) { throw new Error(`编号范围内存在重复章节号：第 ${number} 章`); }
            numbers.add(number);
            seen.set(domain, numbers);
            const fallback = typeof attributes.title === 'string' && attributes.title.trim()
                ? attributes.title.trim() : relative[relative.length - 1].replace(/\.md$/i, '');
            const title = markdownToText(body).title || (/^第\S+章/.test(fallback) ? fallback : `第${number}章 ${fallback}`);
            volume.chapters.push({ number, title, body, attributes, source: uri.toString() });
        } catch (error) {
            if (error instanceof vscode.CancellationError) { throw error; }
            throw new ManuscriptError(`${relative.join('/')}：${error instanceof Error ? error.message : String(error)}`, uri.toString());
        }
    }
    if (!candidates.length) { throw new ManuscriptError('没有可导出的章节，请先创建章节'); }
    const ordered = [...volumeByFolder.values()];
    const typeOrder = { prequel: 0, main: 1, sequel: 2, extra: 3 };
    ordered.sort((a, b) => (typeOrder[a.type ?? 'main'] - typeOrder[b.type ?? 'main'])
        || (a.number ?? 0) - (b.number ?? 0) || (a.title ?? '').localeCompare(b.title ?? ''));
    for (const volume of ordered) {
        volume.chapters.sort((a: ManuscriptChapter, b: ManuscriptChapter) => compareChapterOrder(
            { number: a.number, name: a.source }, { number: b.number, name: b.source }));
    }
    const book: Manuscript = {
        title: typeof config.name === 'string' && config.name.trim() ? config.name.trim() : root.path.split('/').pop() || '未命名小说',
        volumes: ordered
    };
    return {
        book,
        assertUnchanged: async () => {
            for (const [source, hash] of files) {
                checkExportCancelled(token);
                try {
                    if (digest(await currentText(vscode.Uri.parse(source))) !== hash) { throw new Error('内容已变化'); }
                } catch { throw new ManuscriptError('原稿或配置在导出期间发生变化，请重新导出', source); }
            }
            for (const [source, entries] of directories) {
                checkExportCancelled(token);
                try {
                    if (signature(await vscode.workspace.fs.readDirectory(vscode.Uri.parse(source))) !== entries) { throw new Error('目录已变化'); }
                } catch { throw new ManuscriptError('章节目录在导出期间发生变化，请重新导出', source); }
            }
        }
    };
}
