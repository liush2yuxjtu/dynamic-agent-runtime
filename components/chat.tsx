'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

type HarnessId =
  | 'claude-code'
  | 'cline'
  | 'codex'
  | 'cursor'
  | 'deepagents'
  | 'fx'
  | 'grok-build'
  | 'opencode'
  | 'pi';

type HarnessOption = {
  id: HarnessId;
  name: string;
  runtime: 'bridge' | 'host';
  available: boolean;
};

const harnesses: HarnessOption[] = [
  { id: 'claude-code', name: 'Claude Code', runtime: 'bridge', available: false },
  { id: 'cline', name: 'Cline', runtime: 'host', available: true },
  { id: 'codex', name: 'Codex', runtime: 'bridge', available: false },
  { id: 'cursor', name: 'Cursor', runtime: 'bridge', available: false },
  { id: 'deepagents', name: 'Deep Agents', runtime: 'bridge', available: false },
  { id: 'fx', name: 'fx', runtime: 'bridge', available: false },
  { id: 'grok-build', name: 'Grok Build', runtime: 'bridge', available: false },
  { id: 'opencode', name: 'OpenCode', runtime: 'bridge', available: false },
  { id: 'pi', name: 'Pi', runtime: 'host', available: true },
];

const suggestions = [
  '用三句话解释 HarnessAgent 和普通模型调用的区别。',
  '主动更新：我会频繁更新数据表，请给出本体版本化、语义 diff、下游自动同步和回滚方案。',
  '被动更新：请把下游 feedback 转成本体与专家的候选迭代，并设计自动晋级门槛。',
];

type MessagePart = UIMessage['parts'][number];

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <path d="M10 16V4m0 0L5.5 8.5M10 4l4.5 4.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20">
      <rect x="6" y="6" width="8" height="8" rx="1" />
    </svg>
  );
}

function ToolPart({ part }: { part: MessagePart }) {
  const data = part as MessagePart & {
    state?: string;
    toolName?: string;
  };
  const name =
    data.toolName ?? data.type.replace(/^tool-/, '').replace('dynamic-tool', 'event');
  const state = data.state?.replaceAll('-', ' ') ?? 'observed';

  return (
    <div className="tool-event">
      <span className="tool-pulse" />
      <span>{name}</span>
      <span className="tool-state">{state}</span>
    </div>
  );
}

function MessageParts({ parts }: { parts: UIMessage['parts'] }) {
  return parts.map((part, index) => {
    if (part.type === 'text') {
      return (
        <div className="message-text" key={`${part.type}-${index}`}>
          {part.text}
        </div>
      );
    }

    if (part.type.startsWith('tool-') || part.type === 'dynamic-tool') {
      return <ToolPart key={`${part.type}-${index}`} part={part} />;
    }

    return null;
  });
}

function Message({ message }: { message: UIMessage }) {
  const user = message.role === 'user';

  return (
    <article className={`message ${user ? 'message-user' : 'message-assistant'}`}>
      <div className="message-label">
        <span>{user ? 'YOU' : 'LUNA'}</span>
        {!user && <span className="agent-mark">H</span>}
      </div>
      <div className="message-body">
        <MessageParts parts={message.parts} />
      </div>
    </article>
  );
}

function ChatSession({
  sourcePath,
  harness,
  onHarnessChange,
}: {
  sourcePath: string;
  harness: HarnessId;
  onHarnessChange: (harness: HarnessId) => void;
}) {
  const option = harnesses.find(item => item.id === harness) ?? harnesses[0];
  const available = option.available;
  const chatId = `luna-${harness}-harness-local`;
  const storageKey = `dynamic-agent-runtime:messages:${harness}:v2`;
  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat', body: { harness } }),
    [harness],
  );
  const [input, setInput] = useState('');
  const [restored, setRestored] = useState(false);
  const [resetting, setResetting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { messages, setMessages, sendMessage, status, error, stop, clearError } =
    useChat({
      id: chatId,
      transport,
      throttle: 40,
    });

  const busy = status === 'submitted' || status === 'streaming';
  const statusText =
    status === 'submitted'
      ? '建立 Harness session'
      : status === 'streaming'
        ? 'Luna 正在响应'
        : status === 'error'
          ? '连接中断'
          : '等待输入';

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) setMessages(parsed as UIMessage[]);
      }
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      setRestored(true);
    }
  }, [setMessages, storageKey]);

  useEffect(() => {
    if (!restored || busy) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages.slice(-100)));
    } catch {
      // Storage can be unavailable or full; live chat remains usable.
    }
  }, [busy, messages, restored, storageKey]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' });
  }, [messages, status]);

  function submitText(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    if (error) clearError();
    void sendMessage({ text: value });
    setInput('');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitText(input);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  async function resetChat() {
    if (busy || resetting) return;
    setResetting(true);
    try {
      const response = await fetch(
        `/api/chat?id=${encodeURIComponent(chatId)}&harness=${harness}`,
        { method: 'DELETE' },
      );
      if (response.ok) {
        setMessages([]);
        localStorage.removeItem(storageKey);
        clearError();
        setInput('');
      }
    } catch {
      // Keep local history when server-side cleanup fails.
    } finally {
      setResetting(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="ambient-grid" />
      <section className="console" aria-label="Luna Harness Chat">
        <aside className="rail">
          <div>
            <div className="eyebrow">
              HARNESS / {String(harnesses.findIndex(item => item.id === harness) + 1).padStart(2, '0')}
            </div>
            <h1>
              Luna
              <br />
              <em>in motion.</em>
            </h1>
            <p className="rail-copy">
              完整 agent runtime，装进统一 AI SDK stream。会话、工具、sandbox
              各守边界。
            </p>
          </div>

          <div className="route-map" aria-label="运行架构">
            <div>
              <span>01</span>
              <strong>HarnessAgent</strong>
            </div>
            <i />
            <div>
              <span>02</span>
              <strong>{option.name} runtime</strong>
            </div>
            <i />
            <div>
              <span>03</span>
              <strong>CPA / Luna</strong>
            </div>
          </div>

          <div className="harness-switch" aria-label="切换 Harness">
            {harnesses.map(option => (
              <button
                type="button"
                key={option.id}
                className={option.id === harness ? 'harness-active' : ''}
                onClick={() => onHarnessChange(option.id)}
                disabled={busy}
                aria-pressed={option.id === harness}
              >
                <strong>{option.name}</strong>
                <span>{option.available ? `${option.runtime} · ready` : `${option.runtime} · gated`}</span>
              </button>
            ))}
          </div>

          <div className="rail-meta">
            <div>
              <span>MODEL</span>
              <strong>GPT-5.6 Luna</strong>
            </div>
            <div>
              <span>EFFORT</span>
              <strong>MAX</strong>
            </div>
            <div>
              <span>TIER</span>
              <strong>FAST</strong>
            </div>
          </div>
        </aside>

        <section className="chat-panel">
          <header className="chat-header">
            <div className="live-status" aria-live="polite">
              <span className={`status-dot ${busy ? 'status-dot-busy' : ''}`} />
              {available ? statusText : '需要网络 sandbox'}
            </div>
            <button
              className="reset-button"
              type="button"
              onClick={() => void resetChat()}
              disabled={busy || resetting}
            >
              {resetting ? '重置中' : '新对话'}
            </button>
          </header>

          <div className="messages" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="empty-state">
                <div className="empty-kicker">READY WHEN YOU ARE</div>
                <h2>问一个值得<br />认真回答的问题。</h2>
                <p>
                  {available ? (
                    <>
                      流式回复。会话由 {option.name} Harness 保持；内置本体主动 /
                      被动进化 playbook。
                    </>
                  ) : (
                    <>
                      {option.name} adapter 已安装。当前 Mac mini 只提供 CPA +
                      just-bash；该 bridge runtime 需受支持的 network sandbox
                      和独立凭据，因此保持安全关闭。
                    </>
                  )}
                </p>
                <div className="suggestions">
                  {available && suggestions.map((suggestion, index) => (
                    <button
                      type="button"
                      key={suggestion}
                      onClick={() => submitText(suggestion)}
                      disabled={busy}
                    >
                      <span>0{index + 1}</span>
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(message => (
                <Message key={message.id} message={message} />
              ))
            )}

            {status === 'submitted' && (
              <div className="thinking-line" role="status">
                <span />
                启动 {option.name} harness
              </div>
            )}

            {error && (
              <div className="error-card" role="alert">
                CPA 或 {option.name} Harness session 暂不可用。点“新对话”后重试。
              </div>
            )}
          </div>

          <div className="composer-wrap">
            <form className="composer" ref={formRef} onSubmit={onSubmit}>
              <label className="sr-only" htmlFor="chat-input">
                输入消息
              </label>
              <textarea
                id="chat-input"
                value={input}
                onChange={event => setInput(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder={available ? '输入问题…' : '当前部署未启用此 runtime'}
                rows={1}
                disabled={busy || !available}
              />
              {busy ? (
                <button
                  className="send-button stop-button"
                  type="button"
                  onClick={stop}
                  aria-label="停止生成"
                >
                  <StopIcon />
                </button>
              ) : (
                <button
                  className="send-button"
                  type="submit"
                  disabled={!available || !input.trim()}
                  aria-label="发送消息"
                >
                  <ArrowIcon />
                </button>
              )}
            </form>
            <div className="composer-note">
              {available
                ? 'Enter 发送 · Shift + Enter 换行 · sandbox 内工具可用'
                : 'adapter 已安装 · runtime 安全门禁未满足'}
            </div>
          </div>
        </section>
      </section>

      <footer className="provenance">
        <span>github.com/liush2yuxjtu/dynamic-agent-runtime</span>
        <span>{sourcePath}</span>
        <span>Pi session 01a0563f-70ee-72e6-a531-8fec6cd65f7f</span>
      </footer>
    </main>
  );
}

export function Chat({ sourcePath }: { sourcePath: string }) {
  const [harness, setHarness] = useState<HarnessId>('pi');

  return (
    <ChatSession
      key={harness}
      sourcePath={sourcePath}
      harness={harness}
      onHarnessChange={setHarness}
    />
  );
}
