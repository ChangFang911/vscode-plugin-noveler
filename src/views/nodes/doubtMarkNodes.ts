/**
 * 疑问标记 TreeView 节点提供器
 */

import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../treeItem';
import { DoubtMarkService, DoubtMark } from '../../services/doubtMarkService';

/** 扩展 NovelerTreeItem，携带标记数据和文件 URI 供命令处理 */
export class DoubtMarkTreeItem extends NovelerTreeItem {
    constructor(
        label: string,
        nodeType: NodeType,
        collapsibleState: vscode.TreeItemCollapsibleState,
        command?: vscode.Command,
        contextValue?: string,
        description?: string,
        tooltip?: string,
        public readonly mark?: DoubtMark,
        public readonly fileUriStr?: string,  // 文件分组节点使用，用于 URI 精确匹配
    ) {
        super(label, nodeType, collapsibleState, command, contextValue, description, tooltip);
    }
}

export class DoubtMarkNodesProvider {
    private filterUnresolvedOnly = false;

    constructor(private service: DoubtMarkService) {}

    setFilter(unresolvedOnly: boolean): void {
        this.filterUnresolvedOnly = unresolvedOnly;
    }

    isFilterUnresolvedOnly(): boolean {
        return this.filterUnresolvedOnly;
    }

    /** 根节点 */
    getRootNode(): DoubtMarkTreeItem {
        const total = this.service.getTotalCount();
        const unresolved = this.service.getUnresolvedCount();
        const desc = total === 0
            ? '暂无待办'
            : unresolved > 0
                ? `${unresolved} 待处理 / ${total} 总计`
                : `全部已完成 (${total})`;
        const icon = unresolved > 0
            ? new vscode.ThemeIcon('question')
            : new vscode.ThemeIcon('pass');

        const node = new DoubtMarkTreeItem(
            '写作待办',
            NodeType.DoubtMark,
            vscode.TreeItemCollapsibleState.Collapsed,
            undefined,
            'doubtMarkRoot',
            desc,
            this.filterUnresolvedOnly ? '当前仅显示待处理项（右键切换）' : '右键可切换筛选模式'
        );
        node.iconPath = icon;
        return node;
    }

    /** 文件分组节点 */
    getFileGroupNodes(): DoubtMarkTreeItem[] {
        const byFile = this.service.getMarksByFile();
        const nodes: DoubtMarkTreeItem[] = [];

        for (const [uriStr, marks] of byFile) {
            const visible = this.filterUnresolvedOnly
                ? marks.filter(m => !m.resolved)
                : marks;
            if (visible.length === 0) { continue; }

            const unresolved = visible.filter(m => !m.resolved).length;
            const desc = unresolved > 0 ? `${unresolved} 待处理` : '全部已完成';
            const icon = unresolved > 0
                ? new vscode.ThemeIcon('warning')
                : new vscode.ThemeIcon('check');

            const node = new DoubtMarkTreeItem(
                marks[0].fileName,
                NodeType.DoubtMarkFile,
                vscode.TreeItemCollapsibleState.Expanded,
                undefined,
                'doubtMarkFile',
                desc,
                undefined,
                undefined,
                uriStr  // 存储 URI 字符串用于精确匹配
            );
            node.iconPath = icon;
            nodes.push(node);
        }

        // 无标记时显示操作引导
        if (nodes.length === 0) {
            const hint = new DoubtMarkTreeItem(
                '还没有写作待办',
                NodeType.EmptyHint,
                vscode.TreeItemCollapsibleState.None,
                undefined,
                'emptyHint',
                'Ctrl+Shift+/ 添加',
                '在任意 Markdown 文件中，将光标移到需要标记的位置，\n按 Ctrl+Shift+/ 即可添加写作待办'
            );
            hint.iconPath = new vscode.ThemeIcon('info');
            return [hint];
        }

        return nodes.sort((a, b) =>
            (a.label as string).localeCompare(b.label as string)
        );
    }

    /** 某个文件分组下的标记条目 */
    getMarkItemNodes(fileNode: DoubtMarkTreeItem): DoubtMarkTreeItem[] {
        // 优先用 URI 精确匹配，fileNode.fileUriStr 由 getFileGroupNodes 写入
        const byFile = this.service.getMarksByFile();
        const fileMarks = fileNode.fileUriStr
            ? byFile.get(fileNode.fileUriStr)
            : undefined;

        if (!fileMarks) { return []; }

        const visible = this.filterUnresolvedOnly
            ? fileMarks.filter(m => !m.resolved)
            : fileMarks;

        return visible.map(mark => {
            const label = mark.content.length > 50
                ? mark.content.slice(0, 50) + '…'
                : mark.content;

            const node = new DoubtMarkTreeItem(
                label,
                NodeType.DoubtMarkItem,
                vscode.TreeItemCollapsibleState.None,
                {
                    command: 'noveler.jumpToDoubtMark',
                    title: '跳转到标记',
                    arguments: [mark],
                },
                mark.resolved ? 'doubtMarkItemResolved' : 'doubtMarkItem',
                `第 ${mark.lineNumber + 1} 行`,
                `${mark.resolved ? '✓ 已完成' : '○ 待处理'}\n第 ${mark.lineNumber + 1} 行\n${mark.content}`,
                mark
            );
            node.iconPath = mark.resolved
                ? new vscode.ThemeIcon('pass')
                : new vscode.ThemeIcon('circle-outline');

            return node;
        });
    }
}
