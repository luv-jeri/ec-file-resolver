import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron';
import path from 'path';
import AutoLaunch from 'auto-launch';
import { createServer } from './server';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let httpServer: ReturnType<typeof createServer> | null = null;

const resolutionHistory: Array<{
  timestamp: number;
  filesRequested: number;
  filesResolved: number;
  status: string;
}> = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', (e) => {
    if (!(app as any).isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '../assets/tray-icon.png');
  let icon: nativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    if (icon.isEmpty()) {
      icon = nativeImage.createEmpty();
    }
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('EC File Resolver');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open Dashboard', click: () => mainWindow?.show() },
    { type: 'separator' },
    {
      label: 'Server: port 7771',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        (app as any).isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => mainWindow?.show());
}

function setupIpc() {
  ipcMain.handle('get-server-status', () => {
    return {
      running: httpServer !== null,
      port: 7771,
    };
  });

  ipcMain.handle('get-logs', () => {
    return [];
  });

  ipcMain.handle('get-resolution-history', () => {
    return resolutionHistory;
  });
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

  createWindow();
  createTray();
  setupIpc();
  setupAutoLaunch();
});

app.on('window-all-closed', () => {
  // Keep running in tray
});

app.on('before-quit', () => {
  (app as any).isQuitting = true;
  httpServer?.server.close();
});
