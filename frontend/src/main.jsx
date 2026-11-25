import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './auth.jsx';
import { ToastProvider } from './components/toast.jsx';
import './index.css';

window.addEventListener('vite:preloadError', (event) => {
  const lastReload = Number(sessionStorage.getItem('eventqr:chunk-reload-at'));
  if (Date.now() - lastReload < 30000) return;
  sessionStorage.setItem('eventqr:chunk-reload-at', String(Date.now()));
  event.preventDefault();
  window.location.reload();
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
