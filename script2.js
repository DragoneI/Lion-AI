// ═══════════════ CONFIGURATION ═══════════════
const SUPABASE_URL = "https://jiycrapjqclvcsrvdldt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppeWNyYXBqcWNsdmNzcnZkbGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTE4NDUsImV4cCI6MjA5NDQyNzg0NX0.wIOoCURRDLmws-frss9g4pG4UBgH4jSLhNezJsc5JdM";
const WORKER_URL = "https://lionchatbot.dragonetechnology.workers.dev/";

// ═══════════════ SUPABASE ═══════════════
var supabase;
(function() {
  if (window._lionSupabase) {
    supabase = window._lionSupabase;
  } else {
    window._lionSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabase = window._lionSupabase;
  }
})();

// ═══════════════ HEADERS WORKER ═══════════════
async function workerHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token || '';
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` };
}

// ═══════════════ ÉTAT GLOBAL ═══════════════
let currentUser = null;
let currentConvId = null;
let isGenerating = false;
let abortController = null;
let webSearchForced = false;
const MAX_CONTEXT_TOKENS = 1500;
const MAX_HISTORY_MESSAGES = 6;
const MAX_FILE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_MB = 5;
let ctxTargetIdx = null;
let stoppedConvId = null;
let stoppedPartial = '';
let continueBannerEl = null;
let conversations = {};
let conversationListPage = 0;
const CONVERSATIONS_PER_PAGE = 20;
let convSearchQuery = ''; // ★ filtre de recherche sidebar

// ═══════════════ DOM ═══════════════
const $ = (id) => document.getElementById(id);
const sidebar      = $('sidebar');
const overlay      = $('overlay');
const hamburgerBtn = $('hamburgerBtn');
const newChatSBtn  = $('newChatSidebarBtn');
const newChatTBtn  = $('newChatTopBtn');
const convList     = $('conversationList');
const chatCont     = $('chatContainer');
const userInput    = $('userInput');
const sendBtn      = $('sendBtn');
const webSearchBtn = $('webSearchBtn');
const logoutBtn    = $('logoutBtn');
const ctxMenu      = $('ctxMenu');
const ragUploadBtn = $('ragUploadBtn');
const ragFileInput = $('ragFileInput');
const imgUploadBtn = $('imgUploadBtn');
const imgFileInput = $('imgFileInput');
const micBtn       = $('micBtn');

// ═══════════════ ICÔNES SVG ═══════════════
const SVG = {
  copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  edit: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  retry: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>`,
  thumbUp: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/><path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`,
  thumbDown: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/><path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/></svg>`,
  doc: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  globe: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  search: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  warning: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  image: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
  logout: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`
};

// ═══════════════ UTILITAIRES ═══════════════
function esc(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function md(t) {
  let o = esc(t);
  o = o.replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  o = o.replace(/`([^`]+)`/g, '<code>$1</code>');
  o = o.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  o = o.replace(/\*(.+?)\*/g, '<em>$1</em>');
  o = o.replace(/\n/g, '<br>');
  return o;
}

function scroll() { chatCont.scrollTop = chatCont.scrollHeight; }

// ═══════════════ VALIDATION FICHIERS ═══════════════
function validateFileSize(file, maxMB) {
  if (file.size > maxMB * 1024 * 1024) {
    showRagToast(`Fichier trop volumineux (max ${maxMB} Mo)`);
    return false;
  }
  return true;
}

// ═══════════════ MONITORING ═══════════════
const analyticsQueue = [];
function logAnalytics(data) {
  analyticsQueue.push(data);
  console.log(`[Lion AI] ${data.status} | ${data.duration_ms}ms | IN:${data.tokens_input} OUT:${data.tokens_output} | Search:${data.has_search}`);
}
async function flushAnalytics() {
  if (analyticsQueue.length === 0 || !currentUser) return;
  const batch = analyticsQueue.splice(0);
  const rows = batch.map(d => ({
    user_id: currentUser.id, query: d.query, response: d.response?.slice(0, 500),
    duration_ms: d.duration_ms, tokens_input: d.tokens_input, tokens_output: d.tokens_output,
    status: d.status, has_search: d.has_search
  }));
  try { await supabase.from('analytics').insert(rows); } catch (e) { console.warn('Analytics flush failed:', e.message); }
}
setInterval(flushAnalytics, 10000);
window.addEventListener('beforeunload', () => flushAnalytics());

// ═══════════════ SYSTEM PROMPT ═══════════════
function sysPrompt(userLang) {
  const lang = userLang || 'fr';
  const langMap = { fr: 'français', en: 'English', ar: 'العربية', es: 'español', de: 'Deutsch', it: 'italiano', pt: 'português' };
  const langName = langMap[lang] || 'français';
  return `LANGUE OBLIGATOIRE : Réponds UNIQUEMENT en ${langName}. Toutes tes réponses doivent être en ${langName}, même si les résultats web ou documents sont dans une autre langue — traduis-les.

Tu es Lion AI, un assistant IA. Sois direct et concis (1-4 phrases max sauf si détail nécessaire). Code dans \`\`\`. Pas de sources ni URLs.

RAPPEL FINAL : Réponds en ${langName}.`;
}

function detectLanguage(text) {
  if (!text || text.trim().length < 3) return 'fr';
  const t = text.toLowerCase().trim();
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/(hola|gracias|cómo estás|qué tal|en español|puedes|hacer esto)/.test(t)) return 'es';
  if (/(wie geht|danke|bitte|können sie|auf deutsch|guten tag)/.test(t)) return 'de';
  if (/(ciao|grazie|come stai|in italiano|cosa fare)/.test(t)) return 'it';
  if (/(olá|obrigado|como vai|em português|você pode)/.test(t)) return 'pt';
  const enWords = (t.match(/\b(hello|hi there|how are|what is|can you|please|tell me|in english|i need|i want|i would)\b/g) || []).length;
  if (enWords >= 2) return 'en';
  return 'fr';
}

// ═══════════════ DÉCONNEXION ═══════════════
function showLogoutConfirmDialog() {
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-label', 'Confirmation de déconnexion');
  const modalBox = document.createElement('div');
  modalBox.style.cssText = 'background:#fff;border-radius:16px;padding:1.8rem 1.5rem 1.5rem;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);text-align:center;animation:modalSlideIn 0.2s ease;';
  modalBox.innerHTML = `
    <div style="width:48px;height:48px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;" aria-hidden="true">
      ${SVG.logout.replace('width="14" height="14"','width="20" height="20"').replace('stroke="currentColor"','stroke="#EF4444"')}
    </div>
    <h3 style="font-size:1.1rem;font-weight:600;color:#111827;margin-bottom:0.4rem;">Se déconnecter ?</h3>
    <p style="font-size:0.85rem;color:#6B7280;margin-bottom:1.5rem;line-height:1.5;">Vous serez redirigé vers la page de connexion.<br>Vos conversations sont sauvegardées.</p>
    <div style="display:flex;gap:0.6rem;">
      <button id="modalCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1.5px solid #E5E7EB;background:#fff;font-family:inherit;font-size:0.85rem;font-weight:500;cursor:pointer;color:#374151;">Annuler</button>
      <button id="modalConfirmBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:#EF4444;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;">Déconnexion</button>
    </div>`;
  modalOverlay.appendChild(modalBox);
  document.body.appendChild(modalOverlay);
  const styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes modalSlideIn{from{opacity:0;transform:translateY(12px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}';
  document.head.appendChild(styleEl);
  const closeModal = () => { modalOverlay.remove(); styleEl.remove(); };
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalConfirmBtn').addEventListener('click', async () => {
    closeModal(); await flushAnalytics(); await supabase.auth.signOut(); window.location.href = 'login.html';
  });
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', function escHandler(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } });
}
logoutBtn.addEventListener('click', showLogoutConfirmDialog);

// ★ Modale de confirmation générique (remplace confirm() natif)
function showConfirmDialog(title, message, onConfirm, confirmLabel = 'Confirmer') {
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
  modalOverlay.setAttribute('role', 'dialog');
  modalOverlay.setAttribute('aria-modal', 'true');
  modalOverlay.setAttribute('aria-label', title);
  const modalBox = document.createElement('div');
  modalBox.style.cssText = 'background:#fff;border-radius:16px;padding:1.8rem 1.5rem 1.5rem;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);text-align:center;animation:modalSlideIn 0.2s ease;';
  modalBox.innerHTML = `
    <div style="width:48px;height:48px;border-radius:50%;background:#FEF2F2;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;" aria-hidden="true">
      ${SVG.warning.replace('width="14" height="14"','width="22" height="22"').replace('stroke="currentColor"','stroke="#EF4444"')}
    </div>
    <h3 style="font-size:1.1rem;font-weight:600;color:#111827;margin-bottom:0.4rem;">${esc(title)}</h3>
    <p style="font-size:0.85rem;color:#6B7280;margin-bottom:1.5rem;line-height:1.5;">${esc(message)}</p>
    <div style="display:flex;gap:0.6rem;">
      <button id="confirmCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1.5px solid #E5E7EB;background:#fff;font-family:inherit;font-size:0.85rem;font-weight:500;cursor:pointer;color:#374151;">Annuler</button>
      <button id="confirmOkBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:#EF4444;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;">${esc(confirmLabel)}</button>
    </div>`;
  modalOverlay.appendChild(modalBox);
  document.body.appendChild(modalOverlay);
  const styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes modalSlideIn{from{opacity:0;transform:translateY(12px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}';
  document.head.appendChild(styleEl);
  const closeModal = () => { modalOverlay.remove(); styleEl.remove(); };
  modalOverlay.querySelector('#confirmCancelBtn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#confirmOkBtn').addEventListener('click', () => { closeModal(); onConfirm(); });
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', function escHandler(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } });
}

// ═══════════════ SUPABASE DATA (paginated) ═══════════════
async function loadConversationsFromDB(page = 0) {
  if (!currentUser) return;
  const from = page * CONVERSATIONS_PER_PAGE;
  const to = from + CONVERSATIONS_PER_PAGE - 1;
  const { data: convs, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('updated_at', { ascending: false })
    .range(from, to);
  if (error || !convs || convs.length === 0) return;
  for (const conv of convs) {
    if (conversations[conv.id]) continue;
    conversations[conv.id] = {
      id: conv.id,
      title: conv.title,
      messages: [],
      contextMessages: [],
      cache: {},
      _messagesLoaded: false,
      updatedAt: conv.updated_at
    };
  }
  conversationListPage = page;
}

async function loadMessagesForConversation(convId) {
  if (!currentUser || !conversations[convId]) return;
  const conv = conversations[convId];
  if (conv._messagesLoaded) return;
  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: true });
  conv.messages = (messages || []).map(m => ({
    role: m.role, content: m.content, timestamp: m.created_at,
    webSearch: m.web_search, cached: m.cached
  }));
  conv.contextMessages = (messages || [])
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));
  conv._messagesLoaded = true;
}

async function saveConversationToDB(conv) {
  if (!currentUser || !conv) return;
  const now = new Date().toISOString();
  await supabase.from('conversations').upsert({
    id: conv.id, user_id: currentUser.id, title: conv.title,
    updated_at: now
  });
  conv.updatedAt = now;
}

async function saveMessageToDB(convId, msg) {
  if (!currentUser || !convId) return;
  await supabase.from('messages').insert({
    conversation_id: convId, user_id: currentUser.id,
    role: msg.role, content: msg.content,
    web_search: msg.webSearch || false, cached: msg.cached || false
  });
}

async function loadCacheFromDB() {
  if (!currentUser) return;
  const { data } = await supabase
    .from('response_cache')
    .select('*')
    .eq('user_id', currentUser.id);
  if (data && currentConvId && conversations[currentConvId]) {
    data.forEach(row => {
      conversations[currentConvId].cache[row.cache_key] = row.response;
    });
  }
}

async function saveCacheToDB(key, response) {
  if (!currentUser) return;
  await supabase.from('response_cache').upsert(
    { user_id: currentUser.id, cache_key: key, response: response },
    { onConflict: 'user_id, cache_key' }
  );
}

// ═══════════════ CONVERSATIONS ═══════════════
function createConv(title) {
  const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
  const welcome = "Bonjour ! Je suis Lion AI. Comment puis-je vous aider ?";
  const now = new Date().toISOString();
  const conv = {
    id, title: title || 'Nouvelle discussion',
    messages: [{ role: 'assistant', content: welcome, timestamp: now }],
    contextMessages: [
      { role: 'system', content: sysPrompt('fr') },
      { role: 'assistant', content: welcome }
    ],
    cache: {},
    _messagesLoaded: true,
    updatedAt: now
  };
  conversations[id] = conv;
  saveConversationToDB(conv);
  saveMessageToDB(id, { role: 'assistant', content: welcome });
  return id;
}

async function switchConv(id) {
  currentConvId = id;
  clearContinueBanner();
  await loadMessagesForConversation(id);
  loadCacheFromDB();
  renderConvList();
  renderChat();
  closeSidebar();
}

function openSidebar()  { sidebar.classList.add('open'); overlay.classList.add('on'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('on'); }

// ★ Barre de recherche des conversations (injectée une seule fois)
function injectConvSearchBox() {
  if (document.getElementById('convSearchInput')) return;
  const wrap = document.createElement('div');
  wrap.className = 'conv-search-wrap';
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'convSearchInput';
  input.className = 'conv-search-input';
  input.placeholder = 'Rechercher une conversation…';
  input.setAttribute('aria-label', 'Rechercher une conversation');
  input.addEventListener('input', () => {
    convSearchQuery = input.value.trim().toLowerCase();
    renderConvList();
  });
  wrap.appendChild(input);
  convList.parentNode.insertBefore(wrap, convList);
}

function renderConvList() {
  convList.innerHTML = '';
  let ids = Object.keys(conversations);

  if (convSearchQuery) {
    ids = ids.filter(id => conversations[id].title.toLowerCase().includes(convSearchQuery));
  }

  if (ids.length === 0) {
    convList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--gray-400);font-size:0.85rem;">' +
      (convSearchQuery ? 'Aucun résultat' : 'Aucune conversation') + '</div>';
    return;
  }

  ids.sort((a, b) => {
    const ua = conversations[a].updatedAt || '';
    const ub = conversations[b].updatedAt || '';
    return ub.localeCompare(ua);
  }).forEach(id => {
    const c = conversations[id];
    const el = document.createElement('div');
    el.className = 'conversation-item' + (id === currentConvId ? ' active' : '');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', c.title);
    el.innerHTML = '<span class="conversation-title">' + esc(c.title) + '</span>' +
      '<button class="rename-conv-btn" title="Renommer" aria-label="Renommer la conversation">' + SVG.edit + '</button>' +
      '<button class="delete-conv-btn" title="Supprimer" aria-label="Supprimer la conversation">✕</button>';

    el.addEventListener('click', e => {
      if (
        e.target.closest('.delete-conv-btn') ||
        e.target.closest('.rename-conv-btn') ||
        e.target.tagName === 'INPUT'
      ) return;
      switchConv(id);
    });
    el.addEventListener('keydown', e => {
      if (
        e.target.closest('.delete-conv-btn') ||
        e.target.closest('.rename-conv-btn') ||
        e.target.tagName === 'INPUT'
      ) return;
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchConv(id); }
    });

    el.querySelector('.rename-conv-btn').addEventListener('click', e => {
      e.stopPropagation();
      startRenameConv(id, el);
    });

    el.querySelector('.delete-conv-btn').addEventListener('click', e => {
      e.stopPropagation();
      showConfirmDialog(
        'Supprimer la conversation ?',
        'Cette action est irréversible. Tous les messages de cette conversation seront définitivement supprimés.',
        async () => {
          if (currentUser) await supabase.from('conversations').delete().eq('id', id);
          delete conversations[id];
          const rem = Object.keys(conversations);
          if (rem.length) {
            currentConvId = rem[0];
            await loadMessagesForConversation(currentConvId);
            loadCacheFromDB();
          } else {
            currentConvId = null;
          }
          renderConvList();
          renderChat();
        },
        'Supprimer'
      );
    });

    convList.appendChild(el);
  });

  // Bouton "Charger plus" — masqué pendant une recherche pour éviter la confusion
  if (!convSearchQuery) {
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'load-more-btn';
    loadMoreBtn.textContent = 'Charger plus…';
    loadMoreBtn.style.cssText = 'width:100%;padding:0.6rem;margin-top:0.5rem;border:1px dashed var(--gray-300);border-radius:8px;background:transparent;color:var(--gray-500);cursor:pointer;font-family:inherit;font-size:0.8rem;';
    loadMoreBtn.addEventListener('click', async () => {
      await loadConversationsFromDB(conversationListPage + 1);
      renderConvList();
    });
    convList.appendChild(loadMoreBtn);
  }
}

// ★ Renommage inline d'une conversation
function startRenameConv(id, el) {
  const conv = conversations[id];
  const titleSpan = el.querySelector('.conversation-title');
  if (!conv || !titleSpan) return;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'conversation-title-input';
  input.value = conv.title;
  input.setAttribute('aria-label', 'Nouveau nom de la conversation');
  titleSpan.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;
  const commit = async () => {
    if (committed) return;
    committed = true;
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== conv.title) {
      conv.title = newTitle;
      await saveConversationToDB(conv);
    }
    renderConvList();
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); input.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); committed = true; renderConvList(); }
  });
  input.addEventListener('click', e => e.stopPropagation());
}

// ═══════════════ RECHERCHE WEB ═══════════════
async function searchWeb(query) {
  try {
    const headers = await workerHeaders();
    const r = await fetch(WORKER_URL + 'search', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query })
    });
    if (!r.ok) return null;
    const d = await r.json();
    if (d.results?.length) {
      return d.results.slice(0, 5).map(r => ({ snippet: r.snippet || r.title || '' }));
    }
    return null;
  } catch (e) {
    console.warn('Search error:', e.message);
    return null;
  }
}

// ═══════════════ RAG ═══════════════
async function uploadDocument(file) {
  if (!currentUser) return;
  if (!validateFileSize(file, MAX_FILE_SIZE_MB)) return;

  ragUploadBtn.classList.add('uploading');
  ragUploadBtn.setAttribute('aria-busy', 'true');

  try {
    let content;

    if (file.name.endsWith('.pdf')) {
      content = await extractPdfText(file);
    } else {
      content = await readFileAsText(file);
    }

    if (!content || content.trim().length === 0) {
      showRagToast('Aucun contenu texte trouvé dans ce fichier');
      ragUploadBtn.classList.remove('uploading');
      ragUploadBtn.setAttribute('aria-busy', 'false');
      return;
    }

    const filename = file.name;
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({ user_id: currentUser.id, filename, content })
      .select('id')
      .single();

    if (docError) {
      showRagToast('Erreur upload document');
      ragUploadBtn.classList.remove('uploading');
      ragUploadBtn.setAttribute('aria-busy', 'false');
      return;
    }

    const chunks = splitIntoChunks(content, 500);
    const embeddings = await generateEmbeddings(chunks);
    let stored = 0;

    for (let i = 0; i < chunks.length; i++) {
      const insertData = {
        document_id: doc.id,
        user_id: currentUser.id,
        chunk_text: chunks[i]
      };
      if (embeddings[i]) insertData.embedding = embeddings[i];

      const { error: chunkError } = await supabase
        .from('document_chunks')
        .insert(insertData);

      if (!chunkError) stored++;
    }

    if (stored === 0) {
      await supabase.from('documents').delete().eq('id', doc.id);
      showRagToast('Upload échoué — aucun chunk stocké');
      removeFileChip();
    } else {
      showRagToast(`"${filename}" ajouté (${stored} passages)`);
      showFileChip(filename, stored);
    }
  } catch (err) {
    console.error('Upload error:', err);
    showRagToast('Erreur upload : ' + err.message);
    removeFileChip();
  }

  ragUploadBtn.classList.remove('uploading');
  ragUploadBtn.setAttribute('aria-busy', 'false');
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

let pdfjsLib = null;
async function loadPdfJs() {
  if (pdfjsLib) return pdfjsLib;
  if (window.pdfjsLib) {
    pdfjsLib = window.pdfjsLib;
    return pdfjsLib;
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjsLib = window.pdfjsLib;
      resolve(pdfjsLib);
    };
    script.onerror = () => reject(new Error('Impossible de charger pdf.js'));
    document.head.appendChild(script);
  });
}

async function extractPdfText(file) {
  try {
    await loadPdfJs();
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText.trim();
  } catch (err) {
    console.error('PDF extraction error:', err);
    return null;
  }
}

// ★ Découpage avec chevauchement : la fin de chaque chunk se retrouve
// au début du chunk suivant, pour éviter qu'une info coupée pile à la
// frontière entre deux passages devienne invisible à la recherche.
function splitIntoChunks(text, maxLength, overlapRatio = 0.15) {
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
  if (cleaned.length <= maxLength * 2) return [cleaned];

  const paragraphs = cleaned.split(/\n\n+/).filter(p => p.trim().length > 0);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if ((current + '\n\n' + para).length > maxLength && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? '\n\n' : '') + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  const baseChunks = chunks.length > 0 ? chunks : [cleaned];
  if (baseChunks.length <= 1) return baseChunks;

  const overlapLen = Math.floor(maxLength * overlapRatio);
  const overlapped = [baseChunks[0]];
  for (let i = 1; i < baseChunks.length; i++) {
    const prevTail = baseChunks[i - 1].slice(-overlapLen).trim();
    overlapped.push(prevTail ? prevTail + ' … ' + baseChunks[i] : baseChunks[i]);
  }
  return overlapped;
}

async function generateEmbeddings(texts) {
  try {
    const headers = await workerHeaders();
    const res = await fetch(WORKER_URL + 'embed', {
      method: 'POST',
      headers,
      body: JSON.stringify({ texts })
    });
    if (!res.ok) return texts.map(() => null);
    const data = await res.json();
    return data.result?.data || texts.map(() => null);
  } catch (e) {
    console.warn('Embedding error:', e.message);
    return texts.map(() => null);
  }
}

async function searchDocuments(query) {
  if (!currentUser) return null;
  try {
    const queryEmbeddings = await generateEmbeddings([query]);
    if (queryEmbeddings?.[0]) {
      const { data: chunks, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbeddings[0],
        match_threshold: 0.4,
        match_count: 4
      });
      if (!error && chunks?.length > 0) {
        return chunks.map(c => c.chunk_text);
      }
    }
  } catch (e) {
    console.warn('RAG vectoriel échoué:', e.message);
  }

  const { data: allChunks, error: fetchError } = await supabase
    .from('document_chunks')
    .select('chunk_text')
    .eq('user_id', currentUser.id)
    .limit(200);

  if (fetchError || !allChunks?.length) return null;

  const stopWords = new Set([
    'le','la','les','de','du','des','un','une','et','en','au','aux',
    'que','qui','est','il','je','tu','vous','nous','me','ce','se','sur',
    'par','pour','dans','avec','sans','mais','the','is','of','in','it',
    'be','to','peux','peut','dire','parle','fichier','document','contenu',
    'explique','résume'
  ]);

  const keywords = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  if (keywords.length > 0) {
    const scored = allChunks
      .map(c => ({
        text: c.chunk_text,
        score: keywords.reduce((acc, kw) => acc + (c.chunk_text.toLowerCase().includes(kw) ? 1 : 0), 0)
      }))
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(c => c.text);
    if (scored.length > 0) return scored;
  }

  const docKeywords = ['fichier','document','readme','txt','pdf','csv','contenu','texte','uploadé'];
  if (docKeywords.some(w => query.toLowerCase().includes(w))) {
    return allChunks.slice(0, 4).map(c => c.chunk_text);
  }

  return null;
}

// ═══════════════ ANALYSE D'IMAGE ═══════════════
let pendingImage = null;

async function loadImageForSend(file) {
  if (!file || !currentUser) return;
  if (!validateFileSize(file, MAX_IMAGE_SIZE_MB)) return;

  showImgChip(file.name, null);
  imgUploadBtn.classList.add('analyzing');
  imgUploadBtn.setAttribute('aria-busy', 'true');

  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('lion-images')
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data: urlData } = supabase.storage.from('lion-images').getPublicUrl(path);
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

    pendingImage = {
      publicUrl: urlData.publicUrl,
      storagePath: path,
      mediaType: file.type || 'image/jpeg',
      dataUrl,
      filename: file.name
    };

    removeImgChip();
    showImgChip(file.name, dataUrl);
    userInput.placeholder = 'Posez une question sur cette image… (facultatif)';
    userInput.focus();
    updateSendBtn();
  } catch (err) {
    showRagToast('Upload image échoué : ' + err.message);
    removeImgChip();
  }

  imgUploadBtn.classList.remove('analyzing');
  imgUploadBtn.setAttribute('aria-busy', 'false');
}

async function sendImageMessage(question) {
  if (!pendingImage || !currentConvId) return;

  const { publicUrl, dataUrl, filename, mediaType } = pendingImage;
  const lang = detectLanguage(question || '');
  pendingImage = null;
  removeImgChip();
  userInput.placeholder = 'Envoyer un message…';

  const conv = conversations[currentConvId];
  const userText = question
    ? `[Image] ${filename}\n${question}`
    : `[Image] ${filename}`;

  const imgMsg = {
    role: 'user',
    content: userText,
    timestamp: new Date().toISOString(),
    imageUrl: publicUrl
  };
  conv.messages.push(imgMsg);
  conv.contextMessages.push({ role: 'user', content: userText });
  saveMessageToDB(conv.id, imgMsg);

  const outerEl = buildOuter(imgMsg, conv.messages.length - 1);
  const bubble = outerEl.querySelector('.bubble');
  if (bubble) {
    const img = document.createElement('img');
    img.src = dataUrl;
    img.alt = filename;
    img.style.cssText = 'max-width:100%;max-height:220px;border-radius:10px;margin-top:0.5rem;display:block;';
    bubble.appendChild(img);
  }
  chatCont.appendChild(outerEl);
  scroll();

  const to = createTypingIndicator();
  chatCont.appendChild(to);
  scroll();

  isGenerating = true;
  updateSendBtn();

  try {
    const headers = await workerHeaders();
    const res = await fetch(WORKER_URL + 'analyze-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        imageUrl: publicUrl,
        mediaType,
        question: question || 'Décris cette image en détail.',
        lang
      })
    });
    to.remove();
    const data = await res.json();

    if (!res.ok || data.error) {
      throw new Error((data.error || 'Erreur ' + res.status) + (data.detail ? '\n' + data.detail : ''));
    }

    const answer = data.response || "Impossible d'analyser cette image.";
    const aiMsg = {
      role: 'assistant',
      content: answer,
      timestamp: new Date().toISOString()
    };
    conv.messages.push(aiMsg);
    conv.contextMessages.push({ role: 'assistant', content: answer });
    saveMessageToDB(conv.id, aiMsg);

    chatCont.appendChild(buildOuter(aiMsg, conv.messages.length - 1));
    scroll();
    saveConversationToDB(conv);
    renderConvList();
  } catch (err) {
    to.remove();
    showRagToast(err.message);
  }

  isGenerating = false;
  updateSendBtn();
}

// ═══════════════ CHIPS ═══════════════
function showImgChip(filename, dataUrl) {
  removeImgChip();
  const inputShell = document.querySelector('.input-shell');
  const chip = document.createElement('div');
  chip.id = 'imgChip';
  chip.className = 'img-chip';
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-label', `Image ${filename} prête`);

  const thumb = document.createElement('img');
  thumb.className = 'img-chip-thumb';
  thumb.src = dataUrl;
  thumb.alt = filename;

  const name = document.createElement('span');
  name.className = 'img-chip-name';
  name.textContent = filename;

  const meta = document.createElement('span');
  meta.className = 'img-chip-meta';
  meta.textContent = 'Prête';

  const close = document.createElement('button');
  close.className = 'img-chip-close';
  close.title = 'Annuler';
  close.setAttribute('aria-label', "Retirer l'image");
  close.textContent = '✕';
  close.addEventListener('click', () => {
    removeImgChip();
    pendingImage = null;
    userInput.placeholder = 'Envoyer un message…';
    updateSendBtn();
    imgUploadBtn.classList.remove('analyzing');
  });

  chip.appendChild(thumb);
  chip.appendChild(name);
  chip.appendChild(meta);
  chip.appendChild(close);
  inputShell.parentNode.insertBefore(chip, inputShell);
}

function removeImgChip() {
  const e = document.getElementById('imgChip');
  if (e) e.remove();
}

let activeFileName = null;
function showFileChip(filename, chunks) {
  activeFileName = filename;
  removeFileChip();
  const inputShell = document.querySelector('.input-shell');
  const chip = document.createElement('div');
  chip.id = 'fileChip';
  chip.className = 'file-chip';
  chip.setAttribute('role', 'status');
  chip.setAttribute('aria-label', `Document ${filename} avec ${chunks} passages`);
  chip.innerHTML = SVG.doc +
    '<span class="file-chip-name">' + esc(filename) + '</span>' +
    '<span class="file-chip-meta">' + chunks + ' passages</span>' +
    '<button class="file-chip-close" title="Retirer" aria-label="Retirer le document">✕</button>';
  chip.querySelector('.file-chip-close').addEventListener('click', () => {
    removeFileChip();
    activeFileName = null;
  });
  inputShell.parentNode.insertBefore(chip, inputShell);
}

function removeFileChip() {
  const e = document.getElementById('fileChip');
  if (e) e.remove();
}

function showRagToast(message) {
  const toast = document.createElement('div');
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'polite');
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1F2937;color:#fff;padding:0.6rem 1.2rem;border-radius:20px;font-size:0.85rem;z-index:250;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:toastIn 0.3s ease,toastOut 0.3s ease 2.5s forwards;';
  toast.textContent = message;
  document.body.appendChild(toast);

  const style = document.createElement('style');
  style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes toastOut{from{opacity:1}to{opacity:0}}';
  document.head.appendChild(style);

  setTimeout(() => { toast.remove(); style.remove(); }, 3000);
}

// ═══════════════ RENDU CHAT ═══════════════
function renderChat() {
  chatCont.innerHTML = '';
  if (!currentConvId || !conversations[currentConvId]) {
    renderWelcomeScreen();
    return;
  }
  conversations[currentConvId].messages.forEach((m, i) => {
    chatCont.appendChild(buildOuter(m, i));
  });
  if (stoppedConvId === currentConvId && stoppedPartial) {
    attachContinueBanner();
  }
  scroll();
}

function renderWelcomeScreen() {
  const wrap = document.createElement('div');
  wrap.className = 'welcome-screen';

  const logo = document.createElement('div');
  logo.className = 'welcome-logo';
  const img = document.createElement('img');
  img.src = 'logo.svg';
  img.alt = 'Lion AI';
  img.onerror = function() {
    this.style.display = 'none';
    this.parentElement.innerHTML = '<span class="welcome-logo-fallback">🦁</span>';
  };
  logo.appendChild(img);

  const title = document.createElement('h1');
  title.className = 'welcome-title';
  title.textContent = 'Lion AI';

  const subtitle = document.createElement('p');
  subtitle.className = 'welcome-subtitle';
  subtitle.textContent = "Comment puis-je vous aider aujourd'hui ?";

  const pills = document.createElement('div');
  pills.className = 'welcome-pills';
  pills.setAttribute('role', 'group');
  pills.setAttribute('aria-label', 'Actions rapides');

  const pillDefs = [
    { svg: SVG.doc, label: 'Documents', action: () => ragUploadBtn.click() },
    { svg: SVG.image, label: 'Images', action: () => imgUploadBtn.click() },
    { svg: SVG.globe, label: 'Recherche web', action: () => webSearchBtn.click() }
  ];

  pillDefs.forEach(({ svg, label, action }) => {
    const p = document.createElement('button');
    p.type = 'button';
    p.className = 'welcome-pill';
    p.innerHTML = svg + ' ' + label;
    p.addEventListener('click', () => {
      if (!currentConvId) {
        currentConvId = createConv();
        renderConvList();
        renderChat();
      }
      action();
    });
    pills.appendChild(p);
  });

  wrap.appendChild(logo);
  wrap.appendChild(title);
  wrap.appendChild(subtitle);
  wrap.appendChild(pills);
  chatCont.appendChild(wrap);
}

function buildOuter(msg, idx) {
  const o = document.createElement('div');
  o.className = 'msg-outer';
  o.dataset.idx = idx;
  const i = document.createElement('div');
  i.className = 'msg-inner';
  i.appendChild(buildRow(msg, idx));
  o.appendChild(i);
  return o;
}

function buildRow(msg, idx) {
  const row = document.createElement('div');
  row.className = 'msg-row ' + msg.role;

  const av = document.createElement('div');
  av.className = 'avatar ' + (msg.role === 'assistant' ? 'ai' : 'user');
  av.setAttribute('aria-hidden', 'true');

  if (msg.role === 'assistant') {
    const img = document.createElement('img');
    img.src = 'logo.svg';
    img.alt = 'Lion AI';
    img.style.cssText = 'width:28px;height:28px;object-fit:contain;border-radius:50%;';
    img.onerror = function() {
      this.onerror = null;
      this.parentElement.style.background = 'var(--gray-100)';
      this.parentElement.textContent = 'AI';
      this.parentElement.style.fontSize = '11px';
      this.parentElement.style.fontWeight = '600';
    };
    av.appendChild(img);
  } else {
    av.textContent = 'V';
  }

  const col = document.createElement('div');
  col.className = 'bubble-col';

  if (msg.error) {
    const eb = document.createElement('div');
    eb.className = 'error-bubble';
    eb.setAttribute('role', 'alert');
    const warnIcon = document.createElement('span');
    warnIcon.innerHTML = SVG.warning;
    warnIcon.style.cssText = 'display:flex;flex-shrink:0;';
    warnIcon.setAttribute('aria-hidden', 'true');
    const txt = document.createElement('span');
    txt.textContent = msg.content;
    eb.appendChild(warnIcon);
    eb.appendChild(txt);

    const rb = document.createElement('button');
    rb.className = 'retry-btn';
    rb.innerHTML = SVG.retry + ' Réessayer';
    rb.style.cssText = 'display:flex;align-items:center;gap:0.35rem;';
    rb.setAttribute('aria-label', 'Réessayer');
    rb.addEventListener('click', () => retryMsg(idx));
    eb.appendChild(rb);
    col.appendChild(eb);
  } else {
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.innerHTML = md(msg.content);

    if (msg.cached) {
      const b = document.createElement('span');
      b.className = 'cached-badge';
      b.setAttribute('aria-label', 'Réponse mise en cache');
      b.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg> cache`;
      bubble.appendChild(b);
    }

    col.appendChild(bubble);
    attachCtx(bubble, idx, msg.role);

    if (msg.webSearch) {
      const b = document.createElement('div');
      b.className = 'search-results-badge';
      b.setAttribute('aria-label', 'Recherche web utilisée');
      b.innerHTML = SVG.globe + ' Recherche web';
      col.appendChild(b);
    }

    if (msg.ragUsed) {
      const b = document.createElement('div');
      b.className = 'search-results-badge';
      b.style.cssText = 'background:#ECFDF5;border:1px solid #A7F3D0;color:#059669;';
      b.setAttribute('aria-label', 'Connaissances personnelles utilisées');
      b.innerHTML = SVG.doc + ' Connaissances personnelles';
      col.appendChild(b);
    }

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = msg.timestamp
      ? new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';
    meta.appendChild(ts);

    const acts = document.createElement('div');
    acts.className = 'msg-actions';

    const cp = makeActBtn(SVG.copy, 'Copier', 'Copier le message');
    cp.addEventListener('click', () => {
      navigator.clipboard.writeText(msg.content).catch(() => {});
    });
    acts.appendChild(cp);

    if (msg.role === 'user') {
      const ed = makeActBtn(SVG.edit, 'Modifier', 'Modifier le message');
      ed.addEventListener('click', () => startEdit(idx));
      acts.appendChild(ed);

      const rt = makeActBtn(SVG.retry, 'Renvoyer', 'Renvoyer le message');
      rt.addEventListener('click', () => retryMsg(idx));
      acts.appendChild(rt);
    }

    meta.appendChild(acts);
    col.appendChild(meta);

    if (msg.role === 'assistant' && !msg.isStreaming) {
      col.appendChild(makeFeedback());
    }
  }

  row.appendChild(av);
  row.appendChild(col);
  return row;
}

function makeActBtn(svgIcon, title, ariaLabel) {
  const b = document.createElement('button');
  b.className = 'action-btn';
  b.title = title;
  b.setAttribute('aria-label', ariaLabel || title);
  b.innerHTML = svgIcon;
  return b;
}

function makeFeedback() {
  const fb = document.createElement('div');
  fb.className = 'feedback-row';
  fb.setAttribute('role', 'group');
  fb.setAttribute('aria-label', 'Évaluer la réponse');

  [
    { svg: SVG.thumbUp, label: 'Utile' },
    { svg: SVG.thumbDown, label: 'Pas utile' }
  ].forEach(({ svg, label }) => {
    const b = document.createElement('button');
    b.className = 'fb-btn';
    b.title = label;
    b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = svg;
    b.addEventListener('click', () => {
      if (b.classList.contains('active')) return;
      fb.querySelectorAll('.fb-btn').forEach(x => {
        x.classList.remove('active');
        x.setAttribute('aria-pressed', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
    });
    fb.appendChild(b);
  });
  return fb;
}

// ═══════════════ CONTINUE BANNER ═══════════════
function attachContinueBanner() {
  clearContinueBanner();
  const outers = chatCont.querySelectorAll('.msg-outer');
  let last = null;
  outers.forEach(o => {
    if (o.querySelector('.msg-row.assistant')) last = o;
  });

  const banner = document.createElement('div');
  banner.className = 'msg-outer';
  const inner = document.createElement('div');
  inner.className = 'msg-inner';
  inner.style.alignItems = 'flex-start';

  const btn = document.createElement('div');
  btn.className = 'continue-banner';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', 'Continuer la réponse interrompue');
  btn.innerHTML = '<div class="continue-dot" aria-hidden="true"></div><span>Continuer la réponse</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

  btn.addEventListener('click', continueGeneration);
  btn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); continueGeneration(); }
  });

  inner.appendChild(btn);
  banner.appendChild(inner);

  if (last?.nextSibling) {
    chatCont.insertBefore(banner, last.nextSibling);
  } else {
    chatCont.appendChild(banner);
  }
  continueBannerEl = banner;
  scroll();
}

function clearContinueBanner() {
  if (continueBannerEl?.parentNode) {
    continueBannerEl.parentNode.removeChild(continueBannerEl);
  }
  continueBannerEl = null;
}

// ═══════════════ CONTINUE GENERATION ═══════════════
async function continueGeneration() {
  if (isGenerating) return;
  const conv = conversations[currentConvId];
  if (!conv) return;

  clearContinueBanner();
  const partial = stoppedPartial;
  stoppedPartial = '';
  stoppedConvId = null;

  const lang2 = detectLanguage(partial);
  const am = [
    { role: 'system', content: sysPrompt(lang2) },
    ...conv.contextMessages.filter(m => m.role !== 'system').slice(-MAX_HISTORY_MESSAGES),
    { role: 'user', content: 'Continue directement depuis :\n\n' + partial }
  ];

  const outers = chatCont.querySelectorAll('.msg-outer');
  let last = null;
  outers.forEach(o => {
    if (o.querySelector('.msg-row.assistant')) last = o;
  });

  const ab = last?.querySelector('.bubble');
  if (ab) ab.innerHTML = md(partial);

  const to = createTypingIndicator();
  chatCont.appendChild(to);
  scroll();

  const cpl = {
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    isStreaming: true
  };
  conv.messages.push(cpl);

  let co = null, cb = null, cf = '', fc = true;
  const onC = c => {
    cf += c;
    if (fc) {
      fc = false;
      to.remove();
      co = buildOuter(
        { role: 'assistant', content: '', timestamp: cpl.timestamp, isStreaming: true },
        conv.messages.length - 1
      );
      chatCont.appendChild(co);
      cb = co.querySelector('.bubble');
    }
    cb.innerHTML = md(cf);
    scroll();
  };

  isGenerating = true;
  updateSendBtn();

  try {
    await withRetry(() => streamResponse(am, onC));
    to.remove();
    if (!co) {
      co = buildOuter(
        { role: 'assistant', content: cf, timestamp: cpl.timestamp },
        conv.messages.length - 1
      );
      chatCont.appendChild(co);
      cb = co.querySelector('.bubble');
    }
    cb.innerHTML = md(cf);
    cpl.content = cf;
    delete cpl.isStreaming;
    cpl.timestamp = new Date().toISOString();
    conv.contextMessages.push({ role: 'assistant', content: cf });
    saveMessageToDB(conv.id, { role: 'assistant', content: cf });
    co.querySelector('.bubble-col').appendChild(makeFeedback());
  } catch (e) {
    handleStreamError(e, to, cpl, co, cf, conv);
  }

  isGenerating = false;
  abortController = null;
  updateSendBtn();
  saveConversationToDB(conv);
  renderConvList();
}

// ═══════════════ CONTEXT MENU ═══════════════
let lpTimer = null;

function attachCtx(bubble, idx, role) {
  const show = (x, y) => {
    ctxTargetIdx = idx;
    $('ctxEdit').style.display = role === 'user' ? 'flex' : 'none';
    $('ctxRetry').style.display = role === 'user' ? 'flex' : 'none';
    ctxMenu.style.left = Math.min(x, window.innerWidth - 190) + 'px';
    ctxMenu.style.top = Math.min(y, window.innerHeight - 150) + 'px';
    ctxMenu.classList.add('visible');
  };

  bubble.addEventListener('contextmenu', e => {
    e.preventDefault();
    show(e.clientX, e.clientY);
  });

  bubble.addEventListener('touchstart', e => {
    lpTimer = setTimeout(() => {
      const t = e.touches[0];
      show(t.clientX, t.clientY);
    }, 500);
  }, { passive: true });

  bubble.addEventListener('touchend', () => clearTimeout(lpTimer));
  bubble.addEventListener('touchmove', () => clearTimeout(lpTimer));
}

document.addEventListener('click', e => {
  if (!ctxMenu.contains(e.target)) ctxMenu.classList.remove('visible');
});

$('ctxEdit').addEventListener('click', () => {
  ctxMenu.classList.remove('visible');
  if (ctxTargetIdx != null) startEdit(ctxTargetIdx);
});

$('ctxCopy').addEventListener('click', () => {
  ctxMenu.classList.remove('visible');
  if (ctxTargetIdx != null) {
    navigator.clipboard.writeText(conversations[currentConvId].messages[ctxTargetIdx].content).catch(() => {});
  }
});

$('ctxRetry').addEventListener('click', () => {
  ctxMenu.classList.remove('visible');
  if (ctxTargetIdx != null) retryMsg(ctxTargetIdx);
});

// ═══════════════ EDIT ═══════════════
function startEdit(idx) {
  const conv = conversations[currentConvId];
  const msg = conv.messages[idx];
  if (!msg || msg.role !== 'user') return;

  const outer = chatCont.querySelector('.msg-outer[data-idx="' + idx + '"]');
  if (!outer) return;

  const col = outer.querySelector('.bubble-col');
  col.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'edit-wrap';

  const ta = document.createElement('textarea');
  ta.className = 'edit-ta';
  ta.value = msg.content;
  ta.setAttribute('aria-label', 'Modifier votre message');

  const btns = document.createElement('div');
  btns.className = 'edit-btns';

  const cancel = document.createElement('button');
  cancel.className = 'edit-btn cancel';
  cancel.textContent = 'Annuler';
  cancel.setAttribute('aria-label', 'Annuler la modification');

  const ok = document.createElement('button');
  ok.className = 'edit-btn ok';
  ok.textContent = 'Envoyer';
  ok.setAttribute('aria-label', 'Envoyer le message modifié');

  btns.appendChild(cancel);
  btns.appendChild(ok);
  wrap.appendChild(ta);
  wrap.appendChild(btns);
  col.appendChild(wrap);

  ta.style.height = ta.scrollHeight + 'px';
  ta.addEventListener('input', () => {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  });
  ta.focus();

  cancel.addEventListener('click', renderChat);
  ok.addEventListener('click', () => {
    const t = ta.value.trim();
    if (!t || t === msg.content) { renderChat(); return; }
    editAndResend(idx, t);
  });
}

function editAndResend(idx, newText) {
  const conv = conversations[currentConvId];
  conv.messages = conv.messages.slice(0, idx);
  conv.contextMessages = [{ role: 'system', content: sysPrompt(detectLanguage(newText)) }];
  conv.messages.forEach(m => {
    if (m.role !== 'system') conv.contextMessages.push({ role: m.role, content: m.content });
  });
  clearContinueBanner();
  stoppedPartial = '';
  stoppedConvId = null;
  renderChat();
  userInput.value = newText;
  sendMessage();
}

function retryMsg(idx) {
  const conv = conversations[currentConvId];
  let i = idx;
  while (i >= 0 && conv.messages[i].role !== 'user') i--;
  if (i < 0) return;
  editAndResend(i, conv.messages[i].content);
}

// ═══════════════ MÉMOIRE LONGUE ═══════════════
const SUMMARY_THRESHOLD = 16;

async function summarizeIfNeeded(conv) {
  if (!currentUser || !conv) return;
  const userMessages = conv.messages.filter(m => m.role !== 'system');
  if (userMessages.length < SUMMARY_THRESHOLD) return;

  try {
    const { data: existing } = await supabase
      .from('conversation_summaries')
      .select('messages_summarized')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const alreadySummarized = existing?.messages_summarized || 0;
    if (userMessages.length - alreadySummarized < 8) return;

    const toSummarize = userMessages.slice(alreadySummarized, alreadySummarized + 12);
    const summaryPrompt = [
      { role: 'system', content: 'Résume cet échange en 3 phrases max en français. Sois factuel et bref.' },
      ...toSummarize.map(m => ({ role: m.role, content: m.content.slice(0, 200) })),
      { role: 'user', content: 'Résumé :' }
    ];

    const headers = await workerHeaders();
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: summaryPrompt,
        stream: false,
        temperature: 0.3,
        max_tokens: 150
      })
    });

    if (!res.ok) return;
    const data = await res.json();
    const summary = data?.result?.response || data?.response;
    if (!summary) return;

    await supabase.from('conversation_summaries').insert({
      conversation_id: conv.id,
      user_id: currentUser.id,
      summary,
      messages_summarized: alreadySummarized + toSummarize.length
    });
    await supabase.from('conversations').update({ summary }).eq('id', conv.id);
  } catch (e) {
    console.warn('Résumé échoué :', e.message);
  }
}

async function getConvSummary(convId) {
  if (!currentUser) return null;
  try {
    const { data } = await supabase
      .from('conversation_summaries')
      .select('summary')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data?.summary || null;
  } catch (e) {
    return null;
  }
}

// ═══════════════ STREAMING ═══════════════
function estimateTokens(t) {
  return Math.ceil((t || '').split(/\s+/).length / 0.75);
}

function prepareCtx(userMsg, conv, searchResults, ragResults, convSummary) {
  const lang = detectLanguage(userMsg);
  let ctx = [{ role: 'system', content: sysPrompt(lang) }];

  if (convSummary) {
    ctx.push({ role: 'system', content: '[CONTEXTE PRÉCÉDENT] ' + convSummary });
  }

  if (ragResults?.length) {
    const ragText = ragResults.map(r => r.slice(0, 300)).join('\n---\n');
    ctx.push({
      role: 'system',
      content: 'DOCUMENT:\n' + ragText + '\n\nUtilise ce contenu. Ne dis jamais que tu n\'as pas accès au fichier.'
    });
  }

  if (searchResults?.length) {
    const facts = searchResults
      .map(r => r.snippet?.slice(0, 150))
      .filter(s => s?.length > 20)
      .join(' | ');
    const lang2 = {
      fr: 'français', en: 'English', ar: 'العربية',
      es: 'español', de: 'Deutsch', it: 'italiano', pt: 'português'
    }[lang] || 'français';
    ctx.push({
      role: 'system',
      content: `WEB (traduis en ${lang2} si nécessaire): ` + facts
    });
  }

  const hist = conv.contextMessages
    .filter(m =>
      m.role !== 'system' &&
      !m.content.startsWith('WEB') &&
      !m.content.startsWith('DOCUMENT')
    )
    .slice(-MAX_HISTORY_MESSAGES);

  ctx = ctx.concat(hist, [{ role: 'user', content: userMsg }]);

  let tok = ctx.reduce((s, m) => s + estimateTokens(m.content), 0);
  while (tok > MAX_CONTEXT_TOKENS && ctx.length > 3) {
    const idx = ctx.findIndex(m => m.role !== 'system');
    if (idx === -1) break;
    ctx.splice(idx, 1);
    tok = ctx.reduce((s, m) => s + estimateTokens(m.content), 0);
  }

  return ctx;
}

async function streamResponse(messages, onChunk) {
  abortController = new AbortController();
  const tid = setTimeout(() => abortController.abort(), 35000);

  const headers = await workerHeaders();
  const res = await fetch(WORKER_URL, {
    method: 'POST',
    signal: abortController.signal,
    headers,
    body: JSON.stringify({
      messages,
      stream: true,
      temperature: 0.1,
      max_tokens: 350
    })
  });

  clearTimeout(tid);

  if (!res.ok) {
    const t = await res.text();
    throw new Error('Erreur ' + res.status + ': ' + t.slice(0, 200));
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (let l of lines) {
      l = l.trim();
      if (!l || !l.startsWith('data: ')) continue;
      const d = l.slice(6);
      if (d === '[DONE]') continue;
      try {
        const j = JSON.parse(d);
        if (j.response) onChunk(j.response);
      } catch (e) {}
    }
  }
}

async function withRetry(fn, n = 2) {
  for (let i = 0; i <= n; i++) {
    try {
      return await fn();
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      if (i === n) throw e;
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}

function createTypingIndicator() {
  const to = document.createElement('div');
  to.className = 'typing-outer';
  to.setAttribute('aria-label', "Lion AI est en train d'écrire");
  to.setAttribute('aria-live', 'polite');

  const ti = document.createElement('div');
  ti.className = 'typing-inner';

  const tr = document.createElement('div');
  tr.className = 'typing-row-el';

  const ta = document.createElement('div');
  ta.className = 'avatar ai';
  ta.setAttribute('aria-hidden', 'true');

  const img = document.createElement('img');
  img.src = 'logo.svg';
  img.alt = '';
  img.style.cssText = 'width:28px;height:28px;object-fit:contain;border-radius:50%;';
  img.onerror = function() {
    this.onerror = null;
    this.parentElement.style.background = 'var(--gray-100)';
    this.parentElement.textContent = 'AI';
    this.parentElement.style.fontSize = '11px';
  };
  ta.appendChild(img);

  const ti2 = document.createElement('div');
  ti2.className = 'typing-indicator';
  ti2.setAttribute('aria-hidden', 'true');
  ti2.innerHTML = '<span></span><span></span><span></span>';

  tr.appendChild(ta);
  tr.appendChild(ti2);
  ti.appendChild(tr);
  to.appendChild(ti);
  return to;
}

function handleStreamError(e, to, placeholder, aOuter, full, conv) {
  to.remove();
  if (e.name === 'AbortError') {
    if (aOuter && full) {
      aOuter.querySelector('.bubble').innerHTML = md(full) + ' <span style="opacity:.4;font-size:0.8em;">[arrêté]</span>';
      placeholder.content = full;
      delete placeholder.isStreaming;
      conv.contextMessages.push({ role: 'assistant', content: full });
      stoppedPartial = full;
      stoppedConvId = currentConvId;
      attachContinueBanner();
    } else {
      conv.messages.pop();
      if (aOuter) aOuter.remove();
    }
  } else {
    placeholder.content = e.message;
    placeholder.error = true;
    delete placeholder.isStreaming;
    if (aOuter) aOuter.remove();
    chatCont.appendChild(buildOuter(placeholder, conv.messages.length - 1));
  }
}

// ═══════════════ SEND MESSAGE ═══════════════
async function sendMessage() {
  if (isGenerating) {
    abortController?.abort();
    return;
  }

  if (!currentConvId) {
    currentConvId = createConv();
    renderConvList();
    renderChat();
  }

  const text = userInput.value.trim();

  if (pendingImage) {
    userInput.value = '';
    userInput.style.height = '';
    await sendImageMessage(text);
    return;
  }

  if (!text) return;

  clearContinueBanner();
  stoppedPartial = '';
  stoppedConvId = null;

  const conv = conversations[currentConvId];
  const cacheKey = text.toLowerCase().trim();
  const requestStart = Date.now();

  if (conv.cache[cacheKey] && !webSearchForced) {
    const cached = conv.cache[cacheKey];
    const cachedMsg = {
      role: 'assistant',
      content: cached,
      timestamp: new Date().toISOString(),
      cached: true
    };
    conv.messages.push(cachedMsg);
    conv.contextMessages.push({ role: 'assistant', content: cached });
    userInput.value = '';
    userInput.style.height = '';
    chatCont.appendChild(buildOuter(cachedMsg, conv.messages.length - 1));
    scroll();
    saveConversationToDB(conv);
    renderConvList();
    logAnalytics({
      query: text,
      response: cached,
      duration_ms: Date.now() - requestStart,
      tokens_input: estimateTokens(text),
      tokens_output: estimateTokens(cached),
      status: 'cache_hit',
      has_search: false
    });
    return;
  }

  userInput.value = '';
  userInput.style.height = '';

  if (!conv.messages.some(m => m.role === 'user')) {
    conv.title = text.slice(0, 50) + (text.length > 50 ? '…' : '');
    saveConversationToDB(conv);
    renderConvList();
  }

  let ragResults = await searchDocuments(text);
  const shouldSearch = webSearchForced || !ragResults?.length;
  let searchResults = null;

  if (shouldSearch) {
    const si = document.createElement('div');
    si.className = 'msg-outer';
    si.setAttribute('aria-label', 'Recherche en cours');
    si.innerHTML = '<div class="msg-inner" style="align-items:flex-start"><div class="search-indicator"><div class="spinner" aria-hidden="true"></div>Recherche en cours…</div></div>';
    chatCont.appendChild(si);
    scroll();

    searchResults = await searchWeb(text);
    si.remove();

    if (searchResults?.length) {
      const rb = document.createElement('div');
      rb.className = 'msg-outer';
      rb.setAttribute('aria-label', `${searchResults.length} résultat(s) de recherche`);
      rb.innerHTML = '<div class="msg-inner" style="align-items:flex-start"><div class="search-results-badge">' + SVG.globe + ' ' + searchResults.length + ' résultat(s)</div></div>';
      chatCont.appendChild(rb);
      scroll();
    }

    webSearchForced = false;
    webSearchBtn.classList.remove('active');
  }

  const userMsg = {
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
    webSearch: (searchResults?.length > 0),
    ragUsed: (ragResults?.length > 0)
  };
  conv.messages.push(userMsg);
  conv.contextMessages.push({ role: 'user', content: text });
  saveMessageToDB(conv.id, {
    role: 'user',
    content: text,
    webSearch: (searchResults?.length > 0)
  });

  chatCont.appendChild(buildOuter(userMsg, conv.messages.length - 1));
  scroll();

  summarizeIfNeeded(conv).catch(e => console.warn('summarize:', e.message));
  const convSummary = await getConvSummary(conv.id);
  const apiMessages = prepareCtx(text, conv, searchResults, ragResults, convSummary);
  const tokensInput = estimateTokens(apiMessages.map(m => m.content).join(' '));

  const to = createTypingIndicator();
  chatCont.appendChild(to);
  scroll();

  const placeholder = {
    role: 'assistant',
    content: '',
    timestamp: new Date().toISOString(),
    isStreaming: true,
    webSearch: (searchResults?.length > 0),
    ragUsed: (ragResults?.length > 0)
  };
  conv.messages.push(placeholder);

  const aOuter = buildOuter(
    {
      role: 'assistant',
      content: '',
      timestamp: placeholder.timestamp,
      isStreaming: true,
      webSearch: placeholder.webSearch,
      ragUsed: placeholder.ragUsed
    },
    conv.messages.length - 1
  );

  let aBubble = null, full = '', firstChunk = true;
  const onChunk = chunk => {
    full += chunk;
    if (firstChunk) {
      firstChunk = false;
      to.remove();
      chatCont.appendChild(aOuter);
      aBubble = aOuter.querySelector('.bubble');
    }
    aBubble.innerHTML = md(full);
    scroll();
  };

  isGenerating = true;
  updateSendBtn();

  try {
    await withRetry(() => streamResponse(apiMessages, onChunk));
    to.remove();
    if (firstChunk) {
      chatCont.appendChild(aOuter);
      aBubble = aOuter.querySelector('.bubble');
    }
    aBubble.innerHTML = md(full);
    placeholder.content = full;
    delete placeholder.isStreaming;
    placeholder.timestamp = new Date().toISOString();
    conv.contextMessages.push({ role: 'assistant', content: full });
    saveMessageToDB(conv.id, {
      role: 'assistant',
      content: full,
      webSearch: placeholder.webSearch
    });
    aOuter.querySelector('.bubble-col').appendChild(makeFeedback());

    if (full && !placeholder.error) {
      conv.cache[cacheKey] = full;
      saveCacheToDB(cacheKey, full);
      const keys = Object.keys(conv.cache);
      if (keys.length > 50) delete conv.cache[keys[0]];
    }

    logAnalytics({
      query: text,
      response: full,
      duration_ms: Date.now() - requestStart,
      tokens_input: tokensInput,
      tokens_output: estimateTokens(full),
      status: 'success',
      has_search: searchResults?.length > 0
    });
  } catch (e) {
    handleStreamError(e, to, placeholder, aOuter, full, conv);
    logAnalytics({
      query: text,
      response: e.message,
      duration_ms: Date.now() - requestStart,
      tokens_input: tokensInput,
      tokens_output: 0,
      status: 'error',
      has_search: searchResults?.length > 0
    });
  }

  isGenerating = false;
  abortController = null;
  updateSendBtn();
  saveConversationToDB(conv);
  renderConvList();
}

function updateSendBtn() {
  if (isGenerating) {
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
    sendBtn.classList.add('stop');
    sendBtn.disabled = false;
    sendBtn.setAttribute('aria-label', 'Arrêter la génération');
  } else {
    sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';
    sendBtn.classList.remove('stop');
    sendBtn.disabled = !userInput.value.trim() && !pendingImage;
    sendBtn.setAttribute('aria-label', 'Envoyer le message');
  }
}

// ═══════════════ EVENTS ═══════════════
hamburgerBtn.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlay.addEventListener('click', closeSidebar);
newChatSBtn.addEventListener('click', () => switchConv(createConv()));
newChatTBtn.addEventListener('click', () => switchConv(createConv()));

userInput.addEventListener('input', () => {
  updateSendBtn();
  userInput.style.height = 'auto';
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
});

userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (isGenerating) {
      abortController?.abort();
    } else if (userInput.value.trim() || pendingImage) {
      sendMessage();
    }
  }
});

sendBtn.addEventListener('click', sendMessage);

webSearchBtn.addEventListener('click', () => {
  webSearchForced = !webSearchForced;
  if (webSearchForced) {
    webSearchBtn.classList.add('active');
    webSearchBtn.setAttribute('aria-pressed', 'true');
  } else {
    webSearchBtn.classList.remove('active');
    webSearchBtn.setAttribute('aria-pressed', 'false');
  }
});

ragUploadBtn.addEventListener('click', () => ragFileInput.click());

ragFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) uploadDocument(file);
  ragFileInput.value = '';
});

imgUploadBtn.addEventListener('click', () => imgFileInput.click());

imgFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadImageForSend(file);
  imgFileInput.value = '';
});

// ═══════════════ PWA ═══════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Lion AI PWA ready'))
      .catch(e => console.warn('SW:', e.message));
  });
}

// ═══════════════ STT ═══════════════
let isListening = false;
let recognition = null;

function initSTT() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none';
    return;
  }
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = 'fr-FR';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    micBtn.setAttribute('aria-label', 'Écoute en cours');
    userInput.placeholder = 'Écoute en cours…';
  };

  recognition.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t;
      else interim += t;
    }
    userInput.value = final || interim;
    userInput.style.height = 'auto';
    userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px';
    updateSendBtn();
  };

  recognition.onend = () => {
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.setAttribute('aria-label', 'Parler à Lion AI');
    userInput.placeholder = 'Envoyer un message…';
    if (userInput.value.trim()) sendMessage();
  };

  recognition.onerror = (e) => {
    isListening = false;
    micBtn.classList.remove('listening');
    micBtn.setAttribute('aria-label', 'Parler à Lion AI');
    userInput.placeholder = 'Envoyer un message…';
    if (e.error !== 'no-speech') showRagToast('Micro : ' + e.error);
  };
}

function toggleMic() {
  if (!recognition) return;
  if (isListening) {
    recognition.stop();
    return;
  }
  const conv = conversations[currentConvId];
  if (conv?.messages?.length) {
    const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
    if (lastUser) {
      const langMap = {
        fr:'fr-FR', en:'en-US', ar:'ar-SA',
        es:'es-ES', de:'de-DE', it:'it-IT', pt:'pt-PT'
      };
      recognition.lang = langMap[detectLanguage(lastUser.content)] || 'fr-FR';
    }
  }
  recognition.start();
}

if (micBtn) micBtn.addEventListener('click', toggleMic);

// ═══════════════ INIT ═══════════════
async function initApp() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    window.location.href = 'login.html';
    return;
  }
  currentUser = session.user;
  await loadConversationsFromDB(0);
  currentConvId = null;
  injectConvSearchBox();
  renderConvList();
  renderChat();
  updateSendBtn();
  initSTT();
  console.log('Lion AI ready');
}
initApp();
