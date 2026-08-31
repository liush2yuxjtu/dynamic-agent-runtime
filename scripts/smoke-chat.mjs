const baseUrl = process.env.APP_BASE_URL;
if (!baseUrl) {
  throw new Error('APP_BASE_URL is required.');
}

const chatId = `smoke-${Date.now()}`;

function readText(stream) {
  return stream
    .split('\n')
    .filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)))
    .filter(part => part.type === 'text-delta')
    .map(part => part.delta)
    .join('');
}

async function send(messages) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: chatId, messages }),
    signal: AbortSignal.timeout(180_000),
  });
  const stream = await response.text();
  if (!response.ok) {
    throw new Error(`Chat request failed with HTTP ${response.status}.`);
  }
  return readText(stream);
}

let failure;
try {
  const firstUser = {
    id: 'smoke-user-1',
    role: 'user',
    parts: [
      {
        type: 'text',
        text: 'Remember code word ORBIT-731. Reply with exactly STORED',
      },
    ],
  };
  const firstText = await send([firstUser]);
  if (firstText.trim() !== 'STORED') {
    throw new Error('First HarnessAgent turn failed.');
  }

  const secondText = await send([
    firstUser,
    {
      id: 'smoke-assistant-1',
      role: 'assistant',
      parts: [{ type: 'text', text: firstText }],
    },
    {
      id: 'smoke-user-2',
      role: 'user',
      parts: [
        {
          type: 'text',
          text: 'What code word did I ask you to remember? Reply with exactly that code word.',
        },
      ],
    },
  ]);
  if (secondText.trim() !== 'ORBIT-731') {
    throw new Error(
      `HarnessAgent session did not preserve multi-turn context: ${JSON.stringify(secondText)}`,
    );
  }
} catch (error) {
  failure = error;
} finally {
  try {
    const cleanup = await fetch(`${baseUrl}/api/chat?id=${chatId}`, {
      method: 'DELETE',
      signal: AbortSignal.timeout(30_000),
    });
    if (!cleanup.ok) {
      throw new Error(`Smoke session cleanup failed with HTTP ${cleanup.status}.`);
    }
  } catch (cleanupError) {
    failure = failure
      ? new AggregateError([failure, cleanupError], 'Smoke test and cleanup failed.')
      : cleanupError;
  }
}

if (failure) throw failure;
console.log('HarnessAgent CPA multi-turn smoke passed.');
