# 🌙 MOONCRUST-DEV — Intelligent AI Coding Suite & LLM Platform

**Mooncrust-DEV** adalah platform AI Assistant dan Coding Intelligence modern yang siap pakai dan siap deploy langsung ke cloud atau dijalankan di laptop secara lokal.

---

## 🚀 Fitur Utama

- **✨ Built-in Standalone AI Engine (Mooncrust Neural)**: Berfungsi 100% tanpa perlu API key external. Langsung menghasilkan kode rapi, arsitektur, penjelasan teknis, dan debugging.
- **🌐 Multi-Model Cloud Support**:
  - Google Gemini 2.0 Flash / 1.5 Pro (via Google AI Studio)
  - Groq Cloud (LLaMA 3.3 70B & Mixtral)
  - Ollama Local (LLaMA 3, DeepSeek Coder offline)
- **💻 Live HTML/JS Code Sandbox**: Fitur **"▶ Run Preview"** langsung mengeksekusi kode HTML/CSS/JS yang dibuat AI di dalam sandbox interaktif.
- **📋 Syntax Highlighting & Copy**: Format kode rapi dengan Highlight.js untuk 50+ bahasa.
- **🎙️ Voice Speech-to-Text**: Input perintah menggunakan suara secara langsung.
- **💾 Auto-Save & History**: Riwayat percakapan otomatis tersimpan di LocalStorage dengan fitur pencarian dan export Markdown.
- **⚙️ Dynamic Settings**: Kustomisasi System Prompt, Temperature, Max Tokens, dan API Keys kapan saja.

---

## 💻 Cara Menjalankan di Laptop

### 1. Jalankan Server:
```bash
npm start
```
Server akan aktif di: **`http://localhost:3000`**

### 2. Mode Pengembangan (Auto-Reload):
```bash
npm run dev
```

---

## ☁️ Panduan Deploy ke Cloud (Gratis)

### Opsi 1: Deploy ke Vercel (1-Click / CLI)
1. Install Vercel CLI: `npm i -g vercel`
2. Jalankan: `vercel`
3. Ikuti petunjuk di terminal. Konfigurasi sudah tersedia di `vercel.json`.

### Opsi 2: Deploy ke Render / Railway
1. Push repository ini ke GitHub / GitLab.
2. Hubungkan ke **Render.com** atau **Railway.app**.
3. Pilih **Web Service**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. (Opsional) Tambahkan Environment Variable: `GEMINI_API_KEY` atau `GROQ_API_KEY`.

---

© 2026 Mooncrust-DEV Team. All Rights Reserved.
