# Noveler 代码规范文档

本文档旨在防止在代码开发过程中重复犯错，确保代码质量和一致性。

## 📋 目录

1. [导入语句规范](#导入语句规范)
2. [类型定义规范](#类型定义规范)
3. [错误处理规范](#错误处理规范)
4. [日志规范](#日志规范)
5. [资源管理规范](#资源管理规范)
6. [配置管理规范](#配置管理规范)
7. [性能优化规范](#性能优化规范)
8. [代码复用规范](#代码复用规范)
9. [测试规范](#测试规范)
10. [提交前检查清单](#提交前检查清单)

---

## 导入语句规范

### ✅ 正确做法

```typescript
// 使用 ES6 默认导入（适用于有默认导出的库）
import matter from 'gray-matter';

// 使用 ES6 命名空间导入（适用于模块导出多个成员）
import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';

// 使用 ES6 解构导入（适用于只需要部分导出）
import { CONFIG_FILE_NAME, CHAPTERS_FOLDER } from '../constants';
```

### ❌ 错误做法

```typescript
// ❌ 混用 CommonJS require（已废弃）
const jsoncParser = require('jsonc-parser');

// ❌ TypeScript 特有的 require 语法（不推荐）
import matter = require('gray-matter');
```

### 🔍 自查方法

```bash
# 查找所有 require 用法
grep -r "require(" src/ --include="*.ts"

# 应该只在极少数特殊情况下使用，正常代码不应出现
```

---

## 类型定义规范

### ✅ 正确做法

```typescript
// 1. 定义明确的接口
export interface ChapterFrontMatter {
    title: string;
    chapter: number;
    wordCount: number;
    targetWords: number;
    characters: string[];
    // ...
}

// 2. 使用类型保护
function validateTemplates(templates: unknown): templates is Templates {
    if (!templates || typeof templates !== 'object') {
        return false;
    }
    const t = templates as Record<string, unknown>;
    return !!(t.chapter && t.character);
}

// 3. 使用联合类型替代 any
type FontStyle = 'normal' | 'italic' | 'oblique' | undefined;

// 4. 使用泛型类型
export type GenericFrontMatter = Record<string, any>; // 仅在确实需要时使用
```

### ❌ 错误做法

```typescript
// ❌ 滥用 any
export function extractFrontMatter(document: vscode.TextDocument): any {
    // ...
}

// ❌ 使用 as any 强制转换
fontStyle: dialogueStyle.fontStyle as any

// ❌ 缺少类型检查
function process(data) {  // 隐式 any
    // ...
}
```

### 🔍 自查方法

```bash
# 查找所有 any 使用
grep -rn ":\s*any" src/ --include="*.ts"
grep -rn "as any" src/ --include="*.ts"

# ESLint 会自动检查并警告
npm run lint
```

---

## 错误处理规范

### ✅ 正确做法

```typescript
// 1. 使用统一的 handleError 工具
import { handleError, ErrorSeverity } from '../utils/errorHandler';

try {
    await someOperation();
} catch (error) {
    handleError('操作失败', error, ErrorSeverity.Error);
    return;
}

// 2. 使用 Logger 记录错误
import { Logger } from '../utils/logger';

try {
    const data = await loadData();
} catch (error) {
    Logger.error('加载数据失败', error);
    throw error; // 或者返回默认值
}

// 3. 提供有意义的错误消息
handleError(
    '章节创建失败：无法写入文件',
    error,
    ErrorSeverity.Error
);
```

### ❌ 错误做法

```typescript
// ❌ 直接使用 console.error + vscode.window.showErrorMessage
try {
    await someOperation();
} catch (error) {
    console.error('Error:', error);
    vscode.window.showErrorMessage('操作失败');
}

// ❌ 吞掉错误
try {
    await riskyOperation();
} catch {
    // 什么都不做
}

// ❌ 错误消息不明确
catch (error) {
    handleError('失败', error);  // 失败了什么？
}
```

### 🔍 自查方法

```bash
# 查找直接使用 console.error 的地方
grep -rn "console\.error" src/ --include="*.ts"

# 查找空 catch 块
grep -A 2 "} catch" src/ --include="*.ts" | grep -B 1 "^$"
```

---

## 日志规范

### ✅ 正确做法

```typescript
import { Logger } from '../utils/logger';

// 1. 使用合适的日志级别
Logger.debug('配置加载详情', { config });  // 开发调试
Logger.info('插件已激活');                 // 重要信息
Logger.warn('配置项缺失，使用默认值');     // 警告
Logger.error('文件读取失败', error);       // 错误

// 2. 性能测量
Logger.timeStart('加载模板');
const templates = await loadTemplates();
Logger.timeEnd('加载模板');

// 3. 提供上下文信息
Logger.info(`创建章节: ${chapterName}`, {
    chapterNumber,
    targetWords
});
```

### ❌ 错误做法

```typescript
// ❌ 直接使用 console.log
console.log('Noveler: 插件已激活');
console.log('配置:', config);

// ❌ 硬编码前缀
console.log('[Noveler] 信息...');

// ❌ 日志级别混乱
console.log('严重错误发生！'); // 应该用 Logger.error
```

### 🔍 自查方法

```bash
# 查找所有 console 使用
grep -rn "console\." src/ --include="*.ts"

# 统计数量
grep -r "console\." src/ --include="*.ts" | wc -l

# 应该全部替换为 Logger
```

---

## 资源管理规范

### ✅ 正确做法

```typescript
// 1. 所有 Disposable 对象必须注册到 context.subscriptions
export async function activate(context: vscode.ExtensionContext) {
    const watcher = vscode.workspace.createFileSystemWatcher(pattern);
    context.subscriptions.push(watcher); // ✅ 注册清理

    const service = new SomeService();
    context.subscriptions.push(service); // ✅ 如果实现了 Disposable
}

// 2. 实现 dispose 方法
export class MyService {
    private timer?: NodeJS.Timeout;

    public dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = undefined;
        }
    }
}

// 3. deactivate 函数中清理全局资源
export function deactivate() {
    wordCountDebouncer?.dispose();
    highlightDebouncer?.dispose();
    readmeUpdateDebouncer?.dispose();
}
```

### ❌ 错误做法

```typescript
// ❌ 创建资源但不清理
const watcher = vscode.workspace.createFileSystemWatcher(pattern);
// 没有 push 到 context.subscriptions

// ❌ 忘记实现 dispose
export class MyService {
    private timer = setInterval(() => {}, 1000);
    // 没有 dispose 方法，会导致内存泄漏
}

// ❌ 缺少 deactivate 函数
// export function deactivate() {} // 应该实现
```

### 🔍 自查方法

```bash
# 查找所有 createFileSystemWatcher
grep -rn "createFileSystemWatcher" src/ --include="*.ts"

# 检查是否都有 push(
grep -A 2 "createFileSystemWatcher" src/ --include="*.ts" | grep "push"

# 检查是否有 deactivate 函数
grep -n "export function deactivate" src/extension.ts
```

---

## 配置管理规范

### ✅ 正确做法

```typescript
// 1. 使用常量而非魔法数字/字符串
import { README_UPDATE_DEBOUNCE_DELAY } from '../constants';
const debouncer = new Debouncer(README_UPDATE_DEBOUNCE_DELAY);

// 2. 等待配置加载完成
const configService = ConfigService.getInstance();
await configService.waitForConfig(); // ✅ 等待加载
const targetWords = configService.getTargetWords();

// 3. 订阅配置变更
configService.onDidChangeConfig((config) => {
    // 响应配置变更
    this.refresh();
});

// 4. 验证配置
const errors = validateConfig(config);
if (errors.length > 0) {
    // 处理验证错误
}
```

### ❌ 错误做法

```typescript
// ❌ 硬编码魔法数字
const debouncer = new Debouncer(5000); // 5000 是什么？

// ❌ 不等待配置加载
const configService = ConfigService.getInstance();
const targetWords = configService.getTargetWords(); // 可能获取到默认值

// ❌ 不验证配置
this.config = fullConfig.noveler; // 直接使用，可能有错误数据
```

### 🔍 自查方法

```bash
# 查找硬编码的数字（大于 100）
grep -rn "[0-9]\{4,\}" src/ --include="*.ts" | grep -v "//"

# 查找 getInstance 后是否等待
grep -A 3 "ConfigService\.getInstance" src/ --include="*.ts"
```

---

## 性能优化规范

### ✅ 正确做法

```typescript
// 1. 使用缓存避免重复计算
export class WordCountService {
    private cache = new Map<string, { stats: WordCountStats; version: number }>();

    getWordCount(document: vscode.TextDocument): WordCountStats {
        const uri = document.uri.toString();
        const cached = this.cache.get(uri);

        if (cached && cached.version === document.version) {
            return cached.stats; // ✅ 返回缓存
        }

        const stats = this.calculateStats(...);
        this.cache.set(uri, { stats, version: document.version });
        return stats;
    }
}

// 2. 预编译正则表达式
export class WordCountService {
    private static readonly HEADER_REGEX = /^#+\s+/;

    private processText(text: string): string {
        return text.replace(WordCountService.HEADER_REGEX, '');
    }
}

// 3. 使用防抖优化频繁操作
private debouncer = new Debouncer(300);

onTextChange() {
    this.debouncer.debounce(() => {
        this.updateWordCount();
    });
}
```

### ❌ 错误做法

```typescript
// ❌ 每次都重新计算
getWordCount(document: vscode.TextDocument): WordCountStats {
    return this.calculateStats(...); // 没有缓存
}

// ❌ 每次创建新正则
private processLine(line: string): string {
    return line.replace(/^#+\s+/, ''); // 每次都创建新正则对象
}

// ❌ 没有防抖，频繁触发
onTextChange() {
    this.updateWordCount(); // 每次输入都执行
}
```

### 🔍 自查方法

```bash
# 查找在循环中创建正则表达式
grep -rn "\.replace(/\|\.match(/" src/ --include="*.ts"

# 查看是否有缓存机制
grep -rn "Map<.*>" src/ --include="*.ts"
```

---

## 代码复用规范

### ✅ 正确做法

```typescript
// 1. 提取通用逻辑到工具函数
private async getMarkdownItems(
    folderName: string,
    nodeType: NodeType,
    iconPrefix: string,
    titleExtractor: (content: string, filename: string) => string
): Promise<NovelerTreeItem[]> {
    // 通用文件读取、排序、错误处理逻辑
}

// 2. 使用工具函数
const chapters = await this.getMarkdownItems(
    CHAPTERS_FOLDER,
    NodeType.ChapterItem,
    '📄',
    this.extractChapterTitle
);

const characters = await this.getMarkdownItems(
    CHARACTERS_FOLDER,
    NodeType.CharacterItem,
    '👤',
    this.extractCharacterName
);
```

### ❌ 错误做法

```typescript
// ❌ 复制粘贴相似代码
async getChapterItems() {
    const files = await vscode.workspace.fs.readDirectory(...);
    const mdFiles = files.filter(...);
    // 100 行代码
}

async getCharacterItems() {
    const files = await vscode.workspace.fs.readDirectory(...);
    const mdFiles = files.filter(...);
    // 100 行几乎相同的代码
}

async getOutlineItems() {
    const files = await vscode.workspace.fs.readDirectory(...);
    const mdFiles = files.filter(...);
    // 又是 100 行相同的代码
}
```

### 🔍 自查方法

```bash
# 使用工具检查代码重复度
npx jscpd src/

# 人工 review：如果两个函数有 >70% 相似代码，考虑提取
```

---

## 测试规范

### ✅ 正确做法（待实现）

```typescript
// tests/wordCountService.test.ts
import { WordCountService } from '../src/services/wordCountService';

describe('WordCountService', () => {
    it('should count Chinese characters correctly', () => {
        const service = new WordCountService();
        const text = '这是一个测试';
        const count = WordCountService.getSimpleWordCount(text);
        expect(count).toBe(6);
    });

    it('should exclude headers when specified', () => {
        const text = '# 标题\n正文内容';
        const count = WordCountService.getSimpleWordCount(text, true);
        expect(count).toBe(4); // 不包含"# 标题"
    });
});
```

### 🎯 测试覆盖目标

- 核心工具函数：100% 覆盖
- Services：>80% 覆盖
- Providers：>60% 覆盖
- Commands：>60% 覆盖

---

## 提交前检查清单

### 📝 代码质量检查

```bash
# 1. 编译检查
npm run compile

# 2. Lint 检查
npm run lint

# 3. 格式化检查（如果安装了 Prettier）
npx prettier --check "src/**/*.ts"

# 4. 查找 TODO 和 FIXME
grep -rn "TODO\|FIXME" src/

# 5. 查找 console.log（应该使用 Logger）
grep -rn "console\." src/ --include="*.ts"

# 6. 查找 any 类型
grep -rn ":\s*any\|as any" src/ --include="*.ts"

# 7. 查找硬编码的魔法数字/字符串
grep -rn "['\"][0-9]\{4,\}['\"]" src/ --include="*.ts"
```

### ✅ 功能检查

- [ ] 所有新增功能都有对应的类型定义
- [ ] 所有错误都使用 `handleError` 或 `Logger.error` 处理
- [ ] 所有 Disposable 资源都正确清理
- [ ] 所有配置项都从 `ConfigService` 读取，不硬编码
- [ ] 所有频繁调用的函数都考虑了性能优化（缓存/防抖）
- [ ] 没有重复代码（如果有，提取为公共函数）
- [ ] 添加了必要的 JSDoc 注释
- [ ] 更新了 CHANGELOG.md（如果是新功能或 bug 修复）

### ⚠️ 常见错误检查

- [ ] 是否使用了 `require()` 而非 ES6 `import`？
- [ ] 是否使用了 `any` 类型而没有充分理由？
- [ ] 是否使用了 `console.log` 而非 `Logger`？
- [ ] 是否有未注册到 `context.subscriptions` 的 Disposable 对象？
- [ ] 是否有硬编码的配置值（应该在 constants.ts 或 novel.jsonc）？
- [ ] 是否有重复的代码逻辑（应该提取为公共函数）？
- [ ] 是否直接使用 `vscode.window.showErrorMessage` 而非 `handleError`？
- [ ] 是否在获取配置前等待 `waitForConfig()`？

---

## 🔄 代码 Review 要点

在提交 PR 时，reviewer 会重点关注：

1. **类型安全**：是否有 `any` 类型
2. **错误处理**：是否统一使用 `handleError` 和 `Logger`
3. **资源管理**：是否正确清理资源
4. **性能**：是否有不必要的重复计算
5. **代码复用**：是否有重复代码
6. **一致性**：是否符合本规范文档的要求

---

## 📚 参考资源

- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [ESLint 规则](https://eslint.org/docs/rules/)
- [Prettier 配置](https://prettier.io/docs/en/configuration.html)

---

## 📞 联系方式

如有疑问，请：
1. 查阅本文档
2. 查看现有代码示例
3. 在 GitHub Issues 中提问

---

**最后更新**: 2025-12-02
**版本**: v1.0.0
