/**
 * 大纲和参考资料节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { extractFrontMatter } from '../../utils/frontMatterHelper';
import { DRAFTS_FOLDER, REFERENCES_FOLDER } from '../../constants';
import { Logger } from '../../utils/logger';

export class OutlineNodesProvider {
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    async getOutlineItems(): Promise<NovelerTreeItem[]> {
        return this.getMarkdownItems(DRAFTS_FOLDER, NodeType.OutlineItem, '大纲');
    }

    async getReferenceItems(): Promise<NovelerTreeItem[]> {
        return this.getMarkdownItems(REFERENCES_FOLDER, NodeType.ReferenceItem, '参考资料');
    }

    private async getMarkdownItems(
        folderName: string,
        itemNodeType: NodeType,
        itemTypeName: string
    ): Promise<NovelerTreeItem[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        const folderPath = vscode.Uri.joinPath(workspaceFolder.uri, folderName);

        try {
            const files = await vscode.workspace.fs.readDirectory(folderPath);
            const mdFiles = files.filter(([name, type]) => type === vscode.FileType.File && name.endsWith('.md'));

            if (mdFiles.length === 0) {
                return [
                    new NovelerTreeItem(
                        `还没有${itemTypeName}文件`,
                        NodeType.EmptyHint,
                        vscode.TreeItemCollapsibleState.None,
                        undefined,
                        'emptyHint',
                        undefined,
                        `可以在 ${folderName}/ 目录创建 Markdown 文件`
                    ).withIcon(new vscode.ThemeIcon('info')),
                ];
            }

            const items: NovelerTreeItem[] = [];

            for (const [filename] of mdFiles) {
                const filePath = vscode.Uri.joinPath(folderPath, filename);

                try {
                    const content = await vscode.workspace.fs.readFile(filePath);
                    const text = Buffer.from(content).toString('utf8');

                    const title = this.extractTitle(text, filename);

                    const item = new NovelerTreeItem(
                        title,
                        itemNodeType,
                        vscode.TreeItemCollapsibleState.None,
                        {
                            command: 'vscode.open',
                            title: `打开${itemTypeName}`,
                            arguments: [filePath],
                        },
                        itemNodeType === NodeType.OutlineItem ? 'outline' : 'reference',
                        undefined,
                        title
                    );
                    item.resourceUri = filePath;
                    items.push(item);
                } catch (error) {
                    Logger.error(`读取${itemTypeName}文件失败 ${filename}`, error);
                }
            }

            return items;
        } catch (error) {
            return [
                new NovelerTreeItem(
                    `未找到 ${folderName} 目录`,
                    itemNodeType,
                    vscode.TreeItemCollapsibleState.None,
                    undefined,
                    undefined,
                    undefined,
                    '请先运行 "Noveler: 初始化小说项目"'
                ),
            ];
        }
    }

    private extractTitle(text: string, filename: string): string {
        const frontMatter = extractFrontMatter({ getText: () => text } as vscode.TextDocument);

        if (frontMatter.title) {
            return String(frontMatter.title).trim();
        }

        const headingMatch = text.match(OutlineNodesProvider.FIRST_HEADING_REGEX);
        if (headingMatch) {
            return headingMatch[1].trim();
        }

        return filename.replace('.md', '');
    }
}
