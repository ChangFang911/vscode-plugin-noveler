# Noveler - 中文小说写作助手

专为中文小说写作设计的 VS Code 插件，提供语法高亮、格式化、字数统计等实用功能，让创作更加流畅。

## 功能特性

### ✨ 已实现功能

#### 1. 语法高亮
- **对话高亮**：支持多种引号格式 `「」` `""` `""` `''` `""` `''`
- **心理描写**：突出显示 `（）` 包裹的心理活动，斜体显示
- **人物名称**：自动读取 `characters/` 目录和 `novel.json` 中配置的人物名称进行高亮
- **省略号**：特殊标记省略号 `…` 和 `...`

#### 2. 实时字数统计
- 状态栏显示当前文档字数（包含标点符号）
- 自动排除 Front Matter 和 HTML 注释
- 支持查看详细统计信息（总字数、中文字数、段落数、行数）

#### 3. 智能格式化
- **引号统一**：自动转换中英文引号为配置的样式
- **标点规范**：统一中文标点符号
- **空格处理**：删除中文之间多余的空格
- **特殊符号**：统一省略号（…）和破折号（——）

#### 4. 快速创建章节
- 一键创建带有 Front Matter 的标准章节文件
- 自动计算章节序号（如：第一章、第二章...）
- 自动组织到 `chapters/` 目录

## 安装使用

### 开发环境安装

1. **克隆项目并安装依赖**
```bash
git clone https://github.com/ChangFang911/vscode-plugin-noveler.git
cd vscode-plugin-noveler
npm install
```

2. **编译项目**
```bash
npm run compile
```

3. **调试运行**
- 按 `F5` 启动扩展开发主机
- 或在 VS Code 中选择 "Run > Start Debugging"

### 生产环境打包

```bash
npm install -g @vscode/vsce
vsce package
```

生成的 `.vsix` 文件可以通过 "Extensions: Install from VSIX" 命令安装。

## 使用指南

### 创建小说项目

1. **初始化项目**
- 打开一个空文件夹作为工作区
- 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
- 输入 "Noveler: 初始化小说项目"
- 按提示输入小说名称
- 插件会自动创建以下目录结构：

```
my-novel/
├── chapters/              # 章节目录
├── characters/            # 人物目录
├── drafts/                # 草稿和大纲
│   └── 大纲.md            # 自动创建的大纲模板
├── references/            # 参考资料
├── novel.json            # 小说配置文件
└── README.md             # 项目说明
```

2. **创建新章节**
- 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
- 输入 "Noveler: 创建新章节"
- 按提示输入章节标题（章节号会自动计算）

3. **创建人物**
- 按 `Cmd+Shift+P` (Mac) 或 `Ctrl+Shift+P` (Windows/Linux)
- 输入 "Noveler: 创建人物"
- 按提示输入人物名称
- 插件会在 `characters/` 目录下创建人物 MD 文件

### 章节文件格式

```markdown
---
title: "第一章 初入江湖"
chapter: 1
wordCount: 0
targetWords: 5000
characters: ["张无忌", "周芷若"]
locations: ["武当山"]
tags: ["武侠", "成长"]
created: 2025-11-18T10:00:00
modified: 2025-11-18T10:00:00
status: "草稿"
---

# 第一章 初入江湖

清晨的阳光透过窗棂洒在青石板上。

「师父，我想下山。」张无忌低声说道。

（这孩子终于长大了。）老道长抚须而笑。

---

三天后，山门前。

张无忌背着行囊，转身下山……

<!-- noveler:scene 场景：武当山大殿 -->
<!-- noveler:note 作者备注：这里需要增加更多环境描写 -->
```

### 人物文件格式

```markdown
---
name: "张无忌"
gender: "男"
age: "20"
appearance: "眉清目秀，英俊潇洒"
personality: "善良仁慈，优柔寡断"
background: "武当派弟子，明教教主"
relationships: ["周芷若", "赵敏", "谢逊"]
abilities: ["九阳神功", "乾坤大挪移"]
importance: "主角"
firstAppearance: "第一章"
tags: ["主角", "武林盟主"]
created: 2025-11-18T10:00:00
modified: 2025-11-18T10:00:00
---

# 张无忌

## 基本信息

- **性别**：男
- **年龄**：20
- **身份**：明教教主
- **出场**：第一章

## 外貌描写

眉清目秀，身材修长...

## 性格特点

心地善良，但优柔寡断...

## 背景故事

出身武当，父母被害...

## 人际关系

- **周芷若**：青梅竹马
- **赵敏**：相爱相杀
- **谢逊**：义父

## 能力特长

- 九阳神功
- 乾坤大挪移

## 成长轨迹

从懵懂少年到武林盟主...

## 重要事件

- 冰火岛学艺
- 光明顶大战
- 六大派围攻

## 备注

人物塑造的核心是成长与抉择...
```

### 常用命令

| 命令 | 说明 | 快捷键 |
|------|------|--------|
| `Noveler: 初始化小说项目` | 在空文件夹中初始化项目结构 | - |
| `Noveler: 创建新章节` | 创建新章节文件 | - |
| `Noveler: 创建人物` | 创建人物文件 | - |
| `Noveler: 格式化文档` | 格式化当前文档 | - |
| `Noveler: 显示字数统计` | 显示详细字数统计 | - |

### 配置选项

Noveler 支持两种配置方式：

#### 1. 项目级配置（推荐）

在项目根目录的 `novel.json` 文件中配置：

```json
{
  "name": "我的小说",
  "noveler": {
    "highlight": {
      "dialogue": {
        "color": "#ce9178",
        "backgroundColor": "rgba(206, 145, 120, 0.15)"
      },
      "thought": {
        "color": "#608b4e",
        "backgroundColor": "rgba(96, 139, 78, 0.15)",
        "fontStyle": "italic"
      },
      "character": {
        "color": "#4ec9b0",
        "backgroundColor": "rgba(78, 201, 176, 0.15)",
        "fontWeight": "bold"
      },
      "ellipsis": {
        "color": "#569cd6",
        "backgroundColor": "rgba(86, 156, 214, 0.15)"
      }
    },
    "format": {
      "chineseQuoteStyle": "「」",
      "autoFormat": true,
      "convertQuotes": true
    },
    "wordCount": {
      "showInStatusBar": true,
      "includePunctuation": true
    },
    "characters": ["张无忌", "周芷若", "赵敏"]
  }
}
```

详细配置说明请查看 [novel.json 配置文档](docs/novel-json配置说明.md)

#### 2. 全局配置（VSCode 设置）

在 VS Code 设置中搜索 "Noveler"：

```json
{
  // 保存时自动格式化
  "noveler.autoFormat": true,

  // 在状态栏显示字数
  "noveler.showWordCountInStatusBar": true,

  // 中文引号样式：「」 或 ""
  "noveler.chineseQuoteStyle": "「」"
}
```

## Front Matter 字段说明

### 章节文件字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| title | string | 章节标题 | ✓ |
| chapter | number | 章节号 | ✓ |
| wordCount | number | 字数（自动统计） | - |
| targetWords | number | 目标字数 | - |
| characters | string[] | 出场人物 | - |
| locations | string[] | 场景地点 | - |
| tags | string[] | 标签 | - |
| created | datetime | 创建时间 | - |
| modified | datetime | 修改时间 | - |
| status | enum | 状态：草稿/初稿/修改中/完成 | - |

### 人物文件字段

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| name | string | 人物名称 | ✓ |
| gender | string | 性别 | - |
| age | string | 年龄 | - |
| appearance | string | 外貌描述 | - |
| personality | string | 性格描述 | - |
| background | string | 背景故事 | - |
| relationships | string[] | 人际关系 | - |
| abilities | string[] | 能力特长 | - |
| importance | enum | 重要性：主角/重要配角/次要角色/路人 | - |
| firstAppearance | string | 首次出场章节 | - |
| tags | string[] | 标签 | - |
| created | datetime | 创建时间 | - |
| modified | datetime | 修改时间 | - |

## HTML 注释标记

插件识别以下特殊注释（不会显示在导出内容中）：

```markdown
<!-- noveler:scene 场景描述 -->
<!-- noveler:character name="人物名" emotion="情绪" -->
<!-- noveler:dialog speaker="说话人" emotion="情绪" -->
<!-- noveler:note 作者备注 -->
<!-- noveler:todo 待办事项 -->
<!-- noveler:highlight 重点标记 -->
```

## 语法高亮示例

- **对话**：`「你好」` `"你好"` `"你好"` `'你好'` → 橙色背景高亮
- **心理**：`（他在想什么？）` → 绿色背景斜体
- **省略号**：`……` `...` → 蓝色背景加粗
- **人物**：`张无忌说道` → "张无忌"青色背景加粗

## 技术栈

- **开发语言**: TypeScript
- **插件框架**: VS Code Extension API
- **语法高亮**: Decorator API（动态高亮）
- **文档格式**: Markdown + Front Matter (YAML)

## 路线图

### v0.1.0 (当前版本)
- ✅ 基础语法高亮
- ✅ 实时字数统计
- ✅ 文档格式化
- ✅ 创建章节模板

### v0.2.0 (计划中)
- ⏳ 智能提示（人物、场景、对话）
- ⏳ 人物管理面板
- ⏳ 章节大纲视图
- ⏳ 更丰富的语法高亮规则

### v0.3.0 (计划中)
- ⏳ 时间线管理
- ⏳ 导出功能（HTML、PDF、EPUB）
- ⏳ 写作目标跟踪
- ⏳ AI 写作助手

## 常见问题

### Q: 字数统计不准确？
A: 字数统计会自动排除 Front Matter、HTML 注释和 Markdown 标题标记，只计算正文内容。

### Q: 如何自定义语法高亮颜色？
A: 当前使用 Decorator API 实现高亮，颜色在代码中硬编码。未来版本会提供配置选项。

### Q: 格式化会覆盖我的内容吗？
A: 格式化只会调整标点符号和空格，不会修改文字内容。且 Front Matter 和 HTML 注释内容不会被格式化。

## 贡献

欢迎提交 Issue 和 Pull Request！

## 开源协议

MIT License

## 联系方式

- GitHub: [https://github.com/ChangFang911/vscode-plugin-noveler](https://github.com/ChangFang911/vscode-plugin-noveler)
- Issues: [提交问题](https://github.com/ChangFang911/vscode-plugin-noveler/issues)

---

**Happy Writing! 祝写作愉快！** ✍️
