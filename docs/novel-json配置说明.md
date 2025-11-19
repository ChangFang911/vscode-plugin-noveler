# novel.json 配置说明

`novel.json` 是小说项目的配置文件，包含小说信息和 Noveler 插件的配置。

## 完整配置示例

```json
{
  "name": "我的小说",
  "author": "作者名",
  "description": "小说简介",
  "genre": "武侠",
  "tags": ["成长", "江湖"],
  "created": "2025-11-18T10:00:00",
  "modified": "2025-11-18T10:00:00",

  "noveler": {
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

## 配置说明

### 基本信息

| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 小说名称 |
| author | string | 作者名 |
| description | string | 小说简介 |
| genre | string | 类型（如：武侠、仙侠、都市） |
| tags | string[] | 标签 |
| created | datetime | 创建时间 |
| modified | datetime | 修改时间 |

### Noveler 插件配置

#### highlight - 语法高亮配置

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

#### format - 格式化配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| chineseQuoteStyle | string | 中文引号样式 | "「」" |
| autoFormat | boolean | 保存时自动格式化 | true |
| convertQuotes | boolean | 是否转换引号 | true |

**引号样式选项：**
- `"「」"` - 中文直角引号
- `"\"\""` - 中文弯引号

**convertQuotes 说明：**
- `true`（默认）：格式化时会统一引号为 `chineseQuoteStyle` 配置的样式
- `false`：格式化时不转换引号，保持原样

#### wordCount - 字数统计配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| showInStatusBar | boolean | 在状态栏显示字数 | true |
| includePunctuation | boolean | 字数包含标点符号 | true |

#### characters - 全局人物名称配置

| 字段 | 类型 | 说明 | 默认值 |
|------|------|------|--------|
| characters | string[] | 需要高亮的人物名称列表 | [] |

**说明：**
- 配置的人物名称会在所有章节中自动高亮
- 与 `characters/` 目录中的人物文件配置互补
- 两个来源的人物名称会自动合并去重
- 适合快速添加人物名称，无需创建完整的人物文件

**示例：**
```json
"characters": ["张无忌", "周芷若", "赵敏", "谢逊"]
```

## 自定义颜色方案示例

### 深色主题方案

```json
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

```json
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

```json
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

## 使用说明

1. **修改配置后生效**：
   - 修改 `novel.json` 后保存
   - 配置会自动重新加载
   - 如果没有自动生效，运行命令 `Noveler: 重载高亮配置`

2. **配置优先级**：
   - `novel.json` 中的配置优先于 VSCode 的 settings.json
   - 如果 `novel.json` 中没有配置某项，会使用默认值

3. **配置验证**：
   - 配置文件必须是合法的 JSON 格式
   - 颜色值必须是有效的 CSS 颜色格式
   - 如果配置错误，会使用默认值

## 常见问题

### Q: 修改配置后没有立即生效？
A: 尝试运行命令 `Noveler: 重载高亮配置` 或重新打开文件。

### Q: 如何恢复默认配置？
A: 删除 `noveler` 配置节，或运行 `Noveler: 初始化小说项目` 重新生成。

### Q: 可以只配置部分选项吗？
A: 可以，未配置的选项会使用默认值。

### Q: 颜色不够明显怎么办？
A: 调整 `backgroundColor` 的透明度（rgba 中的最后一个值），或使用高对比度方案。
