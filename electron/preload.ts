import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, Library, RemoteStateSnapshot, RemoteCommand } from '../shared/types';

export interface UpdateStatusPayload {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev' | 'ok';
  version?: string;
  percent?: number;
  message?: string;
}

const api = {
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
  },
  store: {
    getLibrary: (): Promise<Library> => ipcRenderer.invoke('store:getLibrary'),
    saveLibrary: (library: Library): Promise<boolean> => ipcRenderer.invoke('store:saveLibrary', library),
    getSettings: (): Promise<AppSettings> => ipcRenderer.invoke('store:getSettings'),
    saveSettings: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke('store:saveSettings', settings),
  },
  fs: {
    chooseSongFolder: (): Promise<string | null> => ipcRenderer.invoke('fs:chooseSongFolder'),
    scanFolderTracks: (folderPath: string): Promise<{ name: string; filePath: string }[]> =>
      ipcRenderer.invoke('fs:scanFolderTracks', folderPath),
    toFileUrl: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:toFileUrl', filePath),
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('fs:openExternal', url),
  },
  net: {
    localAddresses: (): Promise<string[]> => ipcRenderer.invoke('net:localAddresses'),
  },
  log: {
    append: (line: string): Promise<boolean> => ipcRenderer.invoke('log:append', line),
    getPath: (): Promise<string> => ipcRenderer.invoke('log:getPath'),
    reveal: (): Promise<string> => ipcRenderer.invoke('log:reveal'),
    readTail: (maxChars?: number): Promise<string> => ipcRenderer.invoke('log:readTail', maxChars),
    clear: (): Promise<boolean> => ipcRenderer.invoke('log:clear'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
  },
  update: {
    check: (): Promise<UpdateStatusPayload> => ipcRenderer.invoke('update:check'),
    install: (): Promise<boolean> => ipcRenderer.invoke('update:install'),
    onStatus: (cb: (payload: UpdateStatusPayload) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, payload: UpdateStatusPayload) => cb(payload);
      ipcRenderer.on('update:status', listener);
      return () => {
        ipcRenderer.removeListener('update:status', listener);
      };
    },
  },
  remote: {
    getInfo: (): Promise<{ port: number; pin: string; enabled: boolean }> => ipcRenderer.invoke('remote:getInfo'),
    sendState: (snapshot: RemoteStateSnapshot) => ipcRenderer.send('remote:state', snapshot),
    onCommand: (cb: (cmd: RemoteCommand) => void) => {
      const listener = (_e: Electron.IpcRendererEvent, cmd: RemoteCommand) => cb(cmd);
      ipcRenderer.on('remote:command', listener);
      return () => ipcRenderer.removeListener('remote:command', listener);
    },
  },
};

export type MrqApi = typeof api;

contextBridge.exposeInMainWorld('api', api);
