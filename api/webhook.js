import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const sb = createClient(
  process.env.SUPABASE_URL || 'https://zfzkgixkvygbcpoipxdk.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const rawBody = Buffer.concat(chunks);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const obj = event.data.object;
  try {
    if (event.type === 'checkout.session.completed') {
      const userId = obj.client_reference_id;
      if (userId) await sb.from('profiles').update({ status: 'active', stripe_customer_id: obj.customer }).eq('id', userId);
    }
    if (event.type === 'customer.subscription.updated') {
      const status = ['active', 'trialing'].includes(obj.status) ? obj.status : 'free';
      if (obj.customer) await sb.from('profiles').update({ status }).eq('stripe_customer_id', obj.customer);
    }
    if (event.type === 'customer.subscription.deleted') {
      if (obj.customer) await sb.from('profiles').update({ status: 'free' }).eq('stripe_customer_id', obj.customer);
    }
  } catch (err) {
    console.error('DB error:', err.message);
  }
  res.json({ received: true });
}
