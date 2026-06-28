const axios = require('axios');
const { fetchGroups, runPostTask } = require('./facebook');

let settings       = null;
let token          = null;
let pollTimer      = null;
let heartbeatTimer = null;
let running        = false;
let statusInfo     = { connected: false, error: null, currentTask: null };
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
    timeout: 15000,
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
    const res   = await api('get', '/tasks');
    const tasks = res.data?.tasks || [];

    for (const task of tasks) {
      running = true;
      setStatus({ currentTask: { id: task.id, type: task.type } });
      const logs = [];

      const onLog = async (msg) => {
        logs.push(msg);
        setStatus({ currentTask: { id: task.id, type: task.type, lastLog: msg } });
        // Gửi progress lên VPS để web thấy realtime
        api('post', `/tasks/${task.id}/progress`, { logs }).catch(() => {});
      };

      try {
        await api('post', `/tasks/${task.id}/start`);

        let result;

        if (task.type === 'post_groups') {
          const onNeedLogin = () => setStatus({ needLogin: true });
          result = await runPostTask(task, onLog, onNeedLogin);

        } else if (task.type === 'fetch_groups') {
          const fetchResult = await fetchGroups(onLog);
          if (!fetchResult.error && fetchResult.groups.length > 0) {
            await api('post', '/groups', { groups: fetchResult.groups });
            onLog(`Đã đồng bộ ${fetchResult.groups.length} nhóm lên server.`);
          }
          result = fetchResult;

        } else {
          result = { error: `Task type không hỗ trợ: ${task.type}` };
        }

        await api('post', `/tasks/${task.id}/done`, { result, logs });
      } catch (err) {
        await api('post', `/tasks/${task.id}/done`, {
          result: { error: err.message }, logs,
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
      try { await authenticate(); setStatus({ connected: true, error: null }); } catch {}
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

  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 20_000);

  pollAndExecute();
  pollTimer = setInterval(pollAndExecute, 5_000);
}

function stop() {
  clearInterval(pollTimer);
  clearInterval(heartbeatTimer);
  pollTimer      = null;
  heartbeatTimer = null;
  token          = null;
  running        = false;
  setStatus({ connected: false, error: null, currentTask: null });
}

module.exports = { start, stop, getStatus };
