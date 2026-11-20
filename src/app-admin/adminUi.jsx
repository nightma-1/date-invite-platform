/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Дизайн админки. Это рабочий инструмент, а не витрина: светлый нейтральный
 * фон, плотные таблицы, цифры одинаковой ширины (tabular-nums), фирменный
 * ягодный цвет — только для акцентов и активных состояний. Сайт для
 * покупателей остаётся в своём «романтичном» стиле, здесь он не нужен.
 */

import { useEffect, useMemo, useState } from 'react';

// Ключи ink/berry/fontUI/fontDisplay/card совпадают с токенами шаблонов —
// старые разделы переезжают на этот стиль заменой одной строки.
export const A = {
  bg: '#F6F5F3',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  ink: '#1C1917',
  muted: '#78716C',
  line: '#E7E5E4',
  soft: '#F5F5F4',
  berry: '#C23B62',
  berrySoft: '#FBEAF0',
  good: '#15803D',
  goodSoft: '#E8F5EC',
  bad: '#B91C1C',
  badSoft: '#FDECEC',
  warn: '#B45309',
  warnSoft: '#FEF3E2',
  fontUI: '"Manrope", system-ui, -apple-system, sans-serif',
  fontDisplay: '"Manrope", system-ui, -apple-system, sans-serif',
};

export const num = (v) => Number(v || 0).toLocaleString('ru-RU');
export const money = (v) => `${Math.round(Number(v || 0)).toLocaleString('ru-RU')} сум`;

export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function useIsNarrow(breakpoint = 720) {
  const query = `(max-width: ${breakpoint}px)`;
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return narrow;
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 20 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ margin: 0, fontFamily: A.fontUI, fontSize: 22, fontWeight: 700, color: A.ink, letterSpacing: '-0.01em' }}>{title}</h1>
        {subtitle && <p style={{ margin: '4px 0 0', fontFamily: A.fontUI, fontSize: 13, color: A.muted, lineHeight: 1.5 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  );
}

export function Card({ children, style, pad = 16 }) {
  return (
    <div style={{ background: A.surface, border: `1px solid ${A.line}`, borderRadius: 12, padding: pad, ...style }}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint, style }) {
  return (
    <div style={{ margin: '28px 0 10px', ...style }}>
      <h2 style={{ margin: 0, fontFamily: A.fontUI, fontSize: 15, fontWeight: 700, color: A.ink }}>{children}</h2>
      {hint && <p style={{ margin: '3px 0 0', fontFamily: A.fontUI, fontSize: 12, color: A.muted, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}

/**
 * Карточка с числом. delta — изменение к прошлому периоду ({ text, good }),
 * muted — число пока не имеет смысла, alert — что-то сломалось.
 */
export function Stat({ label, value, sub, delta = null, muted = false, alert = false }) {
  const deltaColor = delta?.good === true ? A.good : delta?.good === false ? A.bad : A.muted;
  return (
    <Card pad={14} style={alert ? { borderColor: '#F3C7C7', background: A.badSoft } : undefined}>
      <p style={{ margin: 0, fontFamily: A.fontUI, fontSize: 12, color: alert ? A.bad : A.muted, fontWeight: 600 }}>{label}</p>
      <p style={{
        margin: '4px 0 0', fontFamily: A.fontUI, fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em',
        color: alert ? A.bad : A.ink, opacity: muted ? 0.35 : 1, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2,
      }}
      >
        {value}
        {delta && (
          <span style={{ marginLeft: 6, fontSize: 12, fontWeight: 700, color: deltaColor }}>{delta.text}</span>
        )}
      </p>
      {sub && <p style={{ margin: '3px 0 0', fontFamily: A.fontUI, fontSize: 11.5, color: A.muted, lineHeight: 1.4 }}>{sub}</p>}
    </Card>
  );
}

export function StatGrid({ children, style }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, ...style }}>
      {children}
    </div>
  );
}

export function Button({ children, variant = 'ghost', size = 'md', style, ...props }) {
  const palette = {
    primary: { background: A.berry, color: '#fff', border: `1px solid ${A.berry}` },
    ghost: { background: A.surface, color: A.ink, border: `1px solid ${A.line}` },
    danger: { background: A.surface, color: A.bad, border: `1px solid #F0C9C9` },
    link: { background: 'none', color: A.berry, border: '1px solid transparent', padding: 0 },
  }[variant];
  return (
    <button
      type="button"
      {...props}
      style={{
        padding: size === 'sm' ? '5px 10px' : '8px 14px',
        borderRadius: 8, fontFamily: A.fontUI, fontSize: size === 'sm' ? 12 : 13, fontWeight: 600,
        cursor: props.disabled ? 'not-allowed' : 'pointer', opacity: props.disabled ? 0.5 : 1,
        whiteSpace: 'nowrap', ...palette, ...style,
      }}
    >
      {children}
    </button>
  );
}

export const inputStyle = {
  padding: '8px 10px', borderRadius: 8, border: `1px solid ${A.line}`, background: A.surface,
  fontFamily: A.fontUI, fontSize: 13, color: A.ink, minWidth: 0, boxSizing: 'border-box',
};

/** Переключатель из нескольких вариантов (фильтр статуса и т. п.). */
export function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 2, padding: 2, background: A.soft, borderRadius: 9, border: `1px solid ${A.line}` }}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            style={{
              padding: '5px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              fontFamily: A.fontUI, fontSize: 12.5, fontWeight: 600,
              background: active ? A.surface : 'transparent', color: active ? A.ink : A.muted,
              boxShadow: active ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
            }}
          >
            {o.label}
            {o.count !== undefined && <span style={{ marginLeft: 5, opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function Badge({ tone = 'neutral', children }) {
  const tones = {
    neutral: [A.soft, A.muted],
    good: [A.goodSoft, A.good],
    bad: [A.badSoft, A.bad],
    warn: [A.warnSoft, A.warn],
    accent: [A.berrySoft, A.berry],
  };
  const [bg, fg] = tones[tone] || tones.neutral;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 100, background: bg, color: fg,
      fontFamily: A.fontUI, fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap',
    }}
    >
      {children}
    </span>
  );
}

export function Toggle({ checked, onChange, label }) {
  return (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: A.fontUI, fontSize: 12.5, color: A.muted, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: A.berry }} />
      {label}
    </label>
  );
}

// ------------------------------------------------------------------ таблица

/** Значение ячейки для сортировки. Ячейка — строка, число, React-узел или { d, v }. */
function sortValue(cell) {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return cell;
  if (typeof cell === 'boolean') return cell ? 1 : 0;
  if (typeof cell === 'object' && !Array.isArray(cell) && 'v' in cell && !('$$typeof' in cell)) return cell.v ?? null;
  if (typeof cell === 'string') {
    if (cell === '—' || cell === '') return null;
    // «19 000 сум», «×0.04», «12%» — сортируем как числа
    const n = cell.replace(/[\s ]/g, '').replace(/сум$/, '').replace(/^×/, '').replace(/%$/, '').replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(n)) return Number(n);
    return cell.toLocaleLowerCase('ru');
  }
  return null;
}

function display(cell) {
  if (cell && typeof cell === 'object' && !Array.isArray(cell) && 'd' in cell && !('$$typeof' in cell)) return cell.d;
  return cell;
}

function compare(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return String(a).localeCompare(String(b), 'ru');
}

/**
 * Таблица с сортировкой по клику на заголовок. На узком экране строки
 * превращаются в карточки «подпись: значение», чтобы не листать вбок.
 *
 * head — строки или { label, align, sortable }. rows — массивы ячеек или
 * { cells, key, muted }. Ячейка может быть { d: что показать, v: по чему сортировать }.
 */
export function DataTable({ head, rows, empty = 'Нет данных.', defaultSort = null, style, cards = true }) {
  const narrow = useIsNarrow();
  const [sort, setSort] = useState(defaultSort); // { col, dir: 'asc' | 'desc' }
  const columns = head.map((h, i) => (typeof h === 'string' ? { label: h } : h)).map((c, i) => ({
    align: i === 0 ? 'left' : 'right', sortable: c.label !== '', ...c,
  }));
  const normalized = rows.map((r, i) => (Array.isArray(r) ? { cells: r, key: i } : { key: i, ...r }));

  const sorted = useMemo(() => {
    if (!sort) return normalized;
    const copy = [...normalized];
    copy.sort((ra, rb) => {
      const res = compare(sortValue(ra.cells[sort.col]), sortValue(rb.cells[sort.col]));
      // пустые всегда в конце, в любом направлении
      const va = sortValue(ra.cells[sort.col]);
      const vb = sortValue(rb.cells[sort.col]);
      if (va === null || vb === null) return res;
      return sort.dir === 'asc' ? res : -res;
    });
    return copy;
  }, [normalized, sort]);

  function toggle(col) {
    if (!columns[col].sortable) return;
    setSort((cur) => {
      if (cur?.col === col) return { col, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
      // Числа сначала показываем от большего, текст — по алфавиту.
      const sample = normalized.map((r) => sortValue(r.cells[col])).find((v) => v !== null);
      return { col, dir: typeof sample === 'number' ? 'desc' : 'asc' };
    });
  }

  if (!rows || rows.length === 0) {
    return <p style={{ margin: 0, fontFamily: A.fontUI, fontSize: 13, color: A.muted, ...style }}>{empty}</p>;
  }

  const sortBar = (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontFamily: A.fontUI, fontSize: 12, color: A.muted }}>Сортировка:</span>
      <select
        value={sort ? `${sort.col}:${sort.dir}` : ''}
        onChange={(e) => {
          if (!e.target.value) { setSort(null); return; }
          const [col, dir] = e.target.value.split(':');
          setSort({ col: Number(col), dir });
        }}
        style={{ ...inputStyle, padding: '5px 8px', fontSize: 12 }}
      >
        <option value="">как есть</option>
        {columns.map((c, i) => (c.sortable ? [
          <option key={`${i}d`} value={`${i}:desc`}>{c.label} ↓</option>,
          <option key={`${i}a`} value={`${i}:asc`}>{c.label} ↑</option>,
        ] : null))}
      </select>
    </div>
  );

  if (narrow && cards) {
    return (
      <div style={style}>
        {sortBar}
        <div style={{ display: 'grid', gap: 8 }}>
          {sorted.map((row) => (
            <Card key={row.key} pad={12} style={{ ...(row.muted ? { opacity: 0.55 } : null), ...(row.onClick ? { cursor: 'pointer' } : null) }}>
              <div onClick={row.onClick} role={row.onClick ? 'button' : undefined}>
              <div style={{ fontFamily: A.fontUI, fontSize: 14, fontWeight: 700, color: A.ink, marginBottom: 6, wordBreak: 'break-word' }}>
                {display(row.cells[0])}
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                {row.cells.slice(1).map((cell, i) => {
                  const col = columns[i + 1];
                  const shown = display(cell);
                  if (shown === null || shown === undefined || shown === '') return null;
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontFamily: A.fontUI, fontSize: 12.5 }}>
                      <span style={{ color: A.muted }}>{col.label}</span>
                      <span style={{ color: A.ink, textAlign: 'right', fontVariantNumeric: 'tabular-nums', wordBreak: 'break-word' }}>{shown}</span>
                    </div>
                  );
                })}
              </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ overflowX: 'auto', border: `1px solid ${A.line}`, borderRadius: 12, background: A.surface, ...style }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: A.fontUI, fontSize: 12.5, color: A.ink }}>
        <thead>
          <tr style={{ background: A.soft }}>
            {columns.map((c, i) => {
              const active = sort?.col === i;
              return (
                <th
                  key={`${c.label}-${i}`}
                  onClick={() => toggle(i)}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  style={{
                    textAlign: c.align, padding: '8px 10px', fontWeight: 700, fontSize: 11.5,
                    color: active ? A.ink : A.muted, borderBottom: `1px solid ${A.line}`, whiteSpace: 'nowrap',
                    cursor: c.sortable ? 'pointer' : 'default', userSelect: 'none',
                  }}
                  title={c.sortable ? 'Сортировать' : undefined}
                >
                  {c.label}
                  {c.sortable && (
                    <span style={{ marginLeft: 4, opacity: active ? 1 : 0.25 }}>
                      {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.key}
              onClick={row.onClick}
              className={row.onClick ? 'admin-row-click' : undefined}
              style={{ ...(row.muted ? { opacity: 0.5 } : null), ...(row.onClick ? { cursor: 'pointer' } : null) }}
            >
              {row.cells.map((cell, ci) => (
                <td
                  key={ci}
                  style={{
                    textAlign: columns[ci]?.align || 'right', padding: '8px 10px',
                    borderBottom: `1px solid ${A.line}`, fontVariantNumeric: 'tabular-nums',
                    whiteSpace: ci === 0 ? 'normal' : 'nowrap',
                    minWidth: ci === 0 ? 170 : undefined,
                  }}
                >
                  {display(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Боковая панель с подробностями (на телефоне — на весь экран).
 * Закрывается крестиком, Esc и кликом по затемнению.
 */
export function Drawer({ open, onClose, title, subtitle, children, width = 560 }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20, 16, 28, 0.35)' }} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        style={{
          position: 'relative', width: `min(${width}px, 100vw)`, height: '100%', overflowY: 'auto',
          background: A.bg, boxShadow: '-12px 0 40px rgba(0,0,0,0.12)', fontFamily: A.fontUI,
        }}
      >
        <div style={{
          position: 'sticky', top: 0, zIndex: 1, background: A.bg, borderBottom: `1px solid ${A.line}`,
          padding: '14px 18px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 16, fontWeight: 800, color: A.ink, wordBreak: 'break-word' }}>{title}</p>
            {subtitle && <p style={{ margin: '3px 0 0', fontSize: 12.5, color: A.muted }}>{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Закрыть" style={{
            border: 'none', background: A.soft, borderRadius: 10, width: 32, height: 32, cursor: 'pointer', fontSize: 16, color: A.ink, flexShrink: 0,
          }}>✕</button>
        </div>
        <div style={{ padding: 18 }}>{children}</div>
      </aside>
    </div>
  );
}
