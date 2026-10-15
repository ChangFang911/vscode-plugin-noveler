import { documentIO } from '../../utils/documentOperations';
import { getCharacterAliases } from '../../utils/characterAliases';
/**
 * 人物节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { extractFrontMatter } from '../../utils/frontMatterHelper';
import { CHARACTERS_FOLDER, IMPORTANCE_ORDER, CHARACTER_IMPORTANCE_ICONS } from '../../constants';
import { Logger } from '../../utils/logger';

export class CharacterNodesProvider {
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    private latestItems: Promise<NovelerTreeItem[]> = Promise.resolve([]);

    async getItems(): Promise<NovelerTreeItem[]> {
        this.latestItems = this.loadItems();
        let pending: Promise<NovelerTreeItem[]>;
        let items: NovelerTreeItem[];
        do {
            pending = this.latestItems;
            items = await pending;
        } while (pending !== this.latestItems);
        return items;
    }

    private async loadItems(): Promise<NovelerTreeItem[]> {
        const workspaceFolder = documentIO.workspaceFolder();
        if (!workspaceFolder) {
            return [];
        }

        const folderPath = vscode.Uri.joinPath(workspaceFolder.uri, CHARACTERS_FOLDER);

        try {
            const files = await vscode.workspace.fs.readDirectory(folderPath);
            const mdFiles = files.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));

            if (mdFiles.length === 0) {
                return [
                    new NovelerTreeItem(
                        '创建第一个人物',
                        NodeType.EmptyHint,
                        vscode.TreeItemCollapsibleState.None,
                        { command: 'noveler.createCharacter', title: '创建第一个人物' },
                        'emptyHint',
                        undefined,
                        '点击创建人物档案'
                    ).withIcon(new vscode.ThemeIcon('info')),
                ];
            }

            const items: { item: NovelerTreeItem; priority: number; filename: string }[] = [];

            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(folderPath, filename);

                try {
                    const document = vscode.workspace.textDocuments.find(doc => doc.uri.toString() === filePath.toString());
                    const text = document ? document.getText()
                        : Buffer.from(await documentIO.readFile(filePath)).toString('utf8');
                    const aliases = getCharacterAliases(text);

                    const name = this.extractCharacterName(text, filename);
                    const data = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
                    const role = data.role ? String(data.role).trim() : '';
                    const importance = typeof data.importance === 'string' ? data.importance.trim() : '';
                    const priority = IMPORTANCE_ORDER[importance];

                    const item = new NovelerTreeItem(
                        name,
                        NodeType.CharacterItem,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'vscode.open',
                            title: '打开人物档案',
                            arguments: [filePath],
                        },
                        'character',
                        undefined,
                        `${name}\n定位：${importance || '未设置'}${role ? `\n身份：${role}` : ''}${aliases.length ? `\n别名：${aliases.join('、')}` : ''}`
                    );
                    item.resourceUri = filePath;
                    item.id = filePath.toString();
                    const icon = CHARACTER_IMPORTANCE_ICONS[importance];
                    item.iconPath = new vscode.ThemeIcon(typeof icon === 'string' ? icon : 'person');
                    items.push({ item, priority: typeof priority === 'number' ? priority : 99, filename });
                } catch (error) {
                    Logger.error(`读取人物文件失败 ${filename}`, error);
                }
            }

            return items.sort((a, b) => a.priority - b.priority
                || a.item.label.localeCompare(b.item.label, 'zh-CN')
                || a.filename.localeCompare(b.filename, 'zh-CN')).map(entry => entry.item);
        } catch (error) {
            return [
                new NovelerTreeItem(
                    '未找到 characters 目录',
                    NodeType.CharacterItem,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先在侧栏点击“新建小说项目”'
                ),
            ];
        }
    }

    private extractCharacterName(text: string, filename: string): string {
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);

        if (frontMatter.name) {
            return String(frontMatter.name).trim();
        }

        const headingMatch = text.match(CharacterNodesProvider.FIRST_HEADING_REGEX);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        return filename.replace('.md', '');
    }

}
