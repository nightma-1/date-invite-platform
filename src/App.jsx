/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 */

import { BrowserRouter, Routes, Route, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { BuilderProvider } from './app-builder/builderStore.jsx';
import BuilderShell from './app-builder/BuilderShell.jsx';
import InvitationRuntime from './app-recipient/InvitationRuntime.jsx';
import InvitationList from './app-dashboard/InvitationList.jsx';
import AdminPanel from './app-admin/AdminPanel.jsx';
import Landing from './app-marketing/Landing.jsx';

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        {/* Каждый новый черновик получает свой id — иначе второе приглашение
            перезаписало бы localStorage первого */}
        <Route path="/builder" element={<NewDraftRedirect />} />
        <Route path="/builder/:draftId" element={<BuilderRoute />} />
        <Route path="/i/:slug" element={<InvitationRuntime />} />
        <Route path="/dashboard" element={<InvitationList />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}
