const { watch } = require('fs');
const { execSync, execFile } = require('child_process');
const path = require('path');

const srcDir = path.join(__dirname, '../apps/api/src');
const nestBin = path.join(__dirname, '../node_modules/@nestjs/cli/bin/nest.js');
const apiDir = path.join(__dirname, '../apps/api');
const pm2Cmd = path.join(
  process.env.APPDATA,
  'npm/node_modules/pm2/bin/pm2'
);

let timer = null;
let building = false;

function rebuild() {
  if (building) return;
  building = true;
  console.log('[watcher] File changed, compiling...');
  try {
    execSync(`node "${nestBin}" build`, { cwd: apiDir, stdio: 'inherit', windowsHide: true });
    console.log('[watcher] Build done — restarting tezo-api');
    execFile(process.execPath, [pm2Cmd, 'restart', 'tezo-api'], { windowsHide: true });
  } catch (e) {
    console.error('[watcher] Build failed:', e.message);
  }
  building = false;
}

// fs.watch recursive works natively on Windows (ReadDirectoryChangesW)
watch(srcDir, { recursive: true }, (_, filename) => {
  if (!filename || !filename.endsWith('.ts')) return;
  clearTimeout(timer);
  timer = setTimeout(rebuild, 800);
});

console.log('[watcher] Watching', srcDir);
