"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const api = {
    window: {
        minimize: () => electron_1.ipcRenderer.send('win:minimize'),
        maximize: () => electron_1.ipcRenderer.send('win:maximize'),
        close: () => electron_1.ipcRenderer.send('win:close'),
    },
    store: {
        getLibrary: () => electron_1.ipcRenderer.invoke('store:getLibrary'),
        saveLibrary: (library) => electron_1.ipcRenderer.invoke('store:saveLibrary', library),
        getSettings: () => electron_1.ipcRenderer.invoke('store:getSettings'),
        saveSettings: (settings) => electron_1.ipcRenderer.invoke('store:saveSettings', settings),
    },
    fs: {
        chooseSongFolder: () => electron_1.ipcRenderer.invoke('fs:chooseSongFolder'),
        scanFolderTracks: (folderPath) => electron_1.ipcRenderer.invoke('fs:scanFolderTracks', folderPath),
        toFileUrl: (filePath) => electron_1.ipcRenderer.invoke('fs:toFileUrl', filePath),
        openExternal: (url) => electron_1.ipcRenderer.invoke('fs:openExternal', url),
    },
    net: {
        localAddresses: () => electron_1.ipcRenderer.invoke('net:localAddresses'),
    },
    log: {
        append: (line) => electron_1.ipcRenderer.invoke('log:append', line),
        getPath: () => electron_1.ipcRenderer.invoke('log:getPath'),
        reveal: () => electron_1.ipcRenderer.invoke('log:reveal'),
        readTail: (maxChars) => electron_1.ipcRenderer.invoke('log:readTail', maxChars),
        clear: () => electron_1.ipcRenderer.invoke('log:clear'),
    },
    app: {
        getVersion: () => electron_1.ipcRenderer.invoke('app:getVersion'),
        /** Avisa o processo principal se a música está tocando ou não, pra ele poder confirmar
         *  antes de fechar a janela no meio de uma reprodução ao vivo. */
        reportPlaybackState: (isPlaying) => electron_1.ipcRenderer.send('app:playbackState', isPlaying),
    },
    update: {
        check: () => electron_1.ipcRenderer.invoke('update:check'),
        install: () => electron_1.ipcRenderer.invoke('update:install'),
        onStatus: (cb) => {
            const listener = (_e, payload) => cb(payload);
            electron_1.ipcRenderer.on('update:status', listener);
            return () => {
                electron_1.ipcRenderer.removeListener('update:status', listener);
            };
        },
    },
    remote: {
        getInfo: () => electron_1.ipcRenderer.invoke('remote:getInfo'),
        sendState: (snapshot) => electron_1.ipcRenderer.send('remote:state', snapshot),
        onCommand: (cb) => {
            const listener = (_e, cmd) => cb(cmd);
            electron_1.ipcRenderer.on('remote:command', listener);
            return () => electron_1.ipcRenderer.removeListener('remote:command', listener);
        },
    },
};
electron_1.contextBridge.exposeInMainWorld('api', api);
//# sourceMappingURL=preload.js.map