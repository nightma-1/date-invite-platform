/**
 * © 2026 Date Invite Platform. Все права защищены.
 * Билетный мотив — единственный сквозной структурный приём.
 */

export default function TicketCard({ tokens, className = '', style = {}, children }) {
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ background: tokens.card, borderRadius: 8, ...style }}
    >
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 12,
          backgroundImage: `radial-gradient(circle, ${tokens.bg} 4px, transparent 4.5px)`,
          backgroundSize: '18px 12px',
          backgroundPosition: '9px 0',
          pointerEvents: 'none',
        }}
      />
      <div style={{ paddingTop: 8 }}>{children}</div>
    </div>
  );
}
