// ═══════════════ CONFIGURATION AUTH ═══════════════
const SUPABASE_URL = "https://jiycrapjqclvcsrvdldt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppeWNyYXBqcWNsdmNzcnZkbGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTE4NDUsImV4cCI6MjA5NDQyNzg0NX0.wIOoCURRDLmws-frss9g4pG4UBgH4jSLhNezJsc5JdM";

const _lionAuth = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let isLoginMode = true;

const $ = (id) => document.getElementById(id);

// ═══════════════ ŒIL MOT DE PASSE ═══════════════
$('eyeToggle').addEventListener('click', () => {
  const pw = $('authPassword');
  const isPassword = pw.type === 'password';
  pw.type = isPassword ? 'text' : 'password';
  $('eyeOffIcon').style.display = isPassword ? 'none' : 'block';
  $('eyeOnIcon').style.display  = isPassword ? 'block' : 'none';
});

// ═══════════════ ICÔNES SVG ═══════════════
const ICONS = {
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`
};

// ═══════════════ MESSAGES ═══════════════
function showMessage(type, title, msg) {
  $('authMessageContainer').innerHTML = `
    <div class="auth-message ${type}">
      <div class="auth-message-icon">${ICONS[type]}</div>
      <div><strong>${title}</strong>${msg}</div>
    </div>`;
  if (type !== 'error') setTimeout(() => { $('authMessageContainer').innerHTML = ''; }, 8000);
}

// ═══════════════ SWITCH LOGIN / SIGNUP ═══════════════
$('authSwitch').addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    $('authFormTitle').textContent    = 'Bon retour';
    $('authFormSubtitle').textContent = 'Connectez-vous à votre compte';
    $('authSubmitText').textContent   = 'Se connecter';
    $('authSwitch').textContent       = 'Créer un compte';
    $('authSwitchLabel').textContent  = 'Pas encore de compte ?';
  } else {
    $('authFormTitle').textContent    = 'Créer un compte';
    $('authFormSubtitle').textContent = 'Rejoignez Lion AI gratuitement';
    $('authSubmitText').textContent   = 'Créer mon compte';
    $('authSwitch').textContent       = 'Se connecter';
    $('authSwitchLabel').textContent  = 'Vous avez déjà un compte ?';
  }
  $('authMessageContainer').innerHTML = '';
});

// ═══════════════ FORMULAIRE ═══════════════
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('authMessageContainer').innerHTML = '';
  const email    = $('authEmail').value.trim();
  const password = $('authPassword').value.trim();

  if (isLoginMode) {
    const { data, error } = await _lionAuth.auth.signInWithPassword({ email, password });
    if (error) { showMessage('error', 'Erreur de connexion', error.message); return; }
    window.location.href = 'chat.html';
  } else {
    const { error } = await _lionAuth.auth.signUp({ email, password });
    if (error) { showMessage('error', "Erreur d'inscription", error.message); return; }
    showMessage('success', 'Compte créé !', ' Un email de confirmation vous a été envoyé. Vérifiez votre boîte mail (et vos spams).');
    isLoginMode = true;
    $('authFormTitle').textContent    = 'Bon retour';
    $('authFormSubtitle').textContent = 'Connectez-vous à votre compte';
    $('authSubmitText').textContent   = 'Se connecter';
    $('authSwitch').textContent       = 'Créer un compte';
    $('authSwitchLabel').textContent  = 'Pas encore de compte ?';
  }
});

// ═══════════════ GOOGLE ═══════════════
$('googleBtn').addEventListener('click', async () => {
  $('authMessageContainer').innerHTML = '';
  const { error } = await _lionAuth.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + '/chat.html' }
  });
  if (error) showMessage('error', 'Erreur Google', error.message);
});

// ═══════════════ REDIRIGER SI DÉJÀ CONNECTÉ ═══════════════
_lionAuth.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) window.location.href = 'chat.html';
});
