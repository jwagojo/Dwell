import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { AppStateProvider } from './state/AppState';
import { seedDemoAccount } from './state/demoAccount';

// Dev server only: make sure the demo account exists. Does nothing in a production build.
void seedDemoAccount(localStorage).catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </BrowserRouter>
  </StrictMode>,
);
