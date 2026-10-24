import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import './styles/theme.css';
import { useStore } from './state/useStore';
import { engine } from './audio/engineInstance';

// Ganchos de depuração, úteis para suporte/diagnóstico (ex: via DevTools).
// Não afetam o funcionamento normal do app.
import { rackEngine } from './audio/rack/RackEngine';
(window as any).__mrqDebug = { useStore, engine, rackEngine };

async function bootstrap() {
  // Sob Electron, window.api já foi montado pelo preload.js antes deste script
  // sequer carregar. Sob Tauri não existe um estágio de preload separado —
  // então, quando detectamos que estamos num webview do Tauri (global injetado
  // só nesse ambiente), montamos a mesma API (ver tauriBridge.ts) ANTES de
  // renderizar qualquer componente que dependa de window.api.
  if (!window.api && '__TAURI_INTERNALS__' in window) {
    const bridge = await import('./tauriBridge');
    // Espera a migração de dados do Electron (se houver) e a configuração
    // inicial do servidor remoto terminarem ANTES de montar qualquer
    // componente — ver o comentário em tauriBridge.ts sobre a corrida que
    // isso evita (ex.: TitleBar mostrando a porta/PIN errados por um instante).
    // Em try/catch pra NUNCA travar a tela em branco pra sempre: se a
    // migração falhar por algum motivo inesperado, o app ainda deve abrir
    // (com as configurações padrão) em vez de ficar preso aqui.
    try {
      await bridge.ready;
    } catch (err) {
      console.error('[bootstrap] falha ao aguardar tauriBridge.ready, prosseguindo mesmo assim', err);
    }
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

void bootstrap();
