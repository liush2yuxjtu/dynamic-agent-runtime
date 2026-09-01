import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import {
  SandboxProvisioningError,
  createFallbackSandboxProvider as createProvider,
  type SandboxProviderFactories,
} from './sandbox-registry.ts';

function session(
  id: string,
  runError?: Error,
  onDestroy?: () => void,
): HarnessV1NetworkSandboxSession {
  const toolSurface = {
    description: 'test sandbox',
    readFile: async () => null,
    readBinaryFile: async () => null,
    readTextFile: async () => null,
    writeFile: async () => undefined,
    writeBinaryFile: async () => undefined,
    writeTextFile: async () => undefined,
    spawn: async () => ({
      stdout: new ReadableStream<Uint8Array>(),
      stderr: new ReadableStream<Uint8Array>(),
      wait: async () => ({ exitCode: 0 }),
      kill: async () => undefined,
    }),
    run: async () => {
      if (runError) throw runError;
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  return {
    ...toolSurface,
    id,
    defaultWorkingDirectory: '/workspace',
    ports: [],
    getPortEndpoint: async () => ({ url: 'https://sandbox.test' }),
    getPortUrl: async () => 'https://sandbox.test',
    stop: async () => undefined,
    destroy: async () => {
      onDestroy?.();
    },
    restricted: () => toolSurface,
  };
}

function provider(
  id: string,
  createSession: () =>
    | HarnessV1NetworkSandboxSession
    | Promise<HarnessV1NetworkSandboxSession>,
): HarnessV1SandboxProvider {
  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: id,
    async createSession() {
      return await createSession();
    },
  };
}

function factories(overrides: Partial<SandboxProviderFactories> = {}) {
  return {
    vercel: () => provider('vercel', () => session('vercel')),
    e2b: () => provider('e2b', () => session('e2b')),
    justBash: () => provider('just-bash', () => session('just-bash')),
    ...overrides,
  } satisfies SandboxProviderFactories;
}

const explicitVercelEnv = {
  VERCEL_TOKEN: 'vercel-secret',
  VERCEL_TEAM_ID: 'team-id',
  VERCEL_PROJECT_ID: 'project-id',
};
const oidcToken = `header.${Buffer.from(
  JSON.stringify({ owner_id: 'oidc-team', project_id: 'oidc-project' }),
).toString('base64url')}.signature`;

function createFallbackSandboxProvider(
  env: Readonly<Record<string, string | undefined>>,
  testFactories = factories(),
  allowLocalFallback = true,
) {
  return createProvider({
    env,
    factories: testFactories,
    allowLocalFallback,
  });
}

describe('sandbox fallback registry', () => {
  test('uses only just-bash without cloud credentials', async () => {
    const calls: string[] = [];
    const sandbox = await createFallbackSandboxProvider(
      {},
      factories({
        vercel: () => {
          calls.push('vercel');
          return provider('vercel', () => session('vercel'));
        },
        e2b: () => {
          calls.push('e2b');
          return provider('e2b', () => session('e2b'));
        },
        justBash: () => {
          calls.push('just-bash');
          return provider('just-bash', () => session('just-bash'));
        },
      }),
    );

    assert.equal((await sandbox.createSession()).id, 'just-bash');
    assert.deepEqual(calls, ['just-bash']);
  });

  test('ignores Vercel project metadata without a token', async () => {
    const sandbox = await createFallbackSandboxProvider(
      { VERCEL_TEAM_ID: 'team-id', VERCEL_PROJECT_ID: 'project-id' },
      factories(),
    );
    assert.equal((await sandbox.createSession()).id, 'just-bash');
  });

  test('selects E2B when it is the only configured cloud', async () => {
    const sandbox = await createFallbackSandboxProvider(
      { E2B_API_KEY: 'e2b-secret' },
      factories(),
    );
    assert.equal((await sandbox.createSession()).id, 'e2b');
  });

  test('selects Vercel first when both clouds are configured', async () => {
    let e2bConstructed = false;
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        e2b: () => {
          e2bConstructed = true;
          return provider('e2b', () => session('e2b'));
        },
      }),
    );

    assert.equal((await sandbox.createSession()).id, 'vercel');
    assert.equal(e2bConstructed, false);
  });

  test('uses OIDC when a standalone CLI token lacks project metadata', async () => {
    let received: unknown;
    const sandbox = await createFallbackSandboxProvider(
      { VERCEL_TOKEN: 'cli-token', VERCEL_OIDC_TOKEN: oidcToken },
      factories({
        vercel: credential => {
          received = credential;
          return provider('vercel', () => session('vercel'));
        },
      }),
    );

    assert.equal((await sandbox.createSession()).id, 'vercel');
    assert.deepEqual(received, {
      kind: 'oidc',
      token: oidcToken,
      teamId: 'oidc-team',
      projectId: 'oidc-project',
    });
  });

  test('falls back from Vercel provisioning failure to E2B', async () => {
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () =>
          provider('vercel', () => {
            throw new SandboxProvisioningError('Vercel unavailable.');
          }),
      }),
    );

    assert.equal((await sandbox.createSession()).id, 'e2b');
  });

  test('falls back through both cloud provisioning failures', async () => {
    const unavailable = (id: string) =>
      provider(id, () => {
        throw new SandboxProvisioningError(`${id} unavailable.`);
      });
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () => unavailable('vercel'),
        e2b: () => unavailable('e2b'),
      }),
    );

    assert.equal((await sandbox.createSession()).id, 'just-bash');
  });

  test('classifies retryable vendor responses only during provisioning', async () => {
    const outage = Object.assign(new Error('Service unavailable.'), {
      response: { status: 503 },
    });
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () =>
          provider('vercel', () => {
            throw outage;
          }),
      }),
    );

    assert.equal((await sandbox.createSession()).id, 'e2b');
  });

  test('destroys the selected session when bootstrap fails', async () => {
    const bootstrapError = new Error('Bootstrap failed.');
    let destroyed = 0;
    let e2bCreated = false;
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () =>
          provider('vercel', () =>
            session('vercel', undefined, () => {
              destroyed++;
            }),
          ),
        e2b: () => {
          e2bCreated = true;
          return provider('e2b', () => session('e2b'));
        },
      }),
    );

    await assert.rejects(
      Promise.resolve(
        sandbox.createSession({
          identity: 'bootstrap-v1',
          onFirstCreate: async () => {
            throw bootstrapError;
          },
        }),
      ),
      error => {
        assert.equal(error, bootstrapError);
        return true;
      },
    );
    assert.equal(destroyed, 1);
    assert.equal(e2bCreated, false);
  });

  test('does not fall back on authentication or configuration failure', async () => {
    const authenticationError = Object.assign(new Error('Unauthorized.'), {
      name: 'AuthenticationError',
    });
    let e2bCreated = false;
    let justBashCreated = false;
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () =>
          provider('vercel', () => {
            throw authenticationError;
          }),
        e2b: () => {
          e2bCreated = true;
          return provider('e2b', () => session('e2b'));
        },
        justBash: () => {
          justBashCreated = true;
          return provider('just-bash', () => session('just-bash'));
        },
      }),
    );

    await assert.rejects(Promise.resolve(sandbox.createSession()), error => {
      assert.equal(error, authenticationError);
      return true;
    });
    assert.equal(e2bCreated, false);
    assert.equal(justBashCreated, false);
  });

  test('never falls back after a session is selected', async () => {
    const runError = new Error('run failed');
    let e2bConstructed = false;
    const vercelSession = session('vercel', runError);
    const sandbox = await createFallbackSandboxProvider(
      { ...explicitVercelEnv, E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () => provider('vercel', () => vercelSession),
        e2b: () => {
          e2bConstructed = true;
          return provider('e2b', () => session('e2b'));
        },
      }),
    );

    const selected = await sandbox.createSession();
    await assert.rejects(
      Promise.resolve(selected.run({ command: 'false' })),
      error => {
        assert.equal(error, runError);
        return true;
      },
    );
    assert.equal(e2bConstructed, false);
  });

  test('does not construct providers whose credentials are missing', async () => {
    let vercelConstructed = false;
    const sandbox = await createFallbackSandboxProvider(
      { E2B_API_KEY: 'e2b-secret' },
      factories({
        vercel: () => {
          vercelConstructed = true;
          return provider('vercel', () => session('vercel'));
        },
      }),
    );

    await sandbox.createSession();
    assert.equal(vercelConstructed, false);
  });

  test('passes only each provider credential to factories', async () => {
    const received: unknown[] = [];
    const sandbox = await createFallbackSandboxProvider(
      {
        ...explicitVercelEnv,
        E2B_API_KEY: 'e2b-secret',
        CPA_API_KEY: 'must-not-pass',
        HARNESS_CPA_API_KEY: 'must-not-pass-either',
      },
      factories({
        vercel: credential => {
          received.push(credential);
          return provider('vercel', () => {
            throw new SandboxProvisioningError('Vercel unavailable.');
          });
        },
        e2b: apiKey => {
          received.push(apiKey);
          return provider('e2b', () => session('e2b'));
        },
      }),
    );

    await sandbox.createSession();
    assert.deepEqual(received, [
      {
        kind: 'token',
        token: 'vercel-secret',
        teamId: 'team-id',
        projectId: 'project-id',
      },
      'e2b-secret',
    ]);
  });

  test('can refuse local fallback for bridge-backed runtimes', async () => {
    const sandbox = await createFallbackSandboxProvider({}, factories(), false);
    await assert.rejects(
      Promise.resolve(sandbox.createSession()),
      /No sandbox provider is configured/,
    );
  });
});
