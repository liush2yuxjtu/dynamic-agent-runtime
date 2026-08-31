import type { HarnessAgentSession } from '@ai-sdk/harness/agent';

type SessionFactory = {
  createSession(options?: { sessionId?: string }): Promise<HarnessAgentSession>;
};

type SessionStore = {
  sessions: Map<string, HarnessAgentSession>;
  active: Set<string>;
};

const globalStore = globalThis as typeof globalThis & {
  __lunaHarnessSessions?: SessionStore;
};

const store = (globalStore.__lunaHarnessSessions ??= {
  sessions: new Map(),
  active: new Set(),
});

function claim(chatId: string) {
  if (store.active.has(chatId)) {
    throw new Error('This chat already has an active turn.');
  }
  store.active.add(chatId);
}

function release(chatId: string) {
  store.active.delete(chatId);
}

export async function resumeOrCreateSession({
  agent,
  chatId,
}: {
  agent: SessionFactory;
  chatId: string;
}) {
  claim(chatId);
  const existing = store.sessions.get(chatId);
  if (existing) return { session: existing, resumed: true };

  try {
    const session = await agent.createSession({ sessionId: chatId });
    store.sessions.set(chatId, session);
    return { session, resumed: false };
  } catch (error) {
    release(chatId);
    throw error;
  }
}

export function finishTurn(chatId: string) {
  release(chatId);
}

export async function destroyFailedSession({
  chatId,
  session,
}: {
  chatId: string;
  session: HarnessAgentSession;
}) {
  try {
    await session.destroy();
    store.sessions.delete(chatId);
  } finally {
    release(chatId);
  }
}

export async function clearStoredSession({ chatId }: { chatId: string }) {
  claim(chatId);
  const session = store.sessions.get(chatId);

  try {
    if (session) await session.destroy();
    store.sessions.delete(chatId);
  } finally {
    release(chatId);
  }
}
