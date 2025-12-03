# Noveler 敏感词库

## 📊 词库统计（当前为测试版）

- 总词数：30 个测试词汇
- 高危级别：10 词（政治、严重暴力、严重违法）
- 中危级别：10 词（色情、一般违法、宗教敏感）
- 低危级别：10 词（广告、争议词汇、不文明用语）

> ⚠️ **注意**：当前词库为测试版本，仅包含示例词汇用于功能测试。完整词库（5000+ 词）将在后续版本中提供。

## 🔧 自定义词库

### 创建自定义黑名单

1. 在项目根目录创建 `.noveler/sensitive-words/` 文件夹
2. 复制 `templates/sensitive-words/blacklist-template.json` 到该文件夹
3. 重命名为 `blacklist.json`
4. 编辑 `words` 数组，添加您的敏感词

**示例**:
```json
{
  "description": "我的自定义黑名单",
  "words": [
    "特定敏感词1",
    "特定敏感词2"
  ]
}
```

### 创建自定义白名单

1. 复制 `templates/sensitive-words/whitelist-template.json` 到 `.noveler/sensitive-words/`
2. 重命名为 `whitelist.json`
3. 添加误报词汇（如小说人名、地名、特殊术语）

**示例**:
```json
{
  "description": "我的自定义白名单",
  "words": [
    "主角李明",
    "架空城市天元城",
    "小说中的特殊术语"
  ]
}
```

## ⚙️ 配置

在 `novel.jsonc` 中配置敏感词检测：

```jsonc
{
  "sensitiveWords": {
    // 总开关
    "enabled": true,

    // 检测级别（选择启用哪些级别）
    "levels": {
      "high": true,       // 高危
      "medium": true,     // 中危
      "low": false        // 低危（默认关闭）
    },

    // 检测时机
    "checkOnType": true,        // 输入时检测（防抖 500ms）
    "checkOnSave": true,        // 保存时检测

    // 自定义词库
    "customWords": {
      "enabled": true,
      "blacklistPath": ".noveler/sensitive-words/blacklist.json",
      "whitelistPath": ".noveler/sensitive-words/whitelist.json"
    },

    // 显示设置
    "display": {
      "severity": "Warning",              // "Error" | "Warning" | "Information"
      "showInProblems": true,             // 在问题面板显示
      "showWordCount": true               // 状态栏显示敏感词数量
    }
  }
}
```

## 📝 词库分级说明

### 高危级别（High）
推荐始终启用。包含：
- 政治敏感词汇
- 严重暴力内容
- 严重违法活动

### 中危级别（Medium）
推荐启用。包含：
- 色情内容
- 一般违法活动
- 宗教敏感词汇

### 低危级别（Low）
可选启用。包含：
- 广告营销词汇
- 争议性词汇（地域/性别/种族歧视）
- 不文明用语

## 🎯 使用建议

1. **网文作者**：建议启用 high + medium 级别
2. **现实题材**：建议启用所有级别
3. **玄幻奇幻**：可以只启用 high 级别，medium 和 low 按需开启
4. **个人创作**：根据个人偏好自由配置

## 📖 更新计划

完整词库（5000+ 词）正在准备中，将包括：
- 高危级别：1500 词
- 中危级别：2000 词
- 低危级别：1500 词

词库来源：
- 社区整理
- 开源项目汇总
- 网文平台审核标准
- 人工筛选和分级

## 🤝 贡献

如果您发现词库有遗漏或误报，欢迎通过以下方式反馈：
- GitHub Issues: https://github.com/ChangFang911/vscode-plugin-noveler/issues
- 使用自定义黑名单/白名单进行个性化调整

## 📄 许可证

Community Curated - 社区整理维护
