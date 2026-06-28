const axios = require('axios');
const { runPostTask, clearSession } = require('./facebook');

let settings    = null;
let token       = null;
let pollTimer   = null;
let running     = false;
let statusInfo  = { connected: false, error: null, currentTask: null };
let onStatusChange = null;

function setStatus(patch) {
  Object.assign(statusInfo, patch);
  onStatusChange?.(statusInfo);
}

function getStatus() { return { ...statusInfo }; }

function api(method, path, data) {
  return axios({
    method,
    url: `${settings.serverUrl}/api/post-group/agent${path}`,
    data,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    timeout: 10000,
  });
}

async function authenticate() {
  const res = await axios.post(
    `${settings.serverUrl}/api/post-group/agent/auth`,
    { username: settings.username, password: settings.password },
    { timeout: 10000 }
  );
  token = res.data.token;
}

async function sendHeartbeat() {
  try { await api('post', '/heartbeat'); } catch {}
}

async function pollAndExecute() {
  if (running) return;

  try {
    const res = await api('get', '/tasks');
    const tasks = res.data?.tasks || [];

    for (const task of tasks) {
      running = true;
      setStatus({ currentTask: { id: task.id, type: task.type } });

      try {
        await api('post', `/tasks/${task.id}/start`);

        const logs = [];
        const onLog = (msg) => {
          logs.push(msg);
          setStatus({ currentTask: { id: task.id, type: task.type, lastLog: msg } });
        };

        const onNeedLogin = () => {
          setStatus({ needLogin: true });
        };

        let result;
        if (task.type === 'post_groups') {
          result = await runPostTask(task, onLog, onNeedLogin);
        } else {
          result = { error: `Task type không hỗ trợ: ${task.type}` };
        }

        await api('post', `/tasks/${task.id}/done`, { result, logs });
      } catch (err) {
        await api('post', `/tasks/${task.id}/done`, {
          result: { error: err.message },
          logs: [],
        }).catch(() => {});
      } finally {
        running = false;
        setStatus({ currentTask: null, needLogin: false });
      }
    }
  } catch (err) {
    if (err.response?.status === 401) {
      token = null;
      setStatus({ connected: false, error: 'Phiên hết hạn, đang xác thực lại...' });
    }
  }
}

async function start(cfg, onStatus) {
  settings       = cfg;
  onStatusChange = onStatus;
  token          = null;

  setStatus({ connected: false, error: null });

  try {
    await authenticate();
    setStatus({ connected: true, error: null });
  } catch (err) {
    setStatus({ connected: false, error: 'Xác thực thất bại: ' + (err.response?.data?.error || err.message) });
    return;
  }

  // Heartbeat mỗi 20s
  const heartbeatTimer = setInterval(sendHeartbeat, 20_000);
  sendHeartbeat();

  // Poll task mỗi 5s
  pollTimer = setInterval(pollAndExecute, 5_000);
  pollAndExecute();

  // Lưu timer để stop
  start._heartbeatTimer = heartbeatTimer;
}

function stop() {
  clearInterval(pollTimer);
  clearInterval(start._heartbeatTimer);
  pollTimer = null;
  token     = null;
  running   = false;
  setStatus({ connected: false, error: null, currentTask: null });
}

module.exports = { start, stop, getStatus, clearSession };
