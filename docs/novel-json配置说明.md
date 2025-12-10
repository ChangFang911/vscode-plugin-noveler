# novel.jsonc 配置说明

`novel.jsonc` 是小说项目的配置文件，包含小说信息和 Noveler 插件的配置。

> 💡 推荐使用 `.jsonc` 格式，支持注释。也可以使用 `.json` 格式（不支持注释）。

---

## 📋 目录

- [完整配置示例](#完整配置示例)
- [基本信息](#基本信息)
- [插件配置](#插件配置)
  - [语法高亮 (highlight)](#highlight---语法高亮配置)
  - [格式化 (format)](#format---格式化配置)
  - [字数统计 (wordCount)](#wordcount---字数统计配置)
  - [敏感词检测 (sensitiveWords)](#sensitivewords---敏感词检测配置)
  - [分卷管理 (volumes)](#volumes---分卷管理配置)
  - [写作辅助](#写作辅助配置)
  - [编辑器 (editor)](#editor---编辑器配置)
  - [全局人物 (characters)](#characters---全局人物名称配置)
- [自定义颜色方案](#自定义颜色方案示例)
- [使用说明](#使用说明)
- [常见问题](#常见问题)

---

## 完整配置示例

```jsonc
{
  "name": "我的小说",
  "author": "作者名",
  "description": "小说简介",
  "genre": "武侠",
  "tags": ["成长", "江湖"],
  "created": "2025-11-18T10:00:00",
  "modified": "2025-11-18T10:00:00",

  "noveler": {
    // 语法高亮配置
    "highlight": {
      "dialogue": {
        "color": "#ce9178",
        "backgroundColor": "rgba(206, 145, 120, 0.15)",
        "fontStyle": "normal"
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
        "backgroundColor": "rgba(86, 156, 214, 0.15)",
        "fontWeight": "bold"
      }
    },

    // 格式化配置
    "format": {
      "chineseQuoteStyle": "「」",
      "autoFormat": true,
      "convertQuotes": true
    },

    // 字数统计配置
    "wordCount": {
      "showInStatusBar": true,
      "includePunctuation": true
    },

    // 敏感词检测配置 (v0.3.4+)
    "sensitiveWords": {
      "enabled": true,
      "levels": {
        "high": true,      // 高危词库
        "medium": true,    // 中危词库
        "low": false       // 低危词库
      },
      "checkOnType": true,
      "checkOnSave": true,
      "customWords": {
        "enabled": true,
        "blacklistPath": ".noveler/sensitive-words/blacklist.json",
        "whitelistPath": ".noveler/sensitive-words/whitelist.json"
      },
      "display": {
        "severity": "Warning",
        "showInProblems": true,
        "showWordCount": true
      }
    },

    // 分卷管理配置 (v0.5.0+)
    "volumes": {
      "enabled": false,
      "chapterNumbering": "sequential",  // sequential | reset | hybrid
      "folderStructure": "nested"        // flat | nested
    },

    // 写作辅助配置
    "autoEmptyLine": true,        // 自动空行
    "paragraphIndent": true,      // 段落缩进
    "autoSave": true,             // 自动保存

    // README 自动更新配置
    "readmeAutoUpdate": "ask",    // always | ask | never

    // 编辑器配置
    "editor": {
      "markdownFontSize": 16
    },

    // 全局人物名称
    "characters": ["张无忌", "周芷若", "赵敏"]
  }
}
```

---

## 基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 小说名称 |
| author | string | 作者名 |
| description | string | 小说简介 |
| genre | string | 类型（如：武侠、仙侠、都市） |
| tags | string[] | 标签 |
| created | datetime | 创建时间 |
| modified | datetime | 修改时间 |

---

## 插件配置

所有 Noveler 插件的配置都在 `noveler` 对象下。

### highlight - 语法高亮配置

每种高亮类型支持以下属性：

| 属性 | 类型 | 说明 | 示例 |
|------|------|------|------|
| color | string | 文字颜色 | "#ce9178" |
| backgroundColor | string | 背景颜色 | "rgba(206, 145, 120, 0.15)" |
| fontStyle | string | 字体样式 | "normal", "italic" |
| fontWeight | string | 字体粗细 | "normal", "bold" |

**高亮类型：**

- `dialogue`: 对话内容（各种引号包裹的文字）
- `thought`: 心理描写（括号包裹的文字）
- `character`: 人物名称
- `ellipsis`: 省略号

**颜色格式：**

- 十六进制：`"#ce9178"`
- RGB/RGBA：`"rgb(206, 145, 120)"` 或 `"rgba(206, 145, 120, 0.15)"`
- 颜色名：`"red"`, `"blue"` 等

---

### format - 格式化配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| chineseQuoteStyle | string | 中文引号样式 | "「」" |
| autoFormat | boolean | 保存时自动格式化 | true |
| convertQuotes | boolean | 是否转换引号 | true |

**引号样式选项：**
- `"「」"` - 中文直角引号
- `"\"\""` - 中文弯引号
- `"''"` - 中文单引号

**convertQuotes 说明：**
- `true`（默认）：格式化时会统一引号为 `chineseQuoteStyle` 配置的样式
- `false`：格式化时不转换引号，保持原样

---

### wordCount - 字数统计配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| showInStatusBar | boolean | 在状态栏显示字数 | true |
| includePunctuation | boolean | 字数包含标点符号 | true |

**字数统计说明（v0.3.2+）：**
- **总计** = 正文 + 标点（不含空格）
- **正文** = 中文汉字 + 英文字母和数字（不含标点、不含空格）
- **标点** = 中文标点（含 `""`、`…`、`—` 等）+ 英文标点
- **自动排除**：
  - Front Matter（YAML 元数据）
  - Markdown 标题（`#` 开头的行）
  - HTML 注释（`<!-- ... -->`）
  - 所有空格（全角和半角）
- **状态栏显示**：`总计 xxx | 正文 xxx | 标点 xxx`
- **选中文本统计**：选中任何文本（包括标题）时显示选中部分的字数
- **侧边栏 hover**：鼠标悬停章节名称即可查看详细字数统计

---

### sensitiveWords - 敏感词检测配置

> ⚠️ v0.3.4+ 新增功能

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| enabled | boolean | 是否启用敏感词检测 | true |
| levels.high | boolean | 启用高危词库 | true |
| levels.medium | boolean | 启用中危词库 | true |
| levels.low | boolean | 启用低危词库 | false |
| checkOnType | boolean | 输入时检测 | true |
| checkOnSave | boolean | 保存时检测 | true |

**词库级别说明：**
- **high（高危）**：政治、严重暴力、严重违法 - 推荐启用
- **medium（中危）**：色情、一般违法、宗教敏感 - 推荐启用
- **low（低危）**：广告、争议词汇、不文明用语 - 可选启用

**自定义词库配置：**

```jsonc
"customWords": {
  "enabled": true,
  "blacklistPath": ".noveler/sensitive-words/blacklist.json",  // 自定义黑名单路径
  "whitelistPath": ".noveler/sensitive-words/whitelist.json"   // 自定义白名单路径
}
```

**显示配置：**

```jsonc
"display": {
  "severity": "Warning",        // Error | Warning | Information | Hint
  "showInProblems": true,       // 在问题面板显示
  "showWordCount": true         // 状态栏显示敏感词数量
}
```

**示例配置：**

```jsonc
// 只启用高危词库
"sensitiveWords": {
  "enabled": true,
  "levels": {
    "high": true,
    "medium": false,
    "low": false
  }
}

// 完全禁用敏感词检测
"sensitiveWords": {
  "enabled": false
}
```

---

### volumes - 分卷管理配置

> ⚠️ v0.5.0+ 新增功能

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| enabled | boolean | 是否启用分卷功能 | false |
| chapterNumbering | string | 章节编号模式 | "sequential" |
| folderStructure | string | 文件夹结构 | "nested" |

**章节编号模式（chapterNumbering）：**

- **sequential（全局连续）**：所有章节连续编号
  - 示例：第 1 章、第 2 章、第 3 章...

- **reset（按卷重置）**：每卷重新编号
  - 示例：第一卷-第 1 章、第一卷-第 2 章、第二卷-第 1 章...

- **hybrid（混合模式）**：卷内连续，全局也连续
  - 示例：第 1 章 [卷1-1]、第 2 章 [卷1-2]、第 3 章 [卷2-1]...

**文件夹结构（folderStructure）：**

- **nested（嵌套结构）**：每卷一个文件夹
  ```
  chapters/
  ├── 第一卷-崛起/
  │   ├── 第1章.md
  │   └── 第2章.md
  └── 第二卷-修炼/
      ├── 第1章.md
      └── 第2章.md
  ```

- **flat（扁平结构）**：所有章节在同一目录
  ```
  chapters/
  ├── 第1章.md
  ├── 第2章.md
  └── 第3章.md
  ```

**示例配置：**

```jsonc
// 启用分卷，按卷重置编号
"volumes": {
  "enabled": true,
  "chapterNumbering": "reset",
  "folderStructure": "nested"
}

// 扁平结构（不使用分卷）
"volumes": {
  "enabled": false
}
```

---

### 写作辅助配置

#### autoEmptyLine - 自动空行

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| autoEmptyLine | boolean | 按回车时自动插入空行 | true |

**说明：**
- 仅在 `chapters/` 目录下的 Markdown 文件中生效
- 帮助保持段落间距，提升阅读体验
- 避免手动添加空行的繁琐操作

---

#### paragraphIndent - 段落缩进

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| paragraphIndent | boolean | 自动添加段落缩进 | true |

**说明：**
- 自动添加两个全角空格作为段落缩进
- 符合中文写作习惯
- 与自动空行功能可同时使用

---

#### autoSave - 自动保存

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| autoSave | boolean | 自动启用 VSCode 自动保存 | true |

**说明：**
- 启用后会在工作区级别开启 VSCode 的自动保存功能
- 保存延迟：1000ms（1秒）
- 防止意外丢失内容

---

#### readmeAutoUpdate - README 自动更新

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| readmeAutoUpdate | string | README 自动更新策略 | "ask" |

**可选值：**
- **always**：创建章节/人物后自动更新 README
- **ask**：创建后询问是否更新（推荐）
- **never**：不自动更新，需手动触发

---

### editor - 编辑器配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| markdownFontSize | number | Markdown 文件字号 | 无（使用编辑器默认） |

**说明：**
- 设置后，打开 Markdown 文件时会自动应用该字号
- 切换到其他类型文件时自动恢复原始字号
- 推荐值：16-18，适合长时间阅读和写作
- 留空则使用 VSCode 编辑器的默认字号

---

### characters - 全局人物名称配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| characters | string[] | 需要高亮的人物名称列表 | [] |

**说明：**
- 配置的人物名称会在所有章节中自动高亮
- 与 `characters/` 目录中的人物文件配置互补
- 两个来源的人物名称会自动合并去重
- 适合快速添加人物名称，无需创建完整的人物文件

**示例：**
```jsonc
"characters": ["张无忌", "周芷若", "赵敏", "谢逊"]
```

---

## 自定义颜色方案示例

### 深色主题方案

```jsonc
"highlight": {
  "dialogue": {
    "color": "#d19a66",
    "backgroundColor": "rgba(209, 154, 102, 0.1)"
  },
  "thought": {
    "color": "#98c379",
    "backgroundColor": "rgba(152, 195, 121, 0.1)"
  },
  "character": {
    "color": "#61afef",
    "backgroundColor": "rgba(97, 175, 239, 0.1)"
  },
  "ellipsis": {
    "color": "#c678dd",
    "backgroundColor": "rgba(198, 120, 221, 0.1)"
  }
}
```

### 浅色主题方案

```jsonc
"highlight": {
  "dialogue": {
    "color": "#d73a49",
    "backgroundColor": "rgba(215, 58, 73, 0.08)"
  },
  "thought": {
    "color": "#22863a",
    "backgroundColor": "rgba(34, 134, 58, 0.08)"
  },
  "character": {
    "color": "#005cc5",
    "backgroundColor": "rgba(0, 92, 197, 0.08)"
  },
  "ellipsis": {
    "color": "#6f42c1",
    "backgroundColor": "rgba(111, 66, 193, 0.08)"
  }
}
```

### 高对比度方案

```jsonc
"highlight": {
  "dialogue": {
    "color": "#ff6b6b",
    "backgroundColor": "rgba(255, 107, 107, 0.2)",
    "fontStyle": "normal"
  },
  "thought": {
    "color": "#51cf66",
    "backgroundColor": "rgba(81, 207, 102, 0.2)",
    "fontStyle": "italic"
  },
  "character": {
    "color": "#339af0",
    "backgroundColor": "rgba(51, 154, 240, 0.2)",
    "fontWeight": "bold"
  },
  "ellipsis": {
    "color": "#cc5de8",
    "backgroundColor": "rgba(204, 93, 232, 0.2)",
    "fontWeight": "bold"
  }
}
```

---

## 使用说明

### 1. 配置文件格式

- **推荐使用 `novel.jsonc`**：支持注释，更易维护
- 也可使用 `novel.json`：标准 JSON 格式，不支持注释
- 插件优先读取 `.jsonc`，如果不存在则读取 `.json`

### 2. 修改配置后生效

- 修改 `novel.jsonc` 后保存
- 配置会自动重新加载
- 如果没有自动生效，运行命令 `Noveler: 重载高亮配置`

### 3. 配置优先级

- `novel.jsonc` 中的配置优先于 VSCode 的 settings.json
- 如果 `novel.jsonc` 中没有配置某项，会使用默认值

### 4. 配置验证

- 配置文件必须是合法的 JSON/JSONC 格式
- 颜色值必须是有效的 CSS 颜色格式
- 如果配置错误，会使用默认值并在控制台显示警告

### 5. 配置迁移

- 插件会自动检测并迁移旧版本配置
- 迁移过程不会丢失任何自定义配置
- 详见：[配置迁移说明](CONFIG_MIGRATION.md)

---

## 常见问题

### Q: 修改配置后没有立即生效？
**A**: 尝试以下方法：
1. 运行命令 `Noveler: 重载高亮配置`
2. 重新打开文件
3. 刷新侧边栏
4. 重启 VS Code（极少数情况）

### Q: 如何恢复默认配置？
**A**: 两种方式：
1. 删除 `noveler` 配置节
2. 使用命令 `Noveler: 打开配置文件` 并选择"创建"重新生成

### Q: 可以只配置部分选项吗？
**A**: 可以。未配置的选项会使用默认值。

### Q: 颜色不够明显怎么办？
**A**: 调整 `backgroundColor` 的透明度（rgba 中的最后一个值），或使用高对比度方案。

### Q: novel.json 和 novel.jsonc 有什么区别？
**A**:
- `novel.jsonc`：支持注释（`//` 和 `/* */`），推荐使用
- `novel.json`：标准 JSON，不支持注释

### Q: 配置文件可以共享吗？
**A**: 可以。提交到 Git 仓库，团队成员克隆后即可使用统一配置。

### Q: 如何备份配置？
**A**: 直接复制 `novel.jsonc` 文件即可。

### Q: 敏感词检测影响性能吗？
**A**: 不会。使用了防抖技术和高效算法（Trie 树），只在必要时检测。

### Q: 分卷功能如何迁移？
**A**: 使用命令 `Noveler: 迁移到分卷结构`，插件会引导你完成迁移，支持随时回滚。

---

## 📚 相关文档

- [文件格式说明](文件格式说明.md) - Front Matter 字段详解
- [FAQ](FAQ.md) - 常见问题解答
- [配置迁移说明](CONFIG_MIGRATION.md) - 配置自动迁移系统
- [CHANGELOG](../CHANGELOG.md) - 更新日志

---

## 📋 配置版本历史

- **v0.1.0**：基础配置（highlight, format, wordCount）
- **v0.2.0**：新增 autoEmptyLine, characters
- **v0.3.0**：新增 editor.markdownFontSize
- **v0.3.4**：新增 sensitiveWords（敏感词检测）
- **v0.5.0**：新增 volumes（分卷管理）、paragraphIndent
- **v0.6.0**：新增 readmeAutoUpdate

---

**提示**：推荐使用 `novel.jsonc` 格式，可以添加注释方便理解配置用途。
