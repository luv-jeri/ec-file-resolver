import { app, Tray, Menu, nativeImage, NativeImage } from 'electron';
import path from 'path';
import AutoLaunch from 'auto-launch';
import { createServer } from './server';

let tray: Tray | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;
let isOnline = false;

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'EC File Resolver',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: `Status: ${isOnline ? 'Online' : 'Offline'}`,
      enabled: false,
    },
    {
      label: 'Server: port 7771',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Restart',
      click: () => {
        app.relaunch();
        app.exit();
      },
    },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon: NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      console.error('Tray icon is empty, path:', iconPath);
      icon = nativeImage.createEmpty();
    } else {
      icon = icon.resize({ width: 22, height: 22 });
    }
  } catch (err) {
    console.error('Failed to load tray icon:', err);
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('EC File Resolver');

  updateTrayMenu();
}

async function setupAutoLaunch() {
  const autoLauncher = new AutoLaunch({
    name: 'EC File Resolver',
    isHidden: true,
  });

  try {
    const isEnabled = await autoLauncher.isEnabled();
    if (!isEnabled) {
      await autoLauncher.enable();
      console.log('Auto-launch enabled');
    }
  } catch (e) {
    console.warn('Auto-launch setup failed:', e);
  }
}

app.whenReady().then(() => {
  httpServer = createServer(7771);
  console.log('HTTP server started on port 7771');

  httpServer.server.on('error', (err: any) => {
    console.error('Server error:', err);
    isOnline = false;
    updateTrayMenu();
  });

  httpServer.server.on('listening', () => {
    isOnline = true;
    updateTrayMenu();
  });

  if (httpServer.server.listening) {
    isOnline = true;
  }

  createTray();
  setupAutoLaunch();
});

app.on('window-all-closed', () => {
  // Keep running in tray — no windows to manage
});

app.on('before-quit', () => {
  httpServer?.server.close();
});
