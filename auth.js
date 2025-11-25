// auth.js
// Funções centrais: login, register, check authorization, admin actions, theme.

function encodeEmail(email){
  return email.replace(/\./g, ',');
}

// EXTRAS: theme (dark/light)
const Theme = {
  load() {
    const t = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
  },
  toggle() {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    localStorage.setItem('theme', nxt);
    // update toggle button if exists
    const btn = document.getElementById('themeToggle');
    if (btn) btn.textContent = nxt === 'dark' ? 'Light' : 'Dark';
  }
};

document.addEventListener('DOMContentLoaded', () => {
  Theme.load();

  // LOGIN
  const loginForm = document.getElementById('loginForm');
  if (loginForm){
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) return alert('Preencha email e senha');
      auth.signInWithEmailAndPassword(email, password)
        .then(() => {
          window.location.href = 'home.html';
        })
        .catch(err => alert('Erro: ' + err.message));
    });
  }

  // REGISTER
  const registerForm = document.getElementById('registerForm');
  if (registerForm){
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      const name = document.getElementById('regName') ? document.getElementById('regName').value.trim() : '';
      if (!email || !password) return alert('Preencha email e senha');

      // create user
      auth.createUserWithEmailAndPassword(email, password)
        .then((cred) => {
          // create a profile doc (optional)
          db.collection('users').doc(encodeEmail(email)).set({
            email,
            name: name || null,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            authorized: false
          }, { merge: true });
          alert('Conta criada com sucesso! Aguarde autorização do admin. Você será redirecionado para a página inicial.');
          window.location.href = 'index.html';
        })
        .catch(err => alert('Erro: ' + err.message));
    });
  }

  // LOGOUT (global)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // ADMIN ACTIONS (form handlers)
  const addEmailForm = document.getElementById('addEmailForm');
  if (addEmailForm){
    addEmailForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const em = document.getElementById('authEmail').value.trim();
      if (!em) return alert('Email inválido');
      try {
        await db.collection('authorizedEmails').doc(encodeEmail(em)).set({
          email: em,
          addedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        // also mark in users collection if exists
        await db.collection('users').doc(encodeEmail(em)).set({ authorized: true }, { merge: true });
        alert('Email autorizado!');
        loadAdminLists();
        document.getElementById('authEmail').value = '';
      } catch (err) {
        alert('Erro: ' + err.message);
      }
    });
  }

  const addVideoForm = document.getElementById('addVideoForm');
  if (addVideoForm){
    addVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('videoTitle').value.trim();
      const url = document.getElementById('videoUrl').value.trim();
      if (!url) return alert('Cole o link do vídeo do YouTube');
      // extrair ID do youtube
      const id = extractYouTubeID(url);
      if (!id) return alert('URL do YouTube inválida');
      try {
        await db.collection('videos').add({
          title: title || '',
          ytId: id,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Vídeo adicionado!');
        document.getElementById('videoTitle').value = '';
        document.getElementById('videoUrl').value = '';
        loadAdminLists();
      } catch (err) {
        alert('Erro: ' + err.message);
      }
    });
  }

  // Page-protection: run for protected pages
  auth.onAuthStateChanged(async (user) => {
    // if on home.html -> check authorized
    const protectedContent = document.getElementById('protected-content');
    if (protectedContent){
      if (!user){
        window.location.href = 'index.html';
        return;
      }
      const email = user.email;
      const enc = encodeEmail(email);
      const doc = await db.collection('authorizedEmails').doc(enc).get();
      const isAuthorized = doc.exists;
      // admins should always be allowed
      const isAdmin = await checkIsAdmin(email);
      if (!isAuthorized && !isAdmin){
        // show "awaiting authorization"
        protectedContent.innerHTML = `
          <div class="card centered">
            <h2>Aguardando autorização</h2>
            <p>Sua conta foi criada com sucesso, mas ainda não foi autorizada pelo administrador.</p>
            <p>Volte mais tarde. Contate o suporte se necessário.</p>
            <button id="logoutBtnSmall" class="btn secondary">Sair</button>
          </div>
        `;
        document.getElementById('logoutBtnSmall').addEventListener('click', logout);
        return;
      }

      // se autorizado, carrega lista de vídeos para o aluno
      loadStudentVideos();
    }

    // se estiver no admin.html, verificar se é admin
    const adminArea = document.getElementById('admin-area');
    if (adminArea){
      if (!user){
        window.location.href = 'index.html';
        return;
      }
      const isAdmin = await checkIsAdmin(user.email);
      if (!isAdmin){
        alert('Acesso negado — precisa ser administrador');
        window.location.href = 'index.html';
        return;
      }
      // load admin lists
      loadAdminLists();
    }
  });
});

// helpers

async function checkIsAdmin(email){
  if (!email) return false;
  const enc = encodeEmail(email);
  const doc = await db.collection('admins').doc(enc).get();
  return doc.exists;
}

function logout(){
  auth.signOut().then(() => window.location.href = 'index.html');
}

// Extract YouTube ID from various URL formats
function extractYouTubeID(url){
  if (!url) return null;
  const regex = /(?:youtube\.com\/.*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const m = url.match(regex);
  return m ? m[1] : null;
}

// STUDENT: load videos and render
async function loadStudentVideos(){
  const listEl = document.getElementById('videosList');
  if (!listEl) return;
  listEl.innerHTML = '<p>Carregando vídeos...</p>';
  const snap = await db.collection('videos').orderBy('createdAt','desc').get();
  if (snap.empty){
    listEl.innerHTML = '<p>Nenhum vídeo disponível ainda.</p>';
    return;
  }
  listEl.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const title = d.title || 'Mentoria';
    const ytId = d.ytId;
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <h3>${escapeHtml(title)}</h3>
      <div class="video-embed">
        <iframe src="https://www.youtube.com/embed/${ytId}" frameborder="0" allowfullscreen></iframe>
      </div>
    `;
    listEl.appendChild(card);
  });
}

// ADMIN: load lists (authorized emails + videos)
async function loadAdminLists(){
  const emailsEl = document.getElementById('authorizedEmailsList');
  const videosEl = document.getElementById('adminVideosList');
  if (emailsEl) {
    emailsEl.innerHTML = 'Carregando...';
    const snap = await db.collection('authorizedEmails').orderBy('addedAt','desc').get();
    if (snap.empty) emailsEl.innerHTML = '<p>Sem emails autorizados</p>';
    else {
      emailsEl.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        const email = d.email;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div>${escapeHtml(email)}</div>
          <div>
            <button class="btn danger" onclick="removeAuthorized('${id}')">Remover</button>
          </div>
        `;
        emailsEl.appendChild(row);
      });
    }
  }

  if (videosEl){
    videosEl.innerHTML = 'Carregando...';
    const snap = await db.collection('videos').orderBy('createdAt','desc').get();
    if (snap.empty) videosEl.innerHTML = '<p>Sem vídeos</p>';
    else {
      videosEl.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        const title = d.title || '';
        const ytId = d.ytId;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div><strong>${escapeHtml(title)}</strong><br><small>${escapeHtml(ytId)}</small></div>
          <div>
            <button class="btn danger" onclick="removeVideo('${id}')">Remover</button>
          </div>
        `;
        videosEl.appendChild(row);
      });
    }
  }
}

// admin actions
async function removeAuthorized(docId){
  if (!confirm('Remover este email da lista de autorizados?')) return;
  try {
    await db.collection('authorizedEmails').doc(docId).delete();
    // optional: update users collection authorized flag (if exists)
    // trying to decode email from docId
    const decoded = docId.replace(/,/g, '.');
    await db.collection('users').doc(docId).set({ authorized: false }, { merge: true });
    alert('Removido');
    loadAdminLists();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

async function removeVideo(docId){
  if (!confirm('Remover este vídeo?')) return;
  try {
    await db.collection('videos').doc(docId).delete();
    alert('Vídeo removido');
    loadAdminLists();
  } catch (err) {
    alert('Erro: ' + err.message);
  }
}

// safety helper
function escapeHtml(s){
  if (!s) return '';
  return s.replace(/[&<>"'\/]/g, function(c){
    return {
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'
    }[c];
  });
}
