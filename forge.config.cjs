const path = require('node:path');

module.exports = {
  packagerConfig: {
    name: 'Harness', executableName: 'Harness', asar: true,
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    appBundleId: 'dev.harness.desktop',
    appCopyright: 'Copyright 2026 Harness contributors',
    ignore: (file) => file !== '' && !/^\/(dist|assets)(\/|$)/.test(file) && file !== '/package.json',
  },
  makers: [{ name: '@electron-forge/maker-squirrel', config: {
    name: 'harness_desktop', authors: 'Harness contributors',
    description: 'A local-first AI workspace with provider choice and approved tools.',
    setupExe: 'HarnessSetup.exe', setupIcon: path.join(__dirname, 'assets', 'icon.ico'),
    noMsi: true,
  } }],
};
