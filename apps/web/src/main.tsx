import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import '@fontsource-variable/assistant';
import './styles/index.css';
import { App } from './App';
import { registerServiceWorker } from './lib/push';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
