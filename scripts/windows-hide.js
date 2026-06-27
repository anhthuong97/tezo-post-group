// Force windowsHide on all child processes so no console windows appear on Windows.
// Must use spread AFTER opts so we always override any windowsHide:false the caller set.
const cp = require('child_process');

const _spawn = cp.spawn;
cp.spawn = function (cmd, args, opts) {
  return _spawn(cmd, args, { ...opts, windowsHide: true });
};

const _fork = cp.fork;
cp.fork = function (mod, args, opts) {
  return _fork(mod, args, { ...opts, windowsHide: true });
};

const _execFile = cp.execFile;
cp.execFile = function (cmd, args, opts, cb) {
  if (typeof args === 'function') { cb = args; args = []; opts = {}; }
  else if (typeof opts === 'function') { cb = opts; opts = {}; }
  return _execFile(cmd, args, { ...opts, windowsHide: true }, cb);
};
