import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';

const setupOnly = process.argv.includes('--setup');
const nodeMajor = Number(process.versions.node.split('.')[0]);

function fail(message) {
  process.stderr.write(`\nCampusHomes local runtime error:\n${message}\n\n`);
  process.exit(1);
}

if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
  fail(`Node 24 or newer is required; this shell is using ${process.version}.\nRun "nvm use" (the repository .nvmrc selects Node 24) and retry.`);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit' });
  if (result.error) fail(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(' ')} exited with status ${result.status ?? 'unknown'}.`);
}

function portAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen({ host: '127.0.0.1', port, exclusive: true }, () => server.close(() => resolve(true)));
  });
}

if (!setupOnly) {
  const occupied = [];
  for (const [port, label] of [[3000, 'web'], [4000, 'API']]) {
    if (!(await portAvailable(port))) occupied.push(`${label} port ${port}`);
  }
  if (occupied.length) {
    fail(`${occupied.join(' and ')} already in use. Stop the existing CampusHomes dev terminal before starting another one.\nInspect owners with: ss -ltnp | grep -E ':3000|:4000'`);
  }
}

run('docker', ['compose', '-f', 'apps/api/docker-compose.local.yml', 'up', '-d', '--wait']);
run('pnpm', ['--filter', '@campushomes/api', 'db:migrate']);

if (setupOnly) {
  run('pnpm', ['--filter', '@campushomes/api', 'admin:reset']);
  process.stdout.write('\nLocal services, migrations, and the super-admin account are ready.\n');
  process.exit(0);
}

process.stdout.write('\nStarting CampusHomes API on :4000 and web app on :3000…\n\n');
const child = spawn(
  'pnpm',
  ['--parallel', '--filter', '@campushomes/api', '--filter', '@campushomes/web', 'dev'],
  { cwd: process.cwd(), stdio: 'inherit' },
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => fail(`pnpm could not start: ${error.message}`));
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
