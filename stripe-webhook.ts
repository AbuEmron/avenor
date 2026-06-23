/**
 * Keptly Stripe Webhook — Supabase Edge Function
 *
 * SETUP:
 * 1. supabase functions new stripe-webhook
 * 2. Paste this file → supabase/functions/stripe-webhook/index.ts
 * 3. supabase functions deploy stripe-webhook --no-verify-jwt
 * 4. Set secrets:
 *    supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
 *    supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
 * 5. Stripe Dashboard → Webhooks → Add endpoint:
 *    https://zfzkgixkvygbcpoipxdk.supabase.co/functions/v1/stripe-webhook
 * 6. Select events:
 *    checkout.session.completed
 *    customer.subscription.updated
 *    customer.subscription.deleted
 */
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const sb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const sig = req.headers.get('stripe-signature')!;
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, sig, Deno.env.get('STRIPE_WEBHOOK_SECRET')!
    );
  } catch (err: any) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 });
  }

  const obj = event.data.object as any;

  // Payment succeeded → activate premium
  if (event.type === 'checkout.session.completed') {
    const userId = obj.client_reference_id;
    if (userId) {
      await sb.from('profiles')
        .update({ status: 'active', stripe_customer_id: obj.customer })
        .eq('id', userId);
    }
  }

  // Subscription updated (renewal, plan change)
  if (event.type === 'customer.subscription.updated') {
    const status = ['active', 'trialing'].includes(obj.status) ? obj.status : 'free';
    if (obj.customer) {
      await sb.from('profiles').update({ status }).eq('stripe_customer_id', obj.customer);
    }
  }

  // Subscription cancelled → revert to free
  if (event.type === 'customer.subscription.deleted') {
    if (obj.customer) {
      await sb.from('profiles').update({ status: 'free' }).eq('stripe_customer_id', obj.customer);
    }
  }

  return new Response('ok', { status: 200 });
});
