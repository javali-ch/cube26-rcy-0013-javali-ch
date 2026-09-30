const { spawn } = require('node:child_process');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');

console.log('[REMA] Starting Backend Server (port 3000)...');
const backend = spawn('node', ['src/api/server.js'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true
});

console.log('[REMA] Starting Frontend Client (port 5173)...');
const frontend = spawn('npm', ['--prefix', 'client', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: true
});

function cleanup() {
  console.log('\n[REMA] Shutting down development processes...');
  try { backend.kill(); } catch (e) {}
  try { frontend.kill(); } catch (e) {}
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', cleanup);
