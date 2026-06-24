/**
 * Keptly — Stripe Billing Portal
 * Opens the Stripe Customer Portal so users can cancel, upgrade, update card.
 * Vercel env vars needed:
 *   STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, APP_URL
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' });

  const { data: profile } = await sb.from('profiles')
    .select('stripe_customer_id').eq('id', user.id).single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account — please subscribe first' });
  }

  const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/#settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Portal error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
