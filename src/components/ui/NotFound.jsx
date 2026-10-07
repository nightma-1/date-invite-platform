/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 *
 * Используется и для реально несуществующих путей, и для /admin без прав —
 * специально не говорит, что страница существует, но доступ закрыт.
 */

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fff',
        textAlign: 'center',
        padding: '0 20px',
      }}
    >
      <div>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>Страница не найдена</h1>
        <p style={{ fontSize: '0.875rem', opacity: 0.6 }}>
          <a href="/" style={{ color: 'inherit', textDecoration: 'underline' }}>На главную</a>
        </p>
      </div>
    </div>
  );
}
