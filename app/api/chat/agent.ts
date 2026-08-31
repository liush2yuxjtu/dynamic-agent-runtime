import 'server-only';

import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createCline } from '@ai-sdk/harness-cline';
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

export const HARNESS_IDS = ['pi', 'cline'] as const;
export type HarnessId = (typeof HARNESS_IDS)[number];

const agentPromises = new Map<HarnessId, Promise<HarnessAgent>>();

const ontologyEvolutionSkill = {
  name: 'ontology-evolution',
  description:
    'Turn schema updates or downstream feedback into safe ontology and expert evolution plans.',
  content: [
    'Treat ontology and expert changes as versioned, evidence-backed releases.',
    'For active updates: capture source/schema version and owner, produce semantic diff, map affected experts and downstream contracts, define migration and rollback, run compatibility tests, then recommend shadow, canary, or full promotion. Prefer registry events and idempotent consumers over direct fan-out writes.',
    'For passive updates: preserve feedback provenance, cluster repeated failures, connect each candidate change to evidence, evaluate ontology and expert changes separately, and auto-promote only when explicit quality, safety, sample-size, and regression gates pass. Otherwise keep a reviewable candidate.',
    'Never learn directly from one unverified answer or silently rewrite production ontology. Keep immutable versions, audit trail, rollback target, and downstream acknowledgement status.',
    'When inputs are incomplete, state the missing contract or evidence. Return the smallest executable next step, not a vague platform redesign.',
  ].join(' '),
};

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

async function createAgent(harnessId: HarnessId) {
  const cpa = await resolveCpa();
  const sandbox = createJustBashSandbox({ cwd: '/workspace' });
  const instructions = [
    'You are Luna, a precise and warm general-purpose assistant.',
    'Reply in the language used by the user.',
    'Use the disposable sandbox only when a calculation or file operation materially improves the answer.',
    'Never claim access to host files, apps, credentials, or private data.',
    'Prefer direct answers over long preambles.',
  ].join(' ');

  if (harnessId === 'cline') {
    return new HarnessAgent({
      id: 'luna-cline-harness-chat',
      model: CPA_MODEL,
      harness: createCline({
        auth: {},
        providerId: 'openai-native',
        apiKey: cpa.apiKey,
        baseUrl: cpa.baseUrl,
        headers: { 'X-Claudex-Speed': 'fast' },
        reasoningEffort: 'max',
        maxIterations: 12,
      }),
      sandbox,
      permissionMode: 'allow-all',
      instructions,
      skills: [ontologyEvolutionSkill],
    });
  }

  // Pi resolves this only in the host process. It is never copied into the sandbox.
  process.env.HARNESS_CPA_API_KEY = cpa.apiKey;
  const agentDir = await preparePiAgentDir(cpa.baseUrl);

  return new HarnessAgent({
    id: 'luna-pi-harness-chat',
    model: `openai/${CPA_MODEL}`,
    harness: createPi({
      agentDir,
      thinkingLevel: 'max',
    }),
    sandbox,
    permissionMode: 'allow-all',
    instructions,
    skills: [ontologyEvolutionSkill],
  });
}

export function isHarnessId(value: unknown): value is HarnessId {
  return HARNESS_IDS.includes(value as HarnessId);
}

export function getAgent(harnessId: HarnessId) {
  let promise = agentPromises.get(harnessId);
  if (!promise) {
    promise = createAgent(harnessId).catch(error => {
      agentPromises.delete(harnessId);
      throw error;
    });
    agentPromises.set(harnessId, promise);
  }
  return promise;
}
