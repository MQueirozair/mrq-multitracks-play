import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/theme.css';
import { useStore } from './state/useStore';
import { engine } from './audio/engineInstance';

// Ganchos de depuração, úteis para suporte/diagnóstico (ex: via DevTools).
// Não afetam o funcionamento normal do app.
(window as any).__mrqDebug = { useStore, engine };

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
