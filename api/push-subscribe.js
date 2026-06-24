import { createClient } from '@supabase/supabase-js';

const sb = createClient(
  process.env.SUPABASE_URL || 'https://zfzkgixkvygbcpoipxdk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { subscription, user_id } = req.body;
  if (!subscription || !user_id) return res.status(400).json({ error: 'Missing fields' });
  try {
    await sb.from('push_subscriptions').upsert(
      { user_id, subscription: JSON.stringify(subscription), updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
