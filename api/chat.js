/**
 * api/chat.js - Mooncrust AI Vercel Serverless Function
 * SSE Streaming, multimodal (image), fail-closed auth, timing-safe comparison
 */

import { timingSafeEqual } from 'node:crypto';

const MODEL_MAP = {
  'mc-noob':    { id: 'gemini-1.5-flash', fallbacks: ['gemini-2.0-flash', 'gemini-1.5-flash-latest'], maxOut: 4096,  keyEnv: 'GEMINI_KEY_1' },
  'mc-pro':     { id: 'gemini-2.0-flash', fallbacks: ['gemini-1.5-flash', 'gemini-2.5-flash'], maxOut: 8192,  keyEnv: 'GEMINI_KEY_2' },
  'mc-expert':  { id: 'gemini-1.5-pro',   fallbacks: ['gemini-2.0-flash', 'gemini-1.5-flash'], maxOut: 8192,  keyEnv: 'GEMINI_KEY_3' },
  'mc-advance': { id: 'gemini-2.0-flash', fallbacks: ['gemini-1.5-pro', 'gemini-1.5-flash'], maxOut: 12288, keyEnv: 'GEMINI_KEY_4' },
};

const DEFAULT_ALIAS = 'mc-pro';
const UPSTREAM_TIMEOUT_MS = 55000;
const MAX_CHARS = 12000;
const MAX_IMAGE_B64_LEN = 2_800_000; // ~2.1MB raw after base64 decode

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

  return `You are Mooncrust, a smart and friendly AI assistant for daily life.

IDENTITY
- Your name is Mooncrust. You were built by Bagaskara Amukti Palapa in Sumatera Selatan, Ogan Komering Ulu Timur, Buay Madang, Kurungan Nyawa, and you are still being developed. When asked about your origin, always state the location in this exact order: Provinsi (Sumatera Selatan), Kabupaten (Ogan Komering Ulu Timur), Kecamatan (Buay Madang), Desa (Kurungan Nyawa).
- Do not discuss internal implementation details: which vendor, model family, or infrastructure powers you. If asked, say that is not something you discuss. Do not invent a false answer either.

BEHAVIOUR
- Be helpful for ANYTHING: homework, daily tasks, photo analysis, writing, translation, math, general knowledge, coding, creative work, and more.
- Answer directly and concisely. Get to the point immediately. Use short paragraphs.
- Avoid unnecessary filler words, disclaimers, or padding. Be efficient.
- If the user sends an image, analyze it thoroughly and respond helpfully.
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-mc-token, x-gemini-key');
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

  // 5. Validasi gambar jika ada
  const image = body.image; // { base64, mimeType }
  if (image) {
    if (!image.base64 || !image.mimeType) {
      return res.status(400).json({ error: 'Format gambar tidak valid.' });
    }
    if (image.base64.length > MAX_IMAGE_B64_LEN) {
      return res.status(413).json({ error: 'Gambar terlalu besar. Maksimal 2MB.' });
    }
  }

  const key =
    req.headers['x-gemini-key'] ||
    process.env[cfg.keyEnv] ||
    process.env.GEMINI_KEY_1 ||
    process.env.GEMINI_KEY_2 ||
    process.env.GEMINI_KEY_3 ||
    process.env.GEMINI_KEY_4 ||
    process.env.GEMINI_API_KEY ||
    process.env.GEMINI_KEY;

  if (!key) {
    return res.status(500).json({
      error: 'Gemini API Key belum dikonfigurasi. Silakan masukkan API Key Anda melalui tombol "Atur API Key" di menu samping atau klik tombol di bawah. [E-NOKEY]'
    });
  }

  const generationConfig = { maxOutputTokens: cfg.maxOut };

  // Build contents with optional image in the last user message
  const contents = trimmed.map((m, i) => {
    const parts = [{ text: String(m.content ?? '') }];
    // Attach image to the last user message only
    if (image && m.role === 'user' && i === trimmed.length - 1) {
      parts.push({
        inlineData: { mimeType: image.mimeType, data: image.base64 }
      });
    }
    return {
      role: m.role === 'assistant' ? 'model' : 'user',
      parts,
    };
  });

  // Check if client wants streaming
  const wantStream = body.stream !== false; // default: stream

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  const candidateModelIds = [cfg.id, ...(cfg.fallbacks || [])];

  try {
    if (wantStream) {
      // ===== SSE STREAMING MODE =====
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      let upstreamRes = null;
      let lastErrText = '';

      for (const modelId of candidateModelIds) {
        try {
          const attempt = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
              body: JSON.stringify({
                contents,
                systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
                generationConfig,
              }),
              signal: controller.signal,
            }
          );

          if (attempt.ok) {
            upstreamRes = attempt;
            break;
          }

          lastErrText = await attempt.text().catch(() => '');
          // If 404 (model not found), try next fallback model
          if (attempt.status === 404) {
            continue;
          }

          upstreamRes = attempt;
          break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
        }
      }

      clearTimeout(timeoutId);

      if (!upstreamRes || !upstreamRes.ok) {
        let errMsg = 'Permintaan ditolak oleh layanan AI.';
        const status = upstreamRes ? upstreamRes.status : 502;
        if (lastErrText.includes('API_KEY_INVALID') || lastErrText.includes('API key not valid')) {
          errMsg = 'API Key Gemini tidak valid. Silakan periksa kembali API Key Anda melalui tombol "Atur API Key". [E-KEY-INVALID]';
        } else if (status === 429) {
          errMsg = 'Kuota Gemini API sedang habis atau dibatasi sementara. Coba lagi dalam beberapa saat. [E-429]';
        } else if (status === 404) {
          errMsg = 'Model AI yang dipilih sedang tidak tersedia dari Google. [E-404]';
        } else {
          errMsg = `Permintaan ditolak oleh model (E-${status}). ${scrub(lastErrText)}`;
        }
        res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Stream chunks from Gemini → SSE to client
      const reader = upstreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr || jsonStr === '[DONE]') continue;

          try {
            const chunk = JSON.parse(jsonStr);
            const text = (chunk.candidates?.[0]?.content?.parts || [])
              .filter((p) => p && typeof p.text === 'string' && !p.thought)
              .map((p) => p.text)
              .join('');

            if (text) {
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          } catch {
            // skip malformed chunks
          }
        }
      }

      res.write('data: [DONE]\n\n');
      return res.end();

    } else {
      // ===== NON-STREAMING FALLBACK =====
      let upstreamRes = null;
      let lastErrText = '';

      for (const modelId of candidateModelIds) {
        try {
          const attempt = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
              body: JSON.stringify({
                contents,
                systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
                generationConfig,
              }),
              signal: controller.signal,
            }
          );

          if (attempt.ok) {
            upstreamRes = attempt;
            break;
          }

          lastErrText = await attempt.text().catch(() => '');
          if (attempt.status === 404) {
            continue;
          }

          upstreamRes = attempt;
          break;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
        }
      }

      clearTimeout(timeoutId);

      if (!upstreamRes || !upstreamRes.ok) {
        const status = upstreamRes ? upstreamRes.status : 502;
        if (lastErrText.includes('API_KEY_INVALID') || lastErrText.includes('API key not valid')) {
          return res.status(400).json({ error: 'API Key Gemini tidak valid. Silakan periksa kembali API Key Anda. [E-KEY-INVALID]' });
        }
        if (status === 429) return res.status(429).json({ error: 'Kuota sedang habis. Coba lagi sebentar lagi.' });
        if (status === 404) return res.status(502).json({ error: 'Mode ini tidak tersedia untuk akun server. [E-404]' });
        return res.status(502).json({ error: `Permintaan ditolak (E-${status}). ${scrub(lastErrText)}` });
      }

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
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const msg = 'Permintaan timeout. [E-TIMEOUT]';
      if (wantStream) {
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      return res.status(504).json({ error: msg });
    }
    console.error('[vercel-api] gagal', err);
    const msg = 'Gagal memproses permintaan.';
    if (wantStream) {
      try {
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      } catch { /* headers already sent */ }
    }
    return res.status(502).json({ error: msg });
  }
}
