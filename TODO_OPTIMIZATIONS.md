# Noveler 优化待办清单

本文档列出了所有剩余的优化项目，按优先级和性价比排序。

---

## 📊 总体进度

- ✅ **已完成**: 16 项 (高优 7 + 中优 7 + 低优 2)
- 🚧 **待完成**: 10 项 (低优 10)
- 📈 **完成率**: 62% (16/26)

---

## 🔥 高优先级 (建议本周完成)

### ✅ 1. Logger 全面应用 ⭐⭐⭐⭐⭐ (已完成)
**工作量**: 2-3 小时
**性价比**: 最高
**收益**: 统一日志格式，便于调试和问题追踪

**完成情况**:
- ✅ 在 extension.ts activate() 中初始化 Logger
- ✅ 替换所有 22 处 console 使用为 Logger
- ✅ 更新 errorHandler.ts 使用 Logger
- ✅ 编译验证通过

**已修改文件** (9个):
1. src/extension.ts - 初始化 Logger + 替换 3 处
2. src/providers/highlightProvider.ts - 替换 4 处
3. src/utils/errorHandler.ts - 替换 3 处
4. src/utils/readmeUpdater.ts - 替换 2 处
5. src/utils/frontMatterHelper.ts - 替换 3 处
6. src/commands/createChapter.ts - 替换 1 处
7. src/views/novelerViewProvider.ts - 替换 5 处
8. src/services/projectStatsService.ts - 替换 1 处
9. src/services/configService.ts - 替换 1 处

**完成时间**: 2025-12-02

---

### ✅ 2. 重复代码重构 ⭐⭐⭐⭐ (已完成)
**工作量**: 4-6 小时
**性价比**: 高
**收益**: 减少 124 行重复代码，降低维护成本

**完成情况**:
- ✅ 创建通用的 getMarkdownItems() 方法
- ✅ 重构 getChapterItems() - 从 84 行减少到 30 行
- ✅ 重构 getCharacterItems() - 从 76 行减少到 22 行
- ✅ 重构 getOutlineItems() - 从 76 行减少到 20 行
- ✅ 重构 getReferenceItems() - 从 74 行减少到 20 行
- ✅ 编译验证通过

**代码优化统计**:
- 原始行数: 787 行
- 当前行数: 663 行
- **减少行数**: 124 行
- **减少比例**: 15.7%

**重构方法**:
创建了一个通用的 `getMarkdownItems()` 方法，接受配置对象和 `itemProcessor` 回调函数，将4个几乎相同的方法统一为配置驱动的实现。这大大提高了代码的可维护性和一致性。

**完成时间**: 2025-12-02

---

### ✅ 8. Bug 修复 - 运行时类型错误 ⭐⭐⭐⭐⭐ (已完成)
**工作量**: 1 小时
**性价比**: 极高
**收益**: 修复致命运行时错误，保证扩展稳定性

**问题描述**:
- 用户报告调试控制台出现 `TypeError: name.replace is not a function`
- 错误位置：`highlightProvider.js:226:45`
- 原因：`parsed.data.name` 可能不是字符串类型，导致调用 `.replace()` 失败

**修复方案**:
1. **源头类型转换** (src/providers/highlightProvider.ts:117-121)
   ```typescript
   if (parsed.data && parsed.data.name) {
       // 确保 name 是字符串类型
       const nameStr = typeof parsed.data.name === 'string'
           ? parsed.data.name
           : String(parsed.data.name);
       names.push(nameStr);
   }
   ```

2. **防御性过滤** (src/providers/highlightProvider.ts:168-172)
   ```typescript
   // 过滤并确保所有名称都是字符串
   const validNames = characterNames.filter(name =>
       typeof name === 'string' && name.length > 0
   );
   if (validNames.length === 0) {
       return null;
   }
   ```

**验证结果**:
- ✅ TypeScript 编译成功
- ✅ ESLint 检查通过（0 错误）
- ✅ 运行时类型安全保护已就位

**完成时间**: 2025-12-02

---

## ⚠️ 中优先级 (建议本月完成)

### ✅ 3. ConfigService 单例改进 ⭐⭐⭐ (已完成)
**工作量**: 1 小时
**性价比**: 高
**收益**: 架构更清晰，初始化流程更安全

**完成情况**:
- ✅ 将 `getInstance(_context?)` 分离为 `initialize()` 和 `getInstance()`
- ✅ `initialize()` 仅在 extension.ts 中调用一次
- ✅ `getInstance()` 在未初始化时抛出清晰的错误信息
- ✅ 添加初始化日志记录
- ✅ 编译验证通过

**改进前**:
```typescript
public static getInstance(_context?: vscode.ExtensionContext): ConfigService {
    if (!ConfigService.instance) {
        ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
}
```

**改进后**:
```typescript
public static initialize(): ConfigService {
    if (ConfigService.instance) {
        Logger.warn('ConfigService 已经初始化，忽略重复初始化');
        return ConfigService.instance;
    }
    ConfigService.instance = new ConfigService();
    Logger.debug('ConfigService 初始化完成');
    return ConfigService.instance;
}

public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
        throw new Error('ConfigService not initialized. Call ConfigService.initialize() first in extension.ts');
    }
    return ConfigService.instance;
}
```

**完成时间**: 2025-12-02

---

### ✅ 4. 正则表达式预编译 ⭐⭐⭐⭐ (已完成)
**工作量**: 2 小时
**性价比**: 高
**收益**: 减少正则对象创建开销，提升性能

**完成情况**:
- ✅ wordCountService.ts - 预编译 6 个正则表达式为静态成员
  - HEADER_REGEX = /^#+\s+/
  - SPACE_REGEX = /[\s\u3000]/g
  - CHINESE_CHARS_REGEX = /[\u4e00-\u9fa5]/g
  - CHINESE_PUNCTUATION_REGEX = /[\u3000-\u303f\uff00-\uffef\u2000-\u206f]/g
  - ENGLISH_CHARS_REGEX = /[a-zA-Z0-9]/g
  - ENGLISH_PUNCTUATION_REGEX = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g
- ✅ novelerViewProvider.ts - 预编译 1 个正则表达式为静态成员
  - FIRST_HEADING_REGEX = /^#\s+(.+)$/m
- ✅ 替换所有内联正则为静态成员引用
- ✅ 编译验证通过

**改进前**:
```typescript
// 每次调用都创建新的正则对象
const contentLines = textLines.filter(line => !line.trim().match(/^#+\s+/));
const headingMatch = text.match(/^#\s+(.+)$/m);
```

**改进后**:
```typescript
export class WordCountService {
    private static readonly HEADER_REGEX = /^#+\s+/;

    private processText(text: string): string[] {
        return textLines.filter(line =>
            !line.trim().match(WordCountService.HEADER_REGEX)
        );
    }
}

export class NovelerViewProvider {
    private static readonly FIRST_HEADING_REGEX = /^#\s+(.+)$/m;

    private extractTitle(text: string): string {
        const headingMatch = text.match(NovelerViewProvider.FIRST_HEADING_REGEX);
        // ...
    }
}
```

**完成时间**: 2025-12-02

---

### 5. 文件读取错误恢复 ⭐⭐⭐
**工作量**: 3 小时
**位置**: src/views/novelerViewProvider.ts

**当前问题**: 文件读取失败只显示错误，无法重试

**改进方案**:
1. 添加重试逻辑（最多 3 次）
2. 在错误节点上添加"重新加载"命令
3. 记录错误详情到 OutputChannel

---

### 6. 单元测试 ⭐⭐⭐
**工作量**: 8-12 小时
**收益**: 代码质量保障，防止回归

**测试目标**:
- [ ] wordCountService.ts - 字数统计逻辑
- [ ] frontMatterHelper.ts - Front Matter 解析
- [ ] chineseNumber.ts - 中文数字转换
- [ ] configValidator.ts - 配置验证
- [ ] debouncer.ts - 防抖逻辑

**框架选择**: Jest 或 Mocha + Chai

---

## 💡 低优先级 (长期规划)

### ✅ 7. JSDoc 注释完善 (已完成)
**工作量**: 4 小时
**性价比**: 中
**收益**: 提升代码可维护性，改善开发体验

**完成情况**:
- ✅ 为 ConfigService 添加完整 JSDoc（接口、类、所有公共方法）
- ✅ 为 WordCountService 添加完整 JSDoc（接口、类、所有公共方法）
- ✅ 为 ProjectStatsService 添加完整 JSDoc（接口、类、公共方法）
- ✅ 为 NovelHighlightProvider 添加完整 JSDoc（类、公共方法）
- ✅ 编译验证通过

**已文档化的文件** (4个核心服务):
1. src/services/configService.ts - 配置服务类
2. src/services/wordCountService.ts - 字数统计服务类
3. src/services/projectStatsService.ts - 项目统计服务类
4. src/providers/highlightProvider.ts - 高亮提供器类

**JSDoc 内容**:
- 所有公共接口的完整字段说明
- 所有公共类的详细功能描述
- 所有公共方法的参数、返回值、示例代码
- 使用 @param, @returns, @example 等标准标签

**完成时间**: 2025-12-02

---

## 💡 低优先级 (长期功能)

### 8. 大纲分类功能 ⭐⭐
**工作量**: 4-6 小时
**性价比**: 中
**功能**: 支持 drafts/ 和 references/ 子目录

### 9. 导出功能 ⭐⭐
**工作量**: 12-20 小时
**性价比**: 中
**功能**: 导出为 MD / PDF / EPUB

### 10. 人物关系图 ⭐⭐
**工作量**: 16-24 小时
**性价比**: 低
**功能**: 可视化人物关系

### 11. 写作进度追踪 ⭐⭐⭐
**工作量**: 8-12 小时
**性价比**: 中
**功能**: 每日字数统计、写作曲线

### 12. 智能提示补全 ⭐⭐⭐
**工作量**: 12-16 小时
**性价比**: 中
**功能**: 人物名、地点名自动补全

### 13. 随机起名功能 ⭐⭐⭐⭐
**工作量**: 6-10 小时
**性价比**: 高
**功能**: 多风格姓名生成工具

**实现方案**:
- **中文姓名**: 支持现代、经典、奇幻、历史等多种风格的中文姓名生成
- **英文名字**: 基于 `@faker-js/faker` 库，提供真实的英文姓名组合
- **日语名字**: 包含常见日本姓氏和名字的组合生成
- **奇幻风格**: 专为奇幻小说设计的音节组合名字生成器

**技术栈**:
```typescript
// 依赖安装
npm install @faker-js/faker

// 姓名生成服务
class NameGeneratorService {
    generateChineseName(style: 'modern' | 'classic' | 'fantasy' | 'historical'): string
    generateEnglishName(gender?: 'male' | 'female'): string
    generateJapaneseName(gender?: 'male' | 'female'): string
    generateFantasyName(length?: number): string
}
```

### 14. 手机视图预览 ⭐⭐⭐
**工作量**: 8-12 小时
**性价比**: 中
**功能**: 移动端阅读体验预览

**实现方案**:
- Webview 面板，模拟手机屏幕尺寸
- 实时预览当前章节
- 支持多种屏幕尺寸切换（iPhone、Android）
- 支持深色/浅色主题预览

### 15. 分卷功能 ⭐⭐⭐⭐
**工作量**: 6-8 小时
**性价比**: 高
**功能**: 支持多卷本小说管理

**实现方案**:
```
novel-project/
├── volumes/
│   ├── volume-01/
│   │   ├── chapters/
│   │   └── volume.json
│   ├── volume-02/
│   │   ├── chapters/
│   │   └── volume.json
├── characters/
└── novel.jsonc
```

- 侧边栏树形显示分卷结构
- README 自动生成分卷目录
- 跨卷字数统计

### ✅ 16. 敏感词检测提示 ⭐⭐⭐⭐⭐ (已完成)
**工作量**: 4-6 小时
**性价比**: 极高
**功能**: 实时检测文本中的敏感词汇

**完成情况**:
- ✅ 实现 Trie 树算法进行 O(n) 高效检测
- ✅ 三级词库系统（high/medium/low）
- ✅ 实时下划线标记（防抖 500ms）
- ✅ VSCode Diagnostics API 集成
- ✅ Quick Fix 快速修复菜单（添加白名单、删除、替换、忽略）
- ✅ 自定义黑名单/白名单支持
- ✅ 状态栏显示敏感词数量
- ✅ 可配置检测级别、检测时机、显示方式
- ✅ README 文档完善

**已实现文件**:
1. src/utils/trieTree.ts - Trie 树核心算法
2. src/services/sensitiveWordService.ts - 敏感词检测服务
3. src/providers/sensitiveWordDiagnostic.ts - 诊断提供器
4. src/providers/sensitiveWordCodeAction.ts - Quick Fix 提供器
5. templates/sensitive-words/ - 内置词库（high/medium/low）
6. templates/default-config.jsonc - 配置模板

**完成时间**: 2025-12-03

### 17. 打包优化 ⭐⭐⭐⭐
**工作量**: 4-6 小时
**性价比**: 高
**功能**: 减小扩展包体积，提升加载速度

**实现方案**:
- 使用 webpack/esbuild 打包，减少文件数量
- 配置 `.vscodeignore` 排除不必要文件
- 压缩和混淆代码
- 目标：从 1.2MB 减少到 500KB 以内

**技术步骤**:
```bash
# 1. 安装打包工具
npm install --save-dev webpack webpack-cli ts-loader

# 2. 配置 webpack.config.js
# 3. 更新 package.json scripts
# 4. 测试打包后的扩展
```

---

## 🎯 建议执行顺序

### 第一周
1. ✅ Logger 全面应用 (2-3h) - 完成后立即可用
2. ✅ ConfigService 改进 (1h) - 架构优化
3. ✅ 正则预编译 (2h) - 性能优化

**预期成果**: 日志系统完整，性能提升 5-10%

---

### 第二周
4. ✅ 重复代码重构 (4-6h) - 减少维护成本
5. ✅ 文件错误恢复 (3h) - 提升用户体验

**预期成果**: 代码行数减少 15%，错误处理更友好

---

### 第一个月
6. ✅ 单元测试 (8-12h) - 质量保障
7. ✅ JSDoc 完善 (4h) - 文档完整

**预期成果**: 测试覆盖率 60%+，API 文档完整

---

### 长期 (根据需求)
8-17. 功能增强项目（包括随机起名、手机预览、分卷、敏感词检测、打包优化等）

---

## 📈 预期收益

完成所有中高优先级优化后:
- ✅ 日志系统完整 (便于调试)
- ✅ 性能提升 5-10% (正则优化)
- ✅ 代码量减少 15% (重构)
- ✅ 架构更合理 (单例改进)
- ✅ 错误处理更友好 (重试机制)
- ✅ 测试覆盖 60%+ (质量保障)

总投入: ~25-35 小时
总收益: 显著提升可维护性和用户体验

---

## 🔍 自查工具

```bash
# 查找 console 使用
grep -rn "console\." src/ --include="*.ts" | wc -l

# 查找 any 类型
grep -rn ":\s*any\|as any" src/ --include="*.ts" | wc -l

# 检查编译
npm run compile

# 检查代码质量
npm run lint

# 查找重复代码
npx jscpd src/
```

---

**更新时间**: 2025-12-02
**下次 Review**: 完成高优项目后
