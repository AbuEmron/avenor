import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { interval, user_id } = req.body;

  const priceId = interval === 'yearly'
    ? (process.env.STRIPE_PRICE_ANNUAL_ID  || 'price_1ThgQ7AEUpuHBUGlp98jO8XG')
    : (process.env.STRIPE_PRICE_MONTHLY_ID || 'price_1ThgQ7AEUpuHBUGlwDuRHNF6');

  const baseUrl = process.env.APP_URL || `https://${req.headers.host}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user_id,
      allow_promotion_codes: true,
      subscription_data: { trial_period_days: 14 },
      success_url: `${baseUrl}/#settings`,
      cancel_url:  `${baseUrl}/#settings`,
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
