# 本体与专家进化

## 目标

把高频人为更新和下游 feedback 转成可审计、可回滚、可自动进入下游的版本化发布流程。聊天页内置 `ontology-evolution` Harness skill；Pi 与 Cline 都能基于真实 schema、变更说明或 feedback 生成最小可执行方案。

## 主动更新

适合数据表、字段、枚举、关系和业务规则频繁变化。

```text
source/schema version
  -> semantic diff
  -> ontology candidate
  -> expert impact map
  -> compatibility tests
  -> shadow/canary
  -> registry release event
  -> downstream acknowledgement
```

关键约束：

1. 每次输入带 source version、owner、时间和原因，不覆盖旧版本。
2. 先做 semantic diff；区分新增、重命名、拆分、合并、删除和约束变化。
3. 用依赖图定位受影响专家、prompt、tool contract、query 和下游应用。
4. 下游通过版本 registry + 幂等 release event 消费，不由更新脚本直接 fan-out 改库。
5. 兼容变更可自动 shadow/canary；破坏性变更必须有 migration、截止期和 rollback target。
6. 发布完成以每个下游 acknowledgement 为准，不以“事件已发送”为准。

## 被动更新

适合从失败回答、用户纠正、人工评价、工具错误和业务 KPI 中学习。

```text
feedback + provenance
  -> dedupe / cluster
  -> evidence-backed candidate
  -> ontology eval + expert eval
  -> safety and regression gates
  -> candidate / canary / promoted
```

自动化边界：

- 自动收集、去重、聚类、生成 candidate 和跑 eval。
- 只有达到最小样本量、置信度、质量提升、安全门槛、回归门槛时才自动 canary 或 promotion。
- 单条 feedback、无来源文本、模型自评不能直接改 production ontology。
- 本体事实变化与专家行为变化分别评测、分别版本化，避免一起改后无法归因。

## 建议数据合同

每个 evolution candidate 至少包含：

```json
{
  "candidateId": "evt_...",
  "mode": "active | passive",
  "sourceVersion": "...",
  "evidence": [],
  "semanticDiff": [],
  "affectedExperts": [],
  "affectedConsumers": [],
  "evals": {},
  "promotionPolicy": {},
  "rollbackTarget": "...",
  "status": "candidate | shadow | canary | promoted | rejected"
}
```

## 当前产品边界

当前版本提供可点击入口和两套 Harness 内共享的进化 playbook。它能分析用户粘贴的 schema、更新说明和 feedback，输出 candidate、影响面、测试、发布与回滚方案。

仓库尚未绑定具体 ontology DB、事件总线、下游 registry 或 feedback 数据源，因此不会伪装成已自动写入生产系统。接入时保持上述合同；connector 只负责读取 source、写 candidate、发 release event、收 acknowledgement。

## 部署边界

**NEVER deploy this application on the MacBook.** 本体 connector、定时任务和持久服务也只能部署到 `macmini.tail6a877d.ts.net`。MacBook 只允许短时开发、构建和测试。
