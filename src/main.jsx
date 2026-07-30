import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import { StoreProvider } from './lib/store.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/app.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);

/*
 * Service worker.
 *
 * autoUpdate with an immediate reload is right here: this is a single-user app
 * with no unsaved-form risk, and a stale dataset is worse than a reload. User data
 * lives in localStorage, which a SW update never touches.
 */
registerSW({ immediate: true });
