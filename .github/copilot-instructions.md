# Noveler 仓库指南

本仓库是 TypeScript 编写的 VS Code 插件。修改前阅读 [项目指南](../AGENTS.md) 和 [README](../README.md)。

入口为 src/extension.ts，命令位于 src/commands，配置实现位于 src/services/configService.ts，
默认模板位于 templates/default-config.jsonc。命令声明在 package.json。

使用 npm run compile 编译、npm run lint 检查、npm run test:unit 运行单元测试，
npm test 运行需要桌面环境的 VS Code 扩展宿主测试。发布打包使用 npm run package。

保持修改聚焦，保留用户已有改动；修改行为时同步使用文档和必要的回归测试。
默认中文沟通。

4）编辑规则与约束（针对本仓库的可发现惯例）
- 变更应保持最小化且聚焦：每次 PR 处理一个明确的逻辑修改。
- 优先添加小型测试用例来复现问题，再修改实现以确保可验证。
- 不要在没有说明理由的情况下引入新的顶级依赖；若确有必要，在 PR 描述中说明并更新锁文件（如 package-lock.json、poetry.lock 等）。
- 保持项目原有的代码风格与格式；若仓库包含格式化工具（如 `prettier`、`black`、`gofmt`），请按项目约定执行。

5）提交规范与命名
- 提交信息建议使用简短的祈使句式摘要；可在摘要中包含标签（例如 `[infra]`、`[fix]`、`[feat]`）。
- 若修改引入或变更行为，请附带相应测试和对 `README` 的简要更新说明。

9）向人工汇报的内容（每次非平凡修改后请包含）
- 应至少包含：检查过的文件清单、运行的命令及其输出、添加或修改的测试，以及对非平凡改动的简要理由。
