const Store = require('electron-store');

const store = new Store({
  name: 'tezo-agent-config',
  schema: {
    serverUrl: { type: 'string', default: '' },
    username:  { type: 'string', default: '' },
    password:  { type: 'string', default: '' },
    autoStart: { type: 'boolean', default: true },
  },
});

module.exports = {
  getSettings: () => ({
    serverUrl: store.get('serverUrl'),
    username:  store.get('username'),
    password:  store.get('password'),
    autoStart: store.get('autoStart'),
  }),
  saveSettings: (data) => {
    if (data.serverUrl !== undefined) store.set('serverUrl', data.serverUrl.replace(/\/$/, ''));
    if (data.username  !== undefined) store.set('username',  data.username);
    if (data.password  !== undefined) store.set('password',  data.password);
    if (data.autoStart !== undefined) store.set('autoStart', data.autoStart);
  },
};
