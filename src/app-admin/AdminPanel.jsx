/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * ВАЖНО про безопасность: проверка is_admin здесь — только для UI.
 * Настоящая защита данных живёт в RLS-политиках Postgres.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';
import { listAllGifs, addGifByUrl, addGifByFile, setGifActive, deleteGif } from '../lib/mediaLibrary.js';

const t = getTemplateTokens('romantic');

const GIF_CATEGORIES = ['romantic', 'flirty', 'funny', 'cute', 'bold', 'custom'];

export default function AdminPanel() {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const [stats, setStats] = useState(null);
  const [invitations, setInvitations] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function load() {
      const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', session.user.id).maybeSingle();
      if (cancelled) return;
      if (!profile?.is_admin) {
        setIsAdmin(false);
        return;
      }
      setIsAdmin(true);

      const [invRes, payRes, respRes] = await Promise.all([
        supabase.from('invitations').select('id, slug, recipient_name, status, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('payments').select('amount, status'),
        supabase.from('responses').select('answered_yes'),
      ]);

      if (cancelled) return;

      const paid = (payRes.data || []).filter((p) => p.status === 'paid');
      setStats({
        invitations: invRes.data?.length ?? 0,
        responses: respRes.data?.length ?? 0,
        yes: (respRes.data || []).filter((r) => r.answered_yes).length,
        revenue: paid.reduce((sum, p) => sum + p.amount, 0),
        paidCount: paid.length,
      });
      setInvitations(invRes.data || []);
    }

    load();
    return () => { cancelled = true; };
  }, [session]);

  const wrap = (children) => (
    <div style={{ background: t.bg, minHeight: '100vh' }}>
      <div className="mx-auto max-w-3xl px-5 py-14">{children}</div>
    </div>
  );

  if (session === undefined) return wrap(<p className="text-sm opacity-60">Загрузка…</p>);
  if (!session) return wrap(<AuthGate onAuthenticated={() => {}} />);

  if (isAdmin === false) {
    return wrap(
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>Нет доступа</h1>
        <p className="text-sm" style={{ color: t.ink, opacity: 0.6, fontFamily: t.fontUI }}>
          Этот раздел только для администраторов. Установи <code>is_admin = true</code> в таблице{' '}
          <code>profiles</code> через Supabase Dashboard.
        </p>
      </div>
    );
  }

  if (isAdmin === null || !stats) return wrap(<p className="text-sm opacity-60">Загрузка…</p>);

  return wrap(
    <>
      <h1 className="mb-8 text-2xl" style={{ fontFamily: t.fontDisplay, color: t.ink, fontWeight: 700 }}>
        Админ-панель
      </h1>

      <div className="mb-10 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Приглашений" value={stats.invitations} />
        <StatCard label="Ответов" value={stats.responses} />
        <StatCard label="Из них «Да»" value={stats.yes} />
        <StatCard label="Выручка" value={`${stats.revenue.toLocaleString('ru-RU')} сум`} sub={`${stats.paidCount} оплат`} />
      </div>

      <h2 className="mb-3 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>Последние приглашения</h2>
      <div className="space-y-2">
        {invitations.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between border-b py-2.5 text-sm" style={{ fontFamily: t.fontUI }}>
            <span style={{ color: t.ink }}>{inv.recipient_name}</span>
            <span style={{ color: t.ink, opacity: 0.5 }}>/i/{inv.slug} · {inv.status}</span>
          </div>
        ))}
      </div>
      {invitations.length === 0 && <p className="text-sm opacity-60">Пока пусто.</p>}

      <div className="mt-12">
        <GifLibrarySection />
      </div>
    </>
  );
}

function GifLibrarySection() {
  const [gifs, setGifs] = useState(null);
  const [error, setError] = useState(null);
  const [urlForm, setUrlForm] = useState({ url: '', title: '', category: 'romantic' });
  const [fileForm, setFileForm] = useState({ title: '', category: 'romantic' });
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  function reload() {
    listAllGifs().then(setGifs).catch(() => setError('Не получилось загрузить библиотеку гифок.'));
  }

  useEffect(reload, []);

  async function handleAddByUrl(e) {
    e.preventDefault();
    if (!urlForm.url.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await addGifByUrl(urlForm);
      setUrlForm({ url: '', title: '', category: urlForm.category });
      reload();
    } catch (err) {
      setError(err.message || 'Не получилось добавить гифку.');
    } finally {
      setSaving(false);
    }
  }

  async function handleAddByFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      await addGifByFile({ file, title: fileForm.title, category: fileForm.category });
      setFileForm({ title: '', category: fileForm.category });
      if (fileInputRef.current) fileInputRef.current.value = '';
      reload();
    } catch (err) {
      setError(err.message || 'Не получилось загрузить файл.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(gif) {
    setGifs((prev) => prev.map((g) => (g.id === gif.id ? { ...g, active: !g.active } : g)));
    try {
      await setGifActive(gif.id, !gif.active);
    } catch {
      reload();
    }
  }

  async function handleDelete(gif) {
    if (!confirm(`Удалить гифку «${gif.title || gif.url}»?`)) return;
    setGifs((prev) => prev.filter((g) => g.id !== gif.id));
    try {
      await deleteGif(gif.id);
    } catch {
      reload();
    }
  }

  const inp = {
    padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${t.ink}25`,
    fontFamily: t.fontUI, fontSize: 13, color: t.ink, background: t.card,
  };

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>Библиотека гифок</h2>
      <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
        Гифки отсюда видны всем в конструкторе на шаге «Вопрос».
      </p>

      {error && <p style={{ color: '#C0392B', fontSize: 12, marginBottom: 10 }}>{error}</p>}

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <form onSubmit={handleAddByUrl} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: `${t.ink}20` }}>
          <p className="text-xs font-semibold" style={{ color: t.ink }}>Добавить по ссылке</p>
          <input type="url" required placeholder="https://media.giphy.com/…" value={urlForm.url}
                 onChange={(e) => setUrlForm((f) => ({ ...f, url: e.target.value }))} style={inp} />
          <input type="text" placeholder="Название (необязательно)" value={urlForm.title}
                 onChange={(e) => setUrlForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
          <select value={urlForm.category} onChange={(e) => setUrlForm((f) => ({ ...f, category: e.target.value }))} style={inp}>
            {GIF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="submit" disabled={saving}
                  style={{ ...inp, background: t.berry, color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Добавляем…' : '+ Добавить'}
          </button>
        </form>

        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: `${t.ink}20` }}>
          <p className="text-xs font-semibold" style={{ color: t.ink }}>Загрузить свой файл</p>
          <input type="text" placeholder="Название (необязательно)" value={fileForm.title}
                 onChange={(e) => setFileForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
          <select value={fileForm.category} onChange={(e) => setFileForm((f) => ({ ...f, category: e.target.value }))} style={inp}>
            {GIF_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input ref={fileInputRef} type="file" accept="image/gif,image/webp,image/png,image/jpeg"
                 onChange={handleAddByFile} disabled={saving} style={{ fontSize: 12 }} />
          <p className="text-[11px]" style={{ color: t.ink, opacity: 0.5 }}>GIF, WebP, PNG или JPG — до 8 МБ.</p>
        </div>
      </div>

      {gifs === null && <p className="text-sm opacity-60">Загрузка…</p>}
      {gifs?.length === 0 && <p className="text-sm opacity-60">В библиотеке пока нет гифок.</p>}

      {gifs && gifs.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {gifs.map((gif) => (
            <div key={gif.id} className="overflow-hidden rounded-lg border" style={{ borderColor: `${t.ink}20`, opacity: gif.active ? 1 : 0.4 }}>
              <img src={gif.url} alt={gif.title || 'gif'} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <button type="button" onClick={() => toggleActive(gif)}
                        title={gif.active ? 'Скрыть' : 'Показать'}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                  {gif.active ? '👁️' : '🚫'}
                </button>
                <span className="truncate text-[10px]" style={{ color: t.ink, opacity: 0.5 }}>{gif.category}</span>
                <button type="button" onClick={() => handleDelete(gif)} title="Удалить"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#C0392B' }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, sub }) {
  return (
    <TicketCard tokens={t}>
      <div className="p-4">
        <p className="text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>{label}</p>
        <p className="text-xl" style={{ color: t.ink, fontFamily: t.fontDisplay, fontWeight: 700 }}>{value}</p>
        {sub && <p className="text-xs" style={{ color: t.ink, opacity: 0.4, fontFamily: t.fontUI }}>{sub}</p>}
      </div>
    </TicketCard>
  );
}
