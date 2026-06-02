// ═══════════════ CONFIGURATION ═══════════════
const SUPABASE_URL = "https://jiycrapjqclvcsrvdldt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppeWNyYXBqcWNsdmNzcnZkbGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTE4NDUsImV4cCI6MjA5NDQyNzg0NX0.wIOoCURRDLmws-frss9g4pG4UBgH4jSLhNezJsc5JdM";
const WORKER_URL = "https://lionchatbot.dragonetechnology.workers.dev/";

// ═══════════════ SUPABASE (initialisation unique) ═══════════════
var supabase;
(function() {
  if (window._lionSupabase) {
    supabase = window._lionSupabase;
  } else {
    window._lionSupabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    supabase = window._lionSupabase;
  }
})();

// ═══════════════ ÉTAT GLOBAL ═══════════════
let currentUser = null;
let currentConvId = null;
let isGenerating = false;
let abortController = null;
let webSearchForced = false;
const MAX_CONTEXT_TOKENS = 2500;
let ctxTargetIdx = null;
let stoppedConvId = null;
let stoppedPartial = '';
let continueBannerEl = null;
let conversations = {};

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

// ═══════════════ UTILITAIRES ═══════════════
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function md(t) {
  let o = t.replace(/```(\w+)?\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
  o = o.replace(/`([^`]+)`/g, '<code>$1</code>');
  o = o.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  o = o.replace(/\*(.+?)\*/g, '<em>$1</em>');
  o = o.replace(/\n/g, '<br>');
  return o;
}
function scroll() { chatCont.scrollTop = chatCont.scrollHeight; }

// ═══════════════ MONITORING ═══════════════
const analyticsQueue = [];
function logAnalytics(data) {
  analyticsQueue.push(data);
  console.log(`📊 [Lion AI] ${data.status} | ${data.duration_ms}ms | IN:${data.tokens_input} OUT:${data.tokens_output} | Search:${data.has_search}`);
}
async function flushAnalytics() {
  if (analyticsQueue.length === 0 || !currentUser) return;
  const batch = analyticsQueue.splice(0);
  const rows = batch.map(d => ({
    user_id: currentUser.id,
    query: d.query,
    response: d.response?.slice(0, 500),
    duration_ms: d.duration_ms,
    tokens_input: d.tokens_input,
    tokens_output: d.tokens_output,
    status: d.status,
    has_search: d.has_search
  }));
  try { await supabase.from('analytics').insert(rows); } catch (e) { console.warn('⚠️ Analytics flush failed:', e.message); }
}
setInterval(flushAnalytics, 10000);
window.addEventListener('beforeunload', () => flushAnalytics());

// ═══════════════ SYSTEM PROMPT ═══════════════
function sysPrompt(userLang) {
  const lang = userLang || 'fr';
  const langInstructions = {
    fr: 'Réponds TOUJOURS en français.',
    en: 'Always respond in English.',
    ar: 'أجب دائماً باللغة العربية.',
    es: 'Responde SIEMPRE en español.',
    de: 'Antworte IMMER auf Deutsch.',
    it: 'Rispondi SEMPRE in italiano.',
    pt: 'Responda SEMPRE em português.',
  };
  const instruction = langInstructions[lang] || `Respond in the same language as the user's message.`;
  return `You are Lion AI, an intelligent assistant. ${instruction}

Rules:
- LANGUAGE: Always respond in the same language as the user's message. Auto-detect the language.
- LENGTH: 1 to 5 sentences maximum unless a document or detailed question requires more.
- SOURCES: Never mention sources or URLs.
- STYLE: Speak naturally, as if you already know the information.
- CODE: Always wrap code in \`\`\`.

If web results or personal documents are provided, use them to answer but always rephrase naturally in the user's language.`;
}

function detectLanguage(text) {
  if (!text) return 'fr';
  const t = text.toLowerCase();
  // Arabe : présence de caractères arabes
  if (/[؀-ۿ]/.test(text)) return 'ar';
  // Espagnol
  if (/(hola|gracias|cómo|qué|estás|español|puedes|hacer)/.test(t)) return 'es';
  // Allemand
  if (/(wie|danke|bitte|können|deutsch|hallo|ich|das|die)/.test(t)) return 'de';
  // Italien
  if (/(ciao|grazie|come|puoi|italiano|cosa|fare)/.test(t)) return 'it';
  // Portugais
  if (/(olá|obrigado|como|você|português|fazer|pode)/.test(t)) return 'pt';
  // Anglais
  if (/(hello|hi|how|what|can|you|please|tell|me|the|is|are|do|does)/.test(t)) return 'en';
  // Français par défaut
  return 'fr';
}

// ═══════════════ DÉCONNEXION ═══════════════
function showLogoutConfirmDialog() {
  const modalOverlay = document.createElement('div');
  modalOverlay.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.15s ease;';
  const modalBox = document.createElement('div');
  modalBox.style.cssText = 'background:#fff;border-radius:16px;padding:1.8rem 1.5rem 1.5rem;max-width:360px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2);text-align:center;animation:modalSlideIn 0.2s ease;';
  modalBox.innerHTML = '<div style="font-size:2.5rem;margin-bottom:0.8rem;">👋</div><h3 style="font-size:1.1rem;font-weight:600;color:#111827;margin-bottom:0.4rem;">Se déconnecter ?</h3><p style="font-size:0.85rem;color:#6B7280;margin-bottom:1.5rem;line-height:1.5;">Vous serez redirigé vers la page de connexion.<br>Vos conversations sont sauvegardées.</p><div style="display:flex;gap:0.6rem;"><button id="modalCancelBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:1.5px solid #E5E7EB;background:#fff;font-family:inherit;font-size:0.85rem;font-weight:500;cursor:pointer;color:#374151;">Annuler</button><button id="modalConfirmBtn" style="flex:1;padding:0.65rem;border-radius:10px;border:none;background:#EF4444;color:#fff;font-family:inherit;font-size:0.85rem;font-weight:600;cursor:pointer;">Déconnexion</button></div>';
  modalOverlay.appendChild(modalBox);
  document.body.appendChild(modalOverlay);
  const styleEl = document.createElement('style');
  styleEl.textContent = '@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes modalSlideIn{from{opacity:0;transform:translateY(12px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}';
  document.head.appendChild(styleEl);
  const closeModal = () => { modalOverlay.remove(); styleEl.remove(); };
  document.getElementById('modalCancelBtn').addEventListener('click', closeModal);
  document.getElementById('modalConfirmBtn').addEventListener('click', async () => { closeModal(); await flushAnalytics(); await supabase.auth.signOut(); window.location.href = 'login.html'; });
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
  document.addEventListener('keydown', function escHandler(e) { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', escHandler); } });
}
logoutBtn.addEventListener('click', showLogoutConfirmDialog);

// ═══════════════ SUPABASE DATA ═══════════════
async function loadConversationsFromDB() {
  if (!currentUser) return;
  conversations = {};
  const { data: convs, error } = await supabase.from('conversations').select('*').eq('user_id', currentUser.id).order('updated_at', { ascending: false });
  if (error || !convs || convs.length === 0) return;
  for (const conv of convs) {
    const { data: messages } = await supabase.from('messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });
    conversations[conv.id] = {
      id: conv.id, title: conv.title,
      messages: (messages || []).map(m => ({ role: m.role, content: m.content, timestamp: m.created_at, webSearch: m.web_search, cached: m.cached })),
      contextMessages: (messages || []).filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
      cache: {}
    };
  }
}
async function saveConversationToDB(conv) { if (!currentUser || !conv) return; await supabase.from('conversations').upsert({ id: conv.id, user_id: currentUser.id, title: conv.title, updated_at: new Date().toISOString() }); }
async function saveMessageToDB(convId, msg) { if (!currentUser || !convId) return; await supabase.from('messages').insert({ conversation_id: convId, user_id: currentUser.id, role: msg.role, content: msg.content, web_search: msg.webSearch || false, cached: msg.cached || false }); }
async function loadCacheFromDB() { if (!currentUser) return; const { data } = await supabase.from('response_cache').select('*').eq('user_id', currentUser.id); if (data && currentConvId && conversations[currentConvId]) { data.forEach(row => { conversations[currentConvId].cache[row.cache_key] = row.response; }); } }
async function saveCacheToDB(key, response) { if (!currentUser) return; await supabase.from('response_cache').upsert({ user_id: currentUser.id, cache_key: key, response: response }, { onConflict: 'user_id, cache_key' }); }

// ═══════════════ CONVERSATIONS ═══════════════
function createConv(title) {
  const id = crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36);
  const welcome = "Bonjour ! Je suis Lion AI, votre assistant intelligent. Je recherche automatiquement sur le web et dans vos documents pour vous fournir des réponses précises. Posez-moi vos questions ! 📄🌐";
  const conv = { id, title: title || 'Nouvelle discussion', messages: [{ role: 'assistant', content: welcome, timestamp: new Date().toISOString() }], contextMessages: [{ role: 'system', content: sysPrompt() }, { role: 'assistant', content: welcome }], cache: {} };
  conversations[id] = conv;
  saveConversationToDB(conv);
  saveMessageToDB(id, { role: 'assistant', content: welcome });
  return id;
}
function switchConv(id) { currentConvId = id; clearContinueBanner(); loadCacheFromDB(); renderConvList(); renderChat(); closeSidebar(); }
function openSidebar()  { sidebar.classList.add('open');    overlay.classList.add('on'); }
function closeSidebar() { sidebar.classList.remove('open'); overlay.classList.remove('on'); }
function renderConvList() {
  convList.innerHTML = '';
  const ids = Object.keys(conversations);
  if (ids.length === 0) { convList.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--gray-400);font-size:0.85rem;">Aucune conversation</div>'; return; }
  ids.sort((a, b) => (conversations[b].messages.slice(-1)[0]?.timestamp || '').localeCompare(conversations[a].messages.slice(-1)[0]?.timestamp || '')).forEach(id => {
    const c = conversations[id];
    const el = document.createElement('div'); el.className = 'conversation-item' + (id === currentConvId ? ' active' : '');
    el.innerHTML = '<span class="conversation-title">' + esc(c.title) + '</span><button class="delete-conv-btn" title="Supprimer">✕</button>';
    el.addEventListener('click', e => { if (!e.target.classList.contains('delete-conv-btn')) switchConv(id); });
    el.querySelector('.delete-conv-btn').addEventListener('click', async e => { e.stopPropagation(); if (!confirm('Supprimer cette conversation ?')) return; if (currentUser) await supabase.from('conversations').delete().eq('id', id); delete conversations[id]; const rem = Object.keys(conversations); currentConvId = rem.length ? rem[0] : createConv(); renderConvList(); renderChat(); });
    convList.appendChild(el);
  });
}

// ═══════════════ RECHERCHE WEB ═══════════════
async function searchWeb(query) {
  try {
    const r = await fetch(WORKER_URL + 'search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
    if (!r.ok) return null;
    const d = await r.json();
    let res = [];
    if (d.AbstractText?.trim()) res.push({ title: d.Heading || 'Résumé', snippet: d.AbstractText, source: d.AbstractSource || 'DuckDuckGo' });
    if (d.RelatedTopics) d.RelatedTopics.slice(0, 5).forEach(t => { if (t.Text?.trim()) res.push({ title: t.FirstURL?.split('/').pop()?.replace(/_/g, ' ') || 'Info', snippet: t.Text, source: t.FirstURL || '' }); });
    return res.length ? res : null;
  } catch (e) { return null; }
}

// ═══════════════ RAG : UPLOAD & RECHERCHE DOCUMENTS ═══════════════

// ── UPLOAD : stocke les chunks en texte brut + embeddings via Worker ──
async function uploadDocument(file) {
  if (!currentUser) return;
  ragUploadBtn.classList.add('uploading');

  const reader = new FileReader();
  reader.onerror = () => {
    showRagToast('❌ Erreur de lecture du fichier');
    ragUploadBtn.classList.remove('uploading');
  };

  reader.onload = async (e) => {
    const content = e.target.result;
    const filename = file.name;

    // 1. Insère le document parent
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .insert({ user_id: currentUser.id, filename, content })
      .select('id')
      .single();

    if (docError) {
      console.error('Erreur upload document:', docError);
      showRagToast('❌ Erreur lors de l\'upload');
      ragUploadBtn.classList.remove('uploading');
      return;
    }

    // 2. Découpe en chunks
    const chunks = splitIntoChunks(content, 500);

    // 3. Génère les embeddings (un par un via le Worker corrigé)
    const embeddings = await generateEmbeddings(chunks);

    // 4. Stocke chaque chunk (sans embedding si NOT NULL pose problème)
    let stored = 0;
    let lastError = null;
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

      if (!chunkError) {
        stored++;
      } else {
        lastError = chunkError;
        console.error(`❌ Chunk ${i} non stocké :`, chunkError.message, '| Code:', chunkError.code);
      }
    }

    console.log(`📄 "${filename}" indexé — ${stored}/${chunks.length} chunks stockés`);

    if (stored === 0) {
      const hint = lastError?.code === '23502'
        ? ' Lance ce SQL dans Supabase : ALTER TABLE document_chunks ALTER COLUMN embedding DROP NOT NULL;'
        : ` Erreur : ${lastError?.message}`;
      console.error('🚨 Aucun chunk stocké.' + hint);
      showRagToast('❌ Upload échoué — voir console pour la solution');
      removeFileChip();
    } else {
      showRagToast(`✅ "${filename}" ajouté (${stored} passages indexés)`);
      showFileChip(filename, stored);
    }
    ragUploadBtn.classList.remove('uploading');
  };

  reader.readAsText(file);
}

function splitIntoChunks(text, maxLength) {
  // Nettoie les lignes vides multiples
  const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();

  // Si le fichier est court (< maxLength*2), retourne-le en un seul chunk
  if (cleaned.length <= maxLength * 2) {
    return [cleaned];
  }

  // Découpe par paragraphes (double saut de ligne)
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
  return chunks.length > 0 ? chunks : [cleaned];
}

// ── generateEmbeddings : envoie les textes au Worker (qui les traite un par un) ──
async function generateEmbeddings(texts) {
  try {
    const res = await fetch(WORKER_URL + 'embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts })
    });
    if (!res.ok) return texts.map(() => null);
    const data = await res.json();
    return data.result?.data || texts.map(() => null);
  } catch (e) {
    console.error('Erreur embedding:', e);
    return texts.map(() => null);
  }
}

// ── RECHERCHE : essaie d'abord les embeddings, puis fallback mots-clés, puis fallback total ──
async function searchDocuments(query) {
  if (!currentUser) return null;

  // Tentative 1 : recherche vectorielle via embeddings
  try {
    const queryEmbeddings = await generateEmbeddings([query]);
    if (queryEmbeddings && queryEmbeddings[0]) {
      const { data: chunks, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbeddings[0],
        match_threshold: 0.4, // seuil abaissé pour plus de résultats
        match_count: 5
      });
      if (!error && chunks && chunks.length > 0) {
        console.log(`📚 RAG vectoriel : ${chunks.length} passages trouvés`);
        return chunks.map(c => c.chunk_text);
      }
    }
  } catch (e) {
    console.warn('RAG vectoriel échoué, fallback mots-clés :', e.message);
  }

  // Récupère tous les chunks de l'utilisateur (nécessaire pour les deux fallbacks)
  const { data: allChunks, error: fetchError } = await supabase
    .from('document_chunks')
    .select('chunk_text')
    .eq('user_id', currentUser.id)
    .limit(200);

  if (fetchError || !allChunks || allChunks.length === 0) return null;

  // Tentative 2 : fallback recherche par mots-clés dans le contenu des chunks
  const stopWords = new Set([
    'le','la','les','de','du','des','un','une','et','en','au','aux',
    'que','qui','quoi','est','il','je','tu','vous','nous','me','ce',
    'se','sur','par','pour','dans','avec','sans','mais','ou','donc',
    'or','ni','car','a','à','the','is','of','in','it','be','to','what',
    // mots de requête courants à exclure (ne sont pas dans le contenu)
    'peux','peut','dire','parle','parler','fichier','document','contenu',
    'explique','expliquer','résume','résumer','montre','montrer','dis'
  ]);

  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));

  console.log(`🔍 RAG mots-clés recherchés :`, keywords);

  if (keywords.length > 0) {
    const scored = allChunks
      .map(c => {
        const text = c.chunk_text.toLowerCase();
        const score = keywords.reduce((acc, kw) => acc + (text.includes(kw) ? 1 : 0), 0);
        return { text: c.chunk_text, score };
      })
      .filter(c => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(c => c.text);

    if (scored.length > 0) {
      console.log(`📚 RAG mots-clés : ${scored.length} passages trouvés`);
      return scored;
    }
  }

  // Tentative 3 : fallback total — si l'utilisateur parle d'un document/fichier
  // et qu'on a des chunks en base, on les retourne tous (max 5)
  const docKeywords = ['fichier','document','readme','txt','pdf','csv','écrit','contenu','texte','uploaded','uploadé'];
  const queryLower = query.toLowerCase();
  const mentionsDoc = docKeywords.some(w => queryLower.includes(w));

  if (mentionsDoc && allChunks.length > 0) {
    console.log(`📚 RAG fallback total : ${Math.min(allChunks.length, 5)} chunks retournés`);
    return allChunks.slice(0, 5).map(c => c.chunk_text);
  }

  return null;
}

// ═══════════════ ANALYSE D'IMAGE ═══════════════
// L'image est stockée en attente — envoyée seulement quand l'utilisateur appuie sur Envoyer
let pendingImage = null; // { base64, mediaType, dataUrl, filename }

async function loadImageForSend(file) {
  if (!file || !currentUser) return;
  showImgChip(file.name, null); // chip sans miniature pendant l'upload
  imgUploadBtn.classList.add('analyzing');

  try {
    // Upload dans Supabase Storage
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${currentUser.id}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from('lion-images')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (error) throw error;

    // Récupère l'URL publique
    const { data: urlData } = supabase.storage
      .from('lion-images')
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Lit aussi en dataUrl pour la miniature locale
    const dataUrl = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = e => res(e.target.result);
      r.onerror = rej;
      r.readAsDataURL(file);
    });

    pendingImage = {
      publicUrl,
      storagePath: path,
      mediaType: file.type || 'image/jpeg',
      dataUrl,
      filename: file.name
    };

    // Met à jour le chip avec la miniature
    removeImgChip();
    showImgChip(file.name, dataUrl);
    userInput.placeholder = 'Posez une question sur cette image… (facultatif)';
    userInput.focus();
    updateSendBtn();
    console.log('🖼️ Image uploadée dans Storage :', publicUrl);
  } catch (err) {
    console.error('Erreur upload Storage:', err);
    showRagToast('❌ Upload image échoué : ' + err.message);
    removeImgChip();
  }
  imgUploadBtn.classList.remove('analyzing');
}

async function sendImageMessage(question) {
  if (!pendingImage || !currentConvId) return;
  const { publicUrl, dataUrl, filename, mediaType } = pendingImage;
  const lang = detectLanguage(question || 'fr');
  pendingImage = null;
  removeImgChip();
  userInput.placeholder = 'Envoyer un message…';

  const conv = conversations[currentConvId];

  // Bulle utilisateur : affiche l'image + question
  const userText = question ? `📷 ${esc(filename)}\n${question}` : `📷 ${esc(filename)}`;
  const imgMsg = { role: 'user', content: userText, timestamp: new Date().toISOString(), imageUrl: publicUrl };
  conv.messages.push(imgMsg);
  conv.contextMessages.push({ role: 'user', content: userText });
  saveMessageToDB(conv.id, imgMsg);

  const outerEl = buildOuter(imgMsg, conv.messages.length - 1);
  const bubble = outerEl.querySelector('.bubble');
  if (bubble) {
    const img = document.createElement('img');
    img.src = dataUrl; // miniature locale pour affichage immédiat
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
    // Envoie l'URL publique au Worker (pas de base64 lourd)
    const res = await fetch(WORKER_URL + 'analyze-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl: publicUrl, mediaType, question: question || 'Décris cette image en détail.', lang })
    });
    to.remove();
    const data = await res.json();
    if (!res.ok || data.error) {
      const detail = data.detail ? '\n' + data.detail : '';
      throw new Error((data.error || 'Erreur ' + res.status) + detail);
    }
    const answer = data.response || "Impossible d'analyser cette image.";
    const aiMsg = { role: 'assistant', content: answer, timestamp: new Date().toISOString() };
    conv.messages.push(aiMsg);
    conv.contextMessages.push({ role: 'assistant', content: answer });
    saveMessageToDB(conv.id, aiMsg);
    const aiOuter = buildOuter(aiMsg, conv.messages.length - 1);
    chatCont.appendChild(aiOuter);
    scroll();
    saveConversationToDB(conv);
    renderConvList();
  } catch (err) {
    to.remove();
    showRagToast('❌ ' + err.message);
  }

  isGenerating = false;
  updateSendBtn();
}

// ═══════════════ IMAGE CHIP (indicateur image en cours d'analyse) ═══════════════
function showImgChip(filename, dataUrl) {
  removeImgChip();
  const inputShell = document.querySelector('.input-shell');
  const chip = document.createElement('div');
  chip.id = 'imgChip';
  chip.className = 'img-chip';
  const thumb = document.createElement('img');
  thumb.className = 'img-chip-thumb';
  thumb.src = dataUrl;
  const name = document.createElement('span');
  name.className = 'img-chip-name';
  name.textContent = filename;
  const meta = document.createElement('span');
  meta.className = 'img-chip-meta';
  meta.textContent = 'Analyse en cours...';
  const close = document.createElement('button');
  close.className = 'img-chip-close';
  close.title = 'Annuler';
  close.textContent = '✕';
  close.addEventListener('click', () => { removeImgChip(); imgUploadBtn.classList.remove('analyzing'); });
  chip.appendChild(thumb);
  chip.appendChild(name);
  chip.appendChild(meta);
  chip.appendChild(close);
  inputShell.parentNode.insertBefore(chip, inputShell);
}

function removeImgChip() {
  const existing = document.getElementById('imgChip');
  if (existing) existing.remove();
}

// ═══════════════ FILE CHIP (indicateur fichier uploadé) ═══════════════
let activeFileName = null;

function showFileChip(filename, chunks) {
  activeFileName = filename;
  removeFileChip(); // supprime l'ancien si existant
  const inputShell = document.querySelector('.input-shell');
  const chip = document.createElement('div');
  chip.id = 'fileChip';
  chip.className = 'file-chip';
  chip.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
    '<span class="file-chip-name">' + esc(filename) + '</span>' +
    '<span class="file-chip-meta">' + chunks + ' passages</span>' +
    '<button class="file-chip-close" title="Retirer le fichier">✕</button>';
  chip.querySelector('.file-chip-close').addEventListener('click', () => {
    removeFileChip();
    activeFileName = null;
  });
  // Insère le chip au-dessus de l'input-shell
  inputShell.parentNode.insertBefore(chip, inputShell);
}

function removeFileChip() {
  const existing = document.getElementById('fileChip');
  if (existing) existing.remove();
}

function showRagToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1F2937;color:#fff;padding:0.6rem 1.2rem;border-radius:20px;font-size:0.85rem;z-index:250;box-shadow:0 4px 12px rgba(0,0,0,0.2);animation:toastIn 0.3s ease,toastOut 0.3s ease 2.5s forwards;';
  toast.textContent = message;
  document.body.appendChild(toast);
  const style = document.createElement('style');
  style.textContent = '@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes toastOut{from{opacity:1}to{opacity:0}}';
  document.head.appendChild(style);
  setTimeout(() => { toast.remove(); style.remove(); }, 3000);
}

// ═══════════════ RENDU CHAT ═══════════════
function renderChat() { chatCont.innerHTML = ''; if (!currentConvId || !conversations[currentConvId]) return; conversations[currentConvId].messages.forEach((m, i) => chatCont.appendChild(buildOuter(m, i))); if (stoppedConvId === currentConvId && stoppedPartial) attachContinueBanner(); scroll(); }
function buildOuter(msg, idx) { const o = document.createElement('div'); o.className = 'msg-outer'; o.dataset.idx = idx; const i = document.createElement('div'); i.className = 'msg-inner'; i.appendChild(buildRow(msg, idx)); o.appendChild(i); return o; }

function buildRow(msg, idx) {
  const row = document.createElement('div'); row.className = 'msg-row ' + msg.role;
  const av = document.createElement('div'); av.className = 'avatar ' + (msg.role === 'assistant' ? 'ai' : 'user');
  if (msg.role === 'assistant') {
    const img = document.createElement('img'); img.src = 'logo.svg'; img.alt = 'Lion AI';
    img.style.width = '28px'; img.style.height = '28px'; img.style.objectFit = 'contain'; img.style.borderRadius = '50%';
    img.onerror = function () { this.onerror = null; this.parentElement.style.background = 'var(--gray-100)'; this.parentElement.textContent = '🦁'; this.parentElement.style.fontSize = '16px'; };
    av.appendChild(img);
  } else av.textContent = 'V';
  const col = document.createElement('div'); col.className = 'bubble-col';
  if (msg.error) {
    const eb = document.createElement('div'); eb.className = 'error-bubble';
    eb.innerHTML = '<span>⚠️ ' + esc(msg.content) + '</span>';
    const rb = document.createElement('button'); rb.className = 'retry-btn'; rb.textContent = '↩ Réessayer';
    rb.addEventListener('click', () => retryMsg(idx)); eb.appendChild(rb); col.appendChild(eb);
  } else {
    const bubble = document.createElement('div'); bubble.className = 'bubble'; bubble.innerHTML = md(msg.content);
    if (msg.cached) { const b = document.createElement('span'); b.className = 'cached-badge'; b.textContent = '⚡ cache'; bubble.appendChild(b); }
    col.appendChild(bubble); attachCtx(bubble, idx, msg.role);
    if (msg.webSearch) { const b = document.createElement('div'); b.className = 'search-results-badge'; b.innerHTML = '🌐 Recherche web'; col.appendChild(b); }
    if (msg.ragUsed) { const b = document.createElement('div'); b.className = 'search-results-badge'; b.innerHTML = '📄 Connaissances personnelles'; b.style.background = '#ECFDF5'; b.style.border = '1px solid #A7F3D0'; b.style.color = '#059669'; col.appendChild(b); }
    const meta = document.createElement('div'); meta.className = 'msg-meta';
    const ts = document.createElement('span'); ts.className = 'timestamp'; ts.textContent = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''; meta.appendChild(ts);
    const acts = document.createElement('div'); acts.className = 'msg-actions';
    const cp = makeActBtn('📋', 'Copier'); cp.addEventListener('click', () => navigator.clipboard.writeText(msg.content).catch(() => {})); acts.appendChild(cp);
    if (msg.role === 'user') { const ed = makeActBtn('✏️', 'Modifier'); ed.addEventListener('click', () => startEdit(idx)); acts.appendChild(ed); const rt = makeActBtn('↩', 'Renvoyer'); rt.addEventListener('click', () => retryMsg(idx)); acts.appendChild(rt); }
    meta.appendChild(acts); col.appendChild(meta);
    if (msg.role === 'assistant' && !msg.isStreaming) col.appendChild(makeFeedback());
  }
  row.appendChild(av); row.appendChild(col); return row;
}

function makeActBtn(icon, title) { const b = document.createElement('button'); b.className = 'action-btn'; b.title = title; b.textContent = icon; return b; }
function makeFeedback() { const fb = document.createElement('div'); fb.className = 'feedback-row'; ['👍','👎'].forEach(icon => { const b = document.createElement('button'); b.className = 'fb-btn'; b.textContent = icon; b.addEventListener('click', () => { if (b.classList.contains('active')) return; fb.querySelectorAll('.fb-btn').forEach(x => x.classList.remove('active')); b.classList.add('active'); }); fb.appendChild(b); }); return fb; }

// ═══════════════ CONTINUE BANNER ═══════════════
function attachContinueBanner() { clearContinueBanner(); const outers = chatCont.querySelectorAll('.msg-outer'); let last = null; outers.forEach(o => { if (o.querySelector('.msg-row.assistant')) last = o; }); const banner = document.createElement('div'); banner.className = 'msg-outer'; const inner = document.createElement('div'); inner.className = 'msg-inner'; inner.style.alignItems = 'flex-start'; const btn = document.createElement('div'); btn.className = 'continue-banner'; btn.innerHTML = '<div class="continue-dot"></div><span>Continuer la réponse</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'; btn.addEventListener('click', continueGeneration); inner.appendChild(btn); banner.appendChild(inner); if (last && last.nextSibling) chatCont.insertBefore(banner, last.nextSibling); else chatCont.appendChild(banner); continueBannerEl = banner; scroll(); }
function clearContinueBanner() { if (continueBannerEl?.parentNode) continueBannerEl.parentNode.removeChild(continueBannerEl); continueBannerEl = null; }

// ═══════════════ CONTINUE GENERATION ═══════════════
async function continueGeneration() { if (isGenerating) return; const conv = conversations[currentConvId]; if (!conv) return; clearContinueBanner(); const partial = stoppedPartial; stoppedPartial = ''; stoppedConvId = null; const cp = 'Continue. Voici ce que tu avais écrit :\n\n' + partial + '\n\nContinue directement en français :'; const lang2 = detectLanguage(partial); const am = [{ role: 'system', content: sysPrompt(lang2) }, ...conv.contextMessages.filter(m => m.role !== 'system').slice(-8), { role: 'user', content: cp }]; const outers = chatCont.querySelectorAll('.msg-outer'); let last = null; outers.forEach(o => { if (o.querySelector('.msg-row.assistant')) last = o; }); let ab = last?.querySelector('.bubble'); if (ab) ab.innerHTML = md(partial); const to = createTypingIndicator(); chatCont.appendChild(to); scroll(); const cpl = { role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true }; conv.messages.push(cpl); let co = null, cb = null, cf = '', fc = true; const onC = c => { cf += c; if (fc) { fc = false; to.remove(); co = buildOuter({ role: 'assistant', content: '', timestamp: cpl.timestamp, isStreaming: true }, conv.messages.length - 1); chatCont.appendChild(co); cb = co.querySelector('.bubble'); } cb.innerHTML = md(cf); scroll(); }; isGenerating = true; updateSendBtn(); try { await withRetry(() => streamResponse(am, onC)); to.remove(); if (!co) { co = buildOuter({ role: 'assistant', content: cf, timestamp: cpl.timestamp }, conv.messages.length - 1); chatCont.appendChild(co); cb = co.querySelector('.bubble'); } cb.innerHTML = md(cf); cpl.content = cf; delete cpl.isStreaming; cpl.timestamp = new Date().toISOString(); conv.contextMessages.push({ role: 'assistant', content: cf }); saveMessageToDB(conv.id, { role: 'assistant', content: cf }); co.querySelector('.bubble-col').appendChild(makeFeedback()); } catch (e) { handleStreamError(e, to, cpl, co, cf, conv); } isGenerating = false; abortController = null; updateSendBtn(); saveConversationToDB(conv); renderConvList(); }

// ═══════════════ CONTEXT MENU ═══════════════
let lpTimer = null;
function attachCtx(bubble, idx, role) { const show = (x, y) => { ctxTargetIdx = idx; $('ctxEdit').style.display = role === 'user' ? 'flex' : 'none'; $('ctxRetry').style.display = role === 'user' ? 'flex' : 'none'; ctxMenu.style.left = Math.min(x, window.innerWidth - 190) + 'px'; ctxMenu.style.top = Math.min(y, window.innerHeight - 150) + 'px'; ctxMenu.classList.add('visible'); }; bubble.addEventListener('contextmenu', e => { e.preventDefault(); show(e.clientX, e.clientY); }); bubble.addEventListener('touchstart', e => { lpTimer = setTimeout(() => { const t = e.touches[0]; show(t.clientX, t.clientY); }, 500); }, { passive: true }); bubble.addEventListener('touchend', () => clearTimeout(lpTimer)); bubble.addEventListener('touchmove', () => clearTimeout(lpTimer)); }
document.addEventListener('click', e => { if (!ctxMenu.contains(e.target)) ctxMenu.classList.remove('visible'); });
$('ctxEdit').addEventListener('click', () => { ctxMenu.classList.remove('visible'); if (ctxTargetIdx != null) startEdit(ctxTargetIdx); });
$('ctxCopy').addEventListener('click', () => { ctxMenu.classList.remove('visible'); if (ctxTargetIdx != null) navigator.clipboard.writeText(conversations[currentConvId].messages[ctxTargetIdx].content).catch(() => {}); });
$('ctxRetry').addEventListener('click', () => { ctxMenu.classList.remove('visible'); if (ctxTargetIdx != null) retryMsg(ctxTargetIdx); });

// ═══════════════ EDIT ═══════════════
function startEdit(idx) { const conv = conversations[currentConvId]; const msg = conv.messages[idx]; if (!msg || msg.role !== 'user') return; const outer = chatCont.querySelector('.msg-outer[data-idx="' + idx + '"]'); if (!outer) return; const col = outer.querySelector('.bubble-col'); col.innerHTML = ''; const wrap = document.createElement('div'); wrap.className = 'edit-wrap'; const ta = document.createElement('textarea'); ta.className = 'edit-ta'; ta.value = msg.content; const btns = document.createElement('div'); btns.className = 'edit-btns'; const cancel = document.createElement('button'); cancel.className = 'edit-btn cancel'; cancel.textContent = 'Annuler'; const ok = document.createElement('button'); ok.className = 'edit-btn ok'; ok.textContent = 'Envoyer'; btns.appendChild(cancel); btns.appendChild(ok); wrap.appendChild(ta); wrap.appendChild(btns); col.appendChild(wrap); ta.style.height = ta.scrollHeight + 'px'; ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 'px'; }); ta.focus(); cancel.addEventListener('click', renderChat); ok.addEventListener('click', () => { const t = ta.value.trim(); if (!t || t === msg.content) { renderChat(); return; } editAndResend(idx, t); }); }
function editAndResend(idx, newText) { const conv = conversations[currentConvId]; conv.messages = conv.messages.slice(0, idx); conv.contextMessages = [{ role: 'system', content: sysPrompt(detectLanguage(newText)) }]; conv.messages.forEach(m => { if (m.role !== 'system') conv.contextMessages.push({ role: m.role, content: m.content }); }); clearContinueBanner(); stoppedPartial = ''; stoppedConvId = null; renderChat(); userInput.value = newText; sendMessage(); }
function retryMsg(idx) { const conv = conversations[currentConvId]; let i = idx; while (i >= 0 && conv.messages[i].role !== 'user') i--; if (i < 0) return; editAndResend(i, conv.messages[i].content); }

// ═══════════════ MÉMOIRE LONGUE ═══════════════
const SUMMARY_THRESHOLD = 16; // résume après 16 messages (8 échanges)

async function summarizeIfNeeded(conv) {
  if (!currentUser || !conv) return;
  const userMessages = conv.messages.filter(m => m.role !== 'system');
  if (userMessages.length < SUMMARY_THRESHOLD) return;
  // Vérifie si un résumé récent existe déjà
  const { data: existing } = await supabase
    .from('conversation_summaries')
    .select('messages_summarized, summary')
    .eq('conversation_id', conv.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Résume seulement si de nouveaux messages depuis le dernier résumé
  const alreadySummarized = existing?.messages_summarized || 0;
  if (userMessages.length - alreadySummarized < 8) return;

  const toSummarize = userMessages.slice(alreadySummarized, alreadySummarized + 12);
  const summaryPrompt = [
    { role: 'system', content: 'Résume cette conversation en 3-5 phrases concises en français. Garde les faits importants, décisions et contexte clé. Sois factuel.' },
    ...toSummarize.map(m => ({ role: m.role, content: m.content.slice(0, 300) })),
    { role: 'user', content: 'Fais un résumé concis de cet échange.' }
  ];

  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: summaryPrompt, stream: false, temperature: 0.3, max_tokens: 200 })
    });
    if (!res.ok) return;
    const data = await res.json();
    const summary = data?.result?.response || data?.response;
    if (!summary) return;

    // Stocke dans Supabase
    await supabase.from('conversation_summaries').insert({
      conversation_id: conv.id,
      user_id: currentUser.id,
      summary,
      messages_summarized: alreadySummarized + toSummarize.length
    });

    // Met à jour aussi la colonne summary dans conversations
    await supabase.from('conversations')
      .update({ summary })
      .eq('id', conv.id);

    console.log('🧠 Mémoire longue : résumé créé pour', conv.title);
  } catch (e) {
    console.warn('Résumé échoué (non critique) :', e.message);
  }
}

async function getConvSummary(convId) {
  if (!currentUser) return null;
  const { data } = await supabase
    .from('conversation_summaries')
    .select('summary')
    .eq('conversation_id', convId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data?.summary || null;
}

// ═══════════════ STREAMING ═══════════════
function estimateTokens(t) { return Math.ceil((t || '').split(/\s+/).length / 0.75); }
function prepareCtx(userMsg, conv, searchResults, ragResults, convSummary) {
  const lang = detectLanguage(userMsg);
  let ctx = [{ role: 'system', content: sysPrompt(lang) }];
  // Injecte le résumé de la conversation si disponible
  if (convSummary) {
    ctx.push({ role: 'system', content: '[MEMOIRE CONVERSATION]\n' + convSummary + '\n[FIN MEMOIRE]' });
  }
  if (ragResults?.length) {
    // Prompt RAG strict : interdit toute invention, oblige à citer le contenu exact
    ctx.push({ role: 'system', content: [
      'CONTEXTE DOCUMENT - LIS ATTENTIVEMENT :',
      '='.repeat(40),
      ragResults.join('\n---\n'),
      '='.repeat(40),
      'INSTRUCTION : Reponds a la question de l utilisateur EN UTILISANT UNIQUEMENT le texte ci-dessus.',
      'Si la reponse est dans le texte, cite-la. Ne dis jamais que tu n as pas acces au fichier.',
      'Langue : francais uniquement.'
    ].join('\n') });
  }
  if (searchResults?.length) { const facts = searchResults.map(r => r.snippet).filter(s => s.length > 20).join(' | '); ctx.push({ role: 'system', content: 'INFORMATIONS WEB pour "' + userMsg + '" :\n' + facts + '\n\nTRADUIS et REFORMULE en français. Réponds en 1-3 phrases.' }); }
  const hist = conv.contextMessages.filter(m => m.role !== 'system' && !m.content.startsWith('INFORMATIONS') && !m.content.startsWith('CONNAISSANCES') && !m.content.startsWith('DOCUMENT'));
  ctx = ctx.concat(hist, [{ role: 'user', content: userMsg }]);
  let tok = ctx.reduce((s, m) => s + estimateTokens(m.content), 0);
  while (tok > MAX_CONTEXT_TOKENS && ctx.length > 3) { const idx = ctx.findIndex(m => m.role !== 'system' && !m.content.startsWith('[RÉSUMÉ]')); if (idx === -1) break; ctx.splice(idx, 1, { role: 'system', content: '[RÉSUMÉ] ' + ctx[idx].content.slice(0, 80) + '...' }); tok = ctx.reduce((s, m) => s + estimateTokens(m.content), 0); }
  return ctx;
}
async function streamResponse(messages, onChunk) { abortController = new AbortController(); const tid = setTimeout(() => abortController.abort(), 25000); const res = await fetch(WORKER_URL, { method: 'POST', signal: abortController.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages, stream: true, temperature: 0.1, max_tokens: 300 }) }); clearTimeout(tid); if (!res.ok) { const t = await res.text(); throw new Error('Erreur ' + res.status + ': ' + t.slice(0, 200)); } const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true }); const lines = buf.split('\n'); buf = lines.pop(); for (let l of lines) { l = l.trim(); if (!l || !l.startsWith('data: ')) continue; const d = l.slice(6); if (d === '[DONE]') continue; try { const j = JSON.parse(d); if (j.response) onChunk(j.response); } catch (e) {} } } }
async function withRetry(fn, n = 2) { for (let i = 0; i <= n; i++) { try { return await fn(); } catch (e) { if (e.name === 'AbortError') throw e; if (i === n) throw e; await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i))); } } }
function createTypingIndicator() { const to = document.createElement('div'); to.className = 'typing-outer'; const ti = document.createElement('div'); ti.className = 'typing-inner'; const tr = document.createElement('div'); tr.className = 'typing-row-el'; const ta = document.createElement('div'); ta.className = 'avatar ai'; const img = document.createElement('img'); img.src = 'logo.svg'; img.style.width = '28px'; img.style.height = '28px'; img.style.objectFit = 'contain'; img.style.borderRadius = '50%'; img.onerror = function () { this.onerror = null; this.parentElement.style.background = 'var(--gray-100)'; this.parentElement.textContent = '🦁'; this.parentElement.style.fontSize = '16px'; }; ta.appendChild(img); const ti2 = document.createElement('div'); ti2.className = 'typing-indicator'; ti2.innerHTML = '<span></span><span></span><span></span>'; tr.appendChild(ta); tr.appendChild(ti2); ti.appendChild(tr); to.appendChild(ti); return to; }
function handleStreamError(e, to, placeholder, aOuter, full, conv) { to.remove(); if (e.name === 'AbortError') { if (aOuter && full) { aOuter.querySelector('.bubble').innerHTML = md(full) + ' <span style="opacity:.4">⏹</span>'; placeholder.content = full; delete placeholder.isStreaming; conv.contextMessages.push({ role: 'assistant', content: full }); stoppedPartial = full; stoppedConvId = currentConvId; attachContinueBanner(); } else { conv.messages.pop(); if (aOuter) aOuter.remove(); } } else { placeholder.content = e.message; placeholder.error = true; delete placeholder.isStreaming; if (aOuter) aOuter.remove(); chatCont.appendChild(buildOuter(placeholder, conv.messages.length - 1)); } }

// ═══════════════ SEND MESSAGE ═══════════════
async function sendMessage() {
  if (isGenerating) { abortController?.abort(); return; }
  if (!currentConvId) return;
  const text = userInput.value.trim();

  // Si une image est en attente, l'envoyer avec le texte comme question
  if (pendingImage) {
    userInput.value = '';
    userInput.style.height = '';
    await sendImageMessage(text);
    return;
  }

  if (!text) return;
  clearContinueBanner(); stoppedPartial = ''; stoppedConvId = null;
  const conv = conversations[currentConvId]; const cacheKey = text.toLowerCase().trim();
  const requestStart = Date.now();

  if (conv.cache[cacheKey] && !webSearchForced) {
    const cached = conv.cache[cacheKey];
    const cachedMsg = { role: 'assistant', content: cached, timestamp: new Date().toISOString(), cached: true };
    conv.messages.push(cachedMsg); conv.contextMessages.push({ role: 'assistant', content: cached });
    userInput.value = ''; userInput.style.height = '';
    chatCont.appendChild(buildOuter(cachedMsg, conv.messages.length - 1));
    scroll(); saveConversationToDB(conv); renderConvList();
    logAnalytics({ query: text, response: cached, duration_ms: Date.now() - requestStart, tokens_input: estimateTokens(text), tokens_output: estimateTokens(cached), status: 'cache_hit', has_search: false });
    return;
  }
  userInput.value = ''; userInput.style.height = '';
  if (!conv.messages.some(m => m.role === 'user')) { conv.title = text.slice(0, 50) + (text.length > 50 ? '…' : ''); saveConversationToDB(conv); renderConvList(); }

  // ✅ FIX : cherche d'abord dans les documents personnels
  let ragResults = await searchDocuments(text);

  // ✅ FIX : web search seulement si pas de docs pertinents (ou bouton 🌐 forcé)
  const shouldSearch = webSearchForced || !ragResults?.length;

  let searchResults = null;
  if (shouldSearch) {
    const si = document.createElement('div'); si.className = 'msg-outer';
    si.innerHTML = '<div class="msg-inner" style="align-items:flex-start"><div class="search-indicator"><div class="spinner"></div>🔍 Recherche en cours...</div></div>';
    chatCont.appendChild(si); scroll(); searchResults = await searchWeb(text); si.remove();
    if (searchResults?.length) { const rb = document.createElement('div'); rb.className = 'msg-outer'; rb.innerHTML = '<div class="msg-inner" style="align-items:flex-start"><div class="search-results-badge">🌐 ' + searchResults.length + ' résultat(s)</div></div>'; chatCont.appendChild(rb); scroll(); }
    webSearchForced = false; webSearchBtn.classList.remove('active');
  }

  const userMsg = { role: 'user', content: text, timestamp: new Date().toISOString(), webSearch: (searchResults?.length > 0), ragUsed: (ragResults?.length > 0) };
  conv.messages.push(userMsg); conv.contextMessages.push({ role: 'user', content: text });
  saveMessageToDB(conv.id, { role: 'user', content: text, webSearch: (searchResults?.length > 0) });
  chatCont.appendChild(buildOuter(userMsg, conv.messages.length - 1)); scroll();

  // Mémoire longue : résume si nécessaire + récupère résumé existant
  summarizeIfNeeded(conv); // async, non bloquant
  const convSummary = await getConvSummary(conv.id);
  const apiMessages = prepareCtx(text, conv, searchResults, ragResults, convSummary);
  const tokensInput = estimateTokens(apiMessages.map(m => m.content).join(' '));
  const to = createTypingIndicator(); chatCont.appendChild(to); scroll();
  const placeholder = { role: 'assistant', content: '', timestamp: new Date().toISOString(), isStreaming: true, webSearch: (searchResults?.length > 0), ragUsed: (ragResults?.length > 0) };
  conv.messages.push(placeholder);

  const aOuter = buildOuter({ role: 'assistant', content: '', timestamp: placeholder.timestamp, isStreaming: true, webSearch: placeholder.webSearch, ragUsed: placeholder.ragUsed }, conv.messages.length - 1);
  let aBubble = null, full = '', firstChunk = true;
  const onChunk = chunk => { full += chunk; if (firstChunk) { firstChunk = false; to.remove(); chatCont.appendChild(aOuter); aBubble = aOuter.querySelector('.bubble'); } aBubble.innerHTML = md(full); scroll(); };

  isGenerating = true; updateSendBtn();
  try {
    await withRetry(() => streamResponse(apiMessages, onChunk)); to.remove();
    if (firstChunk) { chatCont.appendChild(aOuter); aBubble = aOuter.querySelector('.bubble'); }
    aBubble.innerHTML = md(full);
    placeholder.content = full; delete placeholder.isStreaming; placeholder.timestamp = new Date().toISOString();
    conv.contextMessages.push({ role: 'assistant', content: full });
    saveMessageToDB(conv.id, { role: 'assistant', content: full, webSearch: placeholder.webSearch });
    aOuter.querySelector('.bubble-col').appendChild(makeFeedback());
    if (full && !placeholder.error) { conv.cache[cacheKey] = full; saveCacheToDB(cacheKey, full); const keys = Object.keys(conv.cache); if (keys.length > 50) delete conv.cache[keys[0]]; }
    logAnalytics({ query: text, response: full, duration_ms: Date.now() - requestStart, tokens_input: tokensInput, tokens_output: estimateTokens(full), status: 'success', has_search: searchResults?.length > 0 });
  } catch (e) {
    handleStreamError(e, to, placeholder, aOuter, full, conv);
    logAnalytics({ query: text, response: e.message, duration_ms: Date.now() - requestStart, tokens_input: tokensInput, tokens_output: 0, status: 'error', has_search: searchResults?.length > 0 });
  }
  isGenerating = false; abortController = null; updateSendBtn(); saveConversationToDB(conv); renderConvList();
}

function updateSendBtn() { if (isGenerating) { sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>'; sendBtn.classList.add('stop'); sendBtn.disabled = false; } else { sendBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>'; sendBtn.classList.remove('stop'); sendBtn.disabled = !userInput.value.trim() && !pendingImage; } }

// ═══════════════ EVENTS ═══════════════
hamburgerBtn.addEventListener('click', () => sidebar.classList.contains('open') ? closeSidebar() : openSidebar());
overlay.addEventListener('click', closeSidebar);
newChatSBtn.addEventListener('click', () => switchConv(createConv()));
newChatTBtn.addEventListener('click', () => switchConv(createConv()));
userInput.addEventListener('input', () => { updateSendBtn(); userInput.style.height = 'auto'; userInput.style.height = Math.min(userInput.scrollHeight, 120) + 'px'; });
userInput.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (isGenerating) { abortController?.abort(); } else if (userInput.value.trim()) sendMessage(); } });
sendBtn.addEventListener('click', sendMessage);
webSearchBtn.addEventListener('click', () => { webSearchForced = !webSearchForced; webSearchForced ? webSearchBtn.classList.add('active') : webSearchBtn.classList.remove('active'); });

// ✅ RAG events
ragUploadBtn.addEventListener('click', () => ragFileInput.click());
ragFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) uploadDocument(file);
  ragFileInput.value = '';
});

// ✅ Image analysis events
imgUploadBtn.addEventListener('click', () => imgFileInput.click());
imgFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) loadImageForSend(file);
  imgFileInput.value = '';
});

// ═══════════════ PWA : Service Worker ═══════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('✅ PWA Service Worker enregistré'))
      .catch(e => console.warn('SW non enregistré :', e.message));
  });
}

// ═══════════════ STT : Reconnaissance vocale ═══════════════
let isListening = false;
let recognition = null;

function initSTT() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    micBtn.style.display = 'none'; // cache le bouton si non supporté
    console.warn('STT non supporté sur ce navigateur');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  // Détecte la langue du dernier message pour adapter la reconnaissance
  recognition.lang = 'fr-FR';

  recognition.onstart = () => {
    isListening = true;
    micBtn.classList.add('listening');
    micBtn.title = 'Écoute en cours… (clic pour arrêter)';
    userInput.placeholder = '🎤 Écoute en cours…';
  };

  recognition.onresult = (event) => {
    let interim = '';
    let final = '';
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
    micBtn.title = 'Parler à Lion AI';
    userInput.placeholder = 'Envoyer un message…';
    // Envoie automatiquement si du texte a été reconnu
    if (userInput.value.trim()) sendMessage();
  };

  recognition.onerror = (e) => {
    isListening = false;
    micBtn.classList.remove('listening');
    userInput.placeholder = 'Envoyer un message…';
    if (e.error !== 'no-speech') showRagToast('❌ Micro : ' + e.error);
  };
}

function toggleMic() {
  if (!recognition) return;
  if (isListening) {
    recognition.stop();
  } else {
    // Adapte la langue selon le dernier message de l'utilisateur
    const conv = conversations[currentConvId];
    if (conv?.messages?.length) {
      const lastUser = [...conv.messages].reverse().find(m => m.role === 'user');
      if (lastUser) {
        const lang = detectLanguage(lastUser.content);
        const langMap = { fr: 'fr-FR', en: 'en-US', ar: 'ar-SA', es: 'es-ES', de: 'de-DE', it: 'it-IT', pt: 'pt-PT' };
        recognition.lang = langMap[lang] || 'fr-FR';
      }
    }
    recognition.start();
  }
}

if (micBtn) micBtn.addEventListener('click', toggleMic);

// ═══════════════ INIT ═══════════════
async function initApp() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) { window.location.href = 'login.html'; return; }
  currentUser = session.user;
  await loadConversationsFromDB();
  const ids = Object.keys(conversations);
  currentConvId = ids.length ? ids[0] : createConv();
  loadCacheFromDB();
  renderConvList();
  renderChat();
  updateSendBtn();
  initSTT();
  console.log('📊 [Lion AI] Observabilité activée — RAG + PWA + STT prêts');
}
initApp();
