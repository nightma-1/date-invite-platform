/**
 * © 2026 Senti. Все права защищены.
 *
 * Партнёры Senti. Пока FORMEMORY_PUBLIC = false, блок «Подарок к свиданию»
 * видит только владелец сервиса (profiles.is_admin) — для проверки на бою.
 * Чтобы показать всем, поставьте true.
 */

export const FORMEMORY_PUBLIC = false;

export const FORMEMORY = {
  url: 'https://formemory-shop-n1-e44d.vercel.app/?utm_source=senti&utm_medium=response&utm_campaign=gift#tag/' + encodeURIComponent('Для пары'),
  code: 'SENTI',
  discount: 10,
};
