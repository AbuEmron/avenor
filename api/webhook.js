/**
 * Keptly — Stripe Webhook Handler
 * Vercel env vars needed:
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Stripe Dashboard → Webhooks → Add endpoint:
 *   https://YOUR_DOMAIN/api/webhook
 * Events to select:
 *   checkout.session.completed
 *   customer.subscription.updated
 *   customer.subscription.deleted
 */
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // Collect raw body (bodyParser must be off)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    event = stripe.webhooks.constructEvent(
      rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const obj = event.data.object;

  try {
    // User completed checkout → activate premium
    if (event.type === 'checkout.session.completed') {
      const userId = obj.client_reference_id;
      if (userId) {
        await sb.from('profiles').update({
          status: 'active',
          stripe_customer_id: obj.customer,
        }).eq('id', userId);
        console.log('Premium activated for user:', userId);
      }
    }

    // Subscription renewed / changed plan
    if (event.type === 'customer.subscription.updated') {
      const status = ['active', 'trialing'].includes(obj.status) ? obj.status : 'free';
      if (obj.customer) {
        await sb.from('profiles').update({ status }).eq('stripe_customer_id', obj.customer);
      }
    }

    // Subscription cancelled → back to free
    if (event.type === 'customer.subscription.deleted') {
      if (obj.customer) {
        await sb.from('profiles').update({ status: 'free' }).eq('stripe_customer_id', obj.customer);
      }
    }
  } catch (err) {
    console.error('DB update error:', err.message);
  }

  res.json({ received: true });
};

// Must disable body parser so Stripe can verify the raw body signature
module.exports.config = { api: { bodyParser: false } };
