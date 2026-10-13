import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ProjectTask } from './project-store';
import { workspaceRoot } from './project-store';

export type SandboxCheck = 'lint' | 'typecheck' | 'test' | 'build';
export type SandboxResult = {
  status: 'passed' | 'failed' | 'unavailable' | 'cancelled';
  output: string;
};

const fixedCommands: Record<SandboxCheck, string[]> = {
  lint: ['npm', 'run', 'lint'],
  typecheck: ['npm', 'run', 'typecheck'],
  test: ['npm', 'test'],
  build: ['npm', 'run', 'build'],
};

export async function runSandboxCheck(
  projectId: string,
  task: ProjectTask,
  check: string,
  signal: AbortSignal,
  spawnCommand: typeof spawn = spawn,
): Promise<SandboxResult> {
  if (!Object.hasOwn(fixedCommands, check)) return { status: 'unavailable', output: 'Unsupported sandbox check.' };
  const image = process.env.TINAN_SANDBOX_IMAGE?.trim();
  if (!image || !/^node:[A-Za-z0-9._-]+@sha256:[a-f0-9]{64}$/.test(image)) {
    return {
      status: 'unavailable',
      output: 'Sandbox is not configured. Set TINAN_SANDBOX_IMAGE to a pre-pulled, digest-pinned official Node image.',
    };
  }
  const uid = typeof process.getuid === 'function' ? process.getuid() : 1000;
  const gid = typeof process.getgid === 'function' ? process.getgid() : 1000;
  const containerName = `tinan-check-${randomUUID()}`;
  const root = await fs.realpath(workspaceRoot());
  const projectPath = await fs.realpath(path.join(root, projectId));
  if (!projectPath.startsWith(`${root}${path.sep}`)) {
    return { status: 'failed', output: 'Project directory is outside the configured workspace root.' };
  }

  const args = [
    'run', '--rm', '--pull=never', '--network=none', '--cpus=1', '--memory=512m',
    '--pids-limit=128', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--name', containerName,
    '--user', `${uid}:${gid}`, '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
    '--mount', `type=bind,src=${projectPath},dst=/workspace`,
    '--workdir=/workspace', '--env=HOME=/tmp', image, ...fixedCommands[check as SandboxCheck],
  ];

  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve({ status: 'cancelled', output: 'Sandbox check cancelled before start.' });
      return;
    }
    let output = '';
    let settled = false;
    const child = spawnCommand('docker', args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    const append = (chunk: Buffer) => {
      output += chunk.toString('utf8');
      if (output.length > 12_000) output = output.slice(-12_000);
    };
    let cleanupTimer: NodeJS.Timeout | undefined;
    const forceStop = () => {
      child.kill('SIGTERM');
      let attempts = 0;
      const removeContainer = () => {
        const cleanup = spawnCommand('docker', ['rm', '--force', containerName], {
          shell: false,
          stdio: 'ignore',
        });
        cleanup.on('error', () => undefined);
      };
      removeContainer();
      cleanupTimer = setInterval(() => {
        removeContainer();
        attempts += 1;
        if (attempts >= 10 && cleanupTimer) clearInterval(cleanupTimer);
      }, 100);
    };
    const timeout = setTimeout(forceStop, 60_000);
    const abort = () => forceStop();
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (cleanupTimer) clearInterval(cleanupTimer);
      signal.removeEventListener('abort', abort);
      resolve({
        status: error.code === 'ENOENT' ? 'unavailable' : 'failed',
        output: error.code === 'ENOENT' ? 'Docker is not installed or is unavailable on the server.' : 'Sandbox process could not start.',
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (cleanupTimer) clearInterval(cleanupTimer);
      signal.removeEventListener('abort', abort);
      const status = signal.aborted ? 'cancelled' : code === 0 ? 'passed' : 'failed';
      resolve({ status, output: output.trim() || (status === 'passed' ? 'Check completed in isolated container.' : `Sandbox exited with code ${code}.`) });
    });
  });
}
