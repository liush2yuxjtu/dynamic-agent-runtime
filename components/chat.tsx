'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

const CHAT_ID = 'luna-harness-local';
const STORAGE_KEY = 'dynamic-agent-runtime:messages:v1';
const transport = new DefaultChatTransport({ api: '/api/chat' });

const suggestions = [
  '用三句话解释 HarnessAgent 和普通模型调用的区别。',
  '帮我设计一个一周可执行的深度工作计划。',
  '计算 17 × 29，并说明最短心算路径。',
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

export function Chat({ sourcePath }: { sourcePath: string }) {
  const [input, setInput] = useState('');
  const [restored, setRestored] = useState(false);
  const [resetting, setResetting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const { messages, setMessages, sendMessage, status, error, stop, clearError } =
    useChat({
      id: CHAT_ID,
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
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as unknown;
        if (Array.isArray(parsed)) setMessages(parsed as UIMessage[]);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setRestored(true);
    }
  }, [setMessages]);

  useEffect(() => {
    if (!restored || busy) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-100)));
    } catch {
      // Storage can be unavailable or full; live chat remains usable.
    }
  }, [busy, messages, restored]);

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
      const response = await fetch(`/api/chat?id=${CHAT_ID}`, {
        method: 'DELETE',
      });
      if (response.ok) {
        setMessages([]);
        localStorage.removeItem(STORAGE_KEY);
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
            <div className="eyebrow">HARNESS / 01</div>
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
              <strong>Pi runtime</strong>
            </div>
            <i />
            <div>
              <span>03</span>
              <strong>CPA / Luna</strong>
            </div>
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
              {statusText}
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
                <p>流式回复。会话由 Harness 保持，不靠每轮重放历史。</p>
                <div className="suggestions">
                  {suggestions.map((suggestion, index) => (
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
                启动 Pi harness
              </div>
            )}

            {error && (
              <div className="error-card" role="alert">
                CPA 隧道或 Harness session 暂不可用。点“新对话”后重试。
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
                placeholder="输入问题…"
                rows={1}
                disabled={busy}
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
                  disabled={!input.trim()}
                  aria-label="发送消息"
                >
                  <ArrowIcon />
                </button>
              )}
            </form>
            <div className="composer-note">
              Enter 发送 · Shift + Enter 换行 · sandbox 内工具可用
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
