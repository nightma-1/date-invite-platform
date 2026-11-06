/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { trackPageView } from './lib/analytics.js';
import { BuilderProvider } from './app-builder/builderStore.jsx';
import BuilderShell from './app-builder/BuilderShell.jsx';
import InvitationRuntime from './app-recipient/InvitationRuntime.jsx';
import InvitationList from './app-dashboard/InvitationList.jsx';
import ResponseView from './app-dashboard/ResponseView.jsx';
import AdminPanel from './app-admin/AdminPanel.jsx';
import Landing from './app-marketing/Landing.jsx';
import NotFound from './components/ui/NotFound.jsx';
import PaymentStatus from './app-builder/PaymentStatus.jsx';

// «Наш музей» пока скрыт: только прямые адреса /lab, без ссылок на сайте.
const MuseumBuilder = lazy(() => import('./app-museum/MuseumBuilder.jsx'));
const MuseumDemo = lazy(() => import('./app-museum/MuseumDemo.jsx'));

function Lazy({ children }) {
  return <Suspense fallback={<div style={{ minHeight: '100dvh', background: '#2b1320' }} />}>{children}</Suspense>;
}

// Адрес админки нарочно не угадываемый и не в публичных ссылках сайта —
// /admin слишком легко найти перебором ботов. Поменять адрес, если он
// когда-нибудь «утечёт», можно только здесь.
const ADMIN_PATH = '/xujayin';

/**
 * Один счётчик просмотров на всё приложение. Висит внутри роутера, поэтому
 * ловит и первый заход, и любую навигацию по SPA (обычный счётчик страниц
 * здесь бы не сработал: перезагрузки документа при переходах нет).
 */
function PageViewTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

function newDraftId() {
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function NewDraftRedirect() {
  const [searchParams] = useSearchParams();
  const query = searchParams.toString();
  // Хвост ?template=... должен пережить редирект, иначе выбор шаблона в галерее теряется
  return <Navigate to={`/builder/${newDraftId()}${query ? `?${query}` : ''}`} replace />;
}

function BuilderRoute() {
  const { draftId } = useParams();
  const [searchParams] = useSearchParams();
  return (
    <BuilderProvider draftId={draftId} initialTemplateId={searchParams.get('template')}>
      <BuilderShell />
    </BuilderProvider>
  );
}

function EditBuilderRoute() {
  const { invitationId } = useParams();
  return (
    <BuilderProvider draftId={`edit-${invitationId}`} editInvitationId={invitationId}>
      <BuilderShell />
    </BuilderProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <PageViewTracker />
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* Каждый новый черновик получает свой id — иначе второе приглашение
            перезаписало бы localStorage первого */}
        <Route path="/builder" element={<NewDraftRedirect />} />
        <Route path="/builder/edit/:invitationId" element={<EditBuilderRoute />} />
        <Route path="/builder/:draftId" element={<BuilderRoute />} />
        <Route path="/payment/:invitationId" element={<PaymentStatus />} />
        <Route path="/i/:slug" element={<InvitationRuntime />} />
        <Route path="/dashboard" element={<InvitationList />} />
        <Route path="/dashboard/response/:invitationId" element={<ResponseView />} />
        <Route path="/lab/museum" element={<Lazy><MuseumBuilder /></Lazy>} />
        <Route path="/lab/museum/demo" element={<Lazy><MuseumDemo /></Lazy>} />
        <Route path="/lab/museum/edit/:invitationId" element={<Lazy><MuseumBuilder /></Lazy>} />
        <Route path={ADMIN_PATH} element={<AdminPanel />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
