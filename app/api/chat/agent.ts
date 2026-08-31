import 'server-only';

import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createPi } from '@ai-sdk/harness-pi';
import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash';
import { execFile } from 'node:child_process';
import { access, constants, mkdir, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CPA_MODEL = 'gpt-5.6-luna';
const DEFAULT_CPA_BASE_URL = 'http://127.0.0.1:8318/v1';

let agentPromise: Promise<HarnessAgent> | undefined;

async function resolveCpaKey() {
  if (process.env.CPA_API_KEY?.trim()) {
    return process.env.CPA_API_KEY.trim();
  }

  const localHelper = path.join(
    homedir(),
    '.pi',
    'agent',
    'bin',
    'cliproxy-api-key',
  );

  try {
    await access(localHelper, constants.X_OK);
    const { stdout } = await execFileAsync(localHelper, [], {
      timeout: 10_000,
      maxBuffer: 2_048,
    });
    return stdout.trim();
  } catch {
    const { stdout } = await execFileAsync(
      'ssh',
      [
        '-o',
        'BatchMode=yes',
        '-o',
        'ConnectTimeout=5',
        'macmini',
        '~/.pi/agent/bin/cliproxy-api-key',
      ],
      { timeout: 10_000, maxBuffer: 2_048 },
    );
    return stdout.trim();
  }
}

async function resolveCpa() {
  const apiKey = await resolveCpaKey();
  if (!apiKey || /\s/.test(apiKey)) {
    throw new Error('CPA credential helper returned an invalid key.');
  }

  const baseUrl = (
    process.env.CPA_BASE_URL?.trim() || DEFAULT_CPA_BASE_URL
  ).replace(/\/+$/, '');

  const response = await fetch(`${baseUrl}/models`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`CPA model check failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as {
    data?: Array<{ id?: string }>;
  };
  if (!payload.data?.some(model => model.id === CPA_MODEL)) {
    throw new Error(`CPA does not expose ${CPA_MODEL}.`);
  }

  return { apiKey, baseUrl };
}

async function preparePiAgentDir(baseUrl: string) {
  const agentDir = path.join(tmpdir(), 'dynamic-agent-runtime', 'pi-agent');
  await mkdir(agentDir, { recursive: true });
  await Promise.all([
    writeFile(
      path.join(agentDir, 'models.json'),
      JSON.stringify(
        {
          providers: {
            openai: {
              baseUrl,
              apiKey: '$HARNESS_CPA_API_KEY',
              headers: { 'X-Claudex-Speed': 'fast' },
            },
          },
        },
        null,
        2,
      ),
      { mode: 0o600 },
    ),
    writeFile(path.join(agentDir, 'settings.json'), '{}\n', { mode: 0o600 }),
  ]);
  return agentDir;
}

async function createAgent() {
  const cpa = await resolveCpa();

  // Pi resolves this only in the host process. It is never copied into the sandbox.
  process.env.HARNESS_CPA_API_KEY = cpa.apiKey;
  const agentDir = await preparePiAgentDir(cpa.baseUrl);

  return new HarnessAgent({
    id: 'luna-harness-chat',
    model: `openai/${CPA_MODEL}`,
    harness: createPi({
      agentDir,
      thinkingLevel: 'max',
    }),
    sandbox: createJustBashSandbox({ cwd: '/workspace' }),
    permissionMode: 'allow-all',
    instructions: [
      'You are Luna, a precise and warm general-purpose assistant.',
      'Reply in the language used by the user.',
      'Use the disposable sandbox only when a calculation or file operation materially improves the answer.',
      'Never claim access to host files, apps, credentials, or private data.',
      'Prefer direct answers over long preambles.',
    ].join(' '),
  });
}

export function getAgent() {
  agentPromise ??= createAgent().catch(error => {
    agentPromise = undefined;
    throw error;
  });
  return agentPromise;
}
