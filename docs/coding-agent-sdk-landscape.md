# Coding Agent SDK 全景

资料快照：2026-08-31。

## 范围

本文把“Coding Agent SDK”定义为能够从代码中启动或控制 agent，并让它读取仓库、修改文件、运行命令、维护会话的 SDK、API 或稳定协议。

“Skills”特指可复用的指令包。当前主流格式是一个包含 `SKILL.md` 的目录，可附带脚本、参考资料和模板。

## 原生 Coding Agent SDK

| SDK | 维护者、采用度、状态 | 语言与执行方式 | 核心能力 | Skills | 主要风险 |
| --- | --- | --- | --- | --- | --- |
| [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview) | Anthropic 官方；Python 约 8.0k stars，TS 约 1.7k；活跃 | Python、TypeScript；本地运行 Claude Code agent loop | 文件读写、Bash、搜索、hooks、权限、sandbox、sessions、subagents、MCP、plugins | 原生 `SKILL.md`；`.claude/skills/`；内置 `/doctor`、`/code-review`、`/batch`、`/debug`、`/loop`、`/claude-api` | 绑定 Claude；本地工具拥有宿主权限，必须限制环境变量、工具和目录 |
| [OpenAI Codex SDK](https://developers.openai.com/codex/sdk) | OpenAI 官方；Codex 仓库约 120.2k stars；活跃 | TypeScript；Python Beta；驱动 Codex CLI 或 app-server | threads、streaming、恢复、结构化输出、sandbox、MCP server、subagents | Agent Skills 标准；`.agents/skills/`；支持 plugins | 绑定 OpenAI；Python SDK 仍为 Beta；CLI 子进程继承环境时要防止凭据外泄 |
| [GitHub Copilot SDK](https://github.com/github/copilot-sdk) | GitHub 官方；GA；MIT；约 10.4k stars | TypeScript、Python、Go、.NET、Java、Rust | custom agents、Fleet 并行、hooks、MCP、plugins、持久 sessions、cloud sessions、BYOK | `skillDirectories` 加载 `SKILL.md`；每个 subagent 可单独预载 skills | 默认第一方工具权限较宽；必须实现 permission handler；依赖 Copilot 或 BYOK 凭据 |
| [Cursor SDK](https://cursor.com/docs/sdk/typescript) | Anysphere 官方；闭源；Public Beta | TypeScript、Python；同一接口支持本地和 Cursor Cloud | 代码索引、Shell、编辑、custom tools、sandbox、hooks、MCP、嵌套 subagents | repo/user skills；内置 `/sdk` 指导 skill | 本地 headless 默认不逐次询问工具执行；API 仍可能变化；云端会上传仓库上下文 |
| [Cline SDK](https://docs.cline.bot/sdk/overview) | Cline 官方；Apache-2.0；约 67.2k stars；活跃 | TypeScript、Node.js；`@cline/sdk` | 多模型、文件与 Shell、SQLite sessions、checkpoints、cron、hooks、MCP、subagents、持久 agent teams | 原生 Skills；plugin 可捆绑 `skills/*/SKILL.md`；官方 `cline-sdk` skill | 功能面大、依赖多；必须显式设置 tool policy 和 sandbox |
| [OpenHands Software Agent SDK](https://github.com/OpenHands/software-agent-sdk) | OpenHands 官方；SDK 约 1.0k stars；OpenHands 约 85.7k；活跃 | Python；REST/WebSocket Agent Server；TypeScript client | typed tools、事件日志、local/Docker/Kubernetes workspaces、security policy、MCP、hooks、subagents | Skills、plugins、marketplace；官方 registry 约 58 skills、10 plugins | 部署复杂；LocalWorkspace 不是隔离边界；生产环境应使用容器或远程 workspace |
| [OpenCode SDK](https://opencode.ai/docs/sdk/) | Anomaly 官方；MIT；约 202.6k stars；活跃 | JavaScript、TypeScript；稳定 SDK 控制 OpenCode Server；V2 embedded SDK 为 Beta | sessions、permissions、LSP、MCP、custom tools、plugins、agents | `.opencode/skills/`、`.agents/skills/`、`.claude/skills/`；按需加载 | 稳定 SDK 是 client/server 架构；embedded V2 仍可能破坏兼容；npm plugins 会执行第三方代码 |
| [Pi Coding Agent SDK](https://github.com/badlogic/pi-mono/blob/HEAD/packages/coding-agent/docs/sdk.md) | Earendil Works 官方；MIT；约 99.6k stars；活跃 | TypeScript；进程内 SDK、RPC、JSON 模式 | 核心工具仅 `read`、`write`、`edit`、`bash`；ResourceLoader、sessions、模型切换、extensions、TUI | `.pi/skills/`、`.agents/skills/`；extensions 可注册工具、命令和 UI | 极简核心意味着 sandbox、MCP 和企业策略由集成方负责；extension 是任意 TypeScript 代码 |
| [Amp SDK](https://ampcode.com/docs/sdk) | Amp 官方；闭源；持续发布 | TypeScript、Python；本地 CLI 或远程 Orb | streaming、thread continuation、MCP、permissions、工具过滤、远程执行 | custom skill 目录、个人、项目和 workspace skills；内置 `building-skills` | vendor lock-in；远程 Orb 忽略部分本地 `skills`、MCP 和 permission 设置，需在 Amp 项目配置 |
| [Qwen Code SDK](https://qwenlm.github.io/qwen-code-docs/en/developers/sdk-typescript/) | Qwen 官方；Apache-2.0；主仓库约 27.5k stars；活跃 | TypeScript；Python Alpha；Java Alpha；进程或 daemon | 多协议模型、sessions、permissions、MCP、hooks、subagents、agent teams | `.qwen/skills/`、`.agents/skills/`；内置 `/review`、`/batch`、`/loop`、`/bugfix` | SDK 仍偏实验；Python 和 Java 为 Alpha；`yolo` 只能用于隔离环境 |
| [Kimi Agent SDK](https://github.com/MoonshotAI/kimi-agent-sdk) | Moonshot AI 官方；Apache-2.0；SDK 约 575 stars，runtime 约 7.2k | Go、Node.js、Python；驱动 Kimi Code | streaming、approvals、sessions、custom tools、MCP、KAOS sandbox | 复用 Kimi Code tools、skills、MCP；支持 `skills_dir` | SDK 采用度较低、更新慢于 runtime；属于 CLI 包装架构 |
| [Mistral Vibe SDK](https://pypi.org/project/mistralai-vibe-sdk/) | Mistral AI 官方；主仓库约 4.9k stars；活跃但较新 | Python 3.12+ | stateful sessions、Pydantic tools、filesystem、MCP、client-handled tools | `SkillDefinition`、`.vibe/skills/`、`.agents/skills/`；内置 skill creator | SDK 采用度仍低；需要较新 Python；本地文件工具必须置于 sandbox |
| [Gemini CLI SDK](https://github.com/google-gemini/gemini-cli/blob/main/packages/sdk/README.md) | Google 官方；父仓库约 106.8k stars；活跃 | TypeScript；`@google/gemini-cli-sdk` | 初版已有 agent loop、custom tools、sessions | CLI 原生支持 `.gemini/skills/`、`.agents/skills/`；SDK 的高级 skill、hook、subagent 支持仍在补齐 | SDK 处于早期；不要假定 CLI 的全部安全策略和能力已进入 SDK |
| [Goose / goose-sdk](https://github.com/aaif-goose/goose) | Agentic AI Foundation；Apache-2.0；约 53.7k stars；活跃 | Rust；ACP stdio/HTTP；实验性 `goose-sdk` | 多模型、sessions、MCP extensions、recipes、subagents | Goose Skills Marketplace、Agent Skills extension | `goose-sdk` API 尚未稳定；生产集成优先使用 ACP，不要绑定内部 crate |
| [mini-SWE-agent](https://github.com/SWE-agent/mini-swe-agent) | SWE-agent 团队；MIT；约 6.9k stars；活跃研究项目 | Python；Bash-only；约百行核心 | GitHub issue 修复、sandbox、批量 SWE-bench 评测 | 无原生 Agent Skills | 适合研究、训练和评测，不是完整产品 SDK；Shell 是唯一操作接口 |

## 可用于 Coding Agent 的通用 SDK

这些 SDK 已有 agent loop、工具或 sandbox，但不是某个现成 Coding Agent 的原生控制层。

| SDK | 维护者与采用度 | 编码相关能力 | 缺口 |
| --- | --- | --- | --- |
| [OpenAI Agents SDK / SandboxAgent](https://developers.openai.com/api/docs/guides/agents/sandboxes) | OpenAI 官方；Python 仓库约 29.1k stars | Python、TypeScript；filesystem、shell、Skills、memory、MCP、handoffs、snapshots | SandboxAgent 仍为 Beta；需要自己设计工程提示词、工具策略和工作流 |
| [Vercel AI SDK HarnessAgent](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview) | Vercel 官方；AI SDK 约 26.5k stars | 用统一 AI SDK 接口运行 Claude Code、Cline、Codex、Cursor、Deep Agents、fx、Grok Build、OpenCode、Pi；支持 sandbox、sessions、skills、host tools | Harness packages 仍为 experimental；adapter 能力不完全一致。详见 [HarnessAgent 指南](vercel-harness-agent.md) |
| [Google ADK](https://google.github.io/adk-docs/) | Google 官方；约 21.3k stars | Python、TypeScript、Go、Java、Kotlin；code execution、MCP、多 agent、图工作流 | 需要自己提供仓库编辑和工程权限策略 |
| [AWS Strands Agents SDK](https://strandsagents.com/) | AWS 官方；Apache-2.0；约 7.1k stars | Python、TypeScript；Agent Skills plugin、Docker/SSH sandbox、Shell、文件编辑、MCP | `allowed-tools` skill 字段目前主要是提示信息，不能替代运行时授权 |
| [Microsoft Agent Framework](https://learn.microsoft.com/en-us/agent-framework/overview/) | Microsoft 官方；MIT；约 13.2k stars | Python、.NET、Go；Harness Agent、Shell、文件、skills、MCP、durable workflows | Go 仍为 Public Preview；部分能力依赖 Foundry 或具体模型提供商 |

以下项目也能组装 Coding Agent，但需要自行实现文件编辑、Shell、sandbox 和权限层：

- [LangGraph](https://github.com/langchain-ai/langgraph)，约 40.7k stars。
- [PydanticAI](https://github.com/pydantic/pydantic-ai)，约 19.6k stars。
- [smolagents](https://github.com/huggingface/smolagents)，约 29.1k stars。
- [CrewAI](https://github.com/crewAIInc/crewAI)，约 57.8k stars。
- [Mastra](https://github.com/mastra-ai/mastra)，约 27.6k stars。

它们是通用 agent framework，不应与 coding-native SDK 混为一类。

## Hosted Coding Agent API

| API | 维护者、状态 | 能力 | Skills 对应物 |
| --- | --- | --- | --- |
| [Claude Managed Agents](https://docs.anthropic.com/en/docs/claude-code/sdk) | Anthropic 官方；Public Beta | 托管 sandbox、sessions、skills、memory、webhooks、多 agent、定时部署 | Claude Agent Skills |
| [Google Jules API](https://developers.google.com/jules/api) | Google 官方；`v1alpha` | 异步修复、审查、计划批准、自动创建 PR | 未提供通用 `SKILL.md` 运行面 |
| [Devin API v3](https://docs.devin.ai/api-reference/v3/usage-examples) | Cognition 官方 | sessions、playbooks、knowledge、schedules、MCP | Devin CLI 支持 Agent Skills；API 侧主要用 playbooks 和 knowledge |
| [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints) | Anysphere 官方；Public Beta | durable agents、runs、SSE、worker pools | repo skills 和 Cursor 配置 |
| [Agent Client Protocol SDKs](https://github.com/agentclientprotocol/agent-client-protocol) | JetBrains 与 Zed 共同维护；Apache-2.0；约 4.1k stars | TypeScript、Python、Java、Kotlin、Rust；IDE 与 agent 互操作 | ACP 不定义 Skills；agent 自己加载 |

## 可靠 Skills 来源

| 来源 | 维护者、采用度 | 内容与边界 |
| --- | --- | --- |
| [Agent Skills 标准](https://agentskills.io/home) | Anthropic 发起的开放标准 | 定义 `SKILL.md`、scripts、references、assets；这是格式规范，不是安全背书 |
| [anthropics/skills](https://github.com/anthropics/skills) | Anthropic 官方；约 172.7k stars | Claude API、MCP、Web 测试、文档与企业工作流；部分文档 skills 是 source-available，不是开源 |
| [openai/plugins](https://github.com/openai/plugins) | OpenAI 官方；约 5.3k stars | 当前 Codex skill/plugin 真源；旧 `openai/skills` 已废弃 |
| [github/awesome-copilot](https://github.com/github/awesome-copilot) | GitHub 官方组织托管；约 38.5k stars | 数百个 agents、skills、hooks、plugins；内容由社区贡献，仍需逐项审查 |
| [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Vercel 官方；约 30.7k stars | React、Next.js、部署、Web/UI 等 skills |
| [skills.sh](https://skills.sh) | Vercel 目录；超过 60 万条索引 | 目录不是统一审核名单；只选官方发布者、高采用仓库或有安全审计的条目 |
| [microsoft/skills](https://github.com/microsoft/skills) | Microsoft 官方；约 3.0k stars | 约 175 个 Azure、Foundry、SDK skills |
| [aws/agent-toolkit-for-aws](https://github.com/aws/agent-toolkit-for-aws) | AWS 官方 GA；约 2.5k stars | CDK、CloudFormation、IAM、Serverless、Bedrock、部署 |
| [OpenHands/extensions](https://github.com/OpenHands/extensions) | OpenHands 官方；约 137 stars | 约 58 skills、10 plugins；采用度小，但维护者和来源清楚 |
| [Gemini Extensions Gallery](https://geminicli.com/extensions/) | Google 官方目录；约 1,588 项 | 同时收录 Google 与第三方扩展；只选 Google 发布或高采用、可审计来源 |

## Agent Skills 的可移植边界

主流客户端都能理解基础字段：

```yaml
---
name: code-review
description: Review code for correctness and security risks.
---
```

较常见的可移植字段：

- `name`
- `description`
- `license`
- `compatibility`
- `metadata`
- `allowed-tools`

高级字段通常只在特定客户端有效。例如 Claude Code 的 `context: fork`、不同产品的 hook 和 plugin 配置。跨客户端共享 skill 时，只把基础字段当作稳定合同。

## 不建议用于新项目

- **Roo Code**：官方仓库已归档。虽然有 NDJSON 自动化与 Skills，不适合作为新 SDK 基础。
- **Continue**：仓库只读。
- **Aider Python API**：官方明确说明该 API 不受支持，可能无兼容性保证地变化。
- **SWE-agent**：维护团队已推荐改用 mini-SWE-agent。
- **低采用非官方 `open-agent-sdk-*` 包装器**：功能描述很多，但维护、兼容和安全证据不足。

## 选择建议

| 需求 | 优先选择 |
| --- | --- |
| 完整本地控制、hooks、skills、subagents | Claude Agent SDK |
| OpenAI 技术栈 | Codex SDK |
| 多语言、Fleet、BYOK、GitHub 集成 | GitHub Copilot SDK |
| 开源、多模型、完整产品运行时 | Cline SDK 或 OpenHands SDK |
| 极简、可深度定制 | Pi SDK |
| 本地与云端使用同一接口 | Cursor SDK |
| 统一调用多种成熟 coding harness | Vercel AI SDK HarnessAgent |
| 研究、训练、SWE-bench | mini-SWE-agent |

## 安全底线

1. Skill 可以携带脚本。安装前阅读全部文件，固定 commit 或 release。
2. MCP stdio server 会在本机执行程序。远程 MCP 也可能返回恶意提示或外传数据。
3. 不在宿主机启用 `yolo`、`bypassPermissions`、`allow-all` 等无审批模式。
4. 文件、Shell 和浏览器工具应运行在隔离 sandbox。
5. 使用工具 allowlist、只读挂载、网络出口白名单和短期凭据。
6. 云端 agent 会接收代码与上下文。上线前核对数据保留、训练、地域和审计策略。
7. GitHub stars 只表示采用度，不代替代码审查或供应链验证。

## 主要来源

- [Agent Skills](https://agentskills.io/home)
- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)
- [Codex SDK](https://developers.openai.com/codex/sdk)
- [GitHub Copilot SDK](https://github.com/github/copilot-sdk)
- [Vercel AI SDK Harnesses](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview)
- [OpenHands Software Agent SDK](https://docs.openhands.dev/sdk)
- [OpenCode SDK](https://opencode.ai/docs/sdk/)
- [Pi SDK](https://github.com/badlogic/pi-mono/blob/HEAD/packages/coding-agent/docs/sdk.md)
