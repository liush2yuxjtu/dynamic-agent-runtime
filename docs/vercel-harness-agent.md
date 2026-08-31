# Vercel AI SDK HarnessAgent 指南

资料快照：2026-08-31。

## 一句话说明

`HarnessAgent` 用统一的 Vercel AI SDK API 运行已有 Coding Agent runtime。应用继续调用 `generate()`、`stream()` 和 AI SDK UI 工具，真正的 agent loop 由 Claude Code、Codex、Pi 等 runtime 执行。

它不是模型 provider，也不是新的基础模型。

## 架构信息图

[![HarnessAgent 详细架构图：产品层通过统一 Agent API 调用 Claude Code、OpenAI Codex 或 Pi adapter，并在隔离 sandbox 中操作代码仓库](images/harness-agent-architecture.png)](images/harness-agent-architecture.png)

图中汇总了 `HarnessAgent` 的调用链、核心能力、运行边界，以及它与 `ToolLoopAgent` 的区别。图片用于快速理解整体关系；adapter 的精确能力和限制以本文后续表格及官方文档为准。

## 架构

```text
应用或 API route
        |
  HarnessAgent
        |
  Harness adapter
        |
  Coding Agent runtime
        |
Sandbox、仓库、Shell、文件
```

四个对象职责不同：

- `HarnessAgent`：应用代码使用的统一 Agent 实现，只保存配置。
- Harness adapter：连接某个 runtime，并统一 sessions、events、tools、usage 和 lifecycle。
- Sandbox provider：提供隔离文件系统、进程和网络。
- `HarnessAgentSession`：保存实时 conversation、workspace、审批和续跑状态。

## 与 ToolLoopAgent 的区别

| | `ToolLoopAgent` | `HarnessAgent` |
| --- | --- | --- |
| Agent loop | AI SDK 管理 | 现成 Coding Agent runtime 管理 |
| 文件与 Shell | 应用自行添加工具 | runtime 通常自带 |
| Session 历史 | 应用或 AI SDK 管理消息 | runtime 原生 session 管理 |
| Sandbox | 可选 | 必需 |
| 最适合 | 业务 agent、RAG、API 工具调用 | 修代码、跑测试、重构、CI 修复 |
| 切换对象 | 模型 provider | 完整 Coding Agent runtime |

简单业务 agent 使用 `ToolLoopAgent`。需要真实工程行为时再使用 `HarnessAgent`。

## 本项目的可切换 Harness

聊天页可点击切换全部 9 个官方 adapter。仓库固定安装对应 9 个 package，并额外安装通用 `@ai-sdk/harness-acp` 入口。每个选项使用独立 chat id 和浏览器历史；切换不会把一个 runtime 的不透明 state 交给另一个 runtime。

当前 Mac mini 部署只启用 Pi 与 Cline。两者是 host-process runtime，可把文件与 Shell 操作限制到 `just-bash` sandbox，并直接使用同一个 CPA `gpt-5.6-luna`、`effort=max` 和 `X-Claudex-Speed: fast`。Pi 通过临时 `models.json` 连接 CPA；Cline 通过官方 OpenAI Responses provider 配置 `providerId: openai-native`、`baseUrl`、`apiKey` 和 `headers`。凭据只在 server process 解析。

其余 7 个 adapter 已安装并可点击查看，但不会伪装成可运行：Claude Code、Codex、Deep Agents、OpenCode 和三个 ACP runtime（Cursor、fx、Grok Build）都要求能暴露端口的 network sandbox；部分还要求 runtime 自有账号凭据。当前唯一官方支持的 bridge sandbox 是 Vercel Sandbox，而本项目禁止索取 `VERCEL_OIDC_TOKEN`、禁止改走 AI Gateway，也不公开 macmini CPA。因此这些选项保持 `gated`，API 对绕过 UI 的请求返回 HTTP 422。未来只有在官方、可验证的 network sandbox 和对应 direct CPA 路由同时满足后才能启用。

当前 Cline adapter 和安装完整 catalog 会引入较大的多 provider 依赖树。发布前必须保留 lockfile、运行 `npm audit`，并把未修复 advisory 作为已知风险处理；不能为了消除报告而执行破坏性 `npm audit fix --force`。

## 当前 adapters

完整选型、采用度、CPA 兼容性和推荐顺序见 [后端 Agent Runtime 全量清单](backend-agent-runtimes.md)。

官方当前提供九个 adapter：

| Runtime | Package | 运行位置 | Structured output | 内置工具审批 | 内置工具过滤 |
| --- | --- | --- | --- | --- | --- |
| Claude Code | `@ai-sdk/harness-claude-code` | Sandbox bridge | 支持 | 支持 | 支持 |
| Cline | `@ai-sdk/harness-cline` | Host process | 支持 | 支持 | 支持 |
| Codex | `@ai-sdk/harness-codex` | Sandbox bridge | 支持 | 不支持 | 不支持 |
| Cursor | `@ai-sdk/harness-cursor` | Sandbox via ACP | 不支持 | 支持 | 不支持 |
| Deep Agents | `@ai-sdk/harness-deepagents` | Sandbox bridge | 支持 | 支持 | 通过自动拒绝实现 |
| fx | `@ai-sdk/harness-fx` | Sandbox via ACP | 不支持 | 支持 | 不支持 |
| Grok Build | `@ai-sdk/harness-grok-build` | Sandbox via ACP | 支持 | 支持 | 不支持 |
| OpenCode | `@ai-sdk/harness-opencode` | Sandbox bridge | 支持 | 支持 | 通过自动拒绝实现 |
| Pi | `@ai-sdk/harness-pi` | Host process | 不支持 | 支持 | 支持 |

以下 adapter 在官方文档中标记为 coming soon：

- Amp，`@ai-sdk/harness-amp`
- Goose，`@ai-sdk/harness-goose`
- Mastra，`@ai-sdk/harness-mastra`

所有当前 adapter 都支持 host custom tools 和 custom skills。`@ai-sdk/harness-acp` 是通用协议入口，不是第十个具体 runtime。

## 安装

以 Claude Code 为例：

```bash
pnpm add \
  @ai-sdk/harness \
  @ai-sdk/harness-claude-code \
  @ai-sdk/sandbox-vercel
```

Bridge-backed runtime 需要 sandbox 网络访问和至少一个暴露的 TCP 端口。Claude Code、Codex、Deep Agents、OpenCode，以及通过 ACP 运行的 Cursor、fx、Grok Build 都属于这类。

Pi、Cline 这类 host process runtime 不在 sandbox 内安装 bridge。Pi 还可使用 `@ai-sdk/sandbox-just-bash`，因为它不需要 sandbox 端口。

## 最小示例

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';

export const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  instructions:
    'Make small changes, preserve public APIs, and run relevant tests.',
});
```

`HarnessAgent` 可放在模块作用域。它不持有实时 session。

执行一次完整 turn：

```ts
const session = await agent.createSession();

try {
  const result = await agent.generate({
    session,
    prompt: 'Find and fix the failing tests.',
  });

  console.log(result.text);
} finally {
  await session.destroy();
}
```

流式执行：

```ts
const session = await agent.createSession();

try {
  const result = await agent.stream({
    session,
    prompt: 'Find and fix the failing tests.',
  });

  for await (const part of result.stream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }
} finally {
  await session.destroy();
}
```

## Session 是核心

普通模型聊天常把全部历史消息重新发送给模型。Harness 不这样工作。

Harness session 自己保存：

- runtime 进程
- sandbox
- working directory
- 原生 conversation history
- pending approvals
- 未完成 turn

向 `HarnessAgent` 传入消息数组时，它只把最后一条新用户消息作为当前输入，不会把整个历史重新灌给 runtime。因此 HTTP chat route 必须保存并恢复 harness session state。

### 生命周期方法

| 方法 | 行为 | 适用场景 |
| --- | --- | --- |
| `session.destroy()` | 停止 runtime，丢弃恢复能力 | 一次性脚本和测试 |
| `session.detach()` | 暂停连接，保留 warm sandbox，返回恢复状态 | 高频多轮 HTTP 请求 |
| `session.stop()` | 保存恢复状态，然后停止 runtime 和 sandbox | 低频多轮请求、节省资源 |
| `session.suspendTurn()` | 序列化正在执行的未完成 turn | 跨进程续跑 |
| `session.hasUnfinishedTurn()` | 判断当前 turn 是否必须先继续或挂起 | workflow、审批、外部工具结果 |

恢复 session：

```ts
const resumeState = await loadResumeState(chatId);

const session = await agent.createSession(
  resumeState
    ? { sessionId: chatId, resumeFrom: resumeState }
    : { sessionId: chatId },
);
```

`resumeState` 是不透明数据。不要修改其内部结构。状态只能交回生成它的同一种 adapter。

如果恢复状态包含未完成 turn，先调用：

```ts
await agent.continueGenerate({ session });
// 或
await agent.continueStream({ session });
```

不要先发送新 prompt。

## Skills

Harness skills 是按需加载的可复用指令包：

```ts
const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  skills: [
    {
      name: 'careful-refactors',
      description: 'Make small, low-risk code changes.',
      content:
        'Preserve public APIs. Read references/checklist.md before editing.',
      files: [
        {
          path: 'references/checklist.md',
          content: [
            '# Refactor checklist',
            '',
            '- Identify the smallest useful change.',
            '- Preserve public APIs.',
            '- Run the narrowest relevant test.',
          ].join('\n'),
        },
      ],
    },
  ],
});
```

每个 skill 包含：

- `name`
- `description`
- `content`
- 可选 `files`

`instructions` 适合每次都应生效的行为。`skills` 适合按需加载的流程、领域规范和参考资料。

## 三类工具

`HarnessAgent` 可同时使用：

1. runtime 内置工具，例如 read、edit、bash、web search。
2. 通过 `tools` 注册的 host-executed AI SDK tools。
3. adapter 通过 `mcpServers` 配置的 MCP tools。

### 工具过滤

`activeTools` 是 allowlist：

```ts
const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  tools: { weather },
  activeTools: ['weather'],
});
```

`inactiveTools` 是 denylist：

```ts
const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  inactiveTools: ['bash', 'write'],
});
```

不能同时设置 `activeTools` 和 `inactiveTools`。

Host tools 总能被 HarnessAgent 过滤。内置工具是否可过滤取决于 adapter。Codex、Cursor、fx、Grok Build 不支持原生内置工具过滤。

### 审批

`permissionMode` 控制 runtime 内置工具：

- `allow-all`，默认，允许读取、编辑和 Shell。
- `allow-edits`，允许读取和编辑，需要时请求 Shell 审批。
- `allow-reads`，允许读取，需要时请求编辑和 Shell 审批。

只有 adapter 声明支持时，审批模式才能暂停内置工具。Codex adapter 不支持内置工具审批。

`toolApproval` 控制 host tools：

```ts
const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  tools: { deployPreview },
  toolApproval: {
    deployPreview: 'user-approval',
  },
});
```

Host tool 审批由 HarnessAgent 统一处理，因此可跨 adapter 工作。

## 结构化输出

支持该能力的 adapter 可使用 AI SDK `Output`：

```ts
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { Output } from 'ai';
import { z } from 'zod';

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  output: Output.object({
    schema: z.object({
      summary: z.string(),
      changedFiles: z.array(z.string()),
      testsPassed: z.boolean(),
    }),
  }),
});
```

`result.output` 返回经过 schema 校验的值。

Pi、Cursor、fx 不支持 structured output。使用时会抛出 `HarnessCapabilityUnsupportedError`。

## 控制执行步数

`stopWhen` 可以在真实 harness tool step 后结束当前结果切片：

```ts
import { isStepCount } from 'ai';

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  stopWhen: isStepCount(1),
});
```

`stopWhen` 默认不存在。未配置时，HarnessAgent 保留原 runtime 行为，直到 turn 完成或等待外部输入。

匹配 `stopWhen` 后，底层 turn 可能仍未完成。检查 `session.hasUnfinishedTurn()`，再挂起或继续。

## Sandbox 准备

`sandboxConfig` 有两个阶段：

- `onBootstrap`：创建可复用 sandbox template 时执行，适合安装依赖。必须同时设置 `bootstrapHash`。
- `onSession`：每次获得 session 后执行，适合写入当前任务文件或轻量配置。

```ts
const sandboxConfig = {
  workDir: 'repo',
  bootstrapHash: 'tools-v1',
  onBootstrap: async ({ session, abortSignal }) => {
    await session.run({
      command:
        'command -v rg >/dev/null || (apt-get update && apt-get install -y ripgrep)',
      abortSignal,
    });
  },
  onSession: async ({ session, sessionWorkDir, abortSignal }) => {
    await session.writeTextFile({
      path: `${sessionWorkDir}/TASK.md`,
      content: 'Run the narrowest relevant tests.',
      abortSignal,
    });
  },
};

const agent = new HarnessAgent({
  harness: claudeCode,
  sandbox,
  sandboxConfig,
});
```

提前构建或刷新模板：

```ts
import { prepareHarnessSandboxTemplate } from '@ai-sdk/harness/agent';

await prepareHarnessSandboxTemplate({
  harness: claudeCode,
  sandboxProvider: sandbox,
  sandboxConfig,
});
```

如果应用自己管理原生 sandbox，使用 `prepareSandboxForHarness()`，再把同一个 `sandboxSession` 传给 `createSession()`。此时 HarnessAgent 不拥有 sandbox，`session.destroy()` 不会销毁调用方创建的 sandbox。

## UI 和 Workflow

Harness 的关键不是重放 UI 消息，而是恢复 session：

1. 使用稳定 `chatId` 作为 `sessionId`。
2. 每轮调用前加载 `resumeFrom`。
3. 流结束后调用 `session.detach()` 或 `session.stop()`。
4. 持久化返回的不透明状态。

不要直接把 `HarnessAgent` 交给 `createAgentUIStreamResponse`，因为每次 `stream()` 都要求显式 `session`。官方 UI 指南使用 `createUIMessageStream`、`toUIMessageStream` 和自定义 session store。

Durable Workflow 可使用 `@ai-sdk/workflow-harness`。跨 workflow run 仍要按 `sessionId` 持久化 `resumeFrom`。

## 何时使用

适合：

- 同一产品需要切换多个 Coding Agent runtime。
- 云端代码修复、PR 审查、重构或 CI 修复。
- 需要统一 AI SDK streaming、UI message、tools 和 session 结果。
- 需要把工程操作放进隔离 sandbox。
- 需要把长任务接入 durable workflow。

不适合：

- 只有一个简单模型和几个业务工具。
- 不需要文件或 Shell。
- 必须使用某个原生 SDK 的全部高级能力。
- 无法承担 sandbox 启动、运行和计费成本。
- 需要稳定、长期不变的 API。Harness packages 当前仍为 experimental。

## 成本

通常同时产生：

- 模型 token 费用。
- Vercel Sandbox 或其他 sandbox provider 费用。
- 长时间保持 warm sandbox 的资源费用。
- 远程日志、存储和网络费用。

`detach()` 保持 sandbox warm，恢复快但占资源。`stop()` 释放资源，恢复时需要重启。按交互频率选择。

## 安全要求

1. 所有 HarnessAgent 都应运行在 sandbox 中。
2. 不把宿主机完整环境变量传入 sandbox。
3. 为每个 adapter 显式选择认证来源。
4. 使用短期凭据和网络域名白名单。
5. 默认收紧 `permissionMode`。Adapter 不支持审批时，用 sandbox、只读挂载和外部 policy 补足。
6. Skills、MCP servers 和 runtime plugins 都是供应链入口。固定版本并审查源码。
7. Host tools 必须验证输入、租户边界和授权，不能只相信模型选择。
8. 保存 tool call、file change、approval 和 session lifecycle 审计记录。
9. 不把 opaque resume state 输出给浏览器或日志。
10. 云端执行前核对代码数据保留、地域和训练政策。

## 选择建议

- 只使用 Claude Code，且需要全部原生 hooks、subagents、permissions：直接 Claude Agent SDK 更简单。
- 只使用 Codex，且需要 Codex 全部配置：直接 Codex SDK 更简单。
- 需要统一多 runtime：使用 HarnessAgent。
- 自己设计 agent loop：使用 ToolLoopAgent。
- 需要模型级统一路由：使用 AI Gateway。AI Gateway 和 HarnessAgent 解决不同问题。

## 本体与专家进化

Pi 与 Cline 都加载同一个 `ontology-evolution` Harness skill。它把高频主动 schema 更新转换成 semantic diff、影响图、兼容性测试、canary 和下游 acknowledgement；把被动 feedback 转成带 provenance 的候选变更、独立 ontology / expert eval 和 promotion gates。完整合同见 [本体与专家进化](ontology-evolution.md)。

## 官方来源

- [AI SDK Harnesses overview](https://ai-sdk.dev/docs/ai-sdk-harnesses/overview)
- [HarnessAgent](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-agent)
- [Harness adapters](https://ai-sdk.dev/docs/ai-sdk-harnesses/harness-adapters)
- [Harness tools](https://ai-sdk.dev/docs/ai-sdk-harnesses/tools)
- [Harness skills](https://ai-sdk.dev/docs/ai-sdk-harnesses/skills)
- [Harness UI](https://ai-sdk.dev/docs/ai-sdk-harnesses/ui)
- [Workflow utilities](https://ai-sdk.dev/docs/ai-sdk-harnesses/workflow-utilities)
- [Claude Code adapter](https://ai-sdk.dev/providers/ai-sdk-harnesses/claude-code)
- [Codex adapter](https://ai-sdk.dev/providers/ai-sdk-harnesses/codex)
- [Pi adapter](https://ai-sdk.dev/providers/ai-sdk-harnesses/pi)
