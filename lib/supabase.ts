import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.XERA_SUPABASE_URL;
const supabaseServiceKey = process.env.XERA_SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn('[Seranex] ⚠️ Supabase credentials missing in .env.local');
}

export const supabase = createClient(
    supabaseUrl || '',
    supabaseServiceKey || ''
);
