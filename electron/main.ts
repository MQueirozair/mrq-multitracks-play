import { app, BrowserWindow, ipcMain, dialog, protocol, shell, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import Store from 'electron-store';
import { autoUpdater } from 'electron-updater';
import type { AppSettings, Library } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import { RemoteServer } from './remoteServer';

const isDev = !app.isPackaged;

const UPDATE_REPO_OWNER = 'MQueirozair';
const UPDATE_REPO_NAME = 'mrq-multitracks-play';

// Protocolo customizado para servir arquivos de áudio locais sem copiar nada
// e sem os bloqueios de CORS/segurança do file:// puro.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'mrqfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.flac', '.aiff', '.aif', '.ogg', '.m4a']);

interface StoreSchema {
  library: Library;
  settings: AppSettings;
}

const store = new Store<StoreSchema>({
  defaults: {
    library: { songs: [], scenes: [] },
    settings: DEFAULT_SETTINGS,
  },
});

let mainWindow: BrowserWindow | null = null;
let remoteServer: RemoteServer | null = null;

// ---------- Log de diagnóstico persistente ----------
// Fica em disco (fora da pasta de instalação) para sobreviver a updates e
// poder ser enviado pelo usuário quando algo falha, sem precisar de DevTools.
const logDir = path.join(app.getPath('userData'), 'logs');
const logFilePath = path.join(logDir, 'mrq-debug.log');

function ensureLogDir() {
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch { /* noop */ }
}

function appendLog(line: string) {
  ensureLogDir();
  const ts = new Date().toISOString();
  try {
    fs.appendFileSync(logFilePath, `[${ts}] ${line}\n`, 'utf8');
    const stat = fs.statSync(logFilePath);
    // Evita crescimento infinito: mantém só o último ~2MB se passar de 5MB.
    if (stat.size > 5 * 1024 * 1024) {
      const content = fs.readFileSync(logFilePath, 'utf8');
      fs.writeFileSync(logFilePath, `[...log truncado...]\n${content.slice(-2 * 1024 * 1024)}`, 'utf8');
    }
  } catch (err) {
    console.error('[log] falha ao gravar log de diagnóstico', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1040,
    minHeight: 660,
    backgroundColor: '#0b0b0d',
    autoHideMenuBar: true,
    frame: false,
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Concede permissão de MIDI/áudio automaticamente (app local, confiável).
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
    if (['midi', 'midiSysex', 'media', 'audioCapture'].includes(permission)) {
      callback(true);
      return;
    }
    callback(false);
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  remoteServer = new RemoteServer({
    getPort: () => store.get('settings').remote.port,
    getPin: () => store.get('settings').remote.pin,
    onCommand: (cmd) => {
      mainWindow?.webContents.send('remote:command', cmd);
    },
  });
  if (store.get('settings').remote.enabled) {
    remoteServer.start().catch((err) => console.error('[remote] falha ao iniciar', err));
  }
}

// ---------- Auto-atualização (electron-updater + GitHub Releases privado) ----------
function sendUpdateStatus(payload: Record<string, unknown>) {
  mainWindow?.webContents.send('update:status', payload);
}

let updaterConfigured = false;
function setupAutoUpdater() {
  if (isDev) {
    appendLog('[autoUpdater] ignorado em modo dev');
    return;
  }
  if (updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.logger = {
    info: (m: unknown) => appendLog(`[autoUpdater] ${m}`),
    warn: (m: unknown) => appendLog(`[autoUpdater][warn] ${m}`),
    error: (m: unknown) => appendLog(`[autoUpdater][erro] ${m}`),
    debug: () => {},
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: UPDATE_REPO_OWNER,
      repo: UPDATE_REPO_NAME,
    });
  } catch (err) {
    appendLog(`[autoUpdater] falha ao configurar feed: ${err instanceof Error ? err.stack : err}`);
  }

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }));
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ status: 'available', version: info.version }));
  autoUpdater.on('update-not-available', (info) => sendUpdateStatus({ status: 'not-available', version: info.version }));
  autoUpdater.on('download-progress', (p) => sendUpdateStatus({ status: 'downloading', percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ status: 'downloaded', version: info.version }));
  autoUpdater.on('error', (err) => {
    appendLog(`[autoUpdater] erro: ${err instanceof Error ? err.stack : err}`);
    sendUpdateStatus({ status: 'error', message: err instanceof Error ? err.message : String(err) });
  });

  // Checagem automática ao abrir o app, e depois a cada 4 horas.
  autoUpdater.checkForUpdates().catch((err) => appendLog(`[autoUpdater] falha ao checar: ${err}`));
  setInterval(() => {
    autoUpdater.checkForUpdates().catch((err) => appendLog(`[autoUpdater] falha ao checar: ${err}`));
  }, 4 * 60 * 60 * 1000);
}

ipcMain.handle('update:check', () => {
  if (isDev) return { status: 'dev' };
  return autoUpdater.checkForUpdates().then(() => ({ status: 'ok' })).catch((err) => ({ status: 'error', message: String(err) }));
});
ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall();
  return true;
});
ipcMain.handle('app:getVersion', () => app.getVersion());

process.on('uncaughtException', (err) => {
  appendLog(`UNCAUGHT EXCEPTION (main): ${err?.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
  appendLog(`UNHANDLED REJECTION (main): ${reason instanceof Error ? reason.stack : String(reason)}`);
});

app.whenReady().then(() => {
  appendLog(
    `=== MRQ iniciado === versão=${app.getVersion()} plataforma=${process.platform} arch=${process.arch} electron=${process.versions.electron} chrome=${process.versions.chrome}`
  );

  protocol.handle('mrqfile', (request) => {
    try {
      const raw = decodeURIComponent(request.url.replace('mrqfile://', '').replace(/^\/+/, ''));
      const filePath = process.platform === 'win32' ? raw : '/' + raw;
      const fileUrl = pathToFileURL(filePath).toString();
      appendLog(`[mrqfile] request.url="${request.url}" raw="${raw}" filePath="${filePath}" fileUrl="${fileUrl}"`);
      return net.fetch(fileUrl);
    } catch (err) {
      appendLog(`[mrqfile] ERRO ao resolver "${request.url}": ${err instanceof Error ? err.stack : err}`);
      return new Response('not found', { status: 404 });
    }
  });

  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  remoteServer?.stop();
  if (process.platform !== 'darwin') app.quit();
});

// ---------- IPC: janela ----------
ipcMain.on('win:minimize', () => mainWindow?.minimize());
ipcMain.on('win:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('win:close', () => mainWindow?.close());

// ---------- IPC: biblioteca / configurações ----------
ipcMain.handle('store:getLibrary', () => store.get('library'));
ipcMain.handle('store:saveLibrary', (_e, library: Library) => {
  store.set('library', library);
  return true;
});
ipcMain.handle('store:getSettings', () => store.get('settings'));
ipcMain.handle('store:saveSettings', (_e, settings: AppSettings) => {
  store.set('settings', settings);
  if (remoteServer) {
    if (settings.remote.enabled) remoteServer.start().catch(() => {});
    else remoteServer.stop();
  }
  return true;
});

// ---------- IPC: arquivos ----------
ipcMain.handle('fs:chooseSongFolder', async () => {
  // Atalho apenas para testes automatizados (E2E) em ambientes sem interação
  // gráfica real, ex: sandbox CI. Nunca ativado em uso normal do app.
  if (process.env.MRQ_TEST_FOLDER) return process.env.MRQ_TEST_FOLDER;
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Escolha a pasta da música (multitracks)',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('fs:scanFolderTracks', async (_e, folderPath: string) => {
  const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
  const tracks = entries
    .filter((e) => e.isFile() && AUDIO_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => ({
      name: path.basename(e.name, path.extname(e.name)),
      filePath: path.join(folderPath, e.name),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  return tracks;
});

ipcMain.handle('fs:toFileUrl', (_e, filePath: string) => {
  const normalized = filePath.split(path.sep).join('/');
  return 'mrqfile:///' + encodeURI(normalized).replace(/#/g, '%23');
});

ipcMain.handle('fs:openExternal', (_e, url: string) => shell.openExternal(url));

// ---------- IPC: log de diagnóstico ----------
ipcMain.handle('log:append', (_e, line: string) => {
  appendLog(String(line));
  return true;
});
ipcMain.handle('log:getPath', () => logFilePath);
ipcMain.handle('log:reveal', () => {
  ensureLogDir();
  if (!fs.existsSync(logFilePath)) fs.writeFileSync(logFilePath, '', 'utf8');
  shell.showItemInFolder(logFilePath);
  return logFilePath;
});
ipcMain.handle('log:readTail', (_e, maxChars = 200000) => {
  try {
    if (!fs.existsSync(logFilePath)) return '';
    const content = fs.readFileSync(logFilePath, 'utf8');
    return content.length > maxChars ? content.slice(-maxChars) : content;
  } catch {
    return '';
  }
});
ipcMain.handle('log:clear', () => {
  try {
    fs.writeFileSync(logFilePath, '', 'utf8');
  } catch { /* noop */ }
  return true;
});

ipcMain.handle('net:localAddresses', () => {
  const nets = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const iface of nets[name] ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }
  return addresses;
});

// ---------- IPC: remoto (estado vindo do renderer para difundir ao celular) ----------
ipcMain.on('remote:state', (_e, snapshot) => {
  remoteServer?.broadcastState(snapshot);
});
ipcMain.handle('remote:getInfo', () => {
  const settings = store.get('settings');
  return { port: settings.remote.port, pin: settings.remote.pin, enabled: settings.remote.enabled };
});
