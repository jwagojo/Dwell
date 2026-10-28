import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { loadBackendConfig } from './lib/backendConfig';
import { AppStateProvider } from './state/AppState';
import { DwellBackend } from './state/backend';
import { seedDemoAccount } from './state/demoAccount';

/**
 * With a valid /config.json the app runs against the Dwell backend (Cognito + API). Without one it runs the
 * localStorage prototype, and the dev server seeds the demo account.
 */
async function start() {
  const config = await loadBackendConfig();
  let backend: DwellBackend | null = null;
  if (config) {
    let storage: Storage | null = null;
    try {
      storage = sessionStorage;
    } catch {
      // blocked storage: the session lives in memory only
    }
    backend = new DwellBackend(config, storage);
  } else {
    // Dev server only: make sure the demo account exists. Does nothing in a production build.
    void seedDemoAccount(localStorage).catch(() => {});
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <AppStateProvider backend={backend}>
          <App />
        </AppStateProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}

void start();
