/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import './i18n/index.js';

// Agentation — тулбар для визуальных заметок агенту (только в dev-режиме).
// В production-сборку не попадает: import.meta.env.DEV === false,
// и Vite вырезает ленивый импорт целиком.
const Agentation = import.meta.env.DEV
  ? React.lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
    {Agentation && (
      <React.Suspense fallback={null}>
        <Agentation
          endpoint={import.meta.env.VITE_AGENTATION_ENDPOINT || 'http://localhost:4747'}
        />
      </React.Suspense>
    )}
  </React.StrictMode>
);
