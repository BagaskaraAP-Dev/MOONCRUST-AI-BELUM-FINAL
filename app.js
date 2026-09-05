/* ===================================================
   MOONCRUST — CLIENT ENGINE
   =================================================== */

marked.setOptions({ breaks: true, gfm: true });
function renderMd(txt) {
  if (!txt) return '';
  return DOMPurify.sanitize(marked.parse(txt));
}

// State
const S = {
  convs: [],
  curId: null,
  busy: false,
  tokens: 0,
  pendingImage: null  // { base64, mimeType }
};

// DOM
const el = (s) => document.querySelector(s);
const els = (s) => document.querySelectorAll(s);

const D = {
  sidebar:     el('#sidebar'),
  menuBtn:     el('#menuBtn'),
  btnNew:      el('#btnNew'),
  btnExport:   el('#btnExport'),
  historyList: el('#historyList'),
  welcome:     el('#welcome'),
  chat:        el('#chat'),
  messages:    el('#messages'),
  input:       el('#input'),
  sendBtn:     el('#sendBtn'),
  micBtn:      el('#micBtn'),
  previewModal: el('#previewModal'),
  previewFrame: el('#previewFrame'),
  closePreview: el('#closePreview'),
  imageInput:   el('#imageInput'),
  imagePreview: el('#imagePreview'),
  previewImg:   el('#previewImg'),
  removeImage:  el('#removeImage'),
};

// ===== IMAGE HANDLING =====
const MAX_IMAGE_BYTES = 2 * 1024 * 1024; // 2MB (Vercel body limit is 4.5MB, base64 expands ~33%)

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Always compress through canvas to enforce size limit
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        const maxDim = 1200;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // Try progressively lower quality until under limit
        for (let q = 0.8; q >= 0.3; q -= 0.1) {
          const dataUrl = canvas.toDataURL('image/jpeg', q);
          const b64 = dataUrl.split(',')[1];
          if (b64.length * 0.75 <= MAX_IMAGE_BYTES) {
            resolve({ base64: b64, mimeType: 'image/jpeg' });
            return;
          }
        }
        // Last resort: lowest quality
        const dataUrl = canvas.toDataURL('image/jpeg', 0.3);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Gagal memuat gambar'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Gagal membaca file'));
    reader.readAsDataURL(file);
  });
}

function showImagePreview(base64, mimeType) {
  D.previewImg.src = `data:${mimeType};base64,${base64}`;
  D.imagePreview.classList.add('show');
}

function clearImagePreview() {
  S.pendingImage = null;
  D.imagePreview.classList.remove('show');
  D.previewImg.src = '';
  if (D.imageInput) D.imageInput.value = '';
}

// ===== PERSISTENCE =====
function save() {
  try {
    localStorage.setItem('mc_data', JSON.stringify({
      convs: S.convs, curId: S.curId, tokens: S.tokens
    }));
  } catch(e) {}
}

function load() {
  let token = sessionStorage.getItem('mc_token');
  if (token) {
    window.MC_TOKEN = token;
    document.getElementById('lockScreen').classList.remove('show');
  } else {
    // Selalu tampilkan lock screen jika belum login di sesi ini
    document.getElementById('lockScreen').classList.add('show');
  }
    
  try {
    const d = JSON.parse(localStorage.getItem('mc_data'));
    if (d) {
      S.convs = d.convs || [];
      S.curId = d.curId || null;
      S.tokens = d.tokens || 0;
    }
  } catch(e) {}
  renderHistory();
  if (S.curId) {
    const c = getCur();
    if (c && c.msgs.length) renderChat(c);
  }
}

// ===== CONVERSATIONS =====
function newConv() {
  const id = 'c_' + Date.now();
  S.convs.unshift({ id, title: 'Chat Baru', msgs: [], ts: Date.now() });
  S.curId = id;
  save();
  renderHistory();
  showWelcome();
  D.input.focus();
  closeSidebar();
}

function getCur() {
  return S.convs.find(c => c.id === S.curId);
}

function switchConv(id) {
  S.curId = id;
  save();
  renderHistory();
  const c = getCur();
  if (c && c.msgs.length) renderChat(c);
  else showWelcome();
  closeSidebar();
}

function deleteConv(id) {
  S.convs = S.convs.filter(c => c.id !== id);
  if (S.curId === id) {
    S.curId = S.convs[0]?.id || null;
    if (S.curId) { const c = getCur(); if (c?.msgs.length) renderChat(c); else showWelcome(); }
    else showWelcome();
  }
  save();
  renderHistory();
}

// ===== HISTORY =====
function renderHistory() {
  D.historyList.innerHTML = '';
  S.convs.forEach(c => {
    const d = document.createElement('div');
    d.className = `hist-item ${c.id === S.curId ? 'active' : ''}`;
    d.innerHTML = `
      <span class="hist-item__label">${esc(c.title)}</span>
      <button class="hist-item__del" title="Hapus">✕</button>
    `;
    d.addEventListener('click', (e) => {
      if (e.target.classList.contains('hist-item__del')) { deleteConv(c.id); return; }
      switchConv(c.id);
    });
    D.historyList.appendChild(d);
  });
}

// ===== DISPLAY =====
function showWelcome() {
  D.welcome.style.display = 'flex';
  D.chat.classList.remove('show');
  D.messages.innerHTML = '';
}

function renderChat(c) {
  D.welcome.style.display = 'none';
  D.chat.classList.add('show');
  D.messages.innerHTML = '';
  c.msgs.forEach(m => appendMsg(m));
  scrollEnd();
}

function appendMsg(m, imageDataUrl) {
  const row = document.createElement('div');
  row.className = `msg ${m.role === 'user' ? 'user' : 'ai'}`;
  row.id = m.id;

  const avatar = m.role === 'user' ? 'U' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const name = m.role === 'user' ? 'You' : 'Mooncrust';
  const t = new Date(m.ts || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const imgHtml = imageDataUrl ? `<img class="msg__image" src="${imageDataUrl}" alt="Uploaded" />` : '';

  const actionsHtml = `
      <div class="msg__actions">
        <button class="msg-act-btn" onclick="copyMsg('${m.id}', this)">📋 Salin</button>
        ${m.role === 'assistant' ? `<button class="msg-act-btn" onclick="speakMsg('${m.id}', this)">🔊 Dengar</button>` : ''}
      </div>
  `;

  row.innerHTML = `
    <div class="msg__avatar">${avatar}</div>
    <div class="msg__body">
      <div class="msg__head">
        <span class="msg__name">${name}</span>
        <span class="msg__time">${t}</span>
      </div>
      <div class="msg__text markdown-body">${m.role === 'user' ? esc(m.content) : renderMd(m.content)}</div>
      ${imgHtml}
      ${actionsHtml}
    </div>
  `;

  D.messages.appendChild(row);
  if (m.role === 'assistant') enhanceCode(row);
}

// ===== CODE ENHANCEMENT =====

function enhanceCode(container) {
  if (typeof hljs === 'undefined') return;
  container.querySelectorAll('pre').forEach(pre => {
    const code = pre.querySelector('code');
    if (!code) return;
    hljs.highlightElement(code);

    const cls = [...code.classList].find(c => c.startsWith('language-'));
    const lang = cls ? esc(cls.replace('language-','')) : 'code';
    const canRun = ['html','css','javascript','js','svg'].includes(lang.toLowerCase());

    const wrap = document.createElement('div');
    wrap.className = 'code-wrap';
    wrap.innerHTML = `
      <div class="code-bar">
        <span class="code-lang">${lang}</span>
        <div class="code-btns">
          ${canRun ? `<button class="code-btn code-btn--run" onclick="runPreview(this)">▶ Run</button>` : ''}
          <button class="code-btn" onclick="copyCode(this)">📋 Copy</button>
        </div>
      </div>
    `;
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
  });
}

// ===== CODE ACTIONS =====
window.copyCode = function(btn) {
  const code = btn.closest('.code-wrap').querySelector('code')?.innerText || '';
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '✅ Copied!';
    setTimeout(() => btn.textContent = '📋 Copy', 2000);
  });
};

window.runPreview = function(btn) {
  const code = btn.closest('.code-wrap').querySelector('code')?.innerText || '';
  D.previewFrame.srcdoc = code;
  D.previewModal.classList.add('show');
};

// ===== VOICE & ACTIONS =====
let currentSpeechBtn = null;

window.speakMsg = function(id, btn) {
  if (!('speechSynthesis' in window)) {
    alert('Browser ini tidak mendukung fitur Text-to-Speech.');
    return;
  }

  // If already speaking this message, toggle stop
  if (window.speechSynthesis.speaking && currentSpeechBtn === btn) {
    window.speechSynthesis.cancel();
    btn.innerHTML = '🔊 Dengar';
    btn.classList.remove('speaking');
    currentSpeechBtn = null;
    return;
  }

  // Stop any other speech
  window.speechSynthesis.cancel();
  if (currentSpeechBtn) {
    currentSpeechBtn.innerHTML = '🔊 Dengar';
    currentSpeechBtn.classList.remove('speaking');
  }

  const c = getCur();
  const m = c?.msgs.find(x => x.id === id);
  if (!m || !m.content) return;

  const cleanText = m.content
    .replace(/```[\s\S]*?```/g, 'cuplikan kode.')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_~>]/g, '')
    .trim();

  const utt = new SpeechSynthesisUtterance(cleanText);
  utt.lang = 'id-ID';
  utt.rate = 1.0;
  utt.pitch = 1.0;

  btn.innerHTML = '⏹ Berhenti';
  btn.classList.add('speaking');
  currentSpeechBtn = btn;

  utt.onend = () => {
    btn.innerHTML = '🔊 Dengar';
    btn.classList.remove('speaking');
    currentSpeechBtn = null;
  };

  utt.onerror = () => {
    btn.innerHTML = '🔊 Dengar';
    btn.classList.remove('speaking');
    currentSpeechBtn = null;
  };

  window.speechSynthesis.speak(utt);
};

window.copyMsg = function(id, btn) {
  const c = getCur();
  const m = c?.msgs.find(x => x.id === id);
  if (m) {
    navigator.clipboard.writeText(m.content).then(() => {
      if (btn) {
        const orig = btn.innerHTML;
        btn.innerHTML = '✅ Tersalin!';
        setTimeout(() => { btn.innerHTML = orig; }, 2000);
      }
    });
  }
};

window.usePrompt = function(promptText) {
  if (S.busy) return;
  D.input.value = promptText;
  D.input.dispatchEvent(new Event('input'));
  send();
};

// ===== SPEECH TO TEXT (MIC) =====
let recognition = null;
let isRecording = false;

function initSpeechRecognition() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (D.micBtn) {
      D.micBtn.title = 'Browser tidak mendukung voice input';
      D.micBtn.style.opacity = '0.5';
    }
    return;
  }

  recognition = new SpeechRec();
  recognition.lang = 'id-ID';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onstart = () => {
    isRecording = true;
    if (D.micBtn) D.micBtn.classList.add('listening');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    if (transcript) {
      if (D.input.value) {
        D.input.value += ' ' + transcript;
      } else {
        D.input.value = transcript;
      }
      D.input.dispatchEvent(new Event('input'));
      D.input.focus();
    }
  };

  recognition.onerror = (e) => {
    console.warn('Speech recognition error:', e.error);
    isRecording = false;
    if (D.micBtn) D.micBtn.classList.remove('listening');
  };

  recognition.onend = () => {
    isRecording = false;
    if (D.micBtn) D.micBtn.classList.remove('listening');
  };
}

function toggleMic() {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    alert('Browser kamu belum mendukung Voice Input (Speech-to-Text). Silakan gunakan browser Chrome.');
    return;
  }
  if (!recognition) initSpeechRecognition();

  if (isRecording) {
    recognition.stop();
  } else {
    try {
      recognition.start();
    } catch (e) {
      console.warn(e);
    }
  }
}

// ===== EXPORT CHAT =====
function exportCurrentChat() {
  const c = getCur();
  if (!c || !c.msgs || c.msgs.length === 0) {
    alert('Belum ada pesan untuk diekspor.');
    return;
  }

  let md = `# Percakapan: ${c.title || 'Mooncrust AI'}\n`;
  md += `Waktu Ekspor: ${new Date().toLocaleString('id-ID')}\n\n`;
  md += `---\n\n`;

  c.msgs.forEach(m => {
    const role = m.role === 'user' ? '👤 Anda' : '🤖 Mooncrust AI';
    const time = new Date(m.ts || Date.now()).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    md += `### [${time}] ${role}\n${m.content}\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = (c.title || 'chat').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  a.href = url;
  a.download = `Mooncrust_${safeName}_${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== SEND + AI (SSE STREAMING) =====
let currentAbort = null; // AbortController for current request

async function send() {
  const txt = D.input.value.trim();
  const hasImage = !!S.pendingImage;
  if ((!txt && !hasImage) || S.busy) return;

  if (!S.curId) newConv();
  const c = getCur();

  if (c.msgs.length === 0) {
    const titleTxt = txt || '📷 Foto';
    c.title = titleTxt.length > 35 ? titleTxt.slice(0, 35) + '…' : titleTxt;
    renderHistory();
  }

  const userMsg = { id: 'u_' + Date.now(), role: 'user', content: txt || '📷 Analisa foto ini', ts: Date.now() };
  const imageForApi = hasImage ? { ...S.pendingImage } : null;
  const imageDataUrl = hasImage ? `data:${S.pendingImage.mimeType};base64,${S.pendingImage.base64}` : null;
  if (hasImage) userMsg.hasImage = true;
  c.msgs.push(userMsg);
  save();

  D.welcome.style.display = 'none';
  D.chat.classList.add('show');
  appendMsg(userMsg, imageDataUrl);
  scrollEnd();

  clearImagePreview();
  D.input.value = '';
  D.input.style.height = 'auto';
  S.busy = true;

  // Create streaming response message placeholder
  const aiMsgId = 'a_' + Date.now();
  const aiRow = document.createElement('div');
  aiRow.className = 'msg ai';
  aiRow.id = aiMsgId;
  aiRow.innerHTML = `
    <div class="msg__avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
    <div class="msg__body">
      <div class="msg__head">
        <span class="msg__name">Mooncrust</span>
        <span class="msg__time">${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span>
      </div>
      <div class="msg__text markdown-body"><div class="typing"><div class="typing__dot"></div><div class="typing__dot"></div><div class="typing__dot"></div></div></div>
      <div class="msg__actions">
        <button class="msg-act-btn msg-act-btn--stop" id="stopBtn">⏹ Stop</button>
      </div>
    </div>
  `;
  D.messages.appendChild(aiRow);
  scrollEnd();

  // Setup AbortController
  currentAbort = new AbortController();
  const stopBtn = document.getElementById('stopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (currentAbort) currentAbort.abort();
    });
  }

  const selectedModel = document.getElementById('modelSelect').value || 'mc-pro';
  let fullText = '';

  try {
    const reqBody = {
      messages: c.msgs.map(m => ({ role: m.role, content: m.content })),
      model: selectedModel,
      stream: true
    };
    if (imageForApi) {
      reqBody.image = imageForApi;
    }

    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-mc-token': window.MC_TOKEN
      },
      body: JSON.stringify(reqBody),
      signal: currentAbort.signal
    });

    // Auth check
    if (resp.status === 401) {
      sessionStorage.removeItem('mc_token');
      window.MC_TOKEN = '';
      document.getElementById('lockScreen').classList.add('show');
      document.getElementById('pinError').textContent = 'PIN salah, coba lagi.';
      throw new Error('PIN salah atau kedaluwarsa.');
    }

    if (!resp.ok && resp.headers.get('content-type')?.includes('application/json')) {
      const errData = await resp.json();
      throw new Error(errData.error || `HTTP ${resp.status}`);
    }

    // Read SSE stream — render plain text while streaming, markdown at end
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const textEl = aiRow.querySelector('.msg__text');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (payload === '[DONE]') continue;

        try {
          const chunk = JSON.parse(payload);
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.text) {
            fullText += chunk.text;
            // Plain text during streaming — no markdown parse, no DOMPurify
            textEl.textContent = fullText;
            scrollEnd();
          }
        } catch (parseErr) {
          if (parseErr.message && !parseErr.message.includes('JSON')) {
            throw parseErr;
          }
        }
      }
    }

    // Finalize: single markdown pass + single enhanceCode pass
    if (!fullText) fullText = 'Tidak ada respons.';
    textEl.innerHTML = renderMd(fullText);
    enhanceCode(aiRow);

    // Save to conversation
    const aiMsg = { id: aiMsgId, role: 'assistant', content: fullText, ts: Date.now() };
    c.msgs.push(aiMsg);
    S.tokens += (txt.length + fullText.length);
    save();

    // Replace stop button with copy button
    const actionsEl = aiRow.querySelector('.msg__actions');
    if (actionsEl) {
      actionsEl.innerHTML = `<button class="msg-act-btn" onclick="copyMsg('${aiMsgId}')">📋 Copy</button>`;
    }

  } catch (err) {
    const textEl = aiRow.querySelector('.msg__text');
    if (err.name === 'AbortError') {
      // User pressed Stop
      if (fullText) {
        textEl.innerHTML = renderMd(fullText + '\n\n---\n*⏹ Dihentikan oleh pengguna*');
        enhanceCode(aiRow);
        const aiMsg = { id: aiMsgId, role: 'assistant', content: fullText, ts: Date.now() };
        c.msgs.push(aiMsg);
        save();
      } else {
        textEl.innerHTML = `<p style="color:var(--text3);font-style:italic;">⏹ Dihentikan sebelum ada jawaban.</p>`;
      }
    } else {
      textEl.innerHTML = `<p style="color:#ef4444;font-weight:600;">⚠️ ${esc(err.message)}</p>`;
    }
    // Replace stop with copy anyway
    const actionsEl = aiRow.querySelector('.msg__actions');
    if (actionsEl && fullText) {
      actionsEl.innerHTML = `<button class="msg-act-btn" onclick="copyMsg('${aiMsgId}')">📋 Copy</button>`;
    } else if (actionsEl) {
      actionsEl.innerHTML = '';
    }
  } finally {
    currentAbort = null;
    S.busy = false;
    D.input.focus();
    scrollEnd();
  }
}

// ===== UTILITIES =====
function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function scrollEnd() { D.chat.scrollTop = D.chat.scrollHeight; }
function closeSidebar() { D.sidebar.classList.remove('open'); document.querySelector('.sidebar-overlay')?.classList.remove('show'); }

// ===== EVENTS =====
function init() {
  load();

  D.sendBtn.addEventListener('click', send);
  D.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });
  D.input.addEventListener('input', () => {
    D.input.style.height = 'auto';
    D.input.style.height = Math.min(D.input.scrollHeight, 180) + 'px';
  });

  D.input.addEventListener('focus', () => {
    setTimeout(() => {
      scrollEnd();
    }, 320);
  });

  D.btnNew.addEventListener('click', newConv);

  if (D.btnExport) {
    D.btnExport.addEventListener('click', exportCurrentChat);
  }
  const btnExportTop = el('#btnExportTop');
  if (btnExportTop) {
    btnExportTop.addEventListener('click', exportCurrentChat);
  }

  const btnClearCache = el('#btnClearCache');
  if (btnClearCache) {
    btnClearCache.addEventListener('click', () => {
      if (confirm('Bersihkan semua cache dan muat ulang halaman?')) {
        try {
          localStorage.clear();
          sessionStorage.clear();
          if ('caches' in window) {
            caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
          }
        } catch(e) {}
        window.location.href = window.location.pathname + '?nocache=' + Date.now();
      }
    });
  }

  if (D.micBtn) {
    D.micBtn.addEventListener('click', toggleMic);
  }
  initSpeechRecognition();

  D.menuBtn.addEventListener('click', () => {
    const isOpen = D.sidebar.classList.toggle('open');
    let ov = document.querySelector('.sidebar-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'sidebar-overlay';
      document.body.appendChild(ov);
      ov.addEventListener('click', closeSidebar);
    }
    if (isOpen) {
      ov.classList.add('show');
    } else {
      ov.classList.remove('show');
    }
  });

  D.closePreview.addEventListener('click', () => {
    D.previewModal.classList.remove('show');
    D.previewFrame.srcdoc = '';
  });

  // Image upload handlers
  if (D.imageInput) {
    D.imageInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        alert('Hanya file gambar yang diizinkan.');
        D.imageInput.value = '';
        return;
      }
      try {
        const compressed = await compressImage(file);
        S.pendingImage = compressed;
        showImagePreview(compressed.base64, compressed.mimeType);
        D.input.focus();
      } catch (err) {
        alert('Gagal memproses gambar: ' + err.message);
        D.imageInput.value = '';
      }
    });
  }

  if (D.removeImage) {
    D.removeImage.addEventListener('click', clearImagePreview);
  }

  // Lock screen logic
  const pinInput = document.getElementById('pinInput');
  const pinBtn = document.getElementById('pinSubmitBtn');
  const pinError = document.getElementById('pinError');
  
  const submitPin = async () => {
    const val = pinInput.value.trim();
    if (!val) { pinError.textContent = 'Token tidak boleh kosong'; return; }

    pinError.textContent = 'Memeriksa…';
    pinBtn.disabled = true;
    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-mc-token': val },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }] })
      });

      if (r.status === 401) {
        pinError.textContent = 'Token salah. Akses ditolak.';
        pinInput.value = '';
        pinInput.focus();
        return;
      }
      if (r.status === 503) {
        pinError.textContent = 'Server belum dikonfigurasi (APP_SECRET kosong).';
        return;
      }

      sessionStorage.setItem('mc_token', val);
      window.MC_TOKEN = val;
      document.getElementById('lockScreen').classList.remove('show');
      pinError.textContent = '';
      pinInput.value = '';
      D.input.focus();
    } catch (e) {
      pinError.textContent = 'Gagal terhubung ke server.';
    } finally {
      pinBtn.disabled = false;
    }
  };
  
  pinBtn.addEventListener('click', submitPin);
  pinInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') submitPin();
  });

  if (!document.getElementById('lockScreen').classList.contains('show')) {
    D.input.focus();
  }
}

document.addEventListener('DOMContentLoaded', init);
