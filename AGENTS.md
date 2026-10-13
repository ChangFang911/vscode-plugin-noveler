# AGENTS.md - Noveler 项目指南

## 项目概述

Noveler 是一个专为中文小说创作设计的 VS Code 插件，提供语法高亮、字数统计、敏感词检测、分卷管理等功能。

- **版本**: 1.0.0（配置版本 0.6.4）
- **语言**: TypeScript
- **引擎**: VS Code ^1.74.0
- **包管理**: npm
- **打包工具**: esbuild

## 常用命令

```bash
# 安装依赖
npm install

# 编译（TypeScript → JavaScript）
npm run compile

# 开发监听模式
npm run compile-watch

# 生产打包（用于发布）
npm run package

# 生成安装包（统一命名为 releases/Noveler-版本号.vsix，并检查图标尺寸）
npm run package:vsix

# 代码检查
npm run lint
```

## 调试方法

按 `F5` 启动扩展开发宿主，在新窗口中测试插件功能。

## 用户操作入口

- 面向不熟悉 VS Code 的小说作者，常用功能必须提供可发现的鼠标入口，不能依赖快捷键或命令面板。
- 文档相关操作优先放在文档标题附近，项目管理操作放在插件侧边栏；右键菜单作为补充入口。
- 新增或调整功能时，同时检查入口名称、可见条件和当前操作对象，避免用户误操作其他文档。

## 项目结构

```
src/
├── extension.ts          # 主入口，初始化和注册命令
├── constants.ts          # 全局常量和正则表达式
├── commands/             # 命令实现
│   ├── initProject.ts    # 初始化项目
│   ├── createChapter.ts  # 创建章节
│   ├── createCharacter.ts # 创建人物
│   ├── createVolume.ts   # 创建卷
│   ├── volumeCommands.ts # 卷管理命令
│   ├── contextMenuCommands.ts # 右键菜单命令
│   ├── migrationWizard.ts # 结构迁移向导
│   └── ...
├── services/             # 业务逻辑服务（单例模式）
│   ├── configService.ts  # 配置管理
│   ├── wordCountService.ts # 字数统计
│   ├── volumeService.ts  # 分卷管理
│   ├── sensitiveWordService.ts # 敏感词检测
│   ├── nameGeneratorService.ts # 随机起名
│   └── ...
├── providers/            # VS Code 提供者
│   ├── formatProvider.ts # 文档格式化
│   ├── highlightProvider.ts # 语法高亮
│   ├── codeLensProvider.ts # CodeLens
│   └── sensitiveWord*.ts # 敏感词诊断和修复
├── views/                # UI 视图
│   ├── novelerViewProvider.ts # 侧边栏树视图
│   └── statsWebviewProvider.ts # 统计仪表板
├── utils/                # 工具函数
│   ├── frontMatterHelper.ts # Front Matter 解析
│   ├── readmeUpdater.ts  # README 自动更新
│   ├── trieTree.ts       # Trie 树（敏感词匹配）
│   └── ...
├── types/                # TypeScript 类型定义
└── data/                 # 名字库 JSON 数据
```

## 核心架构

```
extension.ts (入口)
    ↓
Services (业务逻辑，单例模式)
    ↓
Commands (命令层) + Providers (VS Code 集成)
    ↓
Views (UI 视图)
    ↓
Utils + Types (工具和类型)
```

## 关键服务

| 服务 | 职责 | 关键方法 |
|------|------|---------|
| ConfigService | 配置管理 | `getInstance()`, `getConfig()`, `isVolumesEnabled()` |
| WordCountService | 字数统计 | `getWordCount()`, `getSimpleWordCount()` |
| VolumeService | 分卷管理 | `scanVolumes()`, `getVolumeForChapter()` |
| SensitiveWordService | 敏感词检测 | `checkText()`, `reload()` |

## 配置文件

项目配置保存在 `novel.jsonc`（支持注释），主要配置项：
- `noveler.highlight` - 高亮样式
- `noveler.format` - 格式化设置
- `noveler.sensitiveWords` - 敏感词检测
- `noveler.volumes` - 分卷功能

## 代码规范

1. **单例模式**: 服务类使用 `initialize()` + `getInstance()` 模式
2. **防抖处理**: 字数统计 300ms，高亮 500ms，README 更新 5s
3. **异步优先**: 文件操作使用 `vscode.workspace.fs` 异步 API
4. **错误处理**: 使用 `handleError()` 统一处理，支持 Error/Warning/Silent 级别
5. **日志系统**: 使用 `Logger` 类，支持 Debug/Info/Warn/Error 级别

## 重要依赖

- `yaml`: 解析和编辑 YAML Front Matter，保留注释
- `jsonc-parser`: 解析 JSONC（支持注释的 JSON）

## 开发注意事项

1. **配置版本**: 修改配置结构时，更新 `CURRENT_CONFIG_VERSION` (constants.ts:164)
2. **命令注册**: 新命令需在 `package.json` 和 `extension.ts` 同时注册
3. **类型安全**: 确保 `types/` 目录中的类型定义与实际使用一致
4. **测试**: 使用 `npm run test:unit` 运行单元测试，`npm test` 运行 VS Code 扩展宿主测试，修改后需确保测试通过

## 文件格式

章节文件使用 Markdown + YAML Front Matter:
```markdown
---
title: "标题"
chapter: 1
wordCount: 3000
status: "草稿"  # 草稿 | 初稿 | 修改中 | 已完成
---

# 第一章 标题

正文内容...
```

## 常见开发任务

### 添加新命令
1. 在 `src/commands/` 创建命令文件
2. 在 `package.json` 的 `contributes.commands` 注册
3. 在 `extension.ts` 的 `activate()` 中注册处理器

### 添加新配置项
1. 更新 `templates/default-config.jsonc`
2. 更新 `src/services/configService.ts` 中的接口和方法
3. 更新 `src/types/config.ts` 中的类型定义
4. 递增 `CURRENT_CONFIG_VERSION`

### 修改侧边栏
修改 `src/views/novelerViewProvider.ts` 中的 `getChildren()` 方法
