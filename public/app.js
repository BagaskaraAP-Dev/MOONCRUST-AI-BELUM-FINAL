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
  tokens: 0
};

// DOM
const el = (s) => document.querySelector(s);
const els = (s) => document.querySelectorAll(s);

const D = {
  sidebar:     el('#sidebar'),
  menuBtn:     el('#menuBtn'),
  btnNew:      el('#btnNew'),
  historyList: el('#historyList'),
  welcome:     el('#welcome'),
  chat:        el('#chat'),
  messages:    el('#messages'),
  input:       el('#input'),
  sendBtn:     el('#sendBtn'),
  previewModal: el('#previewModal'),
  previewFrame: el('#previewFrame'),
  closePreview: el('#closePreview'),
};

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

function appendMsg(m) {
  const row = document.createElement('div');
  row.className = `msg ${m.role === 'user' ? 'user' : 'ai'}`;
  row.id = m.id;

  const avatar = m.role === 'user' ? 'U' : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  const name = m.role === 'user' ? 'You' : 'Mooncrust';
  const t = new Date(m.ts || Date.now()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});

  row.innerHTML = `
    <div class="msg__avatar">${avatar}</div>
    <div class="msg__body">
      <div class="msg__head">
        <span class="msg__name">${name}</span>
        <span class="msg__time">${t}</span>
      </div>
      <div class="msg__text markdown-body">${m.role === 'user' ? esc(m.content) : renderMd(m.content)}</div>
      <div class="msg__actions">
        <button class="msg-act-btn" onclick="copyMsg('${m.id}')">📋 Copy</button>
      </div>
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

window.copyMsg = function(id) {
  const c = getCur();
  const m = c?.msgs.find(x => x.id === id);
  if (m) navigator.clipboard.writeText(m.content);
};

// ===== SEND + AI =====
async function send() {
  const txt = D.input.value.trim();
  if (!txt || S.busy) return;

  if (!S.curId) newConv();
  const c = getCur();

  if (c.msgs.length === 0) {
    c.title = txt.length > 35 ? txt.slice(0, 35) + '…' : txt;
    renderHistory();
  }

  const userMsg = { id: 'u_' + Date.now(), role: 'user', content: txt, ts: Date.now() };
  c.msgs.push(userMsg);
  save();

  D.welcome.style.display = 'none';
  D.chat.classList.add('show');
  appendMsg(userMsg);
  scrollEnd();

  D.input.value = '';
  D.input.style.height = 'auto';
  S.busy = true;

  // Typing indicator
  const typingId = 'typing_' + Date.now();
  const typingEl = document.createElement('div');
  typingEl.className = 'msg ai';
  typingEl.id = typingId;
  typingEl.innerHTML = `
    <div class="msg__avatar"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg></div>
    <div class="msg__body">
      <div class="msg__head"><span class="msg__name">Mooncrust Thinking...</span></div>
      <div class="msg__text"><div class="typing"><div class="typing__dot"></div><div class="typing__dot"></div><div class="typing__dot"></div></div></div>
    </div>
  `;
  D.messages.appendChild(typingEl);
  scrollEnd();

  const selectedModel = document.getElementById('modelSelect').value || 'mc-pro';

  try {
    const resp = await fetch('/api/chat', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-mc-token': window.MC_TOKEN
      },
      body: JSON.stringify({
        messages: c.msgs.map(m => ({ role: m.role, content: m.content })),
        model: selectedModel
      })
    });

    // Cek 401 langsung dari HTTP status — tidak bergantung pada teks pesan
    if (resp.status === 401) {
      sessionStorage.removeItem('mc_token');
      window.MC_TOKEN = '';
      document.getElementById('lockScreen').classList.add('show');
      document.getElementById('pinError').textContent = 'PIN salah, coba lagi.';
      throw new Error('PIN salah atau kedaluwarsa.');
    }

    const raw = await resp.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(`Server balas non-JSON (HTTP ${resp.status}): ${raw.slice(0, 150)}`);
    }

    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`);

    const aiText = data.choices?.[0]?.message?.content || 'Tidak ada respons.';
    const aiMsg = { id: 'a_' + Date.now(), role: 'assistant', content: aiText, ts: Date.now() };
    c.msgs.push(aiMsg);

    S.tokens += (data.usage?.total_tokens || (txt.length + aiText.length));
    save();

    typingEl.remove();
    appendMsg(aiMsg);
    scrollEnd();
  } catch (err) {
    typingEl.querySelector('.msg__text').innerHTML = `
      <p style="color:#ef4444;font-weight:600;">⚠️ ${esc(err.message)}</p>
    `;
  } finally {
    S.busy = false;
    D.input.focus();
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

  D.btnNew.addEventListener('click', newConv);



  D.menuBtn.addEventListener('click', () => {
    D.sidebar.classList.toggle('open');
    // add overlay
    let ov = document.querySelector('.sidebar-overlay');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'sidebar-overlay';
      document.body.appendChild(ov);
      ov.addEventListener('click', closeSidebar);
    }
    ov.classList.toggle('show');
  });

  D.closePreview.addEventListener('click', () => {
    D.previewModal.classList.remove('show');
    D.previewFrame.srcdoc = '';
  });

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
