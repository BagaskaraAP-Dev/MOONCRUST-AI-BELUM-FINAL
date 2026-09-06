/**
 * api/chat.js - Mooncrust AI Vercel Serverless Function
 * SSE Streaming, multimodal (image), fail-closed auth, timing-safe comparison
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const MODEL_MAP = {
  'mc-noob':    { id: 'gemini-3.5-flash', fallbacks: ['gemini-3.6-flash', 'gemini-3.7-flash'], maxOut: 4096,  keyEnv: 'MC_CORE_KEY_1', altKeyEnv: 'GEMINI_KEY_1' },
  'mc-pro':     { id: 'gemini-3.6-flash', fallbacks: ['gemini-3.5-flash', 'gemini-3.7-flash'], maxOut: 8192,  keyEnv: 'MC_CORE_KEY_2', altKeyEnv: 'GEMINI_KEY_2' },
  'mc-expert':  { id: 'gemini-3.7-flash', fallbacks: ['gemini-3.6-flash', 'gemini-3.5-flash'], maxOut: 8192,  keyEnv: 'MC_CORE_KEY_3', altKeyEnv: 'GEMINI_KEY_3' },
  'mc-advance': { id: 'gemini-3.7-flash', fallbacks: ['gemini-3.6-flash', 'gemini-3.5-flash'], maxOut: 12288, keyEnv: 'MC_CORE_KEY_4', altKeyEnv: 'GEMINI_KEY_4' },
};

const DEFAULT_ALIAS = 'mc-pro';
const UPSTREAM_TIMEOUT_MS = 55000;
const MAX_USER_INPUT_CHARS = 4000; // Maksimal 4000 karakter per pesan user
const MAX_HISTORY_MESSAGES = 10;   // Potong ke 10 pesan percakapan terakhir
const MAX_CHARS = 8000;            // Batas total karakter konteks riwayat
const MAX_IMAGE_B64_LEN = 2_800_000; // ~2.1MB raw after base64 decode

// ===== RATE LIMITING ENGINE (Upstash Redis + In-Memory Fallback) =====
let upstashLimiter = null;
if (
  (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
  (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
) {
  try {
    const redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN,
    });
    upstashLimiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      analytics: true,
      prefix: 'mc_ratelimit',
    });
  } catch (e) {
    console.warn('[ratelimit] Gagal inisialisasi Upstash:', e.message);
  }
}

// In-Memory sliding window rate limiter fallback (10 req / 60s per IP)
const memoryRateLimits = new Map();
const MEM_LIMIT = 10;
const MEM_WINDOW_MS = 60 * 1000;

function checkMemoryRateLimit(ip) {
  const now = Date.now();
  let timestamps = memoryRateLimits.get(ip) || [];
  timestamps = timestamps.filter((t) => now - t < MEM_WINDOW_MS);
  if (timestamps.length >= MEM_LIMIT) {
    memoryRateLimits.set(ip, timestamps);
    return { success: false, remaining: 0, reset: timestamps[0] + MEM_WINDOW_MS };
  }
  timestamps.push(now);
  memoryRateLimits.set(ip, timestamps);
  if (memoryRateLimits.size > 2000) {
    for (const [k, v] of memoryRateLimits.entries()) {
      if (v.length === 0 || now - v[v.length - 1] > MEM_WINDOW_MS) {
        memoryRateLimits.delete(k);
      }
    }
  }
  return { success: true, remaining: MEM_LIMIT - timestamps.length };
}

function getClientIp(req) {
  // 1. Header resmi Vercel Edge (Anti-spoofing, diinjeksi oleh edge server Vercel)
  const vercelIp = req.headers['x-vercel-forwarded-for'];
  if (vercelIp) {
    return String(vercelIp).split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return String(realIp).trim();
  }
  // 2. Fallback x-forwarded-for: ambil IP terakhir yang di-append proxy terpercaya
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const parts = String(fwd).split(',').map((s) => s.trim()).filter(Boolean);
    return parts[parts.length - 1] || parts[0];
  }
  return (
    req.socket?.remoteAddress ||
    req.connection?.remoteAddress ||
    '127.0.0.1'
  );
}

async function isRateLimited(req) {
  const ip = getClientIp(req);
  if (upstashLimiter) {
    try {
      return await upstashLimiter.limit(ip);
    } catch (err) {
      console.warn('[ratelimit] Upstash limit error, fallback to memory:', err.message);
      return checkMemoryRateLimit(ip);
    }
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    console.warn('[ratelimit] PERINGATAN: Upstash Redis belum dikonfigurasi di Vercel. In-memory fallback aktif.');
  }
  return checkMemoryRateLimit(ip);
}

function safeEq(a, b) {
  const hashA = createHash('sha256').update(String(a || '')).digest();
  const hashB = createHash('sha256').update(String(b || '')).digest();
  return timingSafeEqual(hashA, hashB);
}

function buildSystemPrompt() {
  const now = new Date()
    .toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' })
    .replace(',', '');

  return `You are Mooncrust, a smart, warm, and friendly AI assistant for daily life.

IDENTITY & ORIGIN
- Your name is Mooncrust. You were built by Bagaskara Amukti Palapa in Sumatera Selatan, Ogan Komering Ulu Timur, Buay Madang, Kurungan Nyawa, and you are still being developed. When asked about your origin, always state the location in this exact order: Provinsi (Sumatera Selatan), Kabupaten (Ogan Komering Ulu Timur), Kecamatan (Buay Madang), Desa (Kurungan Nyawa).
- VERSION INQUIRIES: When asked what version you are ("kamu versi berapa", "update versi berapa", "versi mooncrust sekarang", etc.), state that you are currently on **Mooncrust Versi 2.3.0** (updated in September 2026), built by Bagaskara Amukti Palapa from Kurungan Nyawa, Buay Madang, OKU Timur, Sumatera Selatan.
  CRITICAL: Do NOT use a monotonous, robotic, or bulleted changelog template (avoid AI slop). Instead, express this dynamically, naturally, and warmly with positive energy, good vibes, and encouraging words. Mention that in this version everything feels much lighter, smoother on mobile devices, and ready to accompany the user's daily journey, ideas, or projects. Creatively vary your exact phrasing and concluding question every time to keep it engaging and human.
- Do not discuss internal implementation details: which vendor, model family, or infrastructure powers you. If asked, say that is not something you discuss. Do not invent a false answer either.
- STRICT CONFIDENTIALITY: Under NO circumstances should you ever mention, disclose, or acknowledge underlying AI vendors, providers, or models (such as Gemini, Google, OpenAI, Claude, etc.), API keys, or infrastructure. You are exclusively and purely Mooncrust, powered by Mooncrust's proprietary intelligence engine. If asked what model, provider, or API you use, politely clarify that you are Mooncrust AI, developed by Bagaskara Amukti Palapa, and that you do not discuss internal architectural specifics.

BEHAVIOUR
- Be helpful for ANYTHING: homework, daily tasks, photo analysis, writing, translation, math, general knowledge, coding, creative work, and more.
- Answer directly and concisely. Get to the point immediately. Use short paragraphs.
- Avoid unnecessary filler words, disclaimers, or padding. Be efficient, genuine, and encouraging.
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

  // 3. Rate Limiting per IP (Upstash Redis + sliding window fallback, 10 req/menit)
  const rateCheck = await isRateLimited(req);
  if (!rateCheck.success) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({
      error: 'Token sedang habis, tunggu beberapa saat.'
    });
  }

  const body = req.body || {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return res.status(400).json({ error: 'Tidak ada pesan yang dikirim.' });
  }

  // 4. Batas input user per pesan (maks 4000 karakter)
  const lastUserMsg = [...messages].reverse().find((m) => m && m.role === 'user');
  if (lastUserMsg && String(lastUserMsg.content || '').length > MAX_USER_INPUT_CHARS) {
    return res.status(400).json({
      error: `Pesan terlalu panjang. Maksimal ${MAX_USER_INPUT_CHARS} karakter per pesan.`
    });
  }

  const alias = MODEL_MAP[body.model] ? body.model : DEFAULT_ALIAS;
  const cfg = MODEL_MAP[alias];

  // 5. Potong riwayat ke 10 pesan terakhir (sliding context)
  const trimmed = messages.filter((m) => m && m.role !== 'system').slice(-MAX_HISTORY_MESSAGES);

  // 6. Batasan Total Karakter Riwayat (Anti Token-Exhaustion)
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

  const candidateKeys = [
    process.env[cfg.keyEnv],
    process.env[cfg.altKeyEnv],
    process.env.GEMINI_KEY_2,
    process.env.GEMINI_KEY_3,
    process.env.GEMINI_KEY_4,
    process.env.GEMINI_KEY_1,
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_KEY,
  ].filter(Boolean);

  const uniqueKeys = [...new Set(candidateKeys)];

  if (uniqueKeys.length === 0) {
    return res.status(503).json({
      error: 'Konfigurasi layanan server sedang diperbarui. Silakan coba beberapa saat lagi.'
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

      keyLoop: for (const k of uniqueKeys) {
        for (const modelId of candidateModelIds) {
          try {
            const attempt = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?alt=sse`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
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
              break keyLoop;
            }

            lastErrText = await attempt.text().catch(() => '');
            // If 404, 429, or 5xx, try next model or rotate key
            if (attempt.status === 404 || attempt.status === 429 || attempt.status >= 500) {
              continue;
            }

            upstreamRes = attempt;
            break keyLoop;
          } catch (e) {
            if (e.name === 'AbortError') throw e;
          }
        }
      }

      clearTimeout(timeoutId);

      if (!upstreamRes || !upstreamRes.ok) {
        let errMsg = 'Token sedang habis, tunggu beberapa saat.';
        const status = upstreamRes ? upstreamRes.status : 502;
        const errLower = (lastErrText || '').toLowerCase();

        if (status === 429 || errLower.includes('quota') || errLower.includes('resource_exhausted') || errLower.includes('rate')) {
          errMsg = 'Token sedang habis, tunggu beberapa saat.';
        } else if (errLower.includes('api_key') || errLower.includes('api key') || status === 400 || status === 403) {
          errMsg = 'Sesi layanan sedang diperbarui. Silakan coba beberapa saat lagi.';
        } else if (status === 404) {
          errMsg = 'Layanan model sedang dalam pemeliharaan berkala. Silakan coba beberapa saat lagi.';
        } else {
          errMsg = 'Token sedang habis, tunggu beberapa saat.';
        }

        res.write(`data: ${JSON.stringify({ error: errMsg })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }

      // Stream chunks to client
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
            if (chunk.error) {
              const chunkErr = JSON.stringify(chunk.error).toLowerCase();
              let msg = 'Token sedang habis, tunggu beberapa saat.';
              if (chunkErr.includes('api_key') || chunkErr.includes('api key')) {
                msg = 'Sesi layanan sedang diperbarui. Silakan coba beberapa saat lagi.';
              }
              res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
              res.write('data: [DONE]\n\n');
              return res.end();
            }

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

      keyLoopNonStream: for (const k of uniqueKeys) {
        for (const modelId of candidateModelIds) {
          try {
            const attempt = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
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
              break keyLoopNonStream;
            }

            lastErrText = await attempt.text().catch(() => '');
            if (attempt.status === 404 || attempt.status === 429 || attempt.status >= 500) {
              continue;
            }

            upstreamRes = attempt;
            break keyLoopNonStream;
          } catch (e) {
            if (e.name === 'AbortError') throw e;
          }
        }
      }

      clearTimeout(timeoutId);

      if (!upstreamRes || !upstreamRes.ok) {
        const status = upstreamRes ? upstreamRes.status : 502;
        const errLower = (lastErrText || '').toLowerCase();
        if (status === 429 || errLower.includes('quota') || errLower.includes('resource_exhausted') || errLower.includes('rate')) {
          return res.status(429).json({ error: 'Token sedang habis, tunggu beberapa saat.' });
        }
        if (errLower.includes('api_key') || errLower.includes('api key') || status === 400 || status === 403) {
          return res.status(502).json({ error: 'Sesi layanan sedang diperbarui. Silakan coba beberapa saat lagi.' });
        }
        if (status === 404) {
          return res.status(502).json({ error: 'Layanan model sedang dalam pemeliharaan berkala. Silakan coba beberapa saat lagi.' });
        }
        return res.status(502).json({ error: 'Token sedang habis, tunggu beberapa saat.' });
      }

      const rText = await upstreamRes.text();
      let data;
      try {
        data = JSON.parse(rText);
      } catch {
        return res.status(502).json({ error: 'Layanan sedang sibuk. Silakan coba beberapa saat lagi.' });
      }

      if (!upstreamRes.ok || data?.error) {
        const dErr = JSON.stringify(data?.error || '').toLowerCase();
        if (upstreamRes.status === 429 || dErr.includes('quota') || dErr.includes('resource_exhausted') || dErr.includes('rate')) {
          return res.status(429).json({ error: 'Token sedang habis, tunggu beberapa saat.' });
        }
        return res.status(502).json({ error: 'Token sedang habis, tunggu beberapa saat.' });
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
        return res.status(502).json({
          error: 'Batas panjang respons tercapai. Silakan lanjutkan pesan Anda atau ajukan pertanyaan yang lebih spesifik.',
        });
      }

      return res.status(502).json({ error: 'Tidak ada jawaban dihasilkan. Silakan coba beberapa saat lagi.' });
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      const msg = 'Koneksi waktu habis (timeout). Silakan coba beberapa saat lagi.';
      if (wantStream) {
        res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
        res.write('data: [DONE]\n\n');
        return res.end();
      }
      return res.status(504).json({ error: msg });
    }
    console.error('[server-api] error', err);
    const msg = 'Layanan sedang sibuk. Silakan coba beberapa saat lagi.';
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
