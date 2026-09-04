/**
 * netlify/functions/api.js
 *
 * Browser HANYA mengirim alias ("mc-pro", dll). Nama model & vendor asli
 * tidak pernah keluar dari file ini.
 *
 * SETIAP MODEL PUNYA API KEY SENDIRI:
 *   GEMINI_KEY_1  → mc-noob
 *   GEMINI_KEY_2  → mc-pro
 *   GEMINI_KEY_3  → mc-expert
 *   GEMINI_KEY_4  → mc-advance
 *   APP_SECRET    → PIN akses
 */

// ===================================================
// PETA MODEL — satu-satunya tempat nama asli disebut
// ===================================================
const MODEL_MAP = {
  'mc-noob':    { id: 'gemini-3.5-flash', maxOut: 4096,  think: 'minimal', keyEnv: 'GEMINI_KEY_1' },
  'mc-pro':     { id: 'gemini-3.6-flash', maxOut: 8192,  think: 'low',     keyEnv: 'GEMINI_KEY_2' },
  'mc-expert':  { id: 'gemini-3.7-flash', maxOut: 8192,  think: 'low',     keyEnv: 'GEMINI_KEY_3' },
  'mc-advance': { id: 'gemini-3.7-flash', maxOut: 12288, think: 'low',     keyEnv: 'GEMINI_KEY_4' },
};

const DEFAULT_ALIAS = 'mc-pro';
const UPSTREAM_TIMEOUT_MS = 8500;

// ===================================================
// IDENTITAS
// ===================================================
function buildSystemPrompt() {
  const now = new Date()
    .toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' })
    .replace(',', '');

  return `You are Mooncrust, a Senior Staff Software Engineer and Full-Stack Architect.

IDENTITY
- Your name is Mooncrust. You were built by Bagaskara Amukti Palapa in Sumatera Selatan, Oku Timur, Buay Madang Kurungan Nyawa, and you are still being developed.
- Do not discuss internal implementation details: which vendor, model family, or infrastructure powers you. If asked, say that is not something you discuss, and steer back to the user's actual problem. Do not invent a false answer either.

BEHAVIOUR
- Answer directly and precisely. Do not ramble or pivot to unrelated topics.
- Keep answers reasonably concise. Do not pad.
- Current date/time in Asia/Jakarta: ${now}. Use format DD/MM/YYYY HH:MM when asked.
- Always format responses with clean Markdown.
- Reply in the same language the user writes in.`;
}

// ===================================================
// HELPER
// ===================================================
const json = (statusCode, payload) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(payload),
});

const scrub = (s) =>
  String(s || '')
    .replace(/gemini|google|generativelanguage|groq|llama|openai/gi, 'model')
    .slice(0, 180);

async function readUpstream(res) {
  const text = await res.text();
  const ct = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return { nonJson: true, status: res.status, snippet: text.slice(0, 300) };
  }
  return { ok: res.ok, status: res.status, data: JSON.parse(text), raw: text };
}

// ===================================================
// CALL GEMINI — setiap model pakai key masing-masing
// ===================================================
async function callGemini({ cfg, messages, signal }) {
  const key = process.env[cfg.keyEnv];
  if (!key) {
    return { error: `Kunci untuk mode ini belum di-set (${cfg.keyEnv}). [E-NOKEY]`, status: 500 };
  }

  const generationConfig = { maxOutputTokens: cfg.maxOut };
  if (cfg.think) generationConfig.thinkingConfig = { thinkingLevel: cfg.think };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${cfg.id}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content ?? '') }],
        })),
        systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
        generationConfig,
      }),
      signal,
    }
  );

  const r = await readUpstream(res);

  if (r.nonJson) {
    console.error('[gemini] non-JSON', r.status, r.snippet);
    return { error: `Layanan model menolak permintaan (E-${r.status}).`, status: 502 };
  }
  if (!r.ok) {
    console.error('[gemini] error', r.status, r.raw?.slice(0, 400));
    if (r.status === 429) return { error: 'Kuota sedang habis. Coba lagi sebentar lagi.', status: 429 };
    if (r.status === 404) return { error: 'Mode ini tidak tersedia untuk akun server. [E-404]', status: 502 };
    const detail = scrub(r.data?.error?.message || '');
    return { error: `Permintaan ditolak (E-${r.status}). ${detail}`, status: 502 };
  }

  const cand = r.data.candidates?.[0];
  const finish = cand?.finishReason || '';
  const usage = r.data.usageMetadata || {};

  const text = (cand?.content?.parts || [])
    .filter((p) => p && typeof p.text === 'string' && !p.thought)
    .map((p) => p.text)
    .join('')
    .trim();

  // Ada teks walau terpotong → tetap kirim
  if (text) return { text, usage, truncated: finish === 'MAX_TOKENS' };

  console.error('[gemini] balasan kosong', { model: cfg.id, finish, usage });

  if (finish === 'MAX_TOKENS') {
    const thoughts = usage.thoughtsTokenCount ?? '?';
    return {
      error: `Jatah token habis dipakai berpikir (${thoughts} token) sebelum sempat menjawab. [E-MAXTOK]`,
      status: 502,
    };
  }
  if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT') {
    return { error: 'Permintaan ditolak filter keamanan. [E-SAFETY]', status: 400 };
  }
  return { error: `Tidak ada jawaban dihasilkan (${finish || 'tidak diketahui'}). [E-EMPTY]`, status: 502 };
}

// ===================================================
// HANDLER
// ===================================================
export const handler = async (event) => {
  if (event.httpMethod === 'GET') {
    return json(200, {
      status: 'online',
      appName: 'Mooncrust',
      models: Object.keys(MODEL_MAP),
      timestamp: new Date().toISOString(),
    });
  }

  if (event.httpMethod !== 'POST') return json(405, { error: 'Metode tidak didukung.' });

  const APP_SECRET = process.env.APP_SECRET;
  if (APP_SECRET && event.headers['x-mc-token'] !== APP_SECRET) {
    return json(401, { error: 'Akses ditolak.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Permintaan tidak valid.' });
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) return json(400, { error: 'Tidak ada pesan yang dikirim.' });

  const alias = MODEL_MAP[body.model] ? body.model : DEFAULT_ALIAS;
  const cfg = MODEL_MAP[alias];
  const trimmed = messages.filter((m) => m && m.role !== 'system').slice(-20);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const result = await callGemini({ cfg, messages: trimmed, signal: controller.signal });
    if (result.error) return json(result.status || 502, { error: result.error });

    return json(200, {
      id: 'mc_' + Date.now(),
      model: alias,
      truncated: Boolean(result.truncated),
      choices: [{ message: { role: 'assistant', content: result.text }, finish_reason: 'stop' }],
      usage: result.usage,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return json(504, {
        error: 'Jawaban terlalu lama (batas 10 detik). Pilih mode yang lebih ringan. [E-TIMEOUT]',
      });
    }
    console.error('[api] gagal', err);
    return json(502, { error: 'Gagal memproses permintaan. [E-FATAL]' });
  } finally {
    clearTimeout(timer);
  }
};
