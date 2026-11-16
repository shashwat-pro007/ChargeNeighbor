/**
 * Runs the API server and the Vite dev server together.
 * Zero dependencies on purpose so `npm run dev` works right after setup.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { name: 'api', cwd: path.join(root, 'server'), color: '\u001b[36m' },
  { name: 'web', cwd: path.join(root, 'client'), color: '\u001b[35m' },
];

const children = [];

for (const target of targets) {
  const child = spawn('npm', ['run', 'dev'], {
    cwd: target.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    shell: process.platform === 'win32',
  });

  const prefix = `${target.color}[${target.name}]\u001b[0m`;

  const pipe = (stream, out) => {
    stream.setEncoding('utf8');
    let buffer = '';
    stream.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) out.write(`${prefix} ${line}\n`);
    });
  };

  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);

  child.on('exit', (code) => {
    process.stdout.write(`${prefix} exited with code ${code}\n`);
    shutdown(code ?? 1);
  });

  children.push(child);
}

let stopping = false;

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
