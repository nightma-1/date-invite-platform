/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './i18n/index.js';
import { initMiniApp } from './lib/telegramMiniApp.js';

initMiniApp();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
