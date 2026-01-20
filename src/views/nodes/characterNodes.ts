/**
 * 人物节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { extractFrontMatter } from '../../utils/frontMatterHelper';
import { CHARACTERS_FOLDER } from '../../constants';
import { Logger } from '../../utils/logger';

export class CharacterNodesProvider {
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    async getItems(): Promise<NovelerTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
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
                        '💡 还没有人物，点击右侧 ➕ 创建',
                        NodeType.EmptyHint,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        'emptyHint',
                        undefined,
                        '点击人物管理标题右侧的 ➕ 按钮创建你的第一个人物'
                    ),
                ];
            }

            const items: NovelerTreeItem[] = [];

            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(folderPath, filename);

                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    const name = this.extractCharacterName(text, filename);
                    const role = this.extractCharacterRole(text);

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
                        role || undefined,
                        `${name}${role ? `\n角色：${role}` : ''}`
                    );
                    item.resourceUri = filePath;
                    items.push(item);
                } catch (error) {
                    Logger.error(`读取人物文件失败 ${filename}`, error);
                }
            }

            return items;
        } catch (error) {
            return [
                new NovelerTreeItem(
                    '未找到 characters 目录',
                    NodeType.CharacterItem,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先运行 "Noveler: 初始化小说项目"'
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

    private extractCharacterRole(text: string): string {
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);
        if (frontMatter.role) {
            return String(frontMatter.role).trim();
        }
        return '';
    }
}
