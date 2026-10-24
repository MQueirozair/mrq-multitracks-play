// Ponte "window.api" para a casca Tauri — equivalente ao electron/preload.ts,
// mas sem precisar de um processo de preload separado: aqui a gente monta o
// MESMO objeto `window.api` (shape idêntico ao MrqApi do Electron) usando as
// APIs JS do Tauri (invoke de comandos Rust + plugins oficiais). Isso permite
// que TODO o resto do app React (SetlistPanel, AudioEngine, etc.) continue
// chamando `window.api.xxx` sem nenhuma alteração, rodando tanto sob Electron
// quanto sob Tauri a partir do MESMO bundle compilado.
//
// Só é ativado quando o app está rodando dentro de um webview do Tauri
// (ver detecção em main.tsx). Em build Electron, o preload.js já cuidou de
// `window.api` antes deste módulo sequer existir no bundle de produção.

import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { getVersion } from '@tauri-apps/api/app';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog, ask } from '@tauri-apps/plugin-dialog';
import { openUrl, revealItemInDir } from '@tauri-apps/plugin-opener';
import { load as loadStore, type Store } from '@tauri-apps/plugin-store';
import type { AppSettings, Library, RemoteStateSnapshot, RemoteCommand } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import type { MrqApi, UpdateStatusPayload } from '../electron/preload';

// ---------- Fechar com confirmação se a música ainda estiver tocando ----------
// Equivalente ao listener `mainWindow.on('close', ...)` do electron/main.ts:
// lá o processo principal decidia; aqui é o próprio front-end (via
// onCloseRequested, que intercepta tanto o botão customizado da titlebar
// quanto Alt+F4/fechar pela barra de tarefas) que pergunta antes de fechar.
let playbackActive = false;
let forceClose = false;

getCurrentWindow()
  .onCloseRequested(async (event) => {
    if (forceClose || !playbackActive) return;
    event.preventDefault();
    const confirmed = await ask(
      'A música ainda está tocando. Tem certeza que quer fechar o MRQ - Multitracks Play?',
      {
        title: 'Música tocando',
        kind: 'warning',
        okLabel: 'Fechar mesmo assim',
        cancelLabel: 'Cancelar',
      }
    );
    if (confirmed) {
      forceClose = true;
      await getCurrentWindow().close();
    }
  })
  .catch(() => {
    /* noop */
  });

// ---------- Store (biblioteca / configurações) ----------
// Um único arquivo JSON persistente, mesma ideia do electron-store (porém em
// outro diretório — ver nota de migração abaixo).
let storePromise: Promise<Store> | null = null;
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = loadStore('mrq-config.json', { autoSave: false });
  return storePromise;
}

// Mesmo merge raso com os valores padrão que existia em store:getSettings no
// main.ts do Electron: garante que campos novos adicionados em versões mais
// recentes (ex: "rack", ou campos novos dentro de cada RackLayer) nunca
// fiquem `undefined` em instalações com configurações salvas antigas.
function mergeSettingsWithDefaults(stored: Partial<AppSettings> | undefined): AppSettings {
  const storedRack = stored?.rack;
  const defaultLayers = DEFAULT_SETTINGS.rack.layers;
  const layers = (storedRack?.layers ?? defaultLayers).map((layer, i) => ({
    ...(defaultLayers[i] ?? defaultLayers[0]),
    ...layer,
  }));
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    rack: { ...DEFAULT_SETTINGS.rack, ...(storedRack ?? {}), layers },
  };
}

async function applyRemoteConfigFromSettings(settings: AppSettings) {
  try {
    await invoke('remote_configure', {
      enabled: settings.remote.enabled,
      port: settings.remote.port,
      pin: settings.remote.pin,
    });
  } catch (err) {
    console.error('[remote] falha ao configurar servidor remoto', err);
  }
}

// Ao abrir o app, se o controle remoto estiver habilitado nas configurações
// salvas, já sobe o servidor — mesmo comportamento do `createWindow()` do
// Electron (`if (store.get('settings').remote.enabled) remoteServer.start()`).
(async () => {
  try {
    const store = await getStore();
    const stored = (await store.get<AppSettings>('settings')) ?? undefined;
    const settings = mergeSettingsWithDefaults(stored);
    await applyRemoteConfigFromSettings(settings);
  } catch (err) {
    console.error('[remote] falha ao inicializar a partir das configurações salvas', err);
  }
})();

// ---------- Diálogos de arquivo ----------
const INSTRUMENT_FILTERS = [
  {
    name: 'Todos os instrumentos suportados',
    extensions: ['sf2', 'sf3', 'syx', 'wav', 'wave', 'aiff', 'aif', 'flac', 'ogg', 'mp3', 'npno', 'nki', 'sfz'],
  },
  { name: 'SoundFont (.sf2, .sf3)', extensions: ['sf2', 'sf3'] },
  { name: 'Banco DX7 (.syx)', extensions: ['syx'] },
  { name: 'Amostra de áudio (.wav, .aiff, .flac, .ogg, .mp3)', extensions: ['wav', 'wave', 'aiff', 'aif', 'flac', 'ogg', 'mp3'] },
  { name: 'Nord Piano Library (.npno)', extensions: ['npno'] },
  { name: 'Kontakt 1-4 (.nki, sem criptografia)', extensions: ['nki'] },
  { name: 'SFZ (.sfz) — inclui exportações do Kontakt 5-8', extensions: ['sfz'] },
  { name: 'Todos os arquivos', extensions: ['*'] },
];

// ---------- Objeto window.api, shape idêntico ao MrqApi (electron/preload.ts) ----------
const api: MrqApi = {
  window: {
    minimize: () => {
      void getCurrentWindow().minimize();
    },
    maximize: () => {
      void getCurrentWindow().toggleMaximize();
    },
    close: () => {
      void getCurrentWindow().close();
    },
  },
  store: {
    getLibrary: async (): Promise<Library> => {
      const store = await getStore();
      const library = await store.get<Library>('library');
      return library ?? { songs: [], scenes: [] };
    },
    saveLibrary: async (library: Library): Promise<boolean> => {
      const store = await getStore();
      await store.set('library', library);
      await store.save();
      return true;
    },
    getSettings: async (): Promise<AppSettings> => {
      const store = await getStore();
      const stored = (await store.get<AppSettings>('settings')) ?? undefined;
      return mergeSettingsWithDefaults(stored);
    },
    saveSettings: async (settings: AppSettings): Promise<boolean> => {
      const store = await getStore();
      await store.set('settings', settings);
      await store.save();
      await applyRemoteConfigFromSettings(settings);
      return true;
    },
  },
  fs: {
    chooseSongFolder: async (): Promise<string | null> => {
      const result = await openDialog({ directory: true, title: 'Escolha a pasta da música (multitracks)' });
      if (!result) return null;
      return Array.isArray(result) ? result[0] ?? null : result;
    },
    scanFolderTracks: (folderPath: string) =>
      invoke<{ name: string; filePath: string }[]>('scan_folder_tracks', { folderPath }),
    toFileUrl: async (filePath: string): Promise<string> => 'mrqfile://local-file/' + encodeURIComponent(filePath),
    openExternal: (url: string) => openUrl(url),
    chooseInstrumentFile: async (): Promise<string | null> => {
      const result = await openDialog({
        multiple: false,
        title: 'Escolha o arquivo do instrumento',
        filters: INSTRUMENT_FILTERS,
      });
      if (!result) return null;
      return Array.isArray(result) ? result[0] ?? null : result;
    },
  },
  net: {
    localAddresses: () => invoke<string[]>('local_addresses'),
  },
  log: {
    append: (line: string) => invoke<boolean>('log_append', { line }),
    getPath: () => invoke<string>('log_get_path'),
    reveal: async (): Promise<string> => {
      await invoke('log_read_tail', { maxChars: 1 }); // força o flush da fila antes de abrir a pasta
      const path = await invoke<string>('log_get_path');
      await revealItemInDir(path);
      return path;
    },
    readTail: (maxChars?: number) => invoke<string>('log_read_tail', { maxChars }),
    clear: () => invoke<boolean>('log_clear'),
  },
  app: {
    getVersion: () => getVersion(),
    reportPlaybackState: (isPlaying: boolean) => {
      playbackActive = isPlaying;
    },
  },
  update: {
    // TODO(tauri-migration): integrar tauri-plugin-updater (GitHub Releases) —
    // fase seguinte da migração. Por enquanto reporta "sem atualização" para
    // não travar nem mentir sobre um download que não está realmente ocorrendo.
    check: async (): Promise<UpdateStatusPayload> => ({ status: 'not-available' }),
    install: async (): Promise<boolean> => false,
    onStatus: (_cb: (payload: UpdateStatusPayload) => void) => {
      return () => {
        /* noop até o auto-updater do Tauri ser integrado */
      };
    },
  },
  remote: {
    getInfo: async () => {
      const store = await getStore();
      const stored = (await store.get<AppSettings>('settings')) ?? undefined;
      const settings = mergeSettingsWithDefaults(stored);
      return { port: settings.remote.port, pin: settings.remote.pin, enabled: settings.remote.enabled };
    },
    sendState: (snapshot: RemoteStateSnapshot) => {
      void invoke('remote_broadcast_state', { snapshot });
    },
    onCommand: (cb: (cmd: RemoteCommand) => void) => {
      let unlisten: (() => void) | null = null;
      let cancelled = false;
      listen<RemoteCommand>('remote:command', (event) => cb(event.payload)).then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      });
      return () => {
        cancelled = true;
        unlisten?.();
      };
    },
  },
};

window.api = api;
