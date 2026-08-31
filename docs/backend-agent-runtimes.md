# 后端 Agent Runtime 全量清单

资料快照：2026-08-31。

## 范围

本文的“全量”有明确边界：列出 Vercel AI SDK `HarnessAgent` 当前公开的全部正式 adapter，以及可通过通用 ACP adapter 接入的 runtime。它不是互联网上所有 agent framework 的无边界罗列。

`HarnessAgent` 统一 sessions、stream、tools、skills、sandbox 与生命周期；adapter 后面的 runtime 仍保留自己的 agent loop、工具语义和权限模型。所有 Harness packages 当前都标记为 **experimental**，版本间可能出现 breaking changes。

## 全部正式 HarnessAgent adapters

| Runtime | npm package | 当前版本 | 运行位置 | Structured output | 内置工具审批 / 过滤 | CPA `gpt-5.6-luna` 适配 | 当前项目状态 |
| --- | --- | ---: | --- | --- | --- | --- | --- |
| [Claude Code](https://ai-sdk.dev/providers/ai-sdk-harnesses/claude-code) | `@ai-sdk/harness-claude-code` | 1.0.98 | Sandbox bridge | 支持 | 支持 / 支持 | 需验证 CPA Anthropic route | 未安装 |
| [Cline](https://ai-sdk.dev/providers/ai-sdk-harnesses/cline) | `@ai-sdk/harness-cline` | 1.0.21 | Host process | 支持 | 支持 / 支持 | **已通过 CPA Responses API 实测** | 已安装 |
| [Codex](https://ai-sdk.dev/providers/ai-sdk-harnesses/codex) | `@ai-sdk/harness-codex` | 1.0.96 | Sandbox bridge | 支持 | 不支持 / 不支持 | 支持 `OPENAI_BASE_URL`；适合 CPA Responses | 未安装 |
| [Cursor](https://ai-sdk.dev/providers/ai-sdk-harnesses/cursor) | `@ai-sdk/harness-cursor` | 1.0.7 | Sandbox via ACP | 不支持 | 支持 / 不支持 | Provider route 受 Cursor account 设置控制 | 未安装 |
| [Deep Agents](https://github.com/langchain-ai/deepagents) | `@ai-sdk/harness-deepagents` | 1.0.94 | Sandbox bridge | 支持 | 支持 / 自动拒绝 | 模型层灵活；需增加 bridge sandbox | 未安装 |
| [fx](https://ai-sdk.dev/providers/ai-sdk-harnesses/fx) | `@ai-sdk/harness-fx` | 1.0.7 | Sandbox via ACP | 不支持 | 支持 / 不支持 | 未找到可靠 CPA 实证 | 未安装，不优先推荐 |
| [Grok Build](https://ai-sdk.dev/providers/ai-sdk-harnesses/grok-build) | `@ai-sdk/harness-grok-build` | 1.0.31 | Sandbox via ACP | 支持 | 支持有限 / 不支持 | 主要面向 xAI 或 AI Gateway | 未安装 |
| [OpenCode](https://ai-sdk.dev/providers/ai-sdk-harnesses/opencode) | `@ai-sdk/harness-opencode` | 1.0.96 | Sandbox bridge | 支持 | 支持 / 自动拒绝 | 支持 OpenAI-compatible provider；适合 CPA | 未安装 |
| [Pi](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi) | `@ai-sdk/harness-pi` | 1.0.96 | Host process | 不支持 | 支持 / 支持 | **已通过 CPA 实测** | 已安装 |

另有通用 [`@ai-sdk/harness-acp`](https://ai-sdk.dev/providers/ai-sdk-harnesses/acp) 1.0.32，可连接任何符合 ACP v1 的 runtime。官方文档给出完整 profile 的实现包括 Claude Code、Codex、Cursor 和 Grok Build。

## 运行架构差异

### Host process

Pi 与 Cline 在应用 Node.js 进程内运行 agent loop，文件和 Shell 操作通过 sandbox session 执行。

优点：

- 不需要 sandbox 暴露 WebSocket 端口。
- 可使用 `@ai-sdk/sandbox-just-bash`。
- 最适合当前 Mac mini + 本地 CPA 拓扑。

代价：

- runtime 本身仍在 host process，必须审查依赖和环境变量读取。
- process restart 后只能从持久 history 恢复，不能无损 attach 到旧内存 turn。

### Sandbox bridge / ACP

Claude Code、Codex、OpenCode、Deep Agents，以及 Cursor、fx、Grok Build 的 ACP adapter，需要在 sandbox 内启动 bridge，并通过 sandbox 暴露的端口与 host 通信。

优点：runtime 与工具执行都能获得更强隔离。

代价：需要 network-capable sandbox、端口管理、bridge token、bootstrap、凭据代理和更复杂的恢复逻辑。当前 `just-bash` provider 不提供这类网络端口，因此不能只安装 npm 包便宣称可用。

## 采用度与来源可靠性

采用度来自对应官方公开仓库；stars 只是生态信号，不是质量或安全证明。

| Runtime / 基础设施 | 维护者 | 公开采用度 | 维护状态 | 可靠性判断 |
| --- | --- | ---: | --- | --- |
| [OpenCode](https://github.com/anomalyco/opencode) | Anomaly 官方 | 约 202.7k stars | 活跃 | 成熟开源候选 |
| [Claude Code](https://github.com/anthropics/claude-code) | Anthropic 官方 | 约 143.4k stars | 活跃 | 官方成熟 runtime |
| [Codex](https://github.com/openai/codex) | OpenAI 官方 | 约 120.2k stars | 活跃 | 官方成熟 runtime |
| [Pi](https://github.com/earendil-works/pi) | Earendil Works | 约 99.7k stars | 活跃 | 高采用开源 runtime |
| [Cline](https://github.com/cline/cline) | Cline 官方 | 约 67.2k stars | 活跃 | 高采用开源 runtime |
| [Deep Agents](https://github.com/langchain-ai/deepagents) | LangChain 官方 | 约 28.7k stars | 活跃 | 成熟框架团队维护 |
| [Vercel AI SDK](https://github.com/vercel/ai) | Vercel 官方 | 约 26.5k stars | 活跃 | Harness adapter 真源 |
| Cursor | Anysphere 官方 | 闭源，无可比 stars | 持续发布 | 官方但可审计性较低 |
| Grok Build | xAI 官方 | 闭源，无可比 stars | 持续发布 | 官方但绑定 xAI |
| fx | 有 Vercel 正式 adapter | 缺少可靠公开采用数据 | 可用 | 列入可选项，不优先推荐 |

## 不属于 HarnessAgent adapter，但属于成熟后端 Agent runtime

这些产品不能直接作为当前 `HarnessAgent` 的下拉选项，除非已有 adapter 或另写 adapter：

- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview)：Anthropic 官方；TypeScript、Python；tools、hooks、subagents、sessions、permissions、MCP。
- [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents)：OpenAI 官方；TypeScript、Python；handoffs、guardrails、sessions、tracing、resumable approvals。
- [Cline SDK](https://docs.cline.bot/sdk)：持久 runtime、plugins、cron、provider abstraction、multi-agent teams。
- [Deep Agents / LangGraph](https://docs.langchain.com/oss/python/deepagents/overview)：durable execution、interrupt/resume、memory、subagents。
- [Goose](https://github.com/aaif-goose/goose)：Agentic AI Foundation；约 53.7k stars；生产集成优先使用 ACP。
- [Mastra](https://github.com/mastra-ai/mastra)：TypeScript agent framework；约 27.6k stars；需要自行提供 coding tools、sandbox 和权限策略。

更广泛的原生 SDK、Hosted API 和通用框架见 [Coding Agent SDK 全景](coding-agent-sdk-landscape.md)。

## 对当前 Mac mini + CPA 架构的推荐顺序

1. **Pi**：依赖少、启动快、CPA 已实测；适合默认通用路径。
2. **Cline**：多 provider、structured output、tool policy；CPA Responses 已实测。
3. **Codex**：CPA Responses 契合度高；前提是先实现 Mac mini network sandbox provider。
4. **OpenCode**：多模型、skills、subagents；同样需要 bridge sandbox。
5. **Deep Agents**：最适合本体、专家、反馈驱动迭代；集成和 Python runtime 成本更高。
6. Claude Code。
7. Cursor。
8. Grok Build。
9. fx。

此排序针对当前项目约束，不代表通用产品排名。

## 安全与运维边界

1. 只能从官方 package、官方仓库或经过可靠验证的高采用来源接入 runtime。
2. Harness adapter 统一 API，不会自动统一底层权限能力；每个 adapter 必须单独验证 approval、tool filtering、resume 和 structured output。
3. Bridge-backed runtime 必须使用 network sandbox，不能为了省事直接在 Mac mini production host 上裸跑 bridge。
4. CPA credential 只允许在 server process 解析；不能写入 Git、浏览器、sandbox workspace 或日志。
5. Cline 官方 adapter 当前引入较大的多-provider 依赖树。当前审计仍有 13 个 moderate、1 个 high advisory；服务保持 tailnet 私有，不执行破坏性的 `npm audit fix --force`。
6. **NEVER deploy this application on the MacBook.** 所有持久服务、bridge 和未来 network sandbox 都只能运行在 `macmini.tail6a877d.ts.net`。

## 官方来源

- [AI SDK Harness adapters](https://ai-sdk.dev/providers/ai-sdk-harnesses)
- [HarnessAgent overview](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview)
- [Agent Client Protocol adapter](https://ai-sdk.dev/providers/ai-sdk-harnesses/acp)
- [Vercel AI SDK repository](https://github.com/vercel/ai)
- 各 runtime 的官方页面和仓库见上表链接。
