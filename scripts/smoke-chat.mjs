const baseUrl = process.env.APP_BASE_URL;
if (!baseUrl) {
  throw new Error('APP_BASE_URL is required.');
}

const harnesses = (process.env.SMOKE_HARNESSES || 'pi,cline').split(',');

function readText(stream) {
  return stream
    .split('\n')
    .filter(line => line.startsWith('data: {'))
    .map(line => JSON.parse(line.slice(6)))
    .filter(part => part.type === 'text-delta')
    .map(part => part.delta)
    .join('');
}

async function send({ chatId, harness, messages }) {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: chatId, harness, messages }),
    signal: AbortSignal.timeout(180_000),
  });
  const stream = await response.text();
  if (!response.ok) {
    throw new Error(`Chat request failed with HTTP ${response.status}.`);
  }
  return readText(stream);
}

async function smokeHarness(harness) {
  const chatId = `smoke-${harness}-${Date.now()}`;
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
    const firstText = await send({ chatId, harness, messages: [firstUser] });
    if (firstText.trim() !== 'STORED') {
      throw new Error(`${harness} first HarnessAgent turn failed.`);
    }

    const secondText = await send({
      chatId,
      harness,
      messages: [
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
      ],
    });
    if (secondText.trim() !== 'ORBIT-731') {
      throw new Error(
        `${harness} session did not preserve multi-turn context: ${JSON.stringify(secondText)}`,
      );
    }
  } catch (error) {
    failure = error;
  } finally {
    try {
      const cleanup = await fetch(
        `${baseUrl}/api/chat?id=${chatId}&harness=${harness}`,
        { method: 'DELETE', signal: AbortSignal.timeout(30_000) },
      );
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
  console.log(`${harness} HarnessAgent CPA multi-turn smoke passed.`);
}

for (const harness of harnesses) await smokeHarness(harness);
