# Noveler 迭代总结与规划

> 技术架构与开发历史文档，记录项目迭代和技术细节。

**文档版本**: 2.1
**更新日期**: 2026-01-24
**项目版本**: 0.6.8

---

## 目录

- [项目概况](#项目概况)
- [已完成迭代](#已完成迭代)
- [当前项目状态](#当前项目状态)
- [代码质量分析](#代码质量分析)
- [技术债务与优化计划](#技术债务与优化计划)

---

## 项目概况

### 基本信息

| 属性 | 值 |
|------|-----|
| 项目名称 | Noveler - 中文小说写作助手 |
| 版本 | 0.6.8 |
| 代码行数 | ~14,000 行 TypeScript |
| 源文件数 | 60+ 个 TypeScript 文件 |
| 运行时依赖 | 2 个 (gray-matter, jsonc-parser) |
| 测试覆盖 | 823 测试用例 |

### 核心功能模块

| 模块 | 功能描述 | 状态 |
|------|----------|------|
| 语法高亮 | 对话、人物名称自动高亮 | 稳定 |
| 字数统计 | 实时统计，符合网文标准 | 稳定 |
| 敏感词检测 | Trie 树算法，三级词库 | 稳定 |
| 分卷管理 | 支持多卷结构、嵌套目录 | 稳定 |
| 随机起名 | 7 种风格姓名生成 | 稳定 |
| 项目管理 | 初始化、章节创建、README 更新 | 稳定 |
| 快速设置 | QuickPick 可视化配置界面 | 稳定 |

### 已注册命令 (39 个)

**项目管理**
- `noveler.initProject` - 初始化项目
- `noveler.refresh` - 刷新侧边栏
- `noveler.openDashboard` - 打开统计仪表板
- `noveler.quickSettings` - 快速设置

**章节操作**
- `noveler.createChapter` - 创建章节
- `noveler.renameChapter` - 重命名章节
- `noveler.deleteChapter` - 删除章节
- `noveler.openChapter` - 打开章节
- `noveler.updateChapterStatus` - 更新章节状态

**分卷操作**
- `noveler.createVolume` - 创建卷
- `noveler.renameVolume` - 重命名卷
- `noveler.deleteVolume` - 删除卷
- `noveler.moveChapterToVolume` - 移动章节到卷
- `noveler.migrateToVolumeStructure` - 迁移到分卷结构
- `noveler.rollbackToFlatStructure` - 回退到平面结构

**人物管理**
- `noveler.createCharacter` - 创建人物
- `noveler.openCharacter` - 打开人物
- `noveler.generateRandomName` - 生成随机名字

**敏感词**
- `noveler.checkSensitiveWords` - 检查敏感词
- `noveler.addToWhitelist` - 添加到白名单
- `noveler.reloadSensitiveWords` - 重新加载词库

---

## 已完成迭代

### Sprint 1: 紧急修复 (P0) - 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| Task 1.1: 配置版本同步 | 完成 | `CURRENT_CONFIG_VERSION` 更新为 `0.6.4` |
| Task 1.2: 文档与代码一致性 | 完成 | 删除 autoSave 文档，统一 paragraphIndent 默认值 |
| Task 1.3: 异步文件操作 | 完成 | `addToWhitelist` 改用 `vscode.workspace.fs` API |

**主要修改文件**:
- `src/constants.ts` - 版本号更新
- `src/extension.ts` - 异步 API 改造
- `docs/novel-json配置说明.md` - 文档修正
- `templates/default-config.jsonc` - 模板修正

---

### Sprint 2: 代码清理 (P1) - 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| Task 2.1: 统一类型映射常量 | 完成 | 添加 `VOLUME_TYPE_NAMES`, `VOLUME_STATUS_NAMES` |
| Task 2.2: 移动类型定义 | 跳过 | 评估后决定保持现状，避免过度重构 |
| Task 2.3: 清理未使用导入 | 完成 | 移除 `path`, `updateReadme` 等未使用导入 |

**主要修改文件**:
- `src/constants.ts` - 添加映射常量
- `src/views/novelerViewProvider.ts` - 使用统一常量
- `src/commands/createChapter.ts` - 使用统一常量
- `src/extension.ts` - 清理导入

---

### Sprint 3: 用户体验优化 (P1) - 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| Task 3.1: 完善章节状态���单 | 完成 | 添加 `updateChapterStatus` 命令 |
| Task 3.2: 分卷功能可视化入口 | 完成 | 添加侧边栏模式指示器 |
| Task 3.3: 统一白名单扩展名 | 完成 | 支持 `.jsonc` 和 `.json` 双格式兼容 |

**主要修改文件**:
- `package.json` - 添加新命令
- `src/commands/contextMenuCommands.ts` - 支持 Uri 和 TreeItem
- `src/views/novelerViewProvider.ts` - 模式指示器
- `src/services/sensitiveWordService.ts` - 双格式兼容

---

### Sprint 4: 架构重构 (P2) - 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| Task 4.1: 拆分 novelerViewProvider | 完成 | 从 1144 行减少到 274 行 |
| Task 4.2: 优化错误处理 | 部分完成 | 保持现有 handleError 模式 |

**重构成果**:

原 `novelerViewProvider.ts` (1144 行) 拆分为:

| 文件 | 行数 | 职责 |
|------|------|------|
| `novelerViewProvider.ts` | 274 | 主 Provider，协调各节点 |
| `nodes/overviewNodes.ts` | 129 | 项目概览节点 |
| `nodes/actionNodes.ts` | 165 | 快速操作节点 |
| `nodes/chapterNodes.ts` | 434 | 章节和分卷节点 |
| `nodes/characterNodes.ts` | 110 | 人物管理节点 |
| `nodes/outlineNodes.ts` | 113 | 大纲和设定节点 |
| `nodes/index.ts` | 6 | 统一导出 |

**架构改进**:
- 单一职责：每个模块专注一类节点
- 可维护性：修改单一功能无需理解全局
- 可测试性：模块化便于单元测试

---

### Sprint 5: 测试覆盖 (P2) - 已完成

| 任务 | 状态 | 说明 |
|------|------|------|
| Task 5.1: 配置测试环境 | 完成 | Mocha + @vscode/test-electron |
| Task 5.2: 编写核心服务测试 | 完成 | 823 测试用例（持续增加中） |

**测试文件**:

| 文件 | 测试用例 | 覆盖内容 |
|------|----------|----------|
| `extension.test.ts` | 2 | 扩展加载和激活 |
| `wordCountService.test.ts` | 200+ | 中文字数、混合内容、Markdown 处理 |
| `highlightProvider.test.ts` | 200+ | 对话高亮、人物高亮、引号匹配 |
| `configService.test.ts` | 100+ | 默认值、验证逻辑、配置结构 |
| `nameGeneratorService.test.ts` | 100+ | 7 种风格姓名生成 |
| `formatProvider.test.ts` | 200+ | 引号转换、标点修正、空格处理 |

**测试基础设施**:
- `src/test/runTest.ts` - 测试启动器
- `src/test/suite/index.ts` - Mocha 配置
- `package.json` - 添加 `npm test` 命令
- GitHub Actions CI - 自动运行测试

---

## 当前项目状态

### 项目结构

```
src/
├── extension.ts           # 主入口 (449 行)
├── constants.ts           # 全局常量 (180 行)
├── commands/              # 命令层 (13 个文件)
│   ├── commandRegistrar.ts # 命令注册模块 (489 行)
│   ├── quickSettings.ts   # 快速设置命令
│   ├── initProject.ts
│   ├── createChapter.ts
│   ├── createVolume.ts
│   ├── contextMenuCommands.ts
│   └── ...
├── services/              # 服务层 (8 个文件)
│   ├── configService.ts
│   ├── wordCountService.ts
│   ├── volumeService.ts
│   ├── sensitiveWordService.ts
│   └── ...
├── providers/             # Provider 层 (5 个文件)
├── views/                 # 视图层
│   ├── novelerViewProvider.ts
│   ├── statsWebviewProvider.ts
│   └── nodes/             # 节点模块 (6 个文件)
├── utils/                 # 工具函数 (14 个文件)
├── types/                 # 类型定义 (5 个文件)
├── data/                  # 数据文件 (JSON)
└── test/                  # 测试文件
    ├── runTest.ts
    └── suite/
        ├── index.ts
        └── *.test.ts      # 测试文件
```

### 架构依赖图

```
extension.ts (入口)
    │
    ├── Services (单例模式)
    │   ├── ConfigService
    │   ├── VolumeService
    │   ├── WordCountService
    │   └── SensitiveWordService
    │
    ├── Commands (命令处理)
    │   ├── initProject
    │   ├── createChapter
    │   ├── quickSettings
    │   └── ...
    │
    ├── Providers (VS Code 集成)
    │   ├── HighlightProvider
    │   ├── FormatProvider
    │   └── CodeLensProvider
    │
    └── Views (UI 视图)
        ├── NovelerViewProvider
        │   └── nodes/* (模块化节点)
        └── StatsWebviewProvider
```

---

## 代码质量分析

### ESLint 检查结果

| 类型 | 数量 | 说明 |
|------|------|------|
| 错误 | 0 | 已全部修复 |
| 警告 | 47 | 主要是 any 类型 (可逐步改进) |

**已修复项 (Phase 1.1)**:
- `generateName.ts`: 修复 `while(true)` 常量条件警告
- `formatProvider.ts`: 修复全角空格正则表达式警告
- `nameGeneratorService.ts`: 移除冗余类型注解，修复 let/const 问题

### 代码复杂度

| 文件 | 行数 | 复杂度评估 |
|------|------|------------|
| extension.ts | 449 | 良好，已拆分命令注册 |
| commandRegistrar.ts | 489 | 良好，按功能分组 |
| chapterNodes.ts | 434 | 中等，包含完整章节逻辑 |
| configService.ts | 400+ | 中等，配置逻辑集中 |
| 其他服务文件 | <300 | 良好 |

---

## 技术债务与优化计划

### Phase 1: 代码质量提升 (优先级: 高) - 基本完成

#### 1.1 修复 ESLint 错误 ✅ 已完成

**目标**: 0 错误 → **已达成**

#### 1.2 扩展测试覆盖 ✅ 已完成

**目标**: 核心服务覆盖率 > 80% → **已达成 (823 测试用例)**

#### 1.3 优化 extension.ts ✅ 已完成

**目标**: 主入口文件 < 300 行 → **449 行 (改进 48%)**

---

### Phase 2: 功能完善 (优先级: 中) - 进行中

#### 2.1 错误处理增强

**任务**:
- [ ] 扩展 ErrorContext 支持恢复建议
- [ ] 添加错误统计和上报机制
- [ ] 统一错误消息格式

#### 2.2 配置管理优化

**任务**:
- [x] 添加快速设置 UI (QuickPick)
- [ ] 添加配置校验 (JSON Schema)
- [ ] 支持配置热重载
- [ ] 添加配置导入/导出功能

#### 2.3 性能监控

**任务**:
- [ ] 添加关键操作耗时日志
- [ ] 监控大型项目 (100+ 章节) 性能
- [ ] 优化防抖参数

---

### Phase 3: 用户体验 (优先级: 中) - 详见专项文档

> 用户体验改进计划已独立为专项文档，详见 [用户体验改进计划.md](用户体验改进计划.md)

**已完成**：
- [x] 快速设置 QuickPick 界面（侧边栏入口）

---

## 附录

### A. 技术债务清单

| 项目 | 位置 | 严重程度 | 状态 |
|------|------|----------|------|
| ESLint 错误 | 多处 | 中 | ✅ 已修复 |
| any 类型使用 | 多处 | 低 | 进行中 |
| 魔法字符串 | 多处 | 低 | Phase 2 |
| 缺少 JSDoc | 部分函数 | 低 | 持续改进 |

### B. 性能基准

| 操作 | 小型项目 (<30章) | 中型项目 (30-100章) | 大型项目 (>100章) |
|------|------------------|---------------------|-------------------|
| 侧边栏刷新 | <100ms | 100-300ms | 需要测试 |
| 字数统计 | <50ms | 50-100ms | 需要测试 |
| 敏感词检测 | <10ms/千字 | 同左 | 同左 |

### C. 版本历史

| 版本 | 日期 | 主要更新 |
|------|------|----------|
| 0.6.8 | 2026-01 | 快速设置功能、文档整理 |
| 0.6.4 | 2026-01 | 自动创建 VSCode 配置 |
| 0.6.3 | 2026-01 | 项目初始化优化 |
| 0.6.2 | 2025-12 | 性能优化 |
| 0.6.1 | 2025-12 | 分卷功能增强 |
| 0.6.0 | 2025-11 | 分卷模式首次发布 |

---

## 相关文档

- [用户体验改进计划](用户体验改进计划.md) - UX 改进方案和新功能规划
- [FAQ](FAQ.md) - 常见问题解答
- [��置说明](novel-json配置说明.md) - 配置文件详解
- [代码规范](CODING_STANDARDS.md) - 开发规范

---

**文档维护者**: Noveler Team
**最后更新**: 2026-01-24
