# Noveler 修复迭代计划

基于 [PROJECT_ANALYSIS.md](./PROJECT_ANALYSIS.md) 的分析结果，制定以下详细修复计划。

---

## 迭代概览

| 迭代 | 主题 | 时间估算 | 优先级 |
|------|------|----------|--------|
| Sprint 1 | 紧急修复 | 1-2 天 | P0 |
| Sprint 2 | 代码清理 | 3-5 天 | P1 |
| Sprint 3 | 用户体验优化 | 3-5 天 | P1 |
| Sprint 4 | 架构重构 | 1-2 周 | P2 |
| Sprint 5 | 测试覆盖 | 1-2 周 | P2 |

---

## Sprint 1: 紧急修复 (P0)

**目标**: 修复可能导致功能异常的严重问题

### Task 1.1: 配置版本同步
**预计时间**: 15 分钟

**修改文件**:
- `src/constants.ts`

**具体步骤**:
```typescript
// src/constants.ts:155
// 修改前
export const CURRENT_CONFIG_VERSION = '0.6.1';

// 修改后
export const CURRENT_CONFIG_VERSION = '0.6.4';
```

**验证方式**:
1. 删除测试项目的 `novel.jsonc`
2. 重新初始化项目
3. 检查生成的配置文件版本是否为 `0.6.4`

---

### Task 1.2: 修复文档与代码不一致
**预计时间**: 30 分钟

**修改文件**:
- `docs/novel-json配置说明.md`
- `templates/default-config.jsonc`

**具体步骤**:

#### 1.2.1 删除已废弃的 autoSave 配置说明
```markdown
<!-- docs/novel-json配置说明.md -->
<!-- 删除 359-370 行的 autoSave 章节 -->
```

#### 1.2.2 统一 paragraphIndent 默认值描述
```markdown
<!-- docs/novel-json配置说明.md:350 -->
<!-- 修改前 -->
| paragraphIndent | boolean | 自动添加段落缩进 | true |

<!-- 应与 configService.ts:246 保持一致 -->
<!-- configService.ts 中默认是 false -->
```

**决策点**: 需要确认 `paragraphIndent` 的预期默认值：
- 如果希望默认开启：修改 `configService.ts:246` 为 `value: true`
- 如果希望默认关闭：修改 `default-config.jsonc:67` 为 `"value": false`

**验证方式**:
1. 对比文档、模板、代码中的默认值
2. 新建测试项目验证实际行为

---

### Task 1.3: 同步文件操作改异步
**预计时间**: 45 分钟

**修改文件**:
- `src/extension.ts` (addToWhitelist 命令，约 459-504 行)

**具体步骤**:

```typescript
// src/extension.ts - addToWhitelist 命令
// 修改前（同步操作）
context.subscriptions.push(
    vscode.commands.registerCommand('noveler.addToWhitelist', async (word: string) => {
        try {
            const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspaceRoot) {
                vscode.window.showErrorMessage('请先打开一个工作区');
                return;
            }

            const whitelistDir = path.join(workspaceRoot, '.noveler', 'sensitive-words');
            const whitelistPath = path.join(whitelistDir, 'whitelist.json');

            // 确保目录存在（同步）
            if (!fs.existsSync(whitelistDir)) {
                fs.mkdirSync(whitelistDir, { recursive: true });
            }

            // 读取文件（同步）
            let whitelist: WhitelistFile;
            if (fs.existsSync(whitelistPath)) {
                const content = fs.readFileSync(whitelistPath, 'utf-8');
                whitelist = JSON.parse(content);
            } else {
                whitelist = { description: '用户自定义白名单', words: [] };
            }

            // ... 添加词汇逻辑 ...

            // 保存文件（同步）
            fs.writeFileSync(whitelistPath, JSON.stringify(whitelist, null, 2), 'utf-8');
            // ...
        }
    })
);

// 修改后（异步操作）
context.subscriptions.push(
    vscode.commands.registerCommand('noveler.addToWhitelist', async (word: string) => {
        try {
            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('请先打开一个工作区');
                return;
            }

            const whitelistDirUri = vscode.Uri.joinPath(workspaceFolder.uri, '.noveler', 'sensitive-words');
            const whitelistUri = vscode.Uri.joinPath(whitelistDirUri, 'whitelist.jsonc'); // 统一使用 .jsonc

            // 确保目录存在（异步）
            try {
                await vscode.workspace.fs.stat(whitelistDirUri);
            } catch {
                await vscode.workspace.fs.createDirectory(whitelistDirUri);
            }

            // 读取或创建白名单（异步）
            interface WhitelistFile {
                description: string;
                words: string[];
            }

            let whitelist: WhitelistFile;
            try {
                const content = await vscode.workspace.fs.readFile(whitelistUri);
                whitelist = JSON.parse(Buffer.from(content).toString('utf8'));
            } catch {
                whitelist = { description: '用户自定义白名单', words: [] };
            }

            // 检查是否已存在
            if (whitelist.words.includes(word)) {
                vscode.window.showInformationMessage(`"${word}" 已在白名单中`);
                return;
            }

            // 添加词汇
            whitelist.words.push(word);

            // 保存文件（异步）
            const encoder = new TextEncoder();
            await vscode.workspace.fs.writeFile(
                whitelistUri,
                encoder.encode(JSON.stringify(whitelist, null, 2))
            );

            // 重新加载词库
            await sensitiveWordService.reload();

            // 重新检测当前文档
            if (vscode.window.activeTextEditor) {
                sensitiveWordDiagnostic.updateDiagnostics(vscode.window.activeTextEditor.document);
            }

            vscode.window.showInformationMessage(`已将 "${word}" 添加到白名单`);
        } catch (error) {
            handleError('添加到白名单失败', error, ErrorSeverity.Error);
        }
    })
);
```

**同时需要修改**:
- 移除文件顶部的 `import * as fs from 'fs';`（如果不再需要）
- 更新白名单文件扩展名从 `.json` 改为 `.jsonc`

**验证方式**:
1. 在章节中选中文本，右键添加到白名单
2. 检查是否成功创建/更新 `.noveler/sensitive-words/whitelist.jsonc`
3. 确认敏感词诊断是否正确更新

---

### Sprint 1 验收清单

- [ ] `CURRENT_CONFIG_VERSION` 更新为 `0.6.4`
- [ ] 文档中删除 `autoSave` 相关说明
- [ ] `paragraphIndent` 默认值在文档、模板、代码中一致
- [ ] `addToWhitelist` 命令使用异步 API
- [ ] 白名单文件统一使用 `.jsonc` 扩展名
- [ ] 移除未使用的 `fs` 同步导入

---

## Sprint 2: 代码清理 (P1)

**目标**: 提高代码一致性和可维护性

### Task 2.1: 统一类型映射常量
**预计时间**: 1 小时

**修改文件**:
- `src/constants.ts`（添加新常量）
- `src/extension.ts`（使用新常量）
- `src/views/novelerViewProvider.ts`（使用新常量）

**具体步骤**:

#### 2.1.1 在 constants.ts 添加映射常量
```typescript
// src/constants.ts - 在文件末尾添加

/** 卷类型显示名称映射 */
export const VOLUME_TYPE_DISPLAY_NAMES: Record<VolumeType, string> = {
    main: '正文',
    prequel: '前传',
    sequel: '后传',
    extra: '番外'
};

/** 卷状态显示名称映射 */
export const VOLUME_STATUS_DISPLAY_NAMES: Record<string, string> = {
    planning: '计划中',
    writing: '创作中',
    completed: '已完成'
};

/** 章节状态显示名称映射 */
export const CHAPTER_STATUS_DISPLAY_NAMES: Record<string, string> = {
    '草稿': '草稿',
    '初稿': '初稿',
    '修改中': '修改中',
    '已完成': '已完成'
};

/** 性别图标映射 */
export const GENDER_ICON_MAP: Record<string, string> = {
    '男': '👨',
    '女': '👩',
    '其他': '👤'
};
```

#### 2.1.2 更新 extension.ts
```typescript
// src/extension.ts:731-736
// 修改前
const typeNames: Record<string, string> = {
    'main': '正文',
    'prequel': '前传',
    'sequel': '后传',
    'extra': '番外'
};

// 修改后
import { VOLUME_TYPE_DISPLAY_NAMES } from './constants';
// ...
const volumeTypeName = VOLUME_TYPE_DISPLAY_NAMES[volume.volumeType] || volume.volumeType;
```

#### 2.1.3 更新 novelerViewProvider.ts
```typescript
// src/views/novelerViewProvider.ts
// 修改 getVolumeTooltip 方法（约 626 行）
import { VOLUME_TYPE_DISPLAY_NAMES, VOLUME_STATUS_DISPLAY_NAMES } from '../constants';

private getVolumeTooltip(volume: VolumeInfo): string {
    let tooltip = `${volume.title}\n━━━━━━━━━━━━━━\n`;
    tooltip += `类型: ${VOLUME_TYPE_DISPLAY_NAMES[volume.volumeType] || volume.volumeType}\n`;
    tooltip += `状态: ${VOLUME_STATUS_DISPLAY_NAMES[volume.status] || volume.status}\n`;
    // ...
}
```

**验证方式**:
1. 全局搜索 `'main': '正文'` 确认没有重复定义
2. 运行插件，检查侧边栏卷信息显示是否正常

---

### Task 2.2: 移动类型定义到 types 目录
**预计时间**: 1 小时

**修改文件**:
- `src/types/config.ts`（添加类型）
- `src/services/configService.ts`���移除类型，添加导入）

**具体步骤**:

#### 2.2.1 更新 types/config.ts
```typescript
// src/types/config.ts
// 添加从 configService.ts 移过来的类型

import { SensitiveWordConfig } from './sensitiveWord';
import { VolumesConfig } from './volume';

/**
 * 高亮样式配置接口
 */
export interface HighlightStyle {
    /** 文字颜色 */
    color?: string;
    /** 背景颜色 */
    backgroundColor?: string;
    /** 字体样式（normal, italic 等） */
    fontStyle?: string;
    /** 字体粗细（normal, bold 等） */
    fontWeight?: string;
}

/**
 * 小说配置接口
 * 对应 novel.jsonc 中的 noveler 配置项
 */
export interface NovelConfig {
    /** 目标字数配置 */
    targetWords?: {
        /** 每章默认目标字数 */
        default?: number;
    };
    /** 高亮配置 */
    highlight?: {
        /** 对话高亮样式 */
        dialogue?: HighlightStyle;
        /** 人物名高亮样式 */
        character?: HighlightStyle;
    };
    /** 格式化配置 */
    format?: {
        /** 中文引号样式（「」或""） */
        chineseQuoteStyle?: string;
        /** 是否自动格式化 */
        autoFormat?: boolean;
        /** 是否转换引号 */
        convertQuotes?: boolean;
    };
    /** 字数统计配置 */
    wordCount?: {
        /** 是否在状态栏显示字数统计 */
        showInStatusBar?: boolean;
        /** 是否包含标点符号 */
        includePunctuation?: boolean;
    };
    /** README 自动更新配置 */
    autoUpdateReadmeOnCreate?: {
        /** 更新模式：'always' | 'ask' | 'never' */
        value?: string;
    };
    /** 自动空行配置 */
    autoEmptyLine?: {
        /** 是否启用自动空行 */
        value?: boolean;
    };
    /** 段落缩进配置 */
    paragraphIndent?: {
        /** 是否启用段落首行缩进（两个全角空格） */
        value?: boolean;
    };
    /** 人物配置 */
    characters?: {
        /** 人物名称列表 */
        list?: string[];
    };
    /** 敏感词检测配置 */
    sensitiveWords?: SensitiveWordConfig;
    /** 分卷功能配置 */
    volumes?: VolumesConfig;
}
```

#### 2.2.2 更新 configService.ts
```typescript
// src/services/configService.ts
// 移除 HighlightStyle 和 NovelConfig 的本地定义
// 添加导入
import { HighlightStyle, NovelConfig } from '../types/config';

// 保留 re-export 以保持向后兼容（如果其他地方有从 configService 导入这些类型）
export type { HighlightStyle, NovelConfig };
```

**验证方式**:
1. 编译项目 `npm run compile`，确认无类型错误
2. 全局搜索 `from './services/configService'` 检查是否有直接导入类型的地方

---

### Task 2.3: 清理未使用的导入
**预计时间**: 30 分钟

**修改文件**:
- `src/extension.ts`
- 其他有 ESLint 警告的文件

**具体步骤**:
1. 运行 `npm run lint` 查看所有警告
2. 移除未使用的导入
3. 使用 `_` 前缀标记有意忽略的参数

```bash
# 运行 lint 检查
npm run lint

# 自动修复部分问题
npm run lint -- --fix
```

**验证方式**:
1. `npm run lint` 无错误和警告
2. `npm run compile` 成功

---

### Sprint 2 验收清单

- [ ] 类型映射常量统一定义在 `constants.ts`
- [ ] 所有使用处引用常量而非硬编码
- [ ] `HighlightStyle` 和 `NovelConfig` 移至 `types/config.ts`
- [ ] `configService.ts` 通过导入使用这些类型
- [ ] ESLint 检查通过（0 错误，0 警告）
- [ ] 编译成功

---

## Sprint 3: 用户体验优化 (P1)

**目标**: 改善用户交互体验

### Task 3.1: 完善章节状态菜单
**预计时间**: 1 小时

**修改文件**:
- `package.json`
- `src/commands/contextMenuCommands.ts`

**具体步骤**:

#### 3.1.1 更新 package.json
```json
// package.json - contributes.commands 中添加
{
    "command": "noveler.setChapterStatus",
    "title": "设置章节状态"
}

// contributes.menus.view/item/context 中修改
{
    "command": "noveler.setChapterStatus",
    "when": "view == novelerView && viewItem == chapter",
    "group": "2_status@1"
}
// 移除 markChapterCompleted 和 markChapterInProgress 的菜单项
```

#### 3.1.2 添加状态选择命令
```typescript
// src/commands/contextMenuCommands.ts
import { CHAPTER_STATUS_OPTIONS, STATUS_EMOJI_MAP } from '../constants';

/**
 * 设置章节状态（带完整选项菜单）
 */
export async function setChapterStatus(item: { resourceUri?: vscode.Uri }) {
    if (!item?.resourceUri) {
        vscode.window.showWarningMessage('请在章节上点击右键');
        return;
    }

    // 显示状态选择菜单
    const statusOptions = CHAPTER_STATUS_OPTIONS.map(status => ({
        label: `${STATUS_EMOJI_MAP[status] || ''} ${status}`,
        value: status
    }));

    const selected = await vscode.window.showQuickPick(statusOptions, {
        placeHolder: '选择章节状态'
    });

    if (!selected) {
        return;
    }

    try {
        const content = await vscode.workspace.fs.readFile(item.resourceUri);
        const text = Buffer.from(content).toString('utf8');

        // 更新状态
        const updatedText = updateStatusInFrontMatter(text, selected.value);

        const encoder = new TextEncoder();
        await vscode.workspace.fs.writeFile(item.resourceUri, encoder.encode(updatedText));

        // 刷新视图
        await vscode.commands.executeCommand('noveler.refresh');

        vscode.window.showInformationMessage(`已将章节状态更新为「${selected.value}」`);
    } catch (error) {
        handleError('更新章节状态失败', error, ErrorSeverity.Error);
    }
}

function updateStatusInFrontMatter(text: string, newStatus: string): string {
    // 实现 Front Matter 中 status 字段的更新
    // ...
}
```

#### 3.1.3 在 extension.ts 注册命令
```typescript
// src/extension.ts
import { setChapterStatus } from './commands/contextMenuCommands';

// 注册命令
context.subscriptions.push(
    vscode.commands.registerCommand('noveler.setChapterStatus', setChapterStatus)
);
```

**验证方式**:
1. 右键点击章节，检查菜单是否显示"设置章节状态"
2. 选择不同状态，验证更新是否成功
3. 检查侧边栏图标是否正确更新

---

### Task 3.2: 分卷功能可视化入口
**预计时间**: 1.5 小时

**修改文件**:
- `src/commands/initProject.ts`
- `src/views/novelerViewProvider.ts`

**具体步骤**:

#### 3.2.1 初始化时询问是否启用分卷
```typescript
// src/commands/initProject.ts
// 在创建项目结构前添加

// 询问是否启用分卷功能
const enableVolumes = await vscode.window.showQuickPick([
    { label: '$(book) 简单模式', description: '所有章节在同一目录', value: false },
    { label: '$(library) 分卷模式', description: '按卷组织章节（推荐长篇小说）', value: true }
], {
    placeHolder: '选择项目结构'
});

if (enableVolumes === undefined) {
    return; // 用户取消
}

// 更新配置中的 volumes.enabled
if (enableVolumes.value) {
    config.noveler.volumes = {
        enabled: true,
        folderStructure: 'nested',
        numberFormat: 'arabic',
        chapterNumbering: 'global'
    };
}
```

#### 3.2.2 在侧边栏添加快速切换入口
在"项目概览"下添加一个当前模式指示器：
```typescript
// src/views/novelerViewProvider.ts - getOverviewItems 方法
// 添加模式指示器
const volumesEnabled = this.configService.isVolumesEnabled();
items.push(
    new NovelerTreeItem(
        '项目模式',
        NodeType.OverviewItem,
        vscode.TreeItemCollapsibleState.None,
        {
            command: volumesEnabled ? 'noveler.rollbackToFlatStructure' : 'noveler.migrateToVolumeStructure',
            title: '切换项目模式'
        },
        'overviewItem',
        volumesEnabled ? '📚 分卷模式' : '📄 简单模式',
        `当前: ${volumesEnabled ? '分卷模式' : '简单模式'}\n点击切换到${volumesEnabled ? '简单模式' : '分卷模式'}`
    )
);
```

**验证方式**:
1. 新建测试项目，检查是否出现模式选择
2. 检查侧边栏是否显示当前模式
3. 点击模式指示器，验证切换功能

---

### Task 3.3: 统一白名单文件扩展名
**预计时间**: 30 分钟

**修改文件**:
- `src/services/sensitiveWordService.ts`
- `templates/default-config.jsonc`
- `docs/novel-json配置说明.md`

**具体步骤**:

1. 确保所有代码中白名单路径使用 `.jsonc` 扩展名
2. 在 sensitiveWordService 中添加兼容逻辑，同时检查 `.json` 和 `.jsonc`
3. 更新文档说明

```typescript
// src/services/sensitiveWordService.ts
// 添加文件扩展名兼容逻辑
private async loadWhitelist(): Promise<void> {
    const paths = [
        '.noveler/sensitive-words/whitelist.jsonc',
        '.noveler/sensitive-words/whitelist.json'  // 兼容旧格式
    ];

    for (const relativePath of paths) {
        const uri = vscode.Uri.joinPath(this.workspaceUri, relativePath);
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            // 加载成功
            this.whitelistPath = relativePath;
            return;
        } catch {
            // 文件不存在，尝试下一个
        }
    }
}
```

**验证方式**:
1. 测试 `.jsonc` 白名单文件是否正确加载
2. 测试 `.json` 白名单文件是否仍然兼容
3. 新建白名单时是否使用 `.jsonc` 扩展名

---

### Sprint 3 验收清单

- [ ] 章节右键菜单显示完整的状态选项
- [ ] 状态更新后侧边栏图标正确显示
- [ ] 项目初始化时可选择启用分卷
- [ ] 侧边栏显示当前项目模式
- [ ] 白名单文件统一使用 `.jsonc`，兼容 `.json`

---

## Sprint 4: 架构重构 (P2)

**目标**: 提高代码可维护性

### Task 4.1: 拆分 novelerViewProvider
**预计时间**: 4-6 小时

**新建文件**:
- `src/views/nodes/index.ts`
- `src/views/nodes/overviewNodes.ts`
- `src/views/nodes/chapterNodes.ts`
- `src/views/nodes/volumeNodes.ts`
- `src/views/nodes/characterNodes.ts`
- `src/views/nodes/actionNodes.ts`

**具体步骤**:

#### 4.1.1 创建节点工厂模块
```typescript
// src/views/nodes/index.ts
export * from './overviewNodes';
export * from './chapterNodes';
export * from './volumeNodes';
export * from './characterNodes';
export * from './actionNodes';
```

#### 4.1.2 拆分概览节点
```typescript
// src/views/nodes/overviewNodes.ts
import * as vscode from 'vscode';
import { NovelerTreeItem, NodeType } from '../novelerViewProvider';
import { ProjectStatsService } from '../../services/projectStatsService';
import { ConfigService } from '../../services/configService';

export class OverviewNodesProvider {
    constructor(
        private statsService: ProjectStatsService,
        private configService: ConfigService
    ) {}

    async getItems(): Promise<NovelerTreeItem[]> {
        const stats = await this.statsService.getStats();
        if (!stats) {
            return [/* 未初始化提示 */];
        }

        return [
            this.createTotalWordsItem(stats),
            this.createChapterCountItem(stats),
            this.createCharacterCountItem(stats),
            this.createCompletionItem(stats),
            this.createModeIndicatorItem()
        ];
    }

    private createTotalWordsItem(stats: ProjectStats): NovelerTreeItem {
        // ...
    }

    // 其他方法...
}
```

#### 4.1.3 更新主 provider
```typescript
// src/views/novelerViewProvider.ts
import { OverviewNodesProvider, ChapterNodesProvider, ... } from './nodes';

export class NovelerViewProvider implements vscode.TreeDataProvider<NovelerTreeItem> {
    private overviewNodes: OverviewNodesProvider;
    private chapterNodes: ChapterNodesProvider;
    // ...

    constructor() {
        this.overviewNodes = new OverviewNodesProvider(this.statsService, this.configService);
        this.chapterNodes = new ChapterNodesProvider(this.volumeService, this.configService);
        // ...
    }

    async getChildren(element?: NovelerTreeItem): Promise<NovelerTreeItem[]> {
        if (!element) {
            return this.getRootNodes();
        }

        switch (element.nodeType) {
            case NodeType.Overview:
                return this.overviewNodes.getItems();
            case NodeType.Chapters:
                return this.chapterNodes.getItems();
            // ...
        }
    }
}
```

**验证方式**:
1. 编译通过
2. 侧边栏所有功能正常
3. 代码行数分布更均匀（每个文件 < 300 行）

---

### Task 4.2: 优化错误处理
**预计时间**: 2 小时

**修改文件**:
- `src/utils/errorHandler.ts`
- 所有使用 try-catch 的文件

**具体步骤**:

1. 扩展错误处理工具，支持错误上报
2. 统一错误消息格式
3. 添加错误恢复建议

```typescript
// src/utils/errorHandler.ts
export interface ErrorContext {
    operation: string;  // 操作名称
    file?: string;      // 相关文件
    recoveryHint?: string;  // 恢复建议
}

export function handleErrorWithContext(
    context: ErrorContext,
    error: unknown,
    severity: ErrorSeverity = ErrorSeverity.Error
): void {
    const message = `${context.operation}失败`;
    const detail = error instanceof Error ? error.message : String(error);

    switch (severity) {
        case ErrorSeverity.Error:
            const actions = context.recoveryHint ? [context.recoveryHint] : [];
            vscode.window.showErrorMessage(`${message}: ${detail}`, ...actions);
            break;
        // ...
    }

    Logger.error(message, { context, error });
}
```

---

### Sprint 4 验收清单

- [ ] `novelerViewProvider.ts` 拆分为多个模块
- [ ] 每个节点提供者独立文件
- [ ] 主 provider 文件 < 300 行
- [ ] 错误处理统一使用 `handleErrorWithContext`
- [ ] 所有错误包含恢复建议

---

## Sprint 5: 测试覆盖 (P2)

**目标**: 建立测试基础设施

### Task 5.1: 配置测试环境
**预计时间**: 2 小时

**新建文件**:
- `src/test/suite/index.ts`
- `src/test/suite/extension.test.ts`
- `src/test/runTest.ts`
- `.vscode/launch.json`（更新）

**具体步骤**:

1. 安装测试依赖
```bash
npm install --save-dev @vscode/test-electron mocha @types/mocha
```

2. 配置测试入口
3. 添加 VS Code 测试运行配置

---

### Task 5.2: 编写核心服务测试
**预计时间**: 4-6 小时

**新建文件**:
- `src/test/suite/wordCountService.test.ts`
- `src/test/suite/configService.test.ts`
- `src/test/suite/chineseNumber.test.ts`

**测试覆盖重点**:
1. WordCountService - 字数统计逻辑
2. ConfigService - 配置加载和默认值
3. chineseNumber - 数字转换

```typescript
// src/test/suite/wordCountService.test.ts
import * as assert from 'assert';
import { WordCountService } from '../../services/wordCountService';

suite('WordCountService Test Suite', () => {
    test('should count Chinese characters correctly', () => {
        const result = WordCountService.getSimpleWordCount('你好世界');
        assert.strictEqual(result, 4);
    });

    test('should exclude Front Matter', () => {
        const text = '---\ntitle: test\n---\n你好世界';
        const result = WordCountService.getSimpleWordCount(text);
        assert.strictEqual(result, 4);
    });

    test('should count punctuation separately', () => {
        const result = WordCountService.getDetailedStats('你好，世界！');
        assert.strictEqual(result.content, 4);
        assert.strictEqual(result.punctuation, 2);
    });
});
```

---

### Sprint 5 验收清单

- [ ] 测试环境配置完成
- [ ] `npm test` 可正常运行
- [ ] WordCountService 测试覆盖率 > 80%
- [ ] ConfigService 测试覆盖率 > 60%
- [ ] chineseNumber 测试覆盖率 > 90%

---

## 附录

### A. 文件修改清单汇总

| Sprint | 文件 | 修改类型 |
|--------|------|----------|
| 1 | `src/constants.ts` | 修改 |
| 1 | `docs/novel-json配置说明.md` | 修改 |
| 1 | `templates/default-config.jsonc` | 修改 |
| 1 | `src/extension.ts` | 修改 |
| 2 | `src/constants.ts` | 修改 |
| 2 | `src/types/config.ts` | 修改 |
| 2 | `src/services/configService.ts` | 修改 |
| 2 | `src/views/novelerViewProvider.ts` | 修改 |
| 3 | `package.json` | 修改 |
| 3 | `src/commands/contextMenuCommands.ts` | 修改 |
| 3 | `src/commands/initProject.ts` | 修改 |
| 3 | `src/services/sensitiveWordService.ts` | 修改 |
| 4 | `src/views/nodes/*.ts` | 新建 |
| 4 | `src/views/novelerViewProvider.ts` | 重构 |
| 4 | `src/utils/errorHandler.ts` | 修改 |
| 5 | `src/test/**/*.ts` | 新建 |
| 5 | `package.json` | 修改 |

### B. 风险评估

| 修改 | 风险等级 | 影响范围 | 回滚难度 |
|------|----------|----------|----------|
| 配置版本更新 | 低 | 新项目 | 易 |
| 异步 API 改造 | 中 | 白名单功能 | 易 |
| 类型定义移动 | 低 | 编译时 | 易 |
| 侧边栏拆分 | 高 | 整个侧边栏 | 中 |
| 测试添加 | 低 | 无 | 易 |

### C. 验收标准

每个 Sprint 完成后需满足：
1. `npm run compile` 无错误
2. `npm run lint` 无错误和警告
3. 手动测试所有受影响功能
4. 更新 CHANGELOG.md

---

**文档版本**: 1.0
**创建日期**: 2026-01-20
**作者**: Claude
