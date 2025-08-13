import React from 'react';
import ReactDOM from 'react-dom/client';  // Para React 18
import App from './App.jsx';  // Ou ./App.js
import './index.css';  // Se tiver

// Polyfill para Chrome APIs
import browser from 'webextension-polyfill';
window.browser = browser;  // Torna global

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);