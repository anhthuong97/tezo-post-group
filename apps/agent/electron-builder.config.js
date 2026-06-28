module.exports = {
  appId: 'com.tezo.agent',
  productName: 'TeZo Agent',
  directories: { output: 'dist' },
  files: ['src/**/*', 'assets/**/*', 'node_modules/**/*'],
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'assets/icon.ico',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    runAfterFinish: true,
    installerHeaderIcon: 'assets/icon.ico',
  },
};
