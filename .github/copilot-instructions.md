<!--
本文件由 AI 助手生成，目的是帮助自动化编码代理（类似 Copilot 的工具）在此仓库中更快上手。
在创建本文件时，仓库内未发现可识别的源代码（例如 `README.md`、`package.json`、`pyproject.toml`、`src/` 等），
因此下面的指导重点放在发现仓库结构、执行安全操作以及当源代码出现时的最小可行模板。
-->

# Copilot 指南 — 仓库简明指南

目的：帮助 AI 编码代理快速发现仓库结构、遵循本地约定，并做出可验证且最小的修改。

1）仓库状态
- 当前仓库未检测到可识别的源代码文件（例如 `README.md`、`package.json`、`pyproject.toml`、`src/` 等）。
- 如果之后添加了文件，请在进行重要修改前重新运行「检测清单」中的步骤以确认项目类型与构建流程。

2）首次运行前的检查清单（在修改前必须完成）
- 列出仓库根目录下的顶级文件与文件夹；若仓库为空，应向人工报告并询问是否需要脚手架模板。
- 按优先级查找并打开这些文件（若存在）：`README.md`、`package.json`、`pyproject.toml`、`requirements.txt`、`setup.py`、`Makefile`、`Dockerfile`、`docker-compose.yml`、`src/`、`cmd/`、`app/`、`.github/workflows/`。
- 根据发现的文件判断语言与构建系统，并映射到相应的命令（见下文示例）。
- 若仓库包含测试或 lint 配置，优先运行它们（以非破坏方式）。若无测试，建议先向用户提议添加一个最小的测试用例以便后续验证。

3）常用命令示例（在确认存在相应文件后再执行）
- Node：若存在 `package.json`，优先使用 `npm ci`（或在存在 `pnpm-lock.yaml` 时使用 `pnpm install`），然后用 `npm test` 或 `npm run build`（以 `scripts` 为准）。
- Python：若存在 `pyproject.toml` 或 `requirements.txt`，建议创建虚拟环境并安装依赖（`pip install -r requirements.txt` 或 `pip install .`），若有测试则运行 `pytest`。
- Go：若存在 `go.mod`，使用 `go test ./...`。
- Docker：若存在 `docker-compose.yml`，优先使用 `docker compose up --build` 做集成运行。

4）编辑规则与约束（针对本仓库的可发现惯例）
- 变更应保持最小化且聚焦：每次 PR 处理一个明确的逻辑修改。
- 优先添加小型测试用例来复现问题，再修改实现以确保可验证。
- 不要在没有说明理由的情况下引入新的顶级依赖；若确有必要，在 PR 描述中说明并更新锁文件（如 package-lock.json、poetry.lock 等）。
- 保持项目原有的代码风格与格式；若仓库包含格式化工具（如 `prettier`、`black`、`gofmt`），请按项目约定执行。

5）提交规范与命名
- 提交信息建议使用简短的祈使句式摘要；可在摘要中包含标签（例如 `[infra]`、`[fix]`、`[feat]`）。
- 若修改引入或变更行为，请附带相应测试和对 `README` 的简要更新说明。

6）集成点与查找位置
- 外部服务通常通过环境变量或 `.env` 配置；若发现 `docker-compose.yml` 或 `k8s/` 清单，将其视为本地集成测试的首选来源。
- 常见数据库迁移目录：`migrations/`、`db/migrations/` 等。

7）代码存在时参考的示例与模式
- 若发现 `package.json`，优先使用其中的 `scripts`（例如使用 `npm test` 而不是直接调用 `jest`）。
- 若存在 `src/main.py` 或 `app/__init__.py`，查找 `if __name__ == "__main__"` 的入口以及任何 CLI 标志。
- 对于 Go 风格的仓库，若存在 `cmd/` 或 `internal/` 目录，请尊重包边界，不要将 internal 包暴露给外部使用。

8）仓库为空时的建议脚手架（在执行前请先征求用户许可）
- 询问用户是否需要启动模版：Node（Express + Jest）、Python（FastAPI + pytest），或仅创建一个简单的 README。
- 若用户同意搭建脚手架，可创建最小化的 `README.md`、`src/` 示例代码以及 `tests/` 中的一个通过测试用例。

9）向人工汇报的内容（每次非平凡修改后请包含）
- 应至少包含：检查过的文件清单、运行的命令及其输出、添加或修改的测试，以及对非平凡改动的简要理由。

如需将本指南进一步针对某个语言栈定制（Node、Python、Go、Rust 等），请告知优先栈，我会补充具体命令与示例。

附注：默认使用中文回复所有内容。
