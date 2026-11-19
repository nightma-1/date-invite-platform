/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Библиотека гифок для конструктора. Перенесена из старой одностраничной
 * админки; добавлены поиск, фильтры (статус, категория) и сортировка.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  listAllGifs, addGifByUrl, addGifByFile, setGifActive, deleteGif, setGifDefaultForStep,
  setGifCategory, normalizeCategory, listGifCategories, createGifCategory,
  updateGifCategoryLabels, deleteGifCategory, slugFromLabel, CATEGORY_LANGS,
} from '../lib/mediaLibrary.js';
import SmartMedia from '../components/ui/SmartMedia.jsx';
import { A, Card, Segmented, inputStyle } from './adminUi.jsx';

const t = A;

const NEW_CATEGORY_OPTION = '__new__';

/** Селект категории. Значение — slug, в списке показываем русскую подпись.
 *  Пункт «новая» отдаёт управление наружу: там спросим подписи на 3 языках. */
function CategorySelect({ value, categories, onChange, onCreate, style, disabled, title }) {
  const known = categories.some((c) => c.slug === value);
  return (
    <select
      value={value}
      disabled={disabled}
      title={title}
      style={style}
      onChange={async (e) => {
        if (e.target.value !== NEW_CATEGORY_OPTION) {
          onChange(e.target.value);
          return;
        }
        const slug = await onCreate();
        if (slug) onChange(slug);
      }}
    >
      {!known && <option value={value}>{value}</option>}
      {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label_ru}</option>)}
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

export default function GifLibrary() {
  const [gifs, setGifs] = useState(null);
  const [error, setError] = useState(null);
  const [urlForm, setUrlForm] = useState({ url: '', title: '', category: 'romantic' });
  const [fileForm, setFileForm] = useState({ title: '', category: 'romantic' });
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(null);
  const [categories, setCategories] = useState([]);
  const fileInputRef = useRef(null);
  // Панель над сеткой: поиск, фильтры и порядок
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState('all'); // all | active | hidden
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [order, setOrder] = useState('grouped'); // grouped | title | defaults | hidden

  function reload() {
    listAllGifs().then(setGifs).catch(() => setError('Не получилось загрузить библиотеку гифок.'));
  }

  function reloadCategories() {
    return listGifCategories()
      .then(setCategories)
      .catch(() => setError('Не получилось загрузить категории.'));
  }

  useEffect(() => {
    reload();
    reloadCategories();
  }, []);

  /** Спрашиваем подписи на трёх языках и заводим категорию. */
  async function promptNewCategory() {
    const labels = {};
    for (const lang of CATEGORY_LANGS) {
      const value = window.prompt(`Название категории — ${lang.name}:`, labels.ru || '');
      if (value === null) return null;
      if (!value.trim()) {
        setError('Название категории не может быть пустым.');
        return null;
      }
      labels[lang.code] = value.trim();
    }
    try {
      const created = await createGifCategory({ slug: slugFromLabel(labels.ru), labels });
      await reloadCategories();
      return created.slug;
    } catch (err) {
      setError(err.message || 'Не получилось создать категорию.');
      return null;
    }
  }

  /** Переименование меняет только подписи — гифки привязаны к slug и остаются. */
  async function renameCategory(category) {
    const labels = {};
    for (const lang of CATEGORY_LANGS) {
      const value = window.prompt(`Название категории — ${lang.name}:`, category[lang.column]);
      if (value === null) return;
      labels[lang.code] = value;
    }
    try {
      await updateGifCategoryLabels(category.slug, labels);
      await reloadCategories();
    } catch (err) {
      setError(err.message || 'Не получилось переименовать категорию.');
    }
  }

  async function removeCategory(category, count) {
    const fallback = categories.find((c) => c.slug !== category.slug);
    if (!fallback) {
      setError('Это последняя категория — удалять нечего, иначе гифкам будет негде лежать.');
      return;
    }
    const moveTo = count > 0
      ? window.prompt(
        `В категории «${category.label_ru}» ${count} гифок. Они не удаляются, а переедут.\n` +
        `Куда перенести? Доступные: ${categories.filter((c) => c.slug !== category.slug).map((c) => c.slug).join(', ')}`,
        fallback.slug,
      )
      : fallback.slug;
    if (moveTo === null) return;
    if (!categories.some((c) => c.slug === moveTo) || moveTo === category.slug) {
      setError(`Нет такой категории: «${moveTo}».`);
      return;
    }
    if (!window.confirm(`Удалить категорию «${category.label_ru}»?`)) return;
    try {
      await deleteGifCategory(category.slug, moveTo);
      await Promise.all([reloadCategories(), reload()]);
      setUrlForm((f) => (f.category === category.slug ? { ...f, category: moveTo } : f));
      setFileForm((f) => (f.category === category.slug ? { ...f, category: moveTo } : f));
    } catch (err) {
      setError(err.message || 'Не получилось удалить категорию.');
    }
  }

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

  const isDefault = (g) => DEFAULT_STEP_BADGES.some((b) => g[b.column]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (gifs || []).filter((g) => {
      if (visibility === 'active' && !g.active) return false;
      if (visibility === 'hidden' && g.active) return false;
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      if (q && !String(g.title || g.url || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [gifs, search, visibility, categoryFilter]);

  // Плоский список, если выбран порядок не «по категориям».
  const flat = useMemo(() => {
    if (order === 'grouped') return null;
    const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru');
    const copy = [...visible];
    if (order === 'title') copy.sort(byTitle);
    if (order === 'defaults') copy.sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)) || byTitle(a, b));
    if (order === 'hidden') copy.sort((a, b) => Number(a.active) - Number(b.active) || byTitle(a, b));
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, order]);

  const filtersOn = search.trim() || visibility !== 'all' || categoryFilter !== 'all';

  // Показываем все категории из таблицы, даже пустые — иначе в пустую нечем
  // было бы переносить гифки и её не было бы видно. Под фильтром пустые
  // группы прячем, чтобы не мешали.
  const grouped = categories
    .filter((category) => categoryFilter === 'all' || category.slug === categoryFilter)
    .map((category) => ({
      category,
      items: visible.filter((g) => g.category === category.slug),
    }))
    .filter((group) => !filtersOn || group.items.length > 0);


  function renderGif(gif) {
    return (
            <div key={gif.id} className="overflow-hidden rounded-lg border" style={{ borderColor: A.line, background: A.surface, opacity: gif.active ? 1 : 0.4 }}>
              <SmartMedia src={gif.url} alt={gif.title || 'gif'} objectFit="cover" objectPosition="top" style={{ width: '100%', aspectRatio: '1', display: 'block' }} />
              <div className="flex items-center justify-between gap-1 px-1.5 py-1">
                <button type="button" onClick={() => toggleActive(gif)}
                        title={gif.active ? 'Скрыть' : 'Показать'}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 13 }}>
                  {gif.active ? '👁️' : '🚫'}
                </button>
                <CategorySelect
                  value={gif.category}
                  categories={categories}
                  onCreate={promptNewCategory}
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
    );
  }

  const counts = {
    all: (gifs || []).length,
    active: (gifs || []).filter((g) => g.active).length,
    hidden: (gifs || []).filter((g) => !g.active).length,
  };

  return (
    <div>
      <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: t.ink, fontFamily: t.fontUI }}>Библиотека гифок</h2>
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
          <CategorySelect value={urlForm.category} categories={categories} style={inp}
                          onCreate={promptNewCategory}
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
          <CategorySelect value={fileForm.category} categories={categories} style={inp} disabled={saving}
                          onCreate={promptNewCategory}
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

      {/* Поиск, фильтры и порядок */}
      <Card pad={12} style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию"
            style={{ ...inputStyle, flex: '1 1 180px' }}
          />
          <Segmented
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'all', label: 'Все', count: counts.all },
              { value: 'active', label: 'Видимые', count: counts.active },
              { value: 'hidden', label: 'Скрытые', count: counts.hidden },
            ]}
          />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={inputStyle} aria-label="Категория">
            <option value="all">Все категории</option>
            {categories.map((c) => <option key={c.slug} value={c.slug}>{c.label_ru}</option>)}
          </select>
          <select value={order} onChange={(e) => setOrder(e.target.value)} style={inputStyle} aria-label="Порядок">
            <option value="grouped">По категориям</option>
            <option value="title">По названию</option>
            <option value="defaults">Сначала по умолчанию</option>
            <option value="hidden">Сначала скрытые</option>
          </select>
        </div>
        {filtersOn && (
          <p style={{ margin: '8px 0 0', fontSize: 12, color: A.muted }}>
            Найдено: {visible.length}
            {' · '}
            <button
              type="button"
              onClick={() => { setSearch(''); setVisibility('all'); setCategoryFilter('all'); }}
              style={{ background: 'none', border: 'none', padding: 0, color: A.berry, fontWeight: 700, cursor: 'pointer', fontSize: 12 }}
            >
              сбросить фильтры
            </button>
          </p>
        )}
      </Card>

      {gifs === null && <p className="text-sm opacity-60">Загрузка…</p>}
      {gifs?.length === 0 && <p className="text-sm opacity-60">В библиотеке пока нет гифок.</p>}
      {gifs?.length > 0 && visible.length === 0 && <p className="text-sm opacity-60">Под фильтр ничего не попало.</p>}

      {flat && flat.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {flat.map(renderGif)}
        </div>
      )}

      {!flat && grouped.map((group) => (
        <div key={group.category.slug} className="mb-6">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold" style={{ color: t.ink, fontFamily: t.fontUI }}>
              {group.category.label_ru}
              <span style={{ opacity: 0.45, fontWeight: 400 }}> · {group.items.length}</span>
            </p>
            <button type="button" onClick={() => renameCategory(group.category)}
                    title="Переименовать на всех трёх языках"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }}>
              ✏️
            </button>
            <button type="button" onClick={() => removeCategory(group.category, group.items.length)}
                    title="Удалить категорию"
                    style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 11 }}>
              🗑
            </button>
          </div>
          {group.items.length === 0 && (
            <p className="mb-2 text-xs" style={{ color: t.ink, opacity: 0.4 }}>Пусто — в конструкторе эта категория не показывается.</p>
          )}
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {group.items.map(renderGif)}
          </div>
        </div>
      ))}
    </div>
  );
}

