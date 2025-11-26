// auth.js
// Usa Firebase v8 (compatível com firebase.js acima)

// === Helpers ===
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"'\/]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'}[c];
  });
}

// Extrai ID do Google Drive
function extractDriveID(url){
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Theme manager
const Theme = {
  load(){
    const t = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    const btns = document.querySelectorAll('#themeToggle');
    btns.forEach(b => b.textContent = t === 'dark' ? 'Light' : 'Dark');
  },
  toggle(){
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    localStorage.setItem('theme', nxt);
    const btns = document.querySelectorAll('#themeToggle');
    btns.forEach(b => b.textContent = nxt === 'dark' ? 'Light' : 'Dark');
  }
};

// === Auth & UI wiring ===
document.addEventListener('DOMContentLoaded', () => {
  Theme.load();

  // Login
  const loginForm = document.getElementById('loginForm');
  if (loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if(!email || !password) return alert('Preencha email e senha.');
      try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'dashboard.html';
      } catch(err){
        alert('Erro: ' + err.message);
      }
    });
  }

  // Register
  const registerForm = document.getElementById('registerForm');
  if (registerForm){
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName') ? document.getElementById('regName').value.trim() : '';
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      if(!email || !password) return alert('Preencha email e senha.');
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        await db.collection('users').doc(uid).set({
          uid,
          email,
          name: name || null,
          authorized: false,
          role: 'user',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        alert('Conta criada com sucesso! Aguarde autorização do administrador.');
        await auth.signOut();
        window.location.href = 'index.html';
      } catch(err){
        alert('Erro: ' + err.message);
      }
    });
  }

  // Logout button (global)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', logout);

  // ADMIN: authorize user form
  const addUserForm = document.getElementById('addUserForm');
  if (addUserForm){
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      if(!email) return alert('Digite um email válido.');
      try {
        const snap = await db.collection('users').where('email','==', email).get();
        if (snap.empty){
          return alert('Usuário não encontrado. Peça para o aluno se registrar primeiro.');
        }
        snap.forEach(async (doc) => {
          await db.collection('users').doc(doc.id).update({ authorized: true });
        });
        alert('Usuário(s) autorizado(s).');
        document.getElementById('authEmail').value = '';
        loadAdminLists();
      } catch(err){
        alert('Erro: ' + err.message);
      }
    });
  }

  // ADMIN: add video form (Google Drive)
  const addVideoForm = document.getElementById('addVideoForm');
  if (addVideoForm){
    addVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('videoTitle').value.trim();
      const url = document.getElementById('videoUrl').value.trim();
      const id = extractDriveID(url);
      if(!id) return alert('URL do Google Drive inválida. Cole o link de compartilhamento completo.');
      try {
        await db.collection('videos').add({
          title: title || null,
          driveId: id,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert('Vídeo adicionado!');
        document.getElementById('videoTitle').value = '';
        document.getElementById('videoUrl').value = '';
        loadAdminLists();
      } catch(err){
        alert('Erro: ' + err.message);
      }
    });
  }

  // Page protection and dynamic content loading
  auth.onAuthStateChanged(async (user) => {
    // Dashboard protection
    const dashboardArea = document.getElementById('dashboard-content');
    if (dashboardArea){
      if (!user){
        window.location.href = 'index.html';
        return;
      }
      const udoc = await db.collection('users').doc(user.uid).get();
      if (!udoc.exists){
        alert('Perfil não encontrado. Contate o admin.');
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      const udata = udoc.data();
      if (udata.authorized !== true && udata.role !== 'admin'){
        alert('Sua conta ainda não foi autorizada pelo administrador.');
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      document.getElementById('userName') && (document.getElementById('userName').textContent = udata.name || udata.email);
      loadStudentVideos();
    }

    // Admin area protection
    const adminArea = document.getElementById('admin-area');
    if (adminArea){
      if (!user){
        window.location.href = 'index.html';
        return;
      }
      const udoc = await db.collection('users').doc(user.uid).get();
      if (!udoc.exists || udoc.data().role !== 'admin'){
        alert('Acesso negado. É preciso ser administrador.');
        window.location.href = 'dashboard.html';
        return;
      }
      loadAdminLists();
    }
  });

}); // DOMContentLoaded

// === Logout ===
async function logout(){
  await auth.signOut();
  window.location.href = 'index.html';
}

// === Student: load videos (Google Drive) ===
async function loadStudentVideos(){
  const listEl = document.getElementById('videosList');
  if (!listEl) return;
  listEl.innerHTML = '<p>Carregando vídeos...</p>';
  const snap = await db.collection('videos').orderBy('createdAt','asc').get();
  if (snap.empty){
    listEl.innerHTML = '<p>Nenhum vídeo disponível ainda.</p>';
    return;
  }
  listEl.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const card = document.createElement('div');
    card.className = 'video-card';
    const videoURL = `https://drive.google.com/uc?export=download&id=${d.driveId}`;
    card.innerHTML = `
      <h3>${escapeHtml(d.title || 'Mentoria')}</h3>
      <video controls style="width:100%; border-radius:8px;" preload="metadata">
        <source src="${videoURL}" type="video/mp4">
        Seu navegador não suporta vídeo.
      </video>
    `;
    listEl.appendChild(card);
  });
}

// === Admin: load lists ===
async function loadAdminLists(){
  const usersEl = document.getElementById('usersList');
  if (usersEl){
    usersEl.innerHTML = 'Carregando usuários...';
    const snap = await db.collection('users').orderBy('createdAt','desc').get();
    if (snap.empty){
      usersEl.innerHTML = '<p>Sem usuários registrados</p>';
    } else {
      usersEl.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div>
            <strong>${escapeHtml(d.name || d.email)}</strong><br>
            <small>${escapeHtml(d.email)}</small>
          </div>
          <div>
            ${d.authorized ? `<button class="btn secondary" onclick="revokeUser('${id}')">Revogar</button>` : `<button class="btn" onclick="authorizeUser('${id}')">Autorizar</button>`}
            ${d.role === 'admin' ? '<span style="margin-left:8px;font-weight:600;color:var(--accent)">ADMIN</span>' : ''}
          </div>
        `;
        usersEl.appendChild(row);
      });
    }
  }

  const videosEl = document.getElementById('adminVideosList');
  if (videosEl){
    videosEl.innerHTML = 'Carregando vídeos...';
    const snap = await db.collection('videos').orderBy('createdAt','desc').get();
    if (snap.empty) videosEl.innerHTML = '<p>Sem vídeos</p>';
    else {
      videosEl.innerHTML = '';
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div><strong>${escapeHtml(d.title || '')}</strong><br><small>${escapeHtml(d.driveId)}</small></div>
          <div><button class="btn danger" onclick="removeVideo('${id}')">Remover</button></div>
        `;
        videosEl.appendChild(row);
      });
    }
  }
}

// === Admin actions ===
async function authorizeUser(docId){
  if(!confirm('Autorizar este usuário?')) return;
  try {
    await db.collection('users').doc(docId).update({ authorized: true });
    alert('Usuário autorizado.');
    loadAdminLists();
  } catch(err){
    alert('Erro: ' + err.message);
  }
}

async function revokeUser(docId){
  if(!confirm('Revogar autorização deste usuário?')) return;
  try {
    await db.collection('users').doc(docId).update({ authorized: false });
    alert('Autorização revogada.');
    loadAdminLists();
  } catch(err){
    alert('Erro: ' + err.message);
  }
}

async function removeVideo(docId){
  if(!confirm('Remover este vídeo?')) return;
  try {
    await db.collection('videos').doc(docId).delete();
    alert('Vídeo removido.');
    loadAdminLists();
  } catch(err){
    alert('Erro: ' + err.message);
  }
}
