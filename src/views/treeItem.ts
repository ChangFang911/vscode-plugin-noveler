/**
 * TreeView 공용 타입 정의
 * novelerViewProvider와 nodes 사이의 순환 의존성을 방지하기 위해 분리
 */

import * as vscode from 'vscode';
import { VolumeInfo } from '../types/volume';

export enum NodeType {
    Overview = 'overview',
    Actions = 'actions',
    OtherActions = 'otherActions',
    Tools = 'tools',
    Settings = 'settings',
    DoubtMark = 'doubtMark',
    DoubtMarkFile = 'doubtMarkFile',
    DoubtMarkItem = 'doubtMarkItem',
    Chapters = 'chapters',
    Characters = 'characters',
    Outlines = 'outlines',
    References = 'references',

    OverviewItem = 'overviewItem',
    ActionItem = 'actionItem',
    OtherActionItem = 'otherActionItem',
    Volume = 'volume',
    ChapterItem = 'chapterItem',
    CharacterItem = 'characterItem',
    OutlineItem = 'outlineItem',
    ReferenceItem = 'referenceItem',

    InitProject = 'initProject',
    EmptyHint = 'emptyHint',
}

export class NovelerTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly nodeType: NodeType,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly command?: vscode.Command,
        public readonly contextValue?: string,
        public readonly description?: string,
        public readonly tooltip?: string,
        public readonly metadata?: VolumeInfo,
    ) {
        super(label, collapsibleState);
        this.contextValue = contextValue;
        this.description = description;
        this.tooltip = tooltip;
    }

    withIcon(icon: vscode.ThemeIcon): this {
        this.iconPath = icon;
        return this;
    }
}
