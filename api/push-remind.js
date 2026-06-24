/**
 * Keptly — Daily Renewal Reminder Cron
 * Runs daily via vercel.json cron (requires Vercel Pro).
 * Checks every user's renewals and sends push notifications for items due in 7 days.
 *
 * Vercel env vars needed:
 *   VAPID_PUBLIC_KEY   — from: npx web-push generate-vapid-keys
 *   VAPID_PRIVATE_KEY  — same command
 *   VAPID_SUBJECT      — e.g. mailto:hello@keptly.app
 *   CRON_SECRET        — any random string, set in Vercel + in cron auth header
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Install: npm install web-push
 */
const webpush = require('web-push');
const { createClient } = require('@supabase/supabase-js');

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT   || 'mailto:hello@keptly.app',
  process.env.VAPID_PUBLIC_KEY  || '',
  process.env.VAPID_PRIVATE_KEY || ''
);

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr) - Date.now()) / 86400000);
}

module.exports = async function handler(req, res) {
  // Auth guard — must match CRON_SECRET in Vercel
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).end();
  }

  const [{ data: states }, { data: subs }] = await Promise.all([
    sb.from('user_state').select('user_id, data'),
    sb.from('push_subscriptions').select('user_id, subscription'),
  ]);

  const subMap = {};
  (subs || []).forEach(s => { subMap[s.user_id] = s.subscription; });

  let sent = 0, skipped = 0, cleaned = 0;

  for (const state of states || []) {
    const subStr = subMap[state.user_id];
    if (!subStr) { skipped++; continue; }

    const s = state.data || {};
    const items = [];

    const check = (label, date, goto) => {
      const d = daysUntil(date);
      if (d !== null && d >= 0 && d <= 7) {
        items.push({ label, d, goto });
      }
    };

    (s.vault      || []).forEach(d => check(d.title || 'Document',          d.expires,       'vault'));
    (s.home       || []).forEach(h => check(h.item  || 'Home maintenance',  h.nextDue,       'home'));
    (s.insurance  || []).forEach(p => check(p.name  || 'Insurance policy',  p.renews,        'insurance'));
    (s.vehicles   || []).forEach(v => {
      check(`${v.name} registration`, v.registration, 'vehicles');
      check(`${v.name} insurance`,    v.insurance,    'vehicles');
    });
    (s.finance?.bills || []).forEach(b => {
      if (b.dueDay) {
        const now = new Date();
        const due = new Date(now.getFullYear(), now.getMonth(), b.dueDay);
        if (due < now) due.setMonth(due.getMonth() + 1);
        const d = Math.ceil((due - now) / 86400000);
        if (d >= 0 && d <= 3) items.push({ label: `${b.name} bill`, d, goto: 'finance' });
      }
    });

    if (!items.length) { skipped++; continue; }

    items.sort((a, b) => a.d - b.d);
    const top = items[0];
    const body = items.length > 1
      ? `${top.label} in ${top.d}d · +${items.length - 1} more reminder${items.length > 2 ? 's' : ''}`
      : `${top.label} ${top.d === 0 ? 'is due today' : `in ${top.d} day${top.d === 1 ? '' : 's'}`}`;

    try {
      await webpush.sendNotification(
        JSON.parse(subStr),
        JSON.stringify({
          title: '⏰ Keptly reminder',
          body,
          tag: 'keptly-reminder',
          url: `/#${top.goto}`,
        })
      );
      sent++;
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expired — clean it up
        await sb.from('push_subscriptions').delete().eq('user_id', state.user_id);
        cleaned++;
      }
    }
  }

  console.log(`Push reminders: sent=${sent} skipped=${skipped} cleaned=${cleaned}`);
  res.json({ sent, skipped, cleaned });
};
