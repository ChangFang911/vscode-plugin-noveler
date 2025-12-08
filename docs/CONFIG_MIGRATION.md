# 配置自动迁移系统

## 功能说明

当你更新 Noveler 插件后，如果插件引入了新的配置项或功能，**配置迁移系统**会自动检测并升级你的项目配置，无需手动修改或重新初始化项目。

## 工作原理

### 1. 版本检测
- 配置文件中有一个 `version` 字段，记录当前配置版本
- 扩展启动时自动检查版本号
- 如果版本低于当前插件版本，触发自动升级

### 2. 增量升级
支持从任意旧版本升级到最新版本，按顺序执行所有中间版本的升级脚本。

**示例**：
```
用户配置：v0.3.0
插件版本：v0.4.0

执行升级：
0.3.0 → 0.3.4 （添加敏感词配置）
0.3.4 → 0.4.0 （添加分卷和段落缩进配置）
```

### 3. 非侵入式升级
- ✅ **只添加**新配置项
- ✅ **保留**用户已有的自定义配置
- ✅ **保持**配置文件的注释格式
- ❌ **不会覆盖**用户修改的值

### 4. 用户通知
升级完成后会显示通知，用户可以：
- 查看配置文件
- 查看更新日志
- 了解新增功能

## 升级历史

### v0.3.4 → v0.4.0
**新增配置**：
```jsonc
{
  // 分卷功能
  "volumes": {
    "enabled": false,
    "folderStructure": "flat",
    "numberFormat": "arabic"
  },

  // 段落缩进
  "paragraphIndent": {
    "value": false
  }
}
```

### v0.3.0 → v0.3.4
**新增配置**：
```jsonc
{
  // 敏感词检测
  "sensitiveWords": {
    "enabled": true,
    "builtInLibrary": {
      "enabled": true,
      "levels": {
        "high": true,
        "medium": false,
        "low": false
      }
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
```

## 开发者指南

### 如何添加新的迁移脚本

当你需要在新版本中添加配置项时：

**步骤 1**：更新 `CURRENT_CONFIG_VERSION`
```typescript
// src/services/migrationService.ts
const CURRENT_CONFIG_VERSION = '0.6.0';  // 更新为新版本号
```

**步骤 2**：添加迁移函数
```typescript
// 升级到 0.6.0（示例：添加 AI 辅助写作功能）
if (this.compareVersions(fromVersion, '0.6.0') < 0) {
    Logger.info('应用 0.6.0 升级：添加 AI 辅助写作配置');
    const updates = this.getMigration_0_6_0(config);
    this.deepMerge(config, updates);  // 使用深度合并，不是浅合并
    modified = true;
}
```

**步骤 3**：实现迁移逻辑（注意嵌套结构）
```typescript
private static getMigration_0_6_0(config: any): any {
    const updates: any = {};

    // 确保 noveler 配置存在
    if (!config.noveler) {
        config.noveler = {};
    }

    // 如果没有 AI 配置，添加默认配置
    // ⚠️ 重要：新配置应该添加到 updates.noveler 下，而不是 updates 直接下
    if (!config.noveler.aiAssistant) {
        if (!updates.noveler) {
            updates.noveler = {};
        }
        updates.noveler.aiAssistant = {
            enabled: false,
            provider: 'openai',
            model: 'gpt-4'
        };
    }

    return updates;
}
```

**步骤 4**：更新更新日志
```typescript
'0.6.0': `# v0.6.0 新功能

## AI 辅助写作
- 集成 GPT-4 模型
- 智能续写功能
- 情节建议
- 人物对话润色`
```

### 迁移系统架构说明

#### 1. 深度合并 vs 浅合并

**错误示例（浅合并）**：
```typescript
config = { ...config, ...updates };  // ❌ 会覆盖整个 noveler 对象
```

**正确示例（深度合并）**：
```typescript
this.deepMerge(config, updates);  // ✅ 递归合并，保留现有配置
```

#### 2. 配置结构规范

新配置项必须添加到 `noveler` 对象内部：
```typescript
// ❌ 错误：添加到顶层
updates.newFeature = { ... };

// ✅ 正确：添加到 noveler 内部
if (!updates.noveler) {
    updates.noveler = {};
}
updates.noveler.newFeature = { ... };
```

#### 3. 使用 jsonc-parser 保留注释

迁移系统使用 `jsonc-parser` 的 `modify` API：
- ✅ 保留所有注释
- ✅ 保持原有格式
- ✅ 正确处理嵌套对象
- ✅ 自动添加逗号和缩进

不需要手动处理 JSON 格式，`jsonc-parser` 会自动处理。

## 注意事项

1. **版本号格式**：使用语义化版本号 `major.minor.patch`
2. **向后兼容**：新配置项应该有合理的默认值
3. **测试**：在发布前测试从各个旧版本升级
4. **日志**：记录详细的升级日志，方便排��问题

## 故障排除

### 如果升级失败
1. 查看 VSCode 输出面板（选择 "Noveler" 通道）
2. 检查配置文件语法是否正确
3. 手动备份配置文件后重新初始化项目

### 如何禁用自动升级
目前不支持禁用（因为这可能导致功能异常）。如果你需要保持旧配置，建议：
1. 备份当前配置文件
2. 允许自动升级
3. 手动恢复需要的自定义配置
