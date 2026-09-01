import type { HarnessV1SandboxProvider } from '@ai-sdk/harness';

export const SANDBOX_PROVIDER_IDS = ['vercel', 'e2b', 'just-bash'] as const;
export type SandboxProviderId = (typeof SANDBOX_PROVIDER_IDS)[number];

export type SandboxCandidate = {
  readonly id: SandboxProviderId;
  readonly provider: () => Promise<HarnessV1SandboxProvider>;
};

export type VercelSandboxCredential =
  | {
      readonly kind: 'oidc';
      readonly token: string;
      readonly teamId: string;
      readonly projectId: string;
    }
  | {
      readonly kind: 'token';
      readonly token: string;
      readonly teamId: string;
      readonly projectId: string;
    };

export type SandboxProviderFactories = {
  readonly vercel: (
    credential: VercelSandboxCredential,
  ) => HarnessV1SandboxProvider | Promise<HarnessV1SandboxProvider>;
  readonly e2b: (
    apiKey: string,
  ) => HarnessV1SandboxProvider | Promise<HarnessV1SandboxProvider>;
  readonly justBash: () =>
    | HarnessV1SandboxProvider
    | Promise<HarnessV1SandboxProvider>;
};

type CreateSessionOptions = Parameters<
  HarnessV1SandboxProvider['createSession']
>[0];

export class SandboxProvisioningError extends Error {
  readonly retryable = true;
}

class SandboxBootstrapError extends Error {
  readonly original: unknown;

  constructor(original: unknown) {
    super('Sandbox bootstrap failed.');
    this.original = original;
  }
}

const defaultFactories: SandboxProviderFactories = {
  async vercel(credential) {
    const { createVercelSandbox } = await import('@ai-sdk/sandbox-vercel');
    return createVercelSandbox({
      token: credential.token,
      teamId: credential.teamId,
      projectId: credential.projectId,
      runtime: 'node24',
      ports: [4000],
      timeout: 30 * 60 * 1_000,
    });
  },
  async e2b(apiKey) {
    const { createE2BSandbox } = await import('@e2b/ai-sdk-sandbox');
    return createE2BSandbox({
      apiKey,
      ports: [4000],
      timeoutMs: 30 * 60 * 1_000,
    });
  },
  async justBash() {
    const { createJustBashSandbox } = await import(
      '@ai-sdk/sandbox-just-bash'
    );
    return createJustBashSandbox({ cwd: '/workspace' });
  },
};

type SandboxEnvironment = Readonly<Record<string, string | undefined>>;

function trimmed(env: SandboxEnvironment, name: string) {
  return env[name]?.trim() || undefined;
}

function decodeOidcCredential(token: string): VercelSandboxCredential {
  try {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) throw new Error('JWT payload is missing.');
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as { owner_id?: unknown; project_id?: unknown };
    if (
      typeof payload.owner_id !== 'string' ||
      !payload.owner_id ||
      typeof payload.project_id !== 'string' ||
      !payload.project_id
    ) {
      throw new Error('Required Vercel claims are missing.');
    }
    return {
      kind: 'oidc',
      token,
      teamId: payload.owner_id,
      projectId: payload.project_id,
    };
  } catch (error) {
    throw new Error('VERCEL_OIDC_TOKEN is invalid.', { cause: error });
  }
}

function getVercelCredential(
  env: SandboxEnvironment,
): VercelSandboxCredential | undefined {
  const token = trimmed(env, 'VERCEL_TOKEN');
  const teamId = trimmed(env, 'VERCEL_TEAM_ID');
  const projectId = trimmed(env, 'VERCEL_PROJECT_ID');
  const configuredCount = [token, teamId, projectId].filter(Boolean).length;
  if (token && teamId && projectId) {
    return { kind: 'token', token, teamId, projectId };
  }

  const oidcToken = trimmed(env, 'VERCEL_OIDC_TOKEN');
  if (oidcToken) return decodeOidcCredential(oidcToken);
  if (token && configuredCount !== 3) {
    throw new Error(
      'VERCEL_TOKEN, VERCEL_TEAM_ID, and VERCEL_PROJECT_ID must be configured together.',
    );
  }
  return undefined;
}

function lazyProvider(
  create: () => HarnessV1SandboxProvider | Promise<HarnessV1SandboxProvider>,
) {
  let provider: Promise<HarnessV1SandboxProvider> | undefined;
  return () => (provider ??= Promise.resolve().then(create));
}

function errorChain(error: unknown) {
  const chain: Record<string, unknown>[] = [];
  const seen = new Set<unknown>();
  let current = error;
  while (
    current !== null &&
    typeof current === 'object' &&
    !seen.has(current)
  ) {
    seen.add(current);
    const record = current as Record<string, unknown>;
    chain.push(record);
    current = record.cause;
  }
  return chain;
}

function isRetryableProvisioningFailure(error: unknown) {
  const chain = errorChain(error);
  if (
    chain.some(
      item => item.name === 'AbortError' || item.name === 'AuthenticationError',
    )
  ) {
    return false;
  }

  for (const item of chain) {
    if (item.name === 'RateLimitError' || item.name === 'TimeoutError') {
      return true;
    }

    const response =
      item.response !== null && typeof item.response === 'object'
        ? (item.response as Record<string, unknown>)
        : undefined;
    const status =
      typeof response?.status === 'number'
        ? response.status
        : typeof response?.statusCode === 'number'
          ? response.statusCode
          : typeof item.status === 'number'
            ? item.status
            : typeof item.statusCode === 'number'
              ? item.statusCode
              : undefined;
    if (status === 408 || status === 429 || (status !== undefined && status >= 500)) {
      return true;
    }

    if (
      typeof item.code === 'string' &&
      [
        'ECONNREFUSED',
        'ECONNRESET',
        'EHOSTUNREACH',
        'ENETUNREACH',
        'ETIMEDOUT',
        'EAI_AGAIN',
      ].includes(item.code)
    ) {
      return true;
    }

    if (
      typeof item.message === 'string' &&
      (/^5\d\d:/.test(item.message) ||
        /\b(capacity unavailable|placement timeout|no compatible node|quota exceeded|resource exhausted|service unavailable)\b/i.test(
          item.message,
        ) ||
        /\bregion\b.*\bunavailable\b|\bunavailable\b.*\bregion\b/i.test(
          item.message,
        ))
    ) {
      return true;
    }
  }
  return false;
}

function protectBootstrap(
  options: CreateSessionOptions,
  onComplete: () => void,
): CreateSessionOptions {
  if (!options?.onFirstCreate) return options;
  const onFirstCreate = options.onFirstCreate;
  return {
    ...options,
    async onFirstCreate(session, callbackOptions) {
      try {
        await onFirstCreate(session, callbackOptions);
        onComplete();
      } catch (error) {
        throw new SandboxBootstrapError(error);
      }
    },
  };
}

async function createCloudSession(
  id: 'vercel' | 'e2b',
  provider: HarnessV1SandboxProvider,
  options: CreateSessionOptions,
) {
  let bootstrapCompleted = false;
  try {
    return await provider.createSession(
      protectBootstrap(options, () => {
        bootstrapCompleted = true;
      }),
    );
  } catch (error) {
    if (error instanceof SandboxBootstrapError) throw error;
    if (bootstrapCompleted || options?.abortSignal?.aborted) throw error;
    if (error instanceof SandboxProvisioningError) throw error;
    if (!isRetryableProvisioningFailure(error)) throw error;
    throw new SandboxProvisioningError(
      `${id} sandbox provisioning is temporarily unavailable.`,
      { cause: error },
    );
  }
}

export async function createFallbackSandboxProvider({
  env = process.env,
  factories = defaultFactories,
  allowLocalFallback = true,
}: {
  env?: SandboxEnvironment;
  factories?: SandboxProviderFactories;
  allowLocalFallback?: boolean;
} = {}): Promise<HarnessV1SandboxProvider> {
  const vercelCredential = getVercelCredential(env);
  const e2bApiKey = trimmed(env, 'E2B_API_KEY');
  const candidates: readonly SandboxCandidate[] = [
    ...(vercelCredential
      ? [
          {
            id: 'vercel' as const,
            provider: lazyProvider(() => factories.vercel(vercelCredential)),
          },
        ]
      : []),
    ...(e2bApiKey
      ? [
          {
            id: 'e2b' as const,
            provider: lazyProvider(() => factories.e2b(e2bApiKey)),
          },
        ]
      : []),
    ...(allowLocalFallback
      ? [
          {
            id: 'just-bash' as const,
            provider: lazyProvider(() => factories.justBash()),
          },
        ]
      : []),
  ];

  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'luna-sandbox-fallback',
    async createSession(options) {
      let lastProvisioningError: SandboxProvisioningError | undefined;
      for (const candidate of candidates) {
        try {
          const provider = await candidate.provider();
          if (candidate.id === 'just-bash') {
            return await provider.createSession(options);
          }
          return await createCloudSession(candidate.id, provider, options);
        } catch (error) {
          if (error instanceof SandboxBootstrapError) throw error.original;
          if (!(error instanceof SandboxProvisioningError)) throw error;
          lastProvisioningError = error;
        }
      }
      throw (
        lastProvisioningError ?? new Error('No sandbox provider is configured.')
      );
    },
  };
}
