/**
 * © 2026 Senti. Все права защищены (см. LICENSE в корне проекта).
 * Несанкционированное копирование или распространение запрещено.
 */

import { createClient } from '@supabase/supabase-js';

// URL и anon/publishable key НЕ секреты — они защищены RLS в базе, поэтому
// безопасно жить прямо в клиентском коде. Единственная причина захардкодить,
// а не читать из import.meta.env: у нас пока нет способа задать переменные
// окружения на Vercel через доступный MCP-инструмент. Как только появится —
// стоит вернуть чтение из import.meta.env.VITE_SUPABASE_URL и .VITE_SUPABASE_ANON_KEY,
// это чище для дальнейшей смены проекта/окружений.
const SUPABASE_URL = 'https://ygyzillullursmuvdrpi.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Gsr6IJCm41t0VpA_nw4x2Q_miCuFhJ5';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

