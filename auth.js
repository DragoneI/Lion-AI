// ═══════════════ CONFIGURATION AUTH ═══════════════
const SUPABASE_URL = "https://jiycrapjqclvcsrvdldt.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImppeWNyYXBqcWNsdmNzcnZkbGR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4NTE4NDUsImV4cCI6MjA5NDQyNzg0NX0.wIOoCURRDLmws-frss9g4pG4UBgH4jSLhNezJsc5JdM";

// Nom unique pour éviter tout conflit avec d'autres scripts
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

// ═══════════════ MESSAGES ═══════════════
function showMessage(type, title, msg) {
  const icons = { error: '❌', success: '✅', info: 'ℹ️' };
  $('authMessageContainer').innerHTML = `
    <div class="auth-message ${type}">
      <div class="auth-message-icon">${icons[type]}</div>
      <div><strong>${title}</strong>${msg}</div>
    </div>`;
  if (type !== 'error') setTimeout(() => { $('authMessageContainer').innerHTML = ''; }, 8000);
}

// ═══════════════ SWITCH LOGIN / SIGNUP ═══════════════
$('authSwitch').addEventListener('click', () => {
  isLoginMode = !isLoginMode;
  if (isLoginMode) {
    $('authFormTitle').textContent    = 'Bon retour 👋';
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
    // Stocker la session pour script.js
    window.location.href = 'index.html';
  } else {
    const { error } = await _lionAuth.auth.signUp({ email, password });
    if (error) { showMessage('error', "Erreur d'inscription", error.message); return; }
    showMessage('success', 'Compte créé !', ' Un email de confirmation vous a été envoyé. Vérifiez votre boîte mail (et vos spams).');
    isLoginMode = true;
    $('authFormTitle').textContent    = 'Bon retour 👋';
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
    options: { redirectTo: window.location.origin + '/index.html' }
  });
  if (error) showMessage('error', 'Erreur Google', error.message);
});

// ═══════════════ REDIRIGER SI DÉJÀ CONNECTÉ ═══════════════
_lionAuth.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    window.location.href = 'index.html';
  }
});