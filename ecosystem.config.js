module.exports = {
  apps: [
    // NestJS server: runs compiled dist/main.js directly
    {
      name: 'tezo-api',
      script: 'E:\\APP\\tezo\\apps\\api\\dist\\main.js',
      node_args: '--enable-source-maps',
      cwd: 'E:\\APP\\tezo\\apps\\api',
      watch: false,
      autorestart: true,
      windowsHide: true,
      env: { NODE_ENV: 'development' },
    },
    // NestJS watcher: detects src/*.ts changes → nest build → pm2 restart tezo-api
    {
      name: 'tezo-api-watcher',
      script: 'E:\\APP\\tezo\\scripts\\api-watcher.js',
      cwd: 'E:\\APP\\tezo',
      watch: false,
      autorestart: true,
      windowsHide: true,
      env: { NODE_ENV: 'development' },
    },
    // Next.js custom server: single-process dev mode with HMR, no child spawning
    {
      name: 'tezo-web',
      script: 'E:\\APP\\tezo\\apps\\web\\dev-server.js',
      cwd: 'E:\\APP\\tezo\\apps\\web',
      watch: false,
      autorestart: true,
      windowsHide: true,
      env: { NODE_ENV: 'development', PORT: '3001' },
    },
  ],
};
