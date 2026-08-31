import { createFallbackSandboxProvider } from '../app/api/chat/sandbox-registry.ts';

const providerIds = ['vercel', 'e2b'];
const required = new Set(
  (process.env.REQUIRE_SANDBOXES || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean),
);

function environmentFor(providerId) {
  if (providerId === 'vercel') {
    return {
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN,
      VERCEL_TOKEN: process.env.VERCEL_TOKEN,
      VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
      VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    };
  }
  return { E2B_API_KEY: process.env.E2B_API_KEY };
}

async function probe(providerId) {
  const provider = await createFallbackSandboxProvider({
    env: environmentFor(providerId),
    allowLocalFallback: false,
  });
  let session;
  try {
    session = await provider.createSession({
      sessionId: `smoke-${providerId}-${Date.now()}`,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'No sandbox provider is configured.' &&
      !required.has(providerId)
    ) {
      console.log(`${providerId} sandbox smoke skipped: credentials missing.`);
      return;
    }
    throw error;
  }

  try {
    const probePath = `${session.defaultWorkingDirectory}/sandbox-smoke.txt`;
    await session.writeTextFile({ path: probePath, content: 'SANDBOX_OK' });
    const result = await session.run({ command: `cat '${probePath}'` });
    if (result.exitCode !== 0 || result.stdout.trim() !== 'SANDBOX_OK') {
      throw new Error(`${providerId} file or command probe failed.`);
    }

    const process = await session.spawn({
      command:
        "node -e \"require('http').createServer((_,r)=>r.end('PORT_OK')).listen(4000,'0.0.0.0')\"",
    });
    try {
      const endpoint = await session.getPortEndpoint({
        port: 4000,
        protocol: 'http',
      });
      let responseText = '';
      for (let attempt = 0; attempt < 20; attempt++) {
        try {
          const response = await fetch(endpoint.url, {
            headers: endpoint.headers,
            signal: AbortSignal.timeout(5_000),
          });
          responseText = await response.text();
          if (responseText === 'PORT_OK') break;
        } catch {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      if (responseText !== 'PORT_OK') {
        throw new Error(`${providerId} port probe failed.`);
      }
    } finally {
      await process.kill();
    }

    console.log(`${providerId} sandbox smoke passed.`);
  } finally {
    await session.destroy();
  }
}

for (const providerId of providerIds) await probe(providerId);
