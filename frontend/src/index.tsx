import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { UserProvider } from './UserContext';
import { ThemeProvider } from './ThemeContext';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';
import { resolveApiBaseUrl } from './chat/utils';
import { restorePWALocationPreRender } from './pwaLocation';
import { initPWAUpdater } from './pwaUpdater';

// Restore PWA location before mounting BrowserRouter so initial route renders immediately
restorePWALocationPreRender();

// Eagerly check for SW updates and auto-recover if stale chunks fail after a deploy
initPWAUpdater();

if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual';
}

if (typeof window !== 'undefined') {
  try {
    const apiBase = resolveApiBaseUrl();
    if (apiBase && !apiBase.includes(window.location.host)) {
      const origin = new URL(apiBase).origin;
      const pathname = window.location.pathname;
      const isStaticLanding = pathname === '/' || pathname === '/index.html' || pathname === '/about-developer';

      if (!isStaticLanding) {
        const preconnect = document.createElement('link');
        preconnect.rel = 'preconnect';
        preconnect.href = origin;
        preconnect.crossOrigin = 'anonymous';
        document.head.appendChild(preconnect);
      }

      const dnsPrefetch = document.createElement('link');
      dnsPrefetch.rel = 'dns-prefetch';
      dnsPrefetch.href = origin;
      document.head.appendChild(dnsPrefetch);
    }
  } catch (_) {}
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <UserProvider>
          <App />
        </UserProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();