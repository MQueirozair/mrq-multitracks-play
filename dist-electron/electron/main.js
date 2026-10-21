"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_os_1 = __importDefault(require("node:os"));
const node_url_1 = require("node:url");
const electron_store_1 = __importDefault(require("electron-store"));
const electron_updater_1 = require("electron-updater");
const types_1 = require("../shared/types");
const remoteServer_1 = require("./remoteServer");
const isDev = !electron_1.app.isPackaged;
// Token de leitura (somente "Contents: Read-only") do repositório PRIVADO que
// hospeda as releases do app. Usado apenas para o electron-updater conseguir
// listar/baixar os arquivos de atualização sozinho, sem interação do usuário.
// É intencionalmente um token de escopo mínimo (só lê esse repositório),
// então o risco de ele estar embutido no binário é baixo.
const UPDATE_READONLY_TOKEN = process.env.MRQ_UPDATE_TOKEN || '__MRQ_UPDATE_TOKEN__';
const UPDATE_REPO_OWNER = 'MQueirozair';
const UPDATE_REPO_NAME = 'mrq-multitracks-play';
// Protocolo customizado para servir arquivos de áudio locais sem copiar nada
// e sem os bloqueios de CORS/segurança do file:// puro.
electron_1.protocol.registerSchemesAsPrivileged([
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
const store = new electron_store_1.default({
    defaults: {
        library: { songs: [], scenes: [] },
        settings: types_1.DEFAULT_SETTINGS,
    },
});
let mainWindow = null;
let remoteServer = null;
// ---------- Log de diagnóstico persistente ----------
// Fica em disco (fora da pasta de instalação) para sobreviver a updates e
// poder ser enviado pelo usuário quando algo falha, sem precisar de DevTools.
const logDir = node_path_1.default.join(electron_1.app.getPath('userData'), 'logs');
const logFilePath = node_path_1.default.join(logDir, 'mrq-debug.log');
function ensureLogDir() {
    try {
        node_fs_1.default.mkdirSync(logDir, { recursive: true });
    }
    catch { /* noop */ }
}
function appendLog(line) {
    ensureLogDir();
    const ts = new Date().toISOString();
    try {
        node_fs_1.default.appendFileSync(logFilePath, `[${ts}] ${line}\n`, 'utf8');
        const stat = node_fs_1.default.statSync(logFilePath);
        // Evita crescimento infinito: mantém só o último ~2MB se passar de 5MB.
        if (stat.size > 5 * 1024 * 1024) {
            const content = node_fs_1.default.readFileSync(logFilePath, 'utf8');
            node_fs_1.default.writeFileSync(logFilePath, `[...log truncado...]\n${content.slice(-2 * 1024 * 1024)}`, 'utf8');
        }
    }
    catch (err) {
        console.error('[log] falha ao gravar log de diagnóstico', err);
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1360,
        height: 860,
        minWidth: 1040,
        minHeight: 660,
        backgroundColor: '#0b0b0d',
        autoHideMenuBar: true,
        frame: false,
        titleBarStyle: 'hidden',
        webPreferences: {
            preload: node_path_1.default.join(__dirname, 'preload.js'),
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
    }
    else {
        mainWindow.loadFile(node_path_1.default.join(__dirname, '../../dist/index.html'));
    }
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    remoteServer = new remoteServer_1.RemoteServer({
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
function sendUpdateStatus(payload) {
    mainWindow?.webContents.send('update:status', payload);
}
let updaterConfigured = false;
function setupAutoUpdater() {
    if (isDev) {
        appendLog('[autoUpdater] ignorado em modo dev');
        return;
    }
    if (updaterConfigured)
        return;
    updaterConfigured = true;
    electron_updater_1.autoUpdater.logger = {
        info: (m) => appendLog(`[autoUpdater] ${m}`),
        warn: (m) => appendLog(`[autoUpdater][warn] ${m}`),
        error: (m) => appendLog(`[autoUpdater][erro] ${m}`),
        debug: () => { },
    };
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    try {
        electron_updater_1.autoUpdater.setFeedURL({
            provider: 'github',
            owner: UPDATE_REPO_OWNER,
            repo: UPDATE_REPO_NAME,
            private: true,
            token: UPDATE_READONLY_TOKEN,
        });
    }
    catch (err) {
        appendLog(`[autoUpdater] falha ao configurar feed: ${err instanceof Error ? err.stack : err}`);
    }
    electron_updater_1.autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }));
    electron_updater_1.autoUpdater.on('update-available', (info) => sendUpdateStatus({ status: 'available', version: info.version }));
    electron_updater_1.autoUpdater.on('update-not-available', (info) => sendUpdateStatus({ status: 'not-available', version: info.version }));
    electron_updater_1.autoUpdater.on('download-progress', (p) => sendUpdateStatus({ status: 'downloading', percent: p.percent }));
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ status: 'downloaded', version: info.version }));
    electron_updater_1.autoUpdater.on('error', (err) => {
        appendLog(`[autoUpdater] erro: ${err instanceof Error ? err.stack : err}`);
        sendUpdateStatus({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    });
    // Checagem automática ao abrir o app, e depois a cada 4 horas.
    electron_updater_1.autoUpdater.checkForUpdates().catch((err) => appendLog(`[autoUpdater] falha ao checar: ${err}`));
    setInterval(() => {
        electron_updater_1.autoUpdater.checkForUpdates().catch((err) => appendLog(`[autoUpdater] falha ao checar: ${err}`));
    }, 4 * 60 * 60 * 1000);
}
electron_1.ipcMain.handle('update:check', () => {
    if (isDev)
        return { status: 'dev' };
    return electron_updater_1.autoUpdater.checkForUpdates().then(() => ({ status: 'ok' })).catch((err) => ({ status: 'error', message: String(err) }));
});
electron_1.ipcMain.handle('update:install', () => {
    electron_updater_1.autoUpdater.quitAndInstall();
    return true;
});
electron_1.ipcMain.handle('app:getVersion', () => electron_1.app.getVersion());
process.on('uncaughtException', (err) => {
    appendLog(`UNCAUGHT EXCEPTION (main): ${err?.stack || err}`);
});
process.on('unhandledRejection', (reason) => {
    appendLog(`UNHANDLED REJECTION (main): ${reason instanceof Error ? reason.stack : String(reason)}`);
});
electron_1.app.whenReady().then(() => {
    appendLog(`=== MRQ iniciado === versão=${electron_1.app.getVersion()} plataforma=${process.platform} arch=${process.arch} electron=${process.versions.electron} chrome=${process.versions.chrome}`);
    electron_1.protocol.handle('mrqfile', (request) => {
        try {
            const raw = decodeURIComponent(request.url.replace('mrqfile://', '').replace(/^\/+/, ''));
            const filePath = process.platform === 'win32' ? raw : '/' + raw;
            const fileUrl = (0, node_url_1.pathToFileURL)(filePath).toString();
            appendLog(`[mrqfile] request.url="${request.url}" raw="${raw}" filePath="${filePath}" fileUrl="${fileUrl}"`);
            return electron_1.net.fetch(fileUrl);
        }
        catch (err) {
            appendLog(`[mrqfile] ERRO ao resolver "${request.url}": ${err instanceof Error ? err.stack : err}`);
            return new Response('not found', { status: 404 });
        }
    });
    createWindow();
    setupAutoUpdater();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    remoteServer?.stop();
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// ---------- IPC: janela ----------
electron_1.ipcMain.on('win:minimize', () => mainWindow?.minimize());
electron_1.ipcMain.on('win:maximize', () => {
    if (!mainWindow)
        return;
    if (mainWindow.isMaximized())
        mainWindow.unmaximize();
    else
        mainWindow.maximize();
});
electron_1.ipcMain.on('win:close', () => mainWindow?.close());
// ---------- IPC: biblioteca / configurações ----------
electron_1.ipcMain.handle('store:getLibrary', () => store.get('library'));
electron_1.ipcMain.handle('store:saveLibrary', (_e, library) => {
    store.set('library', library);
    return true;
});
electron_1.ipcMain.handle('store:getSettings', () => store.get('settings'));
electron_1.ipcMain.handle('store:saveSettings', (_e, settings) => {
    store.set('settings', settings);
    if (remoteServer) {
        if (settings.remote.enabled)
            remoteServer.start().catch(() => { });
        else
            remoteServer.stop();
    }
    return true;
});
// ---------- IPC: arquivos ----------
electron_1.ipcMain.handle('fs:chooseSongFolder', async () => {
    // Atalho apenas para testes automatizados (E2E) em ambientes sem interação
    // gráfica real, ex: sandbox CI. Nunca ativado em uso normal do app.
    if (process.env.MRQ_TEST_FOLDER)
        return process.env.MRQ_TEST_FOLDER;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Escolha a pasta da música (multitracks)',
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
electron_1.ipcMain.handle('fs:scanFolderTracks', async (_e, folderPath) => {
    const entries = await node_fs_1.default.promises.readdir(folderPath, { withFileTypes: true });
    const tracks = entries
        .filter((e) => e.isFile() && AUDIO_EXTENSIONS.has(node_path_1.default.extname(e.name).toLowerCase()))
        .map((e) => ({
        name: node_path_1.default.basename(e.name, node_path_1.default.extname(e.name)),
        filePath: node_path_1.default.join(folderPath, e.name),
    }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return tracks;
});
electron_1.ipcMain.handle('fs:toFileUrl', (_e, filePath) => {
    const normalized = filePath.split(node_path_1.default.sep).join('/');
    return 'mrqfile:///' + encodeURI(normalized).replace(/#/g, '%23');
});
electron_1.ipcMain.handle('fs:openExternal', (_e, url) => electron_1.shell.openExternal(url));
// ---------- IPC: log de diagnóstico ----------
electron_1.ipcMain.handle('log:append', (_e, line) => {
    appendLog(String(line));
    return true;
});
electron_1.ipcMain.handle('log:getPath', () => logFilePath);
electron_1.ipcMain.handle('log:reveal', () => {
    ensureLogDir();
    if (!node_fs_1.default.existsSync(logFilePath))
        node_fs_1.default.writeFileSync(logFilePath, '', 'utf8');
    electron_1.shell.showItemInFolder(logFilePath);
    return logFilePath;
});
electron_1.ipcMain.handle('log:readTail', (_e, maxChars = 200000) => {
    try {
        if (!node_fs_1.default.existsSync(logFilePath))
            return '';
        const content = node_fs_1.default.readFileSync(logFilePath, 'utf8');
        return content.length > maxChars ? content.slice(-maxChars) : content;
    }
    catch {
        return '';
    }
});
electron_1.ipcMain.handle('log:clear', () => {
    try {
        node_fs_1.default.writeFileSync(logFilePath, '', 'utf8');
    }
    catch { /* noop */ }
    return true;
});
electron_1.ipcMain.handle('net:localAddresses', () => {
    const nets = node_os_1.default.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(nets)) {
        for (const iface of nets[name] ?? []) {
            if (iface.family === 'IPv4' && !iface.internal)
                addresses.push(iface.address);
        }
    }
    return addresses;
});
// ---------- IPC: remoto (estado vindo do renderer para difundir ao celular) ----------
electron_1.ipcMain.on('remote:state', (_e, snapshot) => {
    remoteServer?.broadcastState(snapshot);
});
electron_1.ipcMain.handle('remote:getInfo', () => {
    const settings = store.get('settings');
    return { port: settings.remote.port, pin: settings.remote.pin, enabled: settings.remote.enabled };
});
//# sourceMappingURL=main.js.map