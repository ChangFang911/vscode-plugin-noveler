# v0.6.2 发布摘要

## 🎯 核心亮点

### ✨ 新功能
- **卷类型自动文件夹重命名**: 修改卷类型时，文件夹名称自动同步更新
  - 正文 → 前传: "第01卷-崛起" → "前传01-崛起"
  - 智能冲突检测，完全异步化

### ⚡ 性能提升
- **关键操作 100% UI 阻塞消除**
  - 删除大卷（1000章）: 10s+ 冻结 → 0ms 阻塞 ✅
  - 移动/复制章节: 0.5-2s 卡顿 → 0ms 阻塞 ✅
  - 网络盘操作: 数十秒冻结 → 流畅体验 ✅
- **6 个高频函数完全异步化**
  - renameVolume, deleteVolume, setVolumeStatus, setVolumeType
  - moveChapterToVolume, copyChapterToVolume

### 🐛 Bug 修复
- 修复配置版本号同步问题（0.5.0 → 0.6.1）
- 修复卷操作后侧边栏不刷新问题
- 修复配置文件时间戳未更新问题

### 🏗️ 架构优化
- 刷新命令统一化（3层策略: refreshView/smartRefresh/refresh）
- 进度提示优化（迁移操作和完整刷新显示进度条）

---

## 📥 下载

- **VSIX包**: [chinese-novel-writer-0.6.2.vsix](https://github.com/ChangFang911/vscode-plugin-noveler/releases/download/v0.6.2/chinese-novel-writer-0.6.2.vsix)
- **大小**: 1.4 MB

---

## 📖 详细更新日志

查看 [CHANGELOG.md](https://github.com/ChangFang911/vscode-plugin-noveler/blob/main/CHANGELOG.md) 了解完整变更记录。

---

## 🚀 安装方式

### 方式一：VSCode 插件市场（推荐）
1. 打开 VSCode
2. 进入扩展视图（Ctrl/Cmd + Shift + X）
3. 搜索 "Noveler"
4. 点击安装

### 方式二：离线安装
1. 下载 `chinese-novel-writer-0.6.2.vsix`
2. 在 VSCode 中: Extensions → ... → Install from VSIX
3. 选择下载的文件

---

## ⚠️ 重要提示

- 从旧版本升级会自动触发配置迁移
- 用户自定义配置不会丢失
- 升级完成后会显示更新日志

---

**祝写作愉快！📝**
