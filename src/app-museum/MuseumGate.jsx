/**
 * © 2026 Senti. Все права защищены.
 *
 * Пока музей не запущен (MUSEUM_PUBLIC = false), его страницы видит только
 * владелец сервиса. Остальных отправляем на главную, как будто страницы нет.
 * Ссылка получателя /i/:slug не закрыта: по ней заходят на проверку.
 */

import { Navigate } from 'react-router-dom';
import { MUSEUM_PUBLIC } from '../lib/museumPlans.js';
import { useIsAdmin } from '../lib/useIsAdmin.js';

export default function MuseumGate({ children }) {
  const isAdmin = useIsAdmin();
  // На локальном сервере разработки вход не нужен; в сборку сайта это не попадает
  if (MUSEUM_PUBLIC || import.meta.env.DEV) return children;
  if (isAdmin === null) return <div style={{ minHeight: '100dvh', background: '#fff' }} />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return children;
}
