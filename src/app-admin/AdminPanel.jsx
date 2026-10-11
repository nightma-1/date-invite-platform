/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * ВАЖНО про безопасность: проверка is_admin здесь — только для UI.
 * Настоящая защита данных живёт в RLS-политиках Postgres.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient.js';
import AuthGate from '../app-builder/AuthGate.jsx';
import NotFound from '../components/ui/NotFound.jsx';
import TicketCard from '../components/ui/TicketCard.jsx';
import { getTemplateTokens } from '../templates/registry.js';
import { listAllGifs, addGifByUrl, addGifByFile, setGifActive, deleteGif, setGifDefaultForStep, setGifCategory, normalizeCategory } from '../lib/mediaLibrary.js';
import { T, DecorativeBlobs } from '../app-builder/BuilderUI.jsx';
import SmartMedia from '../components/ui/SmartMedia.jsx';

const t = getTemplateTokens('romantic');

// Базовые категории: у них в конструкторе есть красивые подписи с эмодзи
// (i18n builderUI.gifCategories). Свои категории можно заводить прямо в
// админке — они появляются в списке, как только в них попадает первая гифка,
// и в конструкторе показываются своим названием как есть.
const GIF_CATEGORIES = ['romantic', 'flirty', 'funny', 'cute', 'bold', 'custom'];
const NEW_CATEGORY_OPTION = '__new__';

/** Селект категории с пунктом «новая»: по нему спрашиваем название. */
function CategorySelect({ value, categories, onChange, style, disabled, title }) {
  const options = categories.includes(value) ? categories : [value, ...categories];
  return (
    <select
      value={value}
      disabled={disabled}
      title={title}
      style={style}
      onChange={(e) => {
        if (e.target.value !== NEW_CATEGORY_OPTION) {
          onChange(e.target.value);
          return;
        }
        const name = normalizeCategory(window.prompt('Название новой категории:', ''));
        if (name) onChange(name);
      }}
    >
      {options.map((c) => <option key={c} value={c}>{c}</option>)}
      <option value={NEW_CATEGORY_OPTION}>+ новая категория…</option>
    </select>
  );
}

// Шаги, для которых можно назначить гифку по умолчанию — показываются
// значком под каждой гифкой в библиотеке.
const DEFAULT_STEP_BADGES = [
  { stepType: 'question', column: 'default_for_question', icon: '❓', label: 'Вопрос' },
  { stepType: 'reaction', column: 'default_for_reaction', icon: '🎉', label: 'Реакция' },
  { stepType: 'date', column: 'default_for_date', icon: '🗓️', label: 'Дата' },
  { stepType: 'final', column: 'default_for_final', icon: '💌', label: 'Финал' },
];

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
    <div style={{
      background: `linear-gradient(180deg, #ffffff 0%, ${T.pinkLight} 55%, #ffeef5 100%)`,
      backgroundAttachment: 'fixed',
      backgroundSize: '100% 100vh',
      backgroundRepeat: 'no-repeat',
      minHeight: '100vh',
      position: 'relative',
    }}>
      <DecorativeBlobs />
      <div className="mx-auto max-w-3xl px-5 py-14" style={{ position: 'relative', zIndex: 1 }}>{children}</div>
    </div>
  );

  if (session === undefined) return wrap(<p className="text-sm opacity-60">Загрузка…</p>);
  if (!session) return wrap(<AuthGate onAuthenticated={() => {}} />);

  if (isAdmin === false) return <NotFound />;

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
  const [progress, setProgress] = useState(null);
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

  // Админка умеет принимать сразу пачку файлов. Грузим по очереди, а не
  // Promise.all: так видно прогресс, и одна битая гифка не роняет остальные.
  async function handleAddByFile(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setSaving(true);
    setError(null);
    setProgress({ done: 0, total: files.length });

    const failures = [];
    for (const [index, file] of files.entries()) {
      try {
        await addGifByFile({
          file,
          // При пачке общее название не имеет смысла — берём имя файла,
          // чтобы гифки потом можно было различить.
          title: files.length === 1 ? fileForm.title : file.name.replace(/\.[^.]+$/, ''),
          category: fileForm.category,
        });
      } catch (err) {
        failures.push(`${file.name}: ${err.message || 'ошибка загрузки'}`);
      }
      setProgress({ done: index + 1, total: files.length });
    }

    if (failures.length > 0) {
      const head = `Не загрузилось файлов: ${failures.length} из ${files.length}.`;
      setError([head, ...failures].join('\n'));
    }
    if (failures.length < files.length) {
      setFileForm((f) => ({ ...f, title: '' }));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    setProgress(null);
    setSaving(false);
    reload();
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

  async function changeCategory(gif, category) {
    const clean = normalizeCategory(category);
    if (!clean || clean === gif.category) return;
    setGifs((prev) => prev.map((g) => (g.id === gif.id ? { ...g, category: clean } : g)));
    try {
      await setGifCategory(gif.id, clean);
    } catch (err) {
      setError(err.message || 'Не получилось сменить категорию.');
      reload();
    }
  }

  async function toggleDefault(gif, badge) {
    const nextValue = !gif[badge.column];
    // Оптимистично обновляем локально: снимаем этот флаг со всех гифок и ставим (или снимаем) на выбранной
    setGifs((prev) => prev.map((g) => {
      if (g.id === gif.id) return { ...g, [badge.column]: nextValue };
      if (nextValue && g[badge.column]) return { ...g, [badge.column]: false };
      return g;
    }));
    try {
      await setGifDefaultForStep(gif.id, badge.stepType, nextValue);
    } catch (err) {
      setError(err.message || 'Не получилось изменить гифку по умолчанию.');
      reload();
    }
  }

  const inp = {
    padding: '8px 10px', borderRadius: 6, border: `1.5px solid ${t.ink}25`,
    fontFamily: t.fontUI, fontSize: 13, color: t.ink, background: t.card,
  };

  // Базовые категории + все, что уже заведены в библиотеке.
  const allCategories = Array.from(
    new Set([...GIF_CATEGORIES, ...(gifs || []).map((g) => g.category).filter(Boolean)]),
  ).sort();

  // Раскладываем гифки по категориям — так видно, где пусто, а где свалка.
  const grouped = allCategories
    .map((category) => ({ category, items: (gifs || []).filter((g) => g.category === category) }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <h2 className="mb-1 text-base font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>Библиотека гифок</h2>
      <p className="mb-4 text-xs" style={{ color: t.ink, opacity: 0.55, fontFamily: t.fontUI }}>
        Гифки отсюда видны всем в конструкторе. Значки под гифкой — ❓ Вопрос, 🎉 Реакция, 🗓️ Дата, 💌 Финал —
        назначают её гифкой по умолчанию для нового приглашения и для демо на главной странице
        (на каждый шаг — только одна дефолтная гифка).
      </p>

      {error && <p style={{ color: '#C0392B', fontSize: 12, marginBottom: 10, whiteSpace: 'pre-line' }}>{error}</p>}

      <div className="mb-6 grid gap-3 md:grid-cols-2">
        <form onSubmit={handleAddByUrl} className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: `${t.ink}20` }}>
          <p className="text-xs font-semibold" style={{ color: t.ink }}>Добавить по ссылке</p>
          <input type="url" required placeholder="https://media.giphy.com/…" value={urlForm.url}
                 onChange={(e) => setUrlForm((f) => ({ ...f, url: e.target.value }))} style={inp} />
          <input type="text" placeholder="Название (необязательно)" value={urlForm.title}
                 onChange={(e) => setUrlForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
          <CategorySelect value={urlForm.category} categories={allCategories} style={inp}
                          onChange={(c) => setUrlForm((f) => ({ ...f, category: c }))} />
          <button type="submit" disabled={saving}
                  style={{ ...inp, background: t.berry, color: '#fff', border: 'none', fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Добавляем…' : '+ Добавить'}
          </button>
        </form>

        <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: `${t.ink}20` }}>
          <p className="text-xs font-semibold" style={{ color: t.ink }}>Загрузить свой файл</p>
          <input type="text" placeholder="Название (необязательно)" value={fileForm.title}
                 onChange={(e) => setFileForm((f) => ({ ...f, title: e.target.value }))} style={inp} />
          <CategorySelect value={fileForm.category} categories={allCategories} style={inp} disabled={saving}
                          onChange={(c) => setFileForm((f) => ({ ...f, category: c }))} />
          <input ref={fileInputRef} type="file" multiple
                 accept="image/gif,image/webp,image/png,image/jpeg,video/webm,video/mp4,.tgs,application/x-tgsticker,application/gzip"
                 onChange={handleAddByFile} disabled={saving} style={{ fontSize: 12 }} />
          <p className="text-[11px]" style={{ color: t.ink, opacity: 0.5 }}>
            GIF, WebP, PNG, JPG, WebM, MP4 или TGS — до 20 МБ. Можно выбрать сразу несколько файлов:
            тогда названием станет имя файла, а категория применится ко всем.
          </p>
          {progress && (
            <p className="text-[11px]" style={{ color: t.berry, fontWeight: 600 }}>
              Загружаем… {progress.done} из {progress.total}
            </p>
          )}
        </div>
      </div>

      {gifs === null && <p className="text-sm opacity-60">Загрузка…</p>}
      {gifs?.length === 0 && <p className="text-sm opacity-60">В библиотеке пока нет гифок.</p>}

      {grouped.map((group) => (
        <div key={group.category} className="mb-6">
          <p className="mb-2 text-xs font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
            {group.category}
            <span style={{ opacity: 0.45, fontWeight: 400 }}> · {group.items.length}</span>
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {group.items.map((gif) => (
            <div key={gif.id} className="overflow-hidden rounded-lg border" style={{ borderColor: `${t.ink}20`, opacity: gif.active ? 1 : 0.4 }}>
              <SmartMedia src={gif.url} alt={gif.title || 'gif'} objectFit="cover" objectPosition="top" style={{ width: '100%', aspectRatio: '1', display: 'block' }} />
              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <button type="button" onClick={() => toggleActive(gif)}
                        title={gif.active ? 'Скрыть' : 'Показать'}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                  {gif.active ? '👁️' : '🚫'}
                </button>
                <CategorySelect
                  value={gif.category}
                  categories={allCategories}
                  onChange={(c) => changeCategory(gif, c)}
                  title="Перенести в другую категорию"
                  style={{
                    flex: 1, minWidth: 0, fontSize: 10, color: t.ink, background: 'transparent',
                    border: 'none', cursor: 'pointer', fontFamily: t.fontUI, opacity: 0.7,
                  }}
                />
                <button type="button" onClick={() => handleDelete(gif)} title="Удалить"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, color: '#C0392B' }}>
                  ✕
                </button>
              </div>
              <div className="flex items-center justify-center gap-1 border-t px-1 py-1" style={{ borderColor: `${t.ink}15` }}>
                {DEFAULT_STEP_BADGES.map((badge) => {
                  const active = Boolean(gif[badge.column]);
                  return (
                    <button
                      key={badge.stepType}
                      type="button"
                      onClick={() => toggleDefault(gif, badge)}
                      title={active ? `Убрать дефолт для шага «${badge.label}»` : `Сделать дефолтной для шага «${badge.label}»`}
                      style={{
                        border: 'none', cursor: 'pointer', fontSize: 11, lineHeight: 1,
                        borderRadius: 4, padding: '2px 4px',
                        background: active ? t.berry : 'transparent',
                        opacity: active ? 1 : 0.35,
                        filter: active ? 'none' : 'grayscale(1)',
                      }}
                    >
                      {badge.icon}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          </div>
        </div>
      ))}
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
