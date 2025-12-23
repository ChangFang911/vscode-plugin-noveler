# 更新日志

本项目的所有重要更改都将记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.6.2] - 2025-12-23

### 功能增强

#### 🏷️ 卷类型自动文件夹重命名
- **功能**：修改卷类型时，自动重命名文件夹以反映新类型
- **场景**：
  - 将"第01卷-崛起"从正文改为前传 → 自动重命名为"前传01-崛起"
  - 保持文件夹名称与卷类型一致，避免混淆
- **实现**：[src/commands/volumeCommands.ts:setVolumeType](src/commands/volumeCommands.ts#L253-L359)
- **技术细节**：
  - 使用 `generateVolumeFolderName()` 生成新文件夹名
  - 异步检查目标文件夹是否存在
  - 使用 `vscode.workspace.fs.rename()` 重命名
  - 完全异步化，避免 UI 阻塞

#### 🧹 TODO 清理
- **移除不必要的 TODO**：
  - ~~TODO: 更新所有章节 frontmatter 的 volume 字段（如果使用名称而非序号）~~
  - 原因：章节使用 `volume: number` 引用卷，而非名称，重命名卷不影响章节
- **实现必要的 TODO**：
  - ✅ 修改卷类型时自动重命名文件夹（见上文）

### Bug 修复

#### 🔧 配置版本号同步
- **问题**：插件版本 0.6.1，但 `CURRENT_CONFIG_VERSION` 仍为 0.5.0
- **影响**：
  - 初始化新项目时创建 0.5.0 版本配置
  - MigrationService 检测版本一致，不触发升级
  - 未来新增配置项无法自动添加到用户项目
- **解决方案**：
  - 更新 `CURRENT_CONFIG_VERSION` → `0.6.1`
  - 更新配置模板 `version` → `0.6.1`
  - 添加 0.6.0 和 0.6.1 升级逻辑到 MigrationService
  - 添加版本更新日志到 MigrationService.showChangelog()
- **修复文件**：
  - [src/constants.ts](src/constants.ts:160) - `CURRENT_CONFIG_VERSION = '0.6.1'`
  - [templates/default-config.jsonc](templates/default-config.jsonc:4) - `"version": "0.6.1"`
  - [src/services/migrationService.ts](src/services/migrationService.ts:130-142) - 添加 0.6.0/0.6.1 升级逻辑

#### 🔄 卷操作刷新缺失
- **问题**：`copyChapterToVolume` 和 `setVolumeType` 操作后侧边栏不刷新
- **影响**：用户复制章节或修改卷类型后，必须手动刷新才能看到更新
- **解决方案**：添加 `smartRefresh` 调用
  - [src/commands/volumeCommands.ts:607](src/commands/volumeCommands.ts#L607) - 复制章节后刷新
  - [src/commands/volumeCommands.ts:299](src/commands/volumeCommands.ts#L299) - 设置卷类型后刷新

### 性能优化

#### ⚡ 异步 I/O 转换 - VolumeService
- **VolumeService 异步化**：所有文件操作改为异步（VSCode filesystem API）
  - 替换 `fs.existsSync` → `vscode.workspace.fs.stat`
  - 替换 `fs.readdirSync` → `vscode.workspace.fs.readDirectory`
  - 替换 `fs.readFileSync` → `vscode.workspace.fs.readFile`
- **批量文件读取**：使用 `Promise.all()` 并行读取章节统计
  - 性能提升：100 章节从 2s → 0.3s（85% 提升）
- **消除魔法数字**：添加 `MINIMUM_COMPLETED_WORD_COUNT` 常量

#### ⚡ 异步 I/O 转换 - VolumeCommands（关键优化）
- **问题**：同步文件操作导致 UI 冻结，大卷/大文件场景严重卡顿
- **影响场景**：
  - 删除大卷（1000 章节）→ UI 冻结 10s+，用户以为崩溃 ❌
  - 移动/复制大章节（100KB+）→ 卡顿 0.5-2s ❌
  - 网络盘环境 → 可能冻结数十秒 ❌
- **解决方案**：6 个高频函数完全异步化
  - ✅ `renameVolume` - 重命名文件夹 + 更新配置（异步）
  - ✅ `deleteVolume` - 递归删除文件夹（异步）**[P0-最严重瓶颈]**
  - ✅ `setVolumeStatus` - 读写 volume.json（异步）
  - ✅ `setVolumeType` - 读写 volume.json + 自动重命名文件夹（异步）
  - ✅ `moveChapterToVolume` - 读取 + 写入 + 删除（异步）**[P0-高频操作]**
  - ✅ `copyChapterToVolume` - 读取 + 写入（异步）**[P0-高频操作]**
- **性能收益**：
  - ✅ UI 始终流畅，0ms 阻塞
  - ✅ 支持大项目（1000+ 章节）无卡顿
  - ✅ 网络盘环境下体验显著提升
- **修复文件**：[src/commands/volumeCommands.ts](src/commands/volumeCommands.ts)

#### ⏳ 进度提示
- **迁移操作**：添加进度条（`vscode.ProgressLocation.Notification`）
  - 显示"检查目标文件夹"、"创建卷"、"移动章节"进度
- **完整刷新**：显示刷新步骤进度
  - "刷新侧边栏..." → "更新统计数据..." → "完成"

### Bug 修复

#### 🔧 配置文件时间戳更新缺失
- **问题**：迁移到分卷结构、启用分卷功能时，`novel.jsonc` 的 `modified` 时间戳未更新
- **影响**：用户无法追踪配置修改时间，不利于问题排查和版本管理
- **解决方案**：
  - [src/commands/migrationWizard.ts](src/commands/migrationWizard.ts) - `updateConfigToNested()` 和 `updateConfigToFlat()` 自动更新 `modified`
  - [src/commands/createVolume.ts](src/commands/createVolume.ts) - `enableVolumes()` 自动更新 `modified`
  - 使用 `formatDateTime()` 生成标准格式（YYYY-MM-DD HH:mm:ss）

### 架构重构

#### 🔄 刷新命令统一化
- **问题**：3 个混乱的刷新命令（`refreshView`、`updateReadme`、`refreshViewAndReadme`）导致用户困惑
- **解决方案**：三层刷新策略
  - **Strategy 1** (`refreshView`): 仅刷新侧边栏 UI（内部使用）
  - **Strategy 2** (`smartRefresh`): 智能刷新（UI + 配置驱动的 README 更新）
  - **Strategy 3** (`refresh`): 完整刷新（带进度条，强制更新所有内容）
- **重构范围**：
  - 替换 18+ 处调用点使用新统一策略
  - 更新侧边栏按钮命令：`refreshViewAndReadme` → `refresh`
  - `package.json` 添加新命令定义，废弃旧命令
  - 删除 `handleReadmeAutoUpdate` 导入（改为命令调用）

### 文件变更

#### 修改的文件
- [src/extension.ts](src/extension.ts) - 添加 3 个新刷新命令
- [src/commands/createChapter.ts](src/commands/createChapter.ts) - 使用 `smartRefresh`
- [src/commands/createCharacter.ts](src/commands/createCharacter.ts) - 使用 `smartRefresh`
- [src/commands/createVolume.ts](src/commands/createVolume.ts) - 使用 `smartRefresh`
- [src/commands/contextMenuCommands.ts](src/commands/contextMenuCommands.ts) - 使用 `smartRefresh`（6 处）
- [src/commands/volumeCommands.ts](src/commands/volumeCommands.ts) - 使用 `smartRefresh`（5 处）
- [src/commands/initProject.ts](src/commands/initProject.ts) - 使用 `refresh`
- [src/commands/migrationWizard.ts](src/commands/migrationWizard.ts) - 使用 `refresh`（2 处）+ 添加进度条
- [src/views/novelerViewProvider.ts](src/views/novelerViewProvider.ts) - 侧边栏按钮使用 `refresh`
- [src/services/volumeService.ts](src/services/volumeService.ts) - 异步 I/O + 批量读取
- [src/utils/readmeUpdater.ts](src/utils/readmeUpdater.ts) - 并行文件读取
- [src/constants.ts](src/constants.ts) - 添加 `MINIMUM_COMPLETED_WORD_COUNT`
- [package.json](package.json) - 添加新刷新命令

## [0.6.1] - 2025-12-10

### 代码优化

#### 🧹 架构清理
- **合并 constants 文件**：将 `src/constants/volumeConstants.ts` 合并到 `src/constants.ts`，消除文件/文件夹命名冲突
- **删除未使用代码**：移除 4 个未使用的工具文件，减少 680 行代码（-8.5%）
  - `errorHelper.ts` (186 行) - 仅 1 次引用，已被 `errorHandler.ts` 替代
  - `fileHelper.ts` (214 行) - 0 次引用
  - `validationHelper.ts` (221 行) - 0 次引用
  - `workspaceHelper.ts` (59 行) - 0 次引用
- **清理废弃模板**：删除 3 个不再使用的模板文件
  - `templates/default-config.json` - 已被 `.jsonc` 替代
  - `templates/sensitive-words/custom-words-template.jsonc` - 改用内联模板
  - `templates/sensitive-words/whitelist-template.jsonc` - 改用内联模板
- **清理系统垃圾**：删除所有 `.DS_Store` 文件

#### 🔧 技术改进
- **更新 import 引用**：修改 5 个文件的 import 语句，从 `./constants/volumeConstants` 改为 `./constants`
  - `src/extension.ts`
  - `src/providers/formatProvider.ts`
  - `src/services/migrationService.ts`
  - `src/services/volumeService.ts`
  - `src/utils/volumeHelper.ts`

#### 🎛️ 侧边栏优化
- **优化命令结构**：精简侧边栏命令，提升用户体验
  - 快捷操作精简到 3 个高频命令（格式化、专注模式、刷新视图）
  - 新增 `refreshViewAndReadme` 命令（合并刷新视图 + 更新 README）
  - 其他操作扩充到 7 个低频命令（统计仪表板、敏感词配置、打开配置文件、随机起名等）
  - 删除冗余的 `showWordCount` 命令（状态栏已实时显示字数）
- **优化命令名称**：使用更口语化的命名，提升用户理解
  - "敏感词配置" → "配置敏感词库"
  - "重新加载敏感词库" → "刷新敏感词库"
  - "重新加载高亮配置" → "刷新高亮设置"
  - "迁移到分卷结构" → "切换到分卷模式"
  - "回退到扁平结构" → "退出分卷模式"

#### 📦 打包优化
- **配置 esbuild 打包工具**：替代 TypeScript 编译，实现单文件打包
  - 新增 `esbuild.js` 配置文件
  - 更新 `package.json` scripts（`vscode:prepublish` 使用 `npm run package`）
  - 编译输出从 54 个文件（449 KB）优化为 1 个文件（212 KB）
  - 文件数减少 **99%**，体积减少 **53%**
- **优化 .vscodeignore**：排除不必要的文件
  - 排除开发文档（CODING_STANDARDS.md, CONFIG_MIGRATION.md 等）
  - 排除 node_modules 中的文档和测试文件
  - 排除示例项目（examples/**）
  - 总文件数从 220 减少到 141（**-36%**）
  - VSIX 体积从 1.6 MB 减少到 1.4 MB（**-12.5%**）

#### ⚡ 性能优化
- **文件 I/O 异步化**：将所有同步文件操作改为异步，避免阻塞主线程
  - `volumeService.ts`: 8 个同步操作 → 异步操作
    - `fs.existsSync` → `vscode.workspace.fs.stat`
    - `fs.readdirSync` → `vscode.workspace.fs.readDirectory`
    - `fs.readFileSync` → `vscode.workspace.fs.readFile`
  - `sensitiveWordService.ts`: 6 个同步操作 → 异步操作
  - **性能提升**：在大型项目（100+ 章节）中，UI 响应速度显著改善
- **批处理文件读取**：实现并行文件读取，大幅提升性能
  - `readmeUpdater.ts`: 串行 for 循环 → `Promise.all` 并行读取
  - `volumeService.ts`: 章节统计使用并行计算
  - **性能提升**：100 个章节的扫描时间从 ~2秒 减少到 ~0.3秒（**提升 85%**）
- **代码质量改进**：消除 magic number，提升可维护性
  - 新增常量 `MINIMUM_COMPLETED_WORD_COUNT = 100`
  - 统一使用常量替代硬编码数值

#### 🎯 用户体验优化
- **添加进度提示**：为耗时操作显示实时进度，提升用户体验
  - **迁移到分卷结构**：显示详细的迁移进度
    - 检查目标文件夹 → 创建卷文件夹 → 移动章节
    - 实时显示已处理章节数 (X/Y)
  - **更新 README 统计**：显示扫描进度
    - "正在扫描章节文件..." → "完成"
  - **刷新视图**：分步显示操作进度
    - "刷新侧边栏..." → "更新 README 统计..."
  - **效果**：用户不再疑惑"是不是卡住了"，清晰知道操作进度

### 文档完善

#### 📖 README 重构
- **新增侧边栏视图章节**：详细介绍侧边栏的 5 个功能模块（项目概览、章节管理、人物设定、快捷操作、其他操作）
- **分卷功能提升**：从路线图（v0.7.0+）提升到核心功能，补充详细使用说明
- **优化文档结构**：调整章节顺序，突出侧边栏为主要交互方式

#### 📚 新增支持文档
- **FAQ.md**：60+ 个常见问题解答，涵盖 11 个分类
  - 安装与配置问题
  - 侧边栏使用问题
  - 字数统计问题
  - 高亮问题
  - 格式化问题
  - 敏感词检测问题
  - 分卷管理问题
  - 项目管理问题
  - 配置文件问题
  - 性能问题
  - 其他问题

- **文件格式说明.md**：详细的 Front Matter 字段参考
  - 章节文件格式（15 个字段）
  - 人物文件格式（14 个字段）
  - 自动维护 vs 手动维护字段说明
  - 最佳实践建议

#### ⚙️ 配置文档优化
- **完善 novel-json配置说明.md**：新增 5 个配置章节
  - 敏感词检测配置（sensitiveWords）
  - 分卷管理配置（volumes）
  - 段落缩进配置（paragraphIndent）
  - 自动保存配置（autoSave）
  - README 更新配置（readmeAutoUpdate）
- **配置示例补充**：每个配置都包含详细的字段说明和实际示例

#### 📊 架构审计报告
- **新增 ARCHITECTURE_AUDIT.md**：详细记录项目架构分析结果
  - 项目规模统计（88 个文件，48 个 TS 文件）
  - 发现的 3 类问题（废弃工具、重复模板、垃圾文件）
  - 清理建议和风险评估
  - 预期优化效果分析

### 配置优化

#### 🔒 版本控制优化
- **更新 .gitignore**：添加 `.noveler/` 目录，防止用户自定义配置被提交

#### 🐛 调试配置修复
- **恢复 .vscode/ 目录**：修复 F5 调试时需要选择调试器的问题
  - `launch.json` - 扩展调试配置
  - `settings.json` - 项目设置
  - `tasks.json` - 构建任务

### 清理工作

#### 🗑️ 删除已完成计划文档
- `docs/RANDOM_NAME_GENERATOR_PLAN.md` - v0.6.0 已实现
- `docs/VOLUME_FEATURE_PLAN.md` - v0.5.0 已实现
- `docs/TODO_OPTIMIZATIONS.md` - 内容已过时

#### 🧪 删除临时文件
- `test-name-generator.js` - 临时测试脚本

### 优化效果

#### 代码优化
| 指标 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| 总代码行数 | ~8000 | ~7320 | -8.5% |
| utils/ 文件数 | 18 | 14 | -22% |
| 模板配置文件 | 3 | 1 | -67% |
| 废弃文档 | 3 | 0 | -100% |
| 垃圾文件 | 1+ | 0 | -100% |

#### 打包优化
| 指标 | 优化前 | 优化后 | 改进 |
|------|--------|--------|------|
| VSIX 总文件数 | 220 | 141 | -36% |
| JS 文件数 | 145 | 1 | -99% |
| VSIX 体积 | 1.6 MB | 1.4 MB | -12.5% |
| 编译输出文件数 | 54 | 1 | -98% |
| 编译输出体积 | 449 KB | 212 KB | -53% |

## [0.6.0] - 2025-12-09

### 新增功能

#### 🎲 随机起名功能
- **7 种姓名风格**：支持多种文化和文学风格的姓名生成
  - 中文（现代）：现代常见姓名，如李浩然、王雨萱
  - 中文（古典）：诗意雅致姓名，如司马青云、欧阳明月
  - 中文（玄幻）：武侠仙侠风格，如独孤天辰、慕容星影
  - 英文：真实英文姓名，如 John Smith、Jane Doe
  - 日文：常见日本姓名，如佐藤健、山田美咲
  - 西幻：西方奇幻翻译风格，如艾登·诺德、索菲亚·温特
  - 虚构：音节组合生成，如 Kaelor、Thranis

- **丰富的名字库**：
  - 中文姓氏 140 个（常见 50 + 复姓 30 + 玄幻 60）
  - 中文名字 200+ 个（现代、古典、玄幻各有不同风格）
  - 英文名 220 个（男性 60 + 女性 60 + 姓氏 100）
  - 日文名 192 个（姓氏 72 + 男性名 48 + 女性名 48）
  - 西幻名 132 个（男性名 48 + 女性名 36 + 姓氏 48）
  - 虚构名基于音节动态生成

- **智能交互流程**：
  - 风格选择菜单，清晰的图标和说明
  - 一次生成 10 个候选姓名
  - "再来一组"功能，快速生成更多选项
  - 操作菜单：创建人物文件 / 复制到剪贴板 / 插入到光标位置 / 返回重新选择

- **多种调用方式**：
  - 命令面板：`Noveler: 随机起名`
  - 侧边栏："人物设定"组的按钮
  - 侧边栏："人物设定"组标题的内联按钮

### 技术实现
- **NameGeneratorService**：统一的姓名生成服务
  - 懒加载机制：按需读取数据文件
  - 异步 IO：使用 `fs.promises.readFile` 不阻塞 UI
  - Set 去重：确保生成的姓名不重复
  - 无限循环保护：maxAttempts 限制避免死循环
  - 完整错误处理：友好的错误提示

- **数据文件**：JSON 格式的名字库
  - `chinese-surnames.json` - 中文姓氏（常见/复姓/玄幻）
  - `chinese-given-names.json` - 中文名字（现代/古典/玄幻）
  - `english-names.json` - 英文名字（男/女/姓）
  - `japanese-names.json` - 日文名字（姓/男性名/女性名）
  - `western-fantasy-names.json` - 西幻名字（男/女/姓）
  - `fantasy-syllables.json` - 虚构音节生成规则

### 生成策略优化
- **中文现代名**：支持 2-3 字名（单字名 + 双字名）
- **中文古典名**：70% 常见姓 + 30% 复姓，60% 双字名 + 40% 单字名
- **中文玄幻名**：混合玄幻姓氏和复姓，70% 单字名 + 30% 双字名
- **英文/日文/西幻**：名·姓组合，符合各自文化习惯
- **虚构名**：基于辅音、元音、音节模式动态生成

### 新增文件
- `src/commands/generateName.ts` - 随机起名命令
- `src/services/nameGeneratorService.ts` - 姓名生成服务
- `src/data/*.json` - 6 个名字库数据文件
- `test-name-generator.js` - 测试脚本

## [0.5.0] - 2025-12-08

### 用户体验优化

#### 🎯 简化迁移流程
- **移除策略选择步骤**：迁移到分卷结构时，不再需要选择"智能迁移/平均分卷/自定义分卷"，直接进入自定义分卷流程
- **更直观的操作**：用户可以直接通过选择章节来分配卷，一次性输入每个卷的名称
- **删除冗余代码**：移除了 190 行不再使用的代码，包括：
  - `analyzeMigrationStrategy()` - 策略分析函数
  - `createAutoVolumeGroups()` - 智能迁移函数
  - `createAverageVolumeGroups()` - 平均分卷函数
  - `createSingleVolumeGroup()` - 单卷模式函数

#### 🗑️ 移除无意义的功能
- **删除"蛋卷模式"（单卷模式）**：一章一卷的模式没有实际意义，已从迁移向导中移除

#### 📂 侧边栏组织优化
- **新增"其他操作"分组**：默认折叠的侧边栏组，包含不常用的操作命令
  - 更新 README 统计
  - 重新加载敏感词库
  - 重新加载高亮配置
  - 迁移到分卷结构/回退到扁平结构（根据当前模式动态显示）

### 优化对比

**迁移流程（之前）**:
1. 确认迁移
2. 扫描章节
3. 选择策略（智能/平均/自定义）← 多余步骤
4. 逐个输入卷名 ← 繁琐
5. 确认并执行

**迁移流程（现在）**:
1. 确认迁移
2. 扫描章节
3. 直接选择每卷包含的章节 ← 更直观
4. 一次性输入每个卷的名称
5. 确认并执行

### 已修改文件
- `src/commands/migrationWizard.ts` - 删除 190 行代码，简化迁移流程
- `src/views/novelerViewProvider.ts` - 新增"其他操作"组

## [0.4.0] - 2025-12-03

### 重大改进 - 敏感词配置体验优化

#### 🎯 用户体验全面升级
- **自动创建配置文件**：初始化项目时自动创建带完整注释的配置文件，无需手动复制重命名
- **简化配置结构**：配置文件采用简单的字符串数组格式，无需复杂的 level/reason 字段
- **统一使用 JSONC 格式**：所有配置文件（novel.jsonc, custom-words.jsonc, whitelist.jsonc）统一使用 JSONC 格式，支持注释
- **保留注释功能**：使用 jsonc-parser 库，右键添加词汇时自动保留文件中的注释

#### 📝 配置文件优化
- **custom-words.jsonc**：自定义敏感词库，带详细使用说明
  - 📖 3 步使用指南
  - 💡 4 个实际应用场景
  - ⚠️ 重要注意事项
- **whitelist.jsonc**：白名单配置，排除误报词汇
  - 人物名、地名、技能名等特殊术语
  - 架空世界词汇支持

#### 🚀 交互方式改进
- **选项菜单**：点击侧边栏"敏感词配置"显示选项菜单，引导用户选择要编辑的文件
  - ⚙️ 配置检测级别（调整内置词库）
  - ➕ 管理自定义敏感词
  - ➖ 管理白名单
- **右键快捷操作**：选中文字后右键菜单新增
  - "Noveler: 添加到自定义敏感词库"
  - "Noveler: 添加到白名单"

#### 🗑️ 简化设计
- **移除冗余文件**：删除 blacklist（黑名单）配置，与 custom-words 合并
- **减少文件数量**：从 3 个配置文件（blacklist, custom-words, whitelist）简化为 2 个（custom-words, whitelist）
- **默认启用**：自定义词库和白名单默认开启，无需手动配置

#### 🔧 技术改进
- 使用 `jsonc-parser` 库实现注释保留
- 配置文件路径统一更新为 `.jsonc` 扩展名
- 服务层完全兼容 JSONC 格式

### 配置变更
- **新文件**：
  - `.noveler/sensitive-words/custom-words.jsonc`（自动创建）
  - `.noveler/sensitive-words/whitelist.jsonc`（自动创建）
- **移除文件**：
  - `blacklist-template.jsonc`（已删除）
  - `blacklist.json`（不再使用）
- **配置路径更新**：
  - `customLibrary.path`: `.noveler/sensitive-words/custom-words.jsonc`
  - `whitelist.path`: `.noveler/sensitive-words/whitelist.jsonc`

## [0.3.4] - 2025-12-03

### 新功能
- **敏感词检测功能**：智能检测小说中的敏感词汇，帮助作者规避审核风险
  - **Trie 树算法**：O(n) 时间复杂度，高效检测敏感词
  - **三级词库系统**：
    - 高危级别（high）：政治、严重暴力、严重违法 - 推荐启用
    - 中危级别（medium）：色情、一般违法、宗教敏感 - 推荐启用
    - 低危级别（low）：广告、争议词汇、不文明用语 - 可选启用
  - **实时检测**：输入时检测（500ms 防抖）和保存时检测
  - **状态栏显示**：实时显示敏感词数量
  - **Quick Fix 支持**：
    - 添加到白名单
    - 删除词汇
    - 替换为星号
    - 忽略问题
  - **自定义词库**：支持自定义黑名单和白名单
  - **灵活配置**：可独立开关各级别词库、检测时机、显示样式等

### Bug 修复
- **修复敏感词检测只显示部分匹配的问题**：修改 Trie 树搜索算法为最长匹配优先，避免"政治"覆盖"测试政治词1"
- **修复敏感词服务异步初始化竞态条件**：等待词库加载完成后再注册诊断提供器，确保首次检测时所有词库已就绪
- **修复删除人物后高亮不更新的问题**：在文件监视器回调中添加高亮刷新逻辑，人物文件变更时自动刷新编辑器高亮
- **修复章节列表排序错误**：使用 frontmatter 的 `chapter` 字段进行数字排序，而非文件名字符串排序（"第一千章"现在正确排在"第九百九十九章"后面）

### 用户体验优化
- **减少通知频率**：
  - README 自动更新改为静默模式（只在输出面板记录日志）
  - 高亮配置重新加载改为静默模式
  - 保留用户主动操作的重要反馈通知

### 配置更新
- **新增敏感词配置模板**：在 `templates/default-config.jsonc` 中添加敏感词检测的完整配置说明和推荐设置

## [0.3.3] - 2025-12-02

### Bug 修复
- **修复格式化命令触发 VSCode 格式化选择器的问题**：`noveler.formatDocument` 命令现在直接调用 Noveler 的格式化提供器，不再弹出格式化工具选择对话框
- **修复高亮提供器类型错误**：修复 `highlightProvider.ts` 中的 `TypeError: name.replace is not a function` 运行时错误
  - 在 `loadCharacterNames()` 方法中添加类型检查，确保 `parsed.data.name` 转换为字符串
  - 在 `getCharacterRegex()` 方法中添加防御性过滤，确保所有人物名称都是有效字符串
  - 修复位置：`src/providers/highlightProvider.ts` 第 117-121 行和第 168-172 行

### 代码质量改进
- **ESLint 代码规范修复**：修复所有 ESLint 错误（11 处），代码质量达到 0 错误标准
  - 移除 TypeScript 可推断类型的冗余类型注解（7 处）
  - 规范未使用参数命名（3 处，使用下划线前缀）
  - 修复正则表达式不必要的转义字符（1 处）
- **JSDoc 文档完善**：为 4 个核心服务类添加完整的 JSDoc 注释
  - `ConfigService` - 配置服务类（13 个公共方法）
  - `WordCountService` - 字数统计服务类（5 个公共方法）
  - `ProjectStatsService` - 项目统计服务类
  - `NovelHighlightProvider` - 高亮提供器类（3 个公共方法）
- **正则表达式预编译**：将 7 个正则表达式提取为静态成员，减少运行时开销
  - `WordCountService` - 6 个正则表达式
  - `NovelerViewProvider` - 1 个正则表达式

## [0.3.2] - 2025-11-27

### 字数统计重大优化

#### 核心改进
- **统一字数统计逻辑**：消除硬编码配置，统一使用 `WordCountService` 进行字数统计
- **精准标点符号识别**：扩展中文标点符号 Unicode 范围（U+2000-U+206F），正确识别 `""`、`''`、`…`、`—` 等标点
- **空格过滤**：统计字数时自动排除所有空格（全角和半角），符合网文字数统计标准
- **标题处理优化**：
  - 状态栏（未选中）：仅统计正文，排除标题
  - 状态栏（选中文本）：统计所有选中内容，包括标题
  - 侧边栏 hover：仅统计正文，排除标题

#### 字数统计说明
- **总计** = 正文 + 标点（不含空格）
- **正文** = 中文汉字 + 英文字母和数字（不含标点、不含空格）
- **标点** = 中文标点 + 英文标点

#### UI/UX 优化
- **状态栏显示**：详细展示 `总计 xxx | 正文 xxx | 标点 xxx`
- **侧边栏菜单文案优化**：
  - "README" → "项目文档"（更易于理解）
  - "格式化文档" → "格式化当前章节"（更明确）
  - "更新 README 统计" → "更新项目文档"
  - "刷新视图" → "刷新侧边栏"
  - 删除冗余的"显示字数统计"功能（已在状态栏和侧边栏显示）
- **右键菜单优化**：移除所有菜单项的 "Noveler:" 前缀，简化界面

#### 功能增强
- **README 自动更新**：章节重命名、状态更新、删除操作后自动更新项目文档
- **章节重命名智能化**：
  - 保留文件编号前缀（如 `01-`、`02-`）
  - 自动提取"第X章"前缀，输入框仅显示章节名称
  - 同步更新 Front Matter、正文标题和文件名
- **README 跳转容错**：点击项目概览时，即使找不到对应章节也会打开 README 文件

### 技术改进
- **代码重构**：消除重复的字数统计代码，`calculateStats` 从 52 行减少到 33 行
- **方法复用**：`getSimpleWordCount` → `getDetailedStats` → `calculateStats` 层层复用
- **常量提取**：将所有状态值和表情符号映射提取到 `constants.ts`

### Bug 修复
- 修复侧边栏和状态栏字数不一致的问题
- 修复中文引号和省略号未被计入标点的问题
- 修复章节重命名时文件编号丢失的问题
- 修复 README 章节跳转失败时的错误提示

## [0.3.1] - 2025-11-26

### 文档优化
- 精简 README.md 路线图部分，合并重复的未来计划
- 修复路线图中重复的 v0.3.0 和 v0.4.0 版本号
- 优化版本规划结构，使用 v0.4.0+ 表示未来计划

## [0.3.0] - 2025-11-26

### 新增功能

#### 侧边栏智能刷新
- **创建文件自动刷新**：创建章节或人物后自动刷新侧边栏，立即显示新内容
- **保存文件实时更新**：保存 Markdown 文件时自动更新字数统计和状态
- **文件监控**：通过 FileSystemWatcher 监控 chapters/ 和 characters/ 目录，外部修改也能及时刷新

#### README 人物汇总
- **自动扫描人物**：扫描 characters/ 目录，解析人物 Front Matter 信息
- **分类展示**：按重要性分组展示（主角 > 重要配角 > 次要配角 > 路人）
- **详细信息**：显示人物性别图标（👨👩👤）和首次登场信息
- **智能更新**：创建章节/人物后可选择是否自动更新 README

#### 灵活配置
- **README 更新配置**：新增 `autoUpdateReadmeOnCreate` 配置项
  - `always` - 总是自动更新
  - `ask` - 每次询问（默认）
  - `never` - 从不自动更新

### 技术改进
- 新增 `ErrorHandler` 统一错误处理模块，支持不同严重级别（Error/Warning/Silent）
- 新增 `scanCharacters()` 函数，扫描并解析人物文件 Front Matter
- 优化 README 更新逻辑，使用正则表达式进行更健壮的标题匹配
- 优化人物排序算法，使用显式排序数组确保顺序正确
- 改进 `updateSection()` 和 `updateSectionToEnd()` 函数，修复内容重复问题

### Bug 修复
- 修复 README 更新时重复添加内容的问题（`updateSection` 搜索位置错误）
- 修复人物重要性排序不正确的问题（使用显式排序数组代替 `Object.entries`）
- 统一术语：将"次要角色"改为"次要配角"，保持一致性

### 文档更新
- 更新 CHANGELOG.md 记录 v0.3.0 所有新功能
- 更新 README.md 补充侧边栏刷新和人物汇总说明
- 更新路线图，将已完成功能标记为 ✅

## [0.2.0] - 2025-11-21

### 新增功能

#### 写作辅助
- **专注模式**：一键切换 VSCode Zen Mode，隐藏所有干扰元素，进入纯粹的写作环境
- **自动保存**：插件启动时自动检测并启用 VSCode 自动保存功能（1秒延迟），防止意外丢失内容

#### 侧边栏视图
- **项目概览**：实时显示总字数、章节数、人物数、完成进度等统计信息
- **快捷操作**：集中管理所有常用命令，无需通过命令面板调用
- **章节列表**：以树状结构展示所有章节，显示状态图标和字数
- **人物管理**：集中查看和管理小说人物档案
- **智能刷新**：创建章节/人物时自动刷新侧边栏，保存文件时实时更新统计
- **文件监控**：通过 FileSystemWatcher 监控 chapters/ 和 characters/ 目录，外部修改也能及时刷新

#### README 自动管理
- **人物汇总**：README 中新增"人物设定"章节，自动扫描并分类展示人物（主角、重要配角、次要配角、路人）
- **智能更新**：创建章节/人物后可选择是否自动更新 README
- **灵活配置**：通过 `autoUpdateReadmeOnCreate` 配置控制更新行为（always/ask/never）

#### 配置增强
- **novel.json 集中配置**：所有插件配置现在都优先从 `novel.json` 读取
- **配置优先级**：novel.json（项目级） > VSCode Settings（全局） > 默认值

### 技术改进
- 新增 `ProjectStatsService` 服务，统计项目信息
- 新增 `NovelerViewProvider`，提供完整的侧边栏视图体验
- 新增 `ErrorHandler` 统一错误处理模块，支持不同严重级别
- 优化配置读取逻辑，支持更灵活的配置层级
- 新增 `scanCharacters()` 函数，扫描并解析人物文件 Front Matter
- 改进 README 更新逻辑，修复重复添加内容的问题
- 优化字符排序算法，确保人物按重要性正确排列

### 文档更新
- 更新 README.md 功能说明
- 更新 `docs/novel-json配置说明.md`

### 命令新增
- `Noveler: 切换专注模式` - 进入/退出 Zen Mode
- `Noveler: 刷新视图` - 刷新侧边栏视图

### Bug 修复
- 修复 README 更新时重复添加内容的问题（updateSection 搜索位置错误）
- 修复人物重要性排序不正确的问题（使用显式排序数组代替 Object.entries）
- 统一术语：将"次要角色"改为"次要配角"，保持一致性

## [0.1.0] - 2025-11-19

### 新增功能

#### 语法高亮
- 对话内容高亮：支持多种引号格式（「」、""、''等）
- 心理描写高亮：（）包裹的内容以斜体显示
- 人物名称高亮：自动读取 characters/ 目录和 novel.json 配置
- 省略号特殊标记：… 和 ... 的样式突出显示

#### 项目管理
- 初始化小说项目：一键创建标准项目结构
- 创建新章节：自动计算章节号，支持中文数字（一、十、百、千、万等）
- 创建人物文件：带有完整 Front Matter 的人物档案模板
- README 自动更新：扫描章节统计字数、完成度，自动更新项目 README

#### 字数统计
- 状态栏实时显示：当前文档字数统计
- 详细统计信息：总字数、中文字数、段落数、行数
- 自动排除元数据：Front Matter 和 HTML 注释不计入字数
- Front Matter 自动更新：保存时自动更新章节字数

#### 文档格式化
- 引号标准化：自动转换中英文引号为配置样式
- 标点规范化：统一中文标点符号
- 空格处理：删除中文之间多余空格
- 特殊符号统一：省略号（…）和破折号（——）

#### 配置系统
- 项目级配置：novel.json 支持项目独立配置
- 全局配置：VSCode 设置支持全局默认配置
- 模板系统：可自定义章节、人物、README 等模板
- 配置外置：默认配置抽离到 templates/ 目录便于维护

### 技术改进
- 模块化架构：代码按功能拆分为 commands/、utils/、types/ 等模块
- TypeScript 类型安全：完整的类型定义和接口
- Front Matter 处理：使用 gray-matter 库解析 YAML
- 错误处理优化：用户友好的错误提示信息
- 时间格式优化：统一使用可读格式（YYYY-MM-DD HH:mm:ss）
- 中文数字转换：支持任意大小数字转换（支持万、亿等大单位）

### 文档
- 完整的 README 文档
- Front Matter 字段说明
- 使用指南和示例
- 配置选项说明

### 已知限制
- 语法高亮仅在 Markdown 文件中生效
- 人物名称高亮需要在 novel.json 或 characters/ 中定义
- 格式化功能不影响 Front Matter 和注释内容

---

## [未来计划]

### v0.3.0
- 智能提示（人物、场景、对话）
- 人物关系图可视化
- 章节列表树状视图
- 更丰富的语法高亮规则

### v0.4.0
- 时间线管理工具
- 导出功能（HTML、PDF、EPUB）
- 写作目标跟踪
- AI 写作助手集成
