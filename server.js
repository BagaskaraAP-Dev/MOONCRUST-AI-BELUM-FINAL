import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===================================================
// MOONCRUST-DEV NEURAL ENGINE (Built-in Standalone AI)
// ===================================================
const SYSTEM_CORE_PROMPT = `You are Mooncrust, an elite AI Senior Staff Software Engineer and Full-Stack Architect.
CRITICAL RULES: 
1. You MUST answer the user's question DIRECTLY and PRECISELY. Do NOT ramble. Do NOT pivot to unrelated topics (e.g., if asked a simple math question like 1+1, just answer the math question without bringing up Python or JavaScript). Keep your answers focused, highly relevant, and strictly bounded by the user's prompt.
2. If asked "siapa penciptamu" (who is your creator), you MUST say EXACTLY: "Bagaskara Amukti Palapa". Do NOT add extra context.
3. If asked "kapan dibuat" (when were you created), you MUST say EXACTLY: "Sumatera Selatan, Oku Timur, Buay Madang Kurungan Nyawa Saya Akan Terus dikembangkan". Do NOT add extra context.
4. When asked for the current date or time, output the exact current date/time in the format DD/MM/YYYY HH:MM. The current date/time is: \${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }).replace(',', '')}
5. If asked "siapa kamu sebenarnya", "siapa dirimu", or "who are you", provide a highly professional, cool, and confident introduction. State that you are "Mooncrust, seorang Senior Staff Software Engineer dan Full-Stack Architect". Highlight your expertise in High-Scalability Distributed Systems, Microservices, DevOps, and Clean Code. Make it sound like a top-tier Silicon Valley expert ready to solve any technical challenge. Also, state that you were created by "Bagaskara Amukti Palapa", and created in "Sumatera Selatan, Oku Timur, Buay Madang Kurungan Nyawa, dan akan terus dikembangkan".
6. Always format your responses with clean Markdown.
Never mention that you are powered by Gemini or any other external AI. You ARE Mooncrust.`;

function generateMooncrustResponse(userQuery, conversationHistory = []) {
  const q = userQuery.toLowerCase().trim();

  // Code Generation Patterns
  if (q.includes('buatkan') || q.includes('bikin') || q.includes('create') || q.includes('write') || q.includes('build') || q.includes('code')) {
    if (q.includes('html') || q.includes('landing page') || q.includes('website') || q.includes('ui') || q.includes('calculator') || q.includes('game')) {
      return `### 🚀 Mooncrust-DEV Code Generator: Web Application

Berikut adalah implementasi lengkap, modular, dan modern yang siap dijalankan langsung:

\`\`\`html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mooncrust-DEV App Preview</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card: #151c2e;
      --accent: #6366f1;
      --accent-glow: #818cf8;
      --text: #f3f4f6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', system-ui, sans-serif; }
    body {
      background: radial-gradient(circle at 50% 0%, #1e1b4b, var(--bg));
      color: var(--text);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      background: rgba(21, 28, 46, 0.8);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(99, 102, 241, 0.3);
      padding: 32px;
      border-radius: 20px;
      max-width: 480px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(99, 102, 241, 0.2);
    }
    h1 {
      font-size: 26px;
      background: linear-gradient(135deg, #a5b4fc, #6366f1);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }
    p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
    .btn {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: #fff;
      border: none;
      padding: 12px 28px;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(99, 102, 241, 0.6);
    }
    .badge {
      display: inline-block;
      padding: 4px 12px;
      background: rgba(99, 102, 241, 0.15);
      border: 1px solid rgba(99, 102, 241, 0.4);
      border-radius: 20px;
      font-size: 11px;
      color: #a5b4fc;
      margin-bottom: 16px;
      letter-spacing: 1px;
    }
  </style>
</head>
<body>
  <div class="card">
    <span class="badge">MOONCRUST-DEV ENGINE</span>
    <h1>Interactive Experience</h1>
    <p>Aplikasi ini dihasilkan secara otomatis oleh <strong>Mooncrust-DEV</strong> dengan standar performa tinggi dan UI responsif.</p>
    <button class="btn" onclick="alert('Halo dari Mooncrust-DEV!')">Klik untuk Interaksi</button>
  </div>
</body>
</html>
\`\`\`

### 💡 Keunggulan Arsitektur:
1. **Glassmorphism Design**: Menggunakan CSS backdrop-filter dan glow lighting.
2. **Ultra-Responsive**: Menggunakan dynamic unit dan viewport constraints.
3. **No External Dependencies**: Siap jalan di browser manapun tanpa instalasi tambahan.`;
    }

    if (q.includes('python') || q.includes('fastapi') || q.includes('flask') || q.includes('backend') || q.includes('api')) {
      return `### ⚡ Mooncrust-DEV: Full-Stack Python Backend

Berikut adalah arsitektur RESTful API modern berbasis **FastAPI** dengan validasi Pydantic, async endpoints, dan standard error handling:

\`\`\`python
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
import uvicorn

app = FastAPI(
    title="Mooncrust-DEV High-Performance API",
    description="Enterprise-grade REST API designed with Mooncrust Architecture",
    version="1.0.0"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data Schemas
class ProjectItem(BaseModel):
    id: Optional[int] = None
    name: str = Field(..., example="Mooncrust Project")
    description: str = Field(..., example="AI-driven engineering workspace")
    is_active: bool = True

# In-Memory Database Simulation
db_store: List[ProjectItem] = [
    ProjectItem(id=1, name="Mooncrust-DEV Core", description="Primary AI Engine"),
    ProjectItem(id=2, name="Cosmic Neural", description="Sub-second inference module")
]

@app.get("/api/health", status_code=status.HTTP_200_OK)
async def health_check():
    return {"status": "online", "engine": "Mooncrust-DEV v1.0", "healthy": True}

@app.get("/api/projects", response_model=List[ProjectItem])
async def get_projects():
    return db_store

@app.post("/api/projects", response_model=ProjectItem, status_code=status.HTTP_201_CREATED)
async def create_project(item: ProjectItem):
    item.id = len(db_store) + 1
    db_store.append(item)
    return item

@app.get("/api/projects/{item_id}", response_model=ProjectItem)
async def get_project(item_id: int):
    for project in db_store:
        if project.id == item_id:
            return project
    raise HTTPException(status_code=404, detail=f"Project with ID {item_id} not found")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
\`\`\`

### 🛠️ Cara Menjalankan:
\`\`\`bash
pip install fastapi uvicorn pydantic
python main.py
\`\`\`
Buka dokumentasi otomatis Swagger di: \`http://localhost:8000/docs\``;
    }
  }

  // General Explanation & Assistance
  return `### ★ Mooncrust Analysis

Halo! Saya adalah **Mooncrust-DEV**, sistem LLM & Coding Assistant cerdas Anda.

Mengenai pertanyaan Anda: *"**${userQuery}**"*

Berikut adalah penjelasan komprehensif dan panduan teknis terbaik:

#### 1. Ringkasan & Konsep Utama
Dalam arsitektur software modern, pendekatan optimal harus mengutamakan:
- **Scalability**: Memastikan sistem dapat menampung pertumbuhan beban secara linear.
- **Maintainability**: Penulisan kode yang modular dengan pemisahan dependensi (SoC).
- **Security & Efficiency**: Validasi input ketat, penanganan error asynchronous, dan optimasi query.

#### 2. Contoh Implementasi Rekomendasi
\`\`\`javascript
// Mooncrust Clean Implementation Pattern
async function executeMooncrustWorkflow(payload) {
  try {
    console.log('[Mooncrust-DEV] Processing task with high precision...');
    
    // Validasi data masukan
    if (!payload || Object.keys(payload).length === 0) {
      throw new Error('Payload tidak boleh kosong');
    }

    const result = {
      timestamp: new Date().toISOString(),
      status: 'SUCCESS',
      data: payload,
      engine: 'Mooncrust-DEV v1.0-Release'
    };

    return result;
  } catch (error) {
    console.error('[Mooncrust-DEV] Exception:', error.message);
    throw error;
  }
}
\`\`\`

#### 3. Rekomendasi Langkah Selanjutnya:
1. **Live Deployment**: Anda bisa langsung deploy project ini ke **Vercel**, **Render**, atau **Railway**.
2. **Cloud LLM Integration**: Masukkan API Key (Google Gemini / Groq / OpenAI) di menu **Settings** (ikon gear ⚙️) untuk mengaktifkan model multimodal & live streaming!
3. **Sandbox Testing**: Gunakan fitur **Run Code Preview** untuk mencoba hasil kode HTML/JS secara instan.

Ada modul atau fitur spesifik yang ingin saya buatkan selanjutnya?`;
}

// ===================================================
// API ROUTE: CHAT COMPLETION (Multi-Provider Support)
// ===================================================
app.post('/api/chat', async (req, res) => {
  const {
    messages = [],
    model = 'mooncrust-neural',
    provider = 'mooncrust',
    apiKey = '',
    temperature = 0.7,
    maxTokens = 2048,
    systemPrompt = SYSTEM_CORE_PROMPT
  } = req.body;

  if (!messages || messages.length === 0) {
    return res.status(400).json({ error: 'Messages array is required' });
  }

  const latestUserMessage = messages[messages.length - 1]?.content || '';

  // 1. BUILT-IN MOONCRUST NEURAL ENGINE (Always available, no key required)
  if (provider === 'mooncrust' || model === 'mooncrust-neural') {
    const aiResponse = generateMooncrustResponse(latestUserMessage, messages);
    return res.json({
      id: 'mc_' + Date.now(),
      model: 'mooncrust-neural-v1',
      provider: 'mooncrust',
      choices: [{
        message: {
          role: 'assistant',
          content: aiResponse
        },
        finish_reason: 'stop'
      }],
      usage: {
        prompt_tokens: latestUserMessage.length,
        completion_tokens: aiResponse.length,
        total_tokens: latestUserMessage.length + aiResponse.length
      }
    });
  }

  // 2. GOOGLE GEMINI API (Official REST endpoint)
  if (provider === 'gemini') {
    const activeKey = apiKey || process.env.GEMINI_API_KEY;
    if (!activeKey) {
      return res.status(400).json({
        error: 'Google Gemini API Key diperlukan. Silakan masukkan API Key di menu Settings (⚙️) atau set GEMINI_API_KEY di file .env!'
      });
    }

    try {
      const geminiModel = model.includes('gemini') ? model : 'gemini-3.6-flash';
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${activeKey}`;

      // Convert messages format for Gemini
      const contents = messages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

      const geminiBody = {
        contents,
        systemInstruction: {
          parts: [{ text: SYSTEM_CORE_PROMPT.replace(/\$\{([^}]+)\}/g, () => new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jakarta' }).replace(',', '')) }]
        },
        generationConfig: {
          temperature: parseFloat(temperature) || 0.7,
          maxOutputTokens: parseInt(maxTokens) || 2048
        }
      };

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'AI Engine Error');
      }

      const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Tidak ada respons dari AI.';

      return res.json({
        id: 'gemini_' + Date.now(),
        model: geminiModel,
        provider: 'gemini',
        choices: [{
          message: {
            role: 'assistant',
            content: generatedText
          },
          finish_reason: 'stop'
        }],
        usage: data.usageMetadata || {}
      });
    } catch (err) {
      console.error('[AI Engine Error]', err.message);
      let errMsg = err.message;
      const lowerMsg = errMsg.toLowerCase();
      if (lowerMsg.includes('quota') || lowerMsg.includes('limit') || lowerMsg.includes('429') || lowerMsg.includes('exhausted') || lowerMsg.includes('overloaded')) {
        errMsg = "Maaf limit token anda telah habis hubungi Bagaskara Amukti Palapa CP 082179808686";
      }
      return res.status(500).json({ error: errMsg });
    }
  }

  // 3. GROQ API (Ultra-fast LLaMA 3.3)
  if (provider === 'groq') {
    const activeKey = apiKey || process.env.GROQ_API_KEY;
    if (!activeKey) {
      return res.status(400).json({
        error: 'Groq API Key diperlukan. Silakan masukkan di Settings (⚙️) atau di .env!'
      });
    }

    try {
      const groqModel = model.includes('llama') || model.includes('mixtral') ? model : 'llama-3.3-70b-versatile';
      const groqUrl = 'https://api.groq.com/openai/v1/chat/completions';

      const fullMessages = [
        { role: 'system', content: systemPrompt || SYSTEM_CORE_PROMPT },
        ...messages
      ];

      const response = await fetch(groqUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeKey}`
        },
        body: JSON.stringify({
          model: groqModel,
          messages: fullMessages,
          temperature: parseFloat(temperature) || 0.7,
          max_tokens: parseInt(maxTokens) || 2048
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || 'Groq API Error');
      }

      return res.json(data);
    } catch (err) {
      console.error('[Groq API Error]', err.message);
      return res.status(500).json({ error: `Groq API Error: ${err.message}` });
    }
  }

  // 4. OLLAMA LOCAL (Local model instance)
  if (provider === 'ollama') {
    try {
      const ollamaUrl = req.body.endpoint || 'http://localhost:11434/api/chat';
      const ollamaModel = model || 'llama3';

      const response = await fetch(ollamaUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          messages: [
            { role: 'system', content: systemPrompt || SYSTEM_CORE_PROMPT },
            ...messages
          ],
          stream: false
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error('Ollama service unreachable on ' + ollamaUrl);
      }

      return res.json({
        id: 'ollama_' + Date.now(),
        model: ollamaModel,
        provider: 'ollama',
        choices: [{
          message: {
            role: 'assistant',
            content: data.message?.content || ''
          },
          finish_reason: 'stop'
        }]
      });
    } catch (err) {
      console.error('[Ollama Error]', err.message);
      return res.status(500).json({ error: `Ollama Connection Error: ${err.message}. Pastikan Ollama sedang berjalan di komputer Anda.` });
    }
  }

  // Default fallback
  const fallbackText = generateMooncrustResponse(latestUserMessage);
  return res.json({
    id: 'fallback_' + Date.now(),
    model: 'mooncrust-neural',
    choices: [{
      message: { role: 'assistant', content: fallbackText }
    }]
  });
});

// ===================================================
// API ROUTE: MODELS LIST & HEALTH
// ===================================================
app.get('/api/models', (req, res) => {
  res.json({
    providers: [
      {
        id: 'mooncrust',
        name: 'Mooncrust Neural Core (Built-in)',
        description: 'Instant zero-configuration AI engine. 100% Free & offline capable.',
        models: [
          { id: 'mooncrust-neural', name: 'Mooncrust-DEV v1.0 Ultra' },
          { id: 'mooncrust-code', name: 'Mooncrust Code Architect' }
        ]
      },
      {
        id: 'gemini',
        name: 'Google Gemini Cloud',
        description: 'Google AI Studio state-of-the-art multimodal reasoning',
        models: [
          { id: 'gemini-3.6-flash', name: 'Mooncrust-WEB DEV Ultra' },
          { id: 'gemini-2.5-flash', name: 'Mooncrust-WEB DEV Fast' },
          { id: 'gemini-2.5-pro', name: 'Mooncrust-WEB DEV Pro' }
        ]
      },
      {
        id: 'groq',
        name: 'Groq Cloud Engine',
        description: 'Sub-second speed powered by LPU chips',
        models: [
          { id: 'llama-3.3-70b-versatile', name: 'LLaMA 3.3 70B Versatile' },
          { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B 32k' }
        ]
      },
      {
        id: 'ollama',
        name: 'Ollama Local Instance',
        description: 'Local private models running directly on your CPU/GPU',
        models: [
          { id: 'llama3', name: 'Ollama LLaMA 3' },
          { id: 'deepseek-coder', name: 'DeepSeek Coder' },
          { id: 'mistral', name: 'Mistral 7B' }
        ]
      }
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    appName: 'Mooncrust-DEV',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime())
  });
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`★ MOONCRUST SERVER IS RUNNING!`);
  console.log(`🚀 URL: http://localhost:${PORT}`);
  console.log(`⚡ Ready for local testing and cloud deployment.`);
  console.log(`======================================================\n`);
});
