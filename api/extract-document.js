/**
 * Keptly — AI Document Extraction via Claude
 * Called after OCR scan to auto-fill title, category, ref number and expiry date.
 * Vercel env vars needed:
 *   ANTHROPIC_API_KEY — from console.anthropic.com
 *
 * Install: npm install @anthropic-ai/sdk
 */
const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text } = req.body;
  if (!text || text.trim().length < 10) return res.json({});

  try {
    const msg = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: `Extract document metadata from the OCR text below. Return ONLY valid JSON, nothing else.

Required fields:
- title: the document name or type (e.g. "Passport", "Car Insurance", "Lease Agreement")  
- category: exactly one of: Identity | Financial | Medical | Insurance | Property | Vehicle | Other
- ref: reference/policy/document number (empty string if not found)
- expires: expiry/renewal date as YYYY-MM-DD (empty string if not found)

OCR text:
${text.slice(0, 3000)}`
      }]
    });

    const raw = msg.content[0].text.trim();
    const match = raw.match(/\{[\s\S]*?\}/);
    if (!match) return res.json({});

    const parsed = JSON.parse(match[0]);
    // Validate category
    const valid = ['Identity','Financial','Medical','Insurance','Property','Vehicle','Other'];
    if (!valid.includes(parsed.category)) parsed.category = 'Other';
    res.json(parsed);
  } catch (err) {
    console.error('Claude extraction error:', err.message);
    res.json({}); // Fail silently — user can fill in manually
  }
};
