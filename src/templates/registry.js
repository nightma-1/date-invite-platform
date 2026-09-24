/**
 * © 2026 Date Invite Platform. Все права защищены.
 */

import { romanticTokens } from './romantic/tokens.js';
import { darkRomanceTokens } from './darkromance/tokens.js';
import { cuteTokens } from './cute/tokens.js';
import { funnyTokens } from './funny/tokens.js';
import { luxuryTokens } from './luxury/tokens.js';

export const TEMPLATES = {
  romantic: romanticTokens,
  darkromance: darkRomanceTokens,
  cute: cuteTokens,
  funny: funnyTokens,
  luxury: luxuryTokens,
};

export const TEMPLATE_LIST = Object.values(TEMPLATES);

export const MOODS = [
  { id: 'romantic', label: '❤️ Romantic' },
  { id: 'flirty', label: '😏 Flirty' },
  { id: 'funny', label: '😂 Funny' },
  { id: 'cute', label: '🥹 Cute' },
  { id: 'bold', label: '🔥 Bold' },
];

export function getTemplateTokens(templateId) {
  return TEMPLATES[templateId] ?? TEMPLATES.romantic;
}

export function templatesForMood(mood) {
  const matches = TEMPLATE_LIST.filter((t) => t.mood === mood);
  return matches.length > 0 ? matches : TEMPLATE_LIST;
}
