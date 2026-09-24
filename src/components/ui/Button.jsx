/**
 * © 2026 Senti. Все права защищены.
 */

export default function Button({ tokens, variant = 'primary', style = {}, className = '', ...props }) {
  const base = {
    fontFamily: tokens.fontUI,
    fontWeight: 600, fontSize: 14,
    letterSpacing: '0.01em',
    borderRadius: 6, padding: '11px 22px',
    cursor: 'pointer', border: 'none',
    transition: 'opacity 120ms ease',
  };
  const variants = {
    primary: { background: tokens.berry, color: '#fff' },
    secondary: { background: 'transparent', color: tokens.ink, border: `1.5px solid ${tokens.ink}30` },
    quiet: { background: 'transparent', color: tokens.inkMuted || tokens.ink, padding: '4px 0', textDecoration: 'underline' },
  };
  return <button className={`disabled:opacity-40 ${className}`} style={{ ...base, ...variants[variant], ...style }} {...props} />;
}
