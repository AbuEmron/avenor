/**
 * Keptly — Store Push Notification Subscription
 * Called from the app when a user enables renewal reminders.
 * Requires Supabase table:
 *   CREATE TABLE push_subscriptions (
 *     user_id uuid PRIMARY KEY REFERENCES auth.users,
 *     subscription text NOT NULL,
 *     updated_at timestamptz DEFAULT now()
 *   );
 *   ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "service role only" ON push_subscriptions USING (false);
 */
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { subscription, user_id } = req.body;
  if (!subscription || !user_id) {
    return res.status(400).json({ error: 'Missing subscription or user_id' });
  }

  try {
    await sb.from('push_subscriptions').upsert({
      user_id,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    res.json({ ok: true });
  } catch (err) {
    console.error('Push subscribe error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
