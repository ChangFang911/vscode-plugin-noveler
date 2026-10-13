# novel.jsonc 配置说明

本文按插件 0.8.8 和当前工作区实现校对。插件版本与配置版本分别管理，当前配置版本是 0.6.4。
项目配置必须使用根目录的 `novel.jsonc`，支持注释和尾逗号；主配置不会回退读取 `novel.json`。
可通过 `Noveler: 打开配置文件` 或侧边栏「项目设置」打开。

## 常用配置示例

```jsonc
{
  "name": "我的小说",
  "noveler": {
    "targetWords": {
      "default": 2500
    },
    "sensitiveWords": {
      "enabled": true,
      "builtInLibrary": {
        "enabled": true,
        "levels": {
          "high": true,
          "medium": true,
          "low": false
        }
      }
    },
    "autoEmptyLine": {
      "value": true
    },
    "paragraphIndent": {
      "value": true
    },
    "autoUpdateReadmeOnCreate": {
      "value": "always"
    },
    "volumes": {
      "enabled": true,
      "folderStructure": "flat",
      "chapterNumbering": "volume",
      "numberFormat": "arabic"
    },
    "characters": {
      "list": []
    },
    "highlight": {
      "dialogue": {
        "color": "#ce9178"
      },
      "character": {
        "color": "#4ec9b0",
        "fontWeight": "bold"
      }
    },
    "format": {
      "chineseQuoteStyle": "「」",
      "convertQuotes": true
    }
  }
}
```

上例为扁平结构。已有章节要改为分卷，请运行 `Noveler: 迁移到分卷结构`，让向导同时处理文件和配置。
完整默认字段见 [默认模板](../templates/default-config.jsonc)；部分兼容字段当前未接入，见下文限制。

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

## 配置字段

下表路径均位于 `noveler` 内。

| 路径 | 类型或可选值 | 说明 |
|---|---|---|
| `targetWords.default` | 正数，默认 2500 | 新章节默认目标字数，已有章节可设置自身 `targetWords` |
| `highlight.dialogue` | 样式对象 | 对话高亮 |
| `highlight.character` | 样式对象 | 人物高亮 |
| `characters.list` | 字符串数组 | 补充人物名称；也会读取 `characters/` 文件中的名称 |
| `format.convertQuotes` | 布尔值 | 是否转换引号 |
| `format.chineseQuoteStyle` | `「」` 或两个直双引号 | 引号输出样式，双引号值在 JSON 中写作 `"\"\""` |
| `wordCount.showInStatusBar` | 布尔值，默认 true | 状态栏统计显示 |
| `autoEmptyLine.value` | 布尔值，默认 true | 段落空行 |
| `paragraphIndent.value` | 布尔值，默认 true | 段首两个全角空格 |
| `autoUpdateReadmeOnCreate.value` | `always` / `ask` / `never` | README 更新策略，默认 always；never 时刷新命令也跳过更新 |
| `volumes.enabled` | 布尔值 | 与 nested 结构同时满足才启用分卷 |
| `volumes.folderStructure` | `flat` / `nested` | 扁平 / 分卷目录 |
| `volumes.numberFormat` | `arabic` / `chinese` / `roman` | 卷号显示格式 |
| `volumes.chapterNumbering` | `global` / `volume` / `mixed` | 章节编号策略 |
| `eyeCareMode.enabled` | 布尔值 | 护眼模式，建议使用快速设置切换以保存原主题 |
| `eyeCareMode.previousTheme` | 字符串 | 切换前主题名 |
| `focusMode.typingSound` | 音效名称 | none、mechanical、typewriter、bubble、pop、click、click2、click3、custom |
| `focusMode.typingSoundVolume` | 0–100 | 音效音量 |
| `focusMode.customSoundPaths` | 字符串数组 | 自定义音效文件路径 |
| `focusMode.activeCustomSound` | 字符串 | 当前选中的自定义音效 |

### 高亮样式

| 属性 | 类型 | 说明 | 示例 |
|---|---|---|---|
| color | string | 文字颜色 | #ce9178 |
| backgroundColor | string | 背景颜色 | rgba(206, 145, 120, 0.15) |
| fontStyle | string | 字体样式 | normal / italic |
| fontWeight | string | 字体粗细 | normal / bold |

颜色校验支持十六进制、rgb 和 rgba。人物名称可从 `characters/` 和 `characters.list` 合并读取，
未建立人物档案时也可先在列表中添加姓名。

```jsonc
{
  "noveler": {
    "characters": { "list": ["张无忌", "周芷若", "赵敏", "谢逊"] }
  }
}
```
没有 `highlight.thought`、`highlight.ellipsis` 配置。

## 自定义颜色方案示例

### 深色主题方案

```jsonc
{
  "noveler": {
    "highlight": {
      "dialogue": {
        "color": "#d19a66",
        "backgroundColor": "rgba(209, 154, 102, 0.1)"
      },
      "character": {
        "color": "#61afef",
        "backgroundColor": "rgba(97, 175, 239, 0.1)"
      }
    }
  }
}
```

### 浅色主题方案

```jsonc
{
  "noveler": {
    "highlight": {
      "dialogue": {
        "color": "#d73a49",
        "backgroundColor": "rgba(215, 58, 73, 0.08)"
      },
      "character": {
        "color": "#005cc5",
        "backgroundColor": "rgba(0, 92, 197, 0.08)"
      }
    }
  }
}
```

### 高对比度方案

```jsonc
{
  "noveler": {
    "highlight": {
      "dialogue": {
        "color": "#ff6b6b",
        "backgroundColor": "rgba(255, 107, 107, 0.2)",
        "fontStyle": "normal"
      },
      "character": {
        "color": "#339af0",
        "backgroundColor": "rgba(51, 154, 240, 0.2)",
        "fontWeight": "bold"
      }
    }
  }
}
```

---

## 分卷编号与迁移

- `global`：所有卷使用全局编号。
- `volume`：每卷独立编号。
- `mixed`：正文卷全局编号，前传、后传和番外独立编号。

切换编号模式不会重排已有章节，也不会生成“卷号-章号”复合编号。
目录位置决定章节归属；再次迁移按本次分组处理，旧 Front Matter 的 `volume` 不决定迁移目标。
回到扁平结构时保留原卷资料，后续可以复用卷目录，已有资料不会被覆盖。
成功迁移会清理临时备份，失败恢复不完整时保留备份并提示路径。

### 目录结构示例

分卷目录（nested）：

```text
chapters/
├── 第01卷-崛起/
│   ├── volume.json
│   ├── outline.md
│   └── 第01章-启程.md
└── 第02卷-修炼/
    └── 第01章-入门.md
```

扁平目录（flat）：

```text
chapters/
├── 第01章-启程.md
└── 第02章-入门.md
```

回滚后可能仍存在原卷目录，它们用于保留卷资料；扁平模式的章节在 chapters 根目录。

## 字数与写作辅助

- 总计 = 正文 + 标点，正文为中文汉字、英文字母和数字，不含空格。
- 全文统计排除 Front Matter、整行 Markdown 标题和 HTML 注释；选中统计保留标题。
- 状态栏显示总计、正文和标点，章节悬停也可以查看统计。
- `autoEmptyLine.value` 控制章节编辑时的自动空行，`paragraphIndent.value` 控制两个全角空格缩进，两项可同时开启。
- `format.convertQuotes` 为 false 时保持原引号；为 true 时按 `chineseQuoteStyle` 转换。

## 敏感词配置

```jsonc
{
  "noveler": {
    "sensitiveWords": {
      "enabled": true,
      "builtInLibrary": {
        "enabled": true,
        "levels": { "high": true, "medium": true, "low": false }
      },
      "customLibrary": {
        "enabled": true,
        "path": ".noveler/sensitive-words/custom-words.jsonc"
      },
      "whitelist": {
        "enabled": true,
        "path": ".noveler/sensitive-words/whitelist.jsonc"
      },
      "checkOnType": true,
      "checkOnSave": true,
      "display": {
        "severity": "Warning",
        "showInProblems": true,
        "showWordCount": true
      }
    }
  }
}
```

`severity` 支持 `Error`、`Warning`、`Information`。自定义词库和白名单使用 `words` 数组，
它们的文件路径支持 `.jsonc` 与 `.json` 回退；这一规则不适用于主配置文件。
详见 [敏感词库说明](../templates/sensitive-words/README.md)。

## VS Code 项目设置

自动保存、保存时格式化和编辑器字号在 `.vscode/settings.json` 中设置：

```jsonc
{
  "files.autoSave": "afterDelay",
  "files.autoSaveDelay": 2000,
  "[markdown]": {
    "editor.defaultFormatter": "chang.chinese-novel-writer",
    "editor.formatOnSave": true
  },
  "editor.fontSize": 20
}
```

初始化安全合并缺失项，保留已有设置、注释和尾逗号；已有 `files.autoSave: "off"` 不会被强制开启。
需要关闭自动保存时将 `files.autoSave` 改为 `off`，恢复时改回 `afterDelay`。

## 当前限制与兼容字段

- `noveler.autoSave` 和 `noveler.editor.markdownFontSize` 不生效，请使用 VS Code 设置。
- `format.autoFormat` 当前未接入保存事件；使用 `editor.formatOnSave` 和 Markdown 默认格式化器。
- `wordCount.includePunctuation` 当前未接入计算，总计始终为正文加标点。
- `focusMode.typewriter`、`typewriterPosition` 是旧兼容字段，不提供打字机滚动功能。
- `doubtMark.deleteOnResolve` 默认关闭；在 `noveler` 下设置 `"doubtMark": { "deleteOnResolve": true }`，单项和批量完成时自动删除待办标记，保留同行正文。

修改后保存配置，大多数功能会重新加载。如果显示未更新，可切换文件或重新加载窗口。
遇到格式错误先修复 JSONC，不要通过覆盖整个配置来解决。

## 使用与常见问题

### 可以只配置部分选项吗？

可以，未配置项使用代码中的默认值。注意默认模板与完全缺省的配置并非每项都相同，
例如默认模板 volumes.enabled 为 true，但 folderStructure 为 flat，仍是扁平模式。

### 如何恢复默认配置？

先备份 novel.jsonc，再对照 [默认模板](../templates/default-config.jsonc) 恢复需要的字段。
不要删除小说基本信息；旧的无效字段不会因为保留而变成有效配置。

### 颜色不够明显怎么办？

调整 backgroundColor 的 rgba 透明度，或使用上面的高对比度方案。保存后切换编辑器检查效果。

### 配置可以共享或备份吗？

可以复制 novel.jsonc，或纳入 Git；VS Code 编辑设置另外保存在 .vscode/settings.json。
两个文件控制不同的功能，不能用“novel.jsonc 一律优先”描述它们的关系。

### 配置验证与升级

配置必须为有效 JSONC；验证会检查目标字数、颜色、引号样式和 README 更新策略等字段，
并不代表所有未知字段都会被识别。遇到警告应按字段定位修正。
配置版本由插件维护，旧版本升级的实现和示例见 [配置升级机制](CONFIG_MIGRATION.md)。
功能发布时间请查 [CHANGELOG](../CHANGELOG.md)，不要将插件版本与配置版本混用。

## 相关文档

- [README](../README.md)
- [文件格式说明](文件格式说明.md)
- [FAQ](FAQ.md)
- [配置升级机制](CONFIG_MIGRATION.md)
