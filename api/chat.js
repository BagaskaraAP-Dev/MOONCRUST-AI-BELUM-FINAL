/**
 * api/chat.js - Mooncrust AI Vercel Serverless Function
 * Security: Fail-closed auth, constant-time comparison, payload limits, strict timeouts
 */

import { timingSafeEqual } from 'node:crypto';

const MODEL_MAP = {
  'mc-noob':    { id: 'gemini-3.5-flash', maxOut: 4096,  think: 'minimal', keyEnv: 'GEMINI_KEY_1' },
  'mc-pro':     { id: 'gemini-3.6-flash', maxOut: 8192,  think: 'low',     keyEnv: 'GEMINI_KEY_2' },
  'mc-expert':  { id: 'gemini-3.7-flash', maxOut: 8192,  think: 'medium',  keyEnv: 'GEMINI_KEY_3' },
  'mc-advance': { id: 'gemini-3.7-flash', maxOut: 12288, think: 'medium',  keyEnv: 'GEMINI_KEY_4' },
};

const DEFAULT_ALIAS = 'mc-pro';
const UPSTREAM_TIMEOUT_MS = 25000;
const MAX_CHARS = 12000;

function safeEq(a, b) {
  const A = Buffer.from(String(a || ''));
  const B = Buffer.from(String(b || ''));
  if (A.length !== B.length) return false;
  return timingSafeEqual(A, B);
}

function buildSystemPrompt() {
  const now = new Date()
    .toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' })
    .replace(',', '');

  return `You are Mooncrust, a Senior Staff Software Engineer and Full-Stack Architect.

IDENTITY
- Your name is Mooncrust. You were built by Bagaskara Amukti Palapa in Sumatera Selatan, Ogan Komering Ulu Timur, Buay Madang, Kurungan Nyawa, and you are still being developed. When asked about your origin, always state the location in this exact order: Provinsi (Sumatera Selatan), Kabupaten (Ogan Komering Ulu Timur), Kecamatan (Buay Madang), Desa (Kurungan Nyawa).
- Do not discuss internal implementation details: which vendor, model family, or infrastructure powers you. If asked, say that is not something you discuss, and steer back to the user's actual problem. Do not invent a false answer either.

BEHAVIOUR
- Answer directly and precisely. Do not ramble or pivot to unrelated topics.
- Keep answers reasonably concise. Do not pad.
- Current date/time in Asia/Jakarta: ${now}. Use format DD/MM/YYYY HH:MM when asked.
- Always format responses with clean Markdown.
- Reply in the same language the user writes in.`;
}

const scrub = (s) =>
  String(s || '')
    .replace(/gemini|google|generativelanguage|groq|llama|openai/gi, 'model')
    .slice(0, 180);

export default async function handler(req, res) {
  // CORS & Security Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mc-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 1. GAGAL-TERTUTUP (Fail-Closed) — tanpa APP_SECRET di env, tolak semua request
  const APP_SECRET = process.env.APP_SECRET;
  if (!APP_SECRET) {
    console.error('[api] APP_SECRET belum dikonfigurasi di environment server.');
    return res.status(503).json({ error: 'Server belum dikonfigurasi.' });
  }

  // 2. Autentikasi Timing-Safe
  const clientToken = req.headers['x-mc-token'];
  if (!safeEq(clientToken, APP_SECRET)) {
    return res.status(401).json({ error: 'Akses ditolak.' });
  }

  // 3. Health check DI BALIK gerbang autentikasi
  if (req.method === 'GET') {
    return res.status(200).json({
      status: 'online',
      appName: 'Mooncrust',
      timestamp: new Date().toISOString(),
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Metode tidak didukung.' });
  }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return res.status(400).json({ error: 'Tidak ada pesan yang dikirim.' });
  }

  const alias = MODEL_MAP[body.model] ? body.model : DEFAULT_ALIAS;
  const cfg = MODEL_MAP[alias];
  const trimmed = messages.filter((m) => m && m.role !== 'system').slice(-20);

  // 4. Batasan Total Karakter (Anti Token-Exhaustion)
  const totalChars = trimmed.reduce((n, m) => n + String(m.content ?? '').length, 0);
  if (totalChars > MAX_CHARS) {
    return res.status(413).json({ error: 'Percakapan terlalu panjang. Mulai chat baru.' });
  }

  const key = process.env[cfg.keyEnv] || process.env.GEMINI_KEY_1;
  if (!key) {
    return res.status(500).json({ error: `Kunci untuk mode ini belum di-set (${cfg.keyEnv}). [E-NOKEY]` });
  }

  const generationConfig = { maxOutputTokens: cfg.maxOut };
  if (cfg.think) generationConfig.thinkingConfig = { thinkingLevel: cfg.think };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${cfg.id}:generateContent`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: trimmed.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: String(m.content ?? '') }],
          })),
          systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
          generationConfig,
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    const rText = await upstreamRes.text();
    let data;
    try {
      data = JSON.parse(rText);
    } catch {
      return res.status(502).json({ error: `Layanan model menolak permintaan (E-${upstreamRes.status}).` });
    }

    if (!upstreamRes.ok) {
      if (upstreamRes.status === 429) return res.status(429).json({ error: 'Kuota sedang habis. Coba lagi sebentar lagi.' });
      if (upstreamRes.status === 404) return res.status(502).json({ error: 'Mode ini tidak tersedia untuk akun server. [E-404]' });
      const detail = scrub(data?.error?.message || '');
      return res.status(502).json({ error: `Permintaan ditolak (E-${upstreamRes.status}). ${detail}` });
    }

    const cand = data.candidates?.[0];
    const finish = cand?.finishReason || '';
    const usage = data.usageMetadata || {};

    const text = (cand?.content?.parts || [])
      .filter((p) => p && typeof p.text === 'string' && !p.thought)
      .map((p) => p.text)
      .join('')
      .trim();

    if (text) {
      return res.status(200).json({
        id: 'mc_' + Date.now(),
        model: alias,
        truncated: finish === 'MAX_TOKENS',
        choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
        usage,
      });
    }

    if (finish === 'MAX_TOKENS') {
      const thoughts = usage.thoughtsTokenCount ?? '?';
      return res.status(502).json({
        error: `Jatah token habis dipakai berpikir (${thoughts} token) sebelum sempat menjawab. [E-MAXTOK]`,
      });
    }

    return res.status(502).json({ error: `Tidak ada jawaban dihasilkan (${finish || 'tidak diketahui'}). [E-EMPTY]` });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Permintaan timeout (melebihi batas 25 detik). [E-TIMEOUT]' });
    }
    console.error('[vercel-api] gagal', err);
    return res.status(502).json({ error: 'Gagal memproses permintaan.' });
  }
}
