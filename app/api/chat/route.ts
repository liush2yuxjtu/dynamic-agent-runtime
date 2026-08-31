import { getHarnessErrorMessage } from '@ai-sdk/harness/agent';
import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { createHash } from 'node:crypto';
import { getAgent } from './agent';
import {
  clearStoredSession,
  destroyFailedSession,
  finishTurn,
  resumeOrCreateSession,
} from './session-store';

export const runtime = 'nodejs';
export const maxDuration = 300;

const CHAT_ID = /^[a-zA-Z0-9_-]{1,128}$/;

type ChatBody = {
  id?: string;
  messages?: UIMessage[];
};

function ownedChatId(request: Request, clientChatId: string) {
  const tailnetLogin = request.headers.get('tailscale-user-login');
  const hostname = new URL(request.url).hostname;
  const owner = tailnetLogin
    ? `tailnet:${tailnetLogin}`
    : hostname === '127.0.0.1' || hostname === 'localhost'
      ? 'loopback-operator'
      : undefined;

  if (!owner) return undefined;
  return createHash('sha256')
    .update(`${owner}\0${clientChatId}`)
    .digest('hex');
}

function textFromMessage(message: UIMessage) {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n');
}

function recoveryPrompt(messages: UIMessage[]) {
  const transcript = messages
    .slice(-30)
    .map(message => {
      const role = message.role === 'user' ? 'User' : 'Assistant';
      return `${role}: ${textFromMessage(message)}`;
    })
    .join('\n\n')
    .slice(-60_000);

  return [
    'The local harness process restarted. Restore context from this transcript, then answer the final user message without mentioning the restart.',
    '',
    transcript,
  ].join('\n');
}

export async function POST(request: Request) {
  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return Response.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body.id || !CHAT_ID.test(body.id) || !Array.isArray(body.messages)) {
    return Response.json({ error: 'Invalid chat request.' }, { status: 400 });
  }

  const chatId = ownedChatId(request, body.id);
  if (!chatId) {
    return Response.json({ error: 'Tailnet identity required.' }, { status: 401 });
  }

  const uiMessages = body.messages;
  const modelMessages = await convertToModelMessages(uiMessages);

  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute: async ({ writer }) => {
        const agent = await getAgent();
        const { session, resumed } = await resumeOrCreateSession({
          agent,
          chatId,
        });

        try {
          const result = await agent.stream(
            !resumed && uiMessages.length > 1
              ? {
                  session,
                  prompt: recoveryPrompt(uiMessages),
                  abortSignal: request.signal,
                }
              : {
                  session,
                  messages: modelMessages,
                  abortSignal: request.signal,
                },
          );

          writer.merge(
            toUIMessageStream({
              stream: result.stream,
              sendReasoning: false,
              onError: getHarnessErrorMessage,
              onEnd: () => {
                finishTurn(chatId);
              },
            }),
          );
        } catch (error) {
          await destroyFailedSession({ chatId, session });
          throw error;
        }
      },
      onError: getHarnessErrorMessage,
    }),
    consumeSseStream: consumeStream,
  });
}

export async function DELETE(request: Request) {
  const clientChatId = new URL(request.url).searchParams.get('id');
  if (!clientChatId || !CHAT_ID.test(clientChatId)) {
    return Response.json({ error: 'Invalid chat id.' }, { status: 400 });
  }

  const chatId = ownedChatId(request, clientChatId);
  if (!chatId) {
    return Response.json({ error: 'Tailnet identity required.' }, { status: 401 });
  }

  try {
    await clearStoredSession({ chatId });
    return new Response(null, { status: 204 });
  } catch {
    return Response.json({ error: 'Could not reset chat.' }, { status: 409 });
  }
}
