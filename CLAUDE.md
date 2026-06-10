# Multi Agent Chat — 项目约定

## 提交 / PR / 代码署名

- **禁止**在任何 commit message、PR 标题/正文中出现 Claude / AI / Anthropic 相关的署名、footer 或元数据(例如 `Co-Authored-By: Claude`、`🤖 Generated with Claude Code` 等)。
- **禁止**使用 `--author` 或任何方式把 git author 设为 Claude/Anthropic。
- **禁止**在代码注释、docstring 中标注「由 Claude / AI 生成」之类的信息。
- commit message 与 PR 内容应读起来像人类开发者本人编写。

## 运行环境

- 需要 Node.js `>=22.13.0`(系统默认的 node 20 太低,用 `nvm use 22`)。
- 首次 `npm install` 后,若 `npm run dev` 报 `Error: Electron uninstall`,说明 Electron 二进制未下载,执行 `node node_modules/electron/install.js` 补下载。
- 真正与 agent 对话需要 `codex` / `claude` CLI 在 `PATH`(或设 `CODEX_PATH` / `CLAUDE_PATH`)。
