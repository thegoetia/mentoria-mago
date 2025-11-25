// auth.js
// Central auth + DB logic (Firebase v8 style)

// ---------- Helpers ----------
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"'\/]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'}[c];
  });
}

function extractYouTubeID(url){
  if(!url) return null;
  // handles many formats
  const re = /(?:youtube\.com\/(?:watch\?.*v=|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;
  const m = url.match(re);
  return m ? m[1] : null;
}

// Theme manager
const Theme = {
  load(){
    const t = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', t);
    updateThemeButtons();
  },
  toggle(){
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const nxt = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nxt);
    localStorage.setItem('theme', nxt);
    updateThemeButtons();
  }
};
function updateThemeButtons(){
  document.querySelectorAll('[data-theme-toggle]').forEach(b => {
    const t = document.documentElement.getAttribute('data-theme') || 'dark';
    b.textContent = t === 'dark' ? 'Light' : 'Dark';
  });
}

// ---------- Page wiring ----------
document.addEventListener('DOMContentLoaded', () => {
  Theme.load();

  // LOGIN
  const loginForm = document.getElementById('loginForm');
  if (loginForm){
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if(!email || !password) return toast('Preencha email e senha');
      try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'dashboard.html';
      } catch(err){
        toast(err.message);
      }
    });
  }

  // REGISTER
  const registerForm = document.getElementById('registerForm');
  if (registerForm){
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('regName') ? document.getElementById('regName').value.trim() : '';
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      if(!email || !password) return toast('Preencha email e senha');
      try {
        const cred = await auth.createUserWithEmailAndPassword(email, password);
        const uid = cred.user.uid;
        // create user document with authorized:false
        await db.collection('users').doc(uid).set({
          uid,
          email,
          name: name || null,
          authorized: false,
          role: 'user',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        toast('Conta criada! Aguarde autorização do admin. Você será redirecionado ao login.');
        await auth.signOut();
        setTimeout(()=> window.location.href = 'index.html', 1200);
      } catch(err){
        toast(err.message);
      }
    });
  }

  // LOGOUT buttons
  document.querySelectorAll('[data-logout]').forEach(b => {
    b.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'index.html';
    });
  });

  // Admin: add video form (if present)
  const addVideoForm = document.getElementById('addVideoForm');
  if (addVideoForm){
    addVideoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = document.getElementById('videoTitle').value.trim();
      const url = document.getElementById('videoUrl').value.trim();
      const id = extractYouTubeID(url);
      if(!id) return toast('URL do YouTube inválida');
      try {
        await db.collection('videos').add({
          title: title || null,
          ytId: id,
          createdAt: Date.now()
        });
        toast('Vídeo adicionado');
        addVideoForm.reset();
        loadAdminLists();
      } catch(err){
        toast(err.message);
      }
    });
  }

  // Admin: authorize by email form
  const addUserForm = document.getElementById('addUserForm');
  if (addUserForm){
    addUserForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('authEmail').value.trim();
      if(!email) return toast('Digite um email');
      try {
        // find user by email
        const snap = await db.collection('users').where('email','==',email).get();
        if (snap.empty) return toast('Usuário não encontrado (peça para ele se registrar primeiro).');
        snap.forEach(async docSnap => {
          await db.collection('users').doc(docSnap.id).update({ authorized: true });
        });
        toast('Usuário(s) autorizado(s)');
        addUserForm.reset();
        loadAdminLists();
      } catch(err){
        toast(err.message);
      }
    });
  }

  // If page needs protection (dashboard or admin), auth.onAuthStateChanged below will handle it
  auth.onAuthStateChanged(async (user) => {
    // DASHBOARD
    const dashArea = document.getElementById('dashboard-content');
    if (dashArea){
      if(!user){
        window.location.href = 'index.html';
        return;
      }
      const udoc = await db.collection('users').doc(user.uid).get();
      if(!udoc.exists){
        toast('Perfil não encontrado. Contate o admin.');
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      const udata = udoc.data();
      if (udata.authorized !== true && udata.role !== 'admin'){
        toast('Conta não autorizada. Aguarde o admin.');
        await auth.signOut();
        window.location.href = 'index.html';
        return;
      }
      // allowed
      document.getElementById('userName') && (document.getElementById('userName').textContent = udata.name || udata.email);
      dashArea.style.display = 'block';
      loadStudentVideos();
      attachDashboardProtection();
    }

    // ADMIN
    const adminArea = document.getElementById('admin-area');
    if (adminArea){
      if(!user){
        window.location.href = 'index.html';
        return;
      }
      const udoc = await db.collection('users').doc(user.uid).get();
      if(!udoc.exists || udoc.data().role !== 'admin'){
        toast('Acesso negado: precisa ser admin');
        window.location.href = 'dashboard.html';
        return;
      }
      adminArea.style.display = 'block';
      loadAdminLists();
    }
  });

}); // DOMContentLoaded end

// ---------- Student: load videos in ascending order ----------
async function loadStudentVideos(){
  const listEl = document.getElementById('videosList');
  if (!listEl) return;
  listEl.innerHTML = '<p>Carregando...</p>';
  const snap = await db.collection('videos').orderBy('createdAt','asc').get();
  if (snap.empty){
    listEl.innerHTML = '<p>Nenhum vídeo disponível.</p>';
    return;
  }
  listEl.innerHTML = '';
  snap.forEach(docSnap => {
    const d = docSnap.data();
    const wrapper = document.createElement('div');
    wrapper.className = 'video-wrapper';

    const embedSrc = `https://www.youtube.com/embed/${d.ytId}?rel=0&modestbranding=1`;

    wrapper.innerHTML = `
      <div class="video-overlay" onclick="playVideo(this)"></div>
      <iframe class="video-frame" src="${embedSrc}" allowfullscreen></iframe>
      <div class="play-button">▶</div>
      <h3 class="video-title">${escapeHtml(d.title || 'Mentoria')}</h3>
    `;

    listEl.appendChild(wrapper);
  });
}

// play handler (global)
window.playVideo = function(overlay){
  const parent = overlay.parentElement;
  const iframe = parent.querySelector('.video-frame');
  const playBtn = parent.querySelector('.play-button');
  // allow interaction AFTER clicking play
  iframe.style.pointerEvents = 'auto';
  overlay.style.display = 'none';
  if (playBtn) playBtn.style.display = 'none';
  // Optionally auto-play by adding &autoplay=1
  if (iframe.src.indexOf('autoplay=1') === -1){
    iframe.src = iframe.src + (iframe.src.indexOf('?') === -1 ? '?' : '&') + 'autoplay=1';
  }
};

// ---------- Admin: lists & actions ----------
async function loadAdminLists(){
  // users list
  const usersEl = document.getElementById('usersList');
  if (usersEl){
    usersEl.innerHTML = 'Carregando...';
    const snap = await db.collection('users').orderBy('createdAt','desc').get();
    if (snap.empty){
      usersEl.innerHTML = '<p>Sem usuários</p>';
    } else {
      usersEl.innerHTML = '';
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div>
            <strong>${escapeHtml(d.name || d.email)}</strong><br>
            <small>${escapeHtml(d.email)}</small>
          </div>
          <div>
            ${d.authorized ? `<button class="btn secondary" onclick="revokeUser('${id}')">Revogar</button>` : `<button class="btn" onclick="authorizeUser('${id}')">Autorizar</button>`}
            ${d.role === 'admin' ? '<span class="badge">ADMIN</span>' : ''}
          </div>
        `;
        usersEl.appendChild(row);
      });
    }
  }

  // videos list
  const videosEl = document.getElementById('adminVideosList');
  if (videosEl){
    videosEl.innerHTML = 'Carregando...';
    const snap = await db.collection('videos').orderBy('createdAt','asc').get();
    if (snap.empty) videosEl.innerHTML = '<p>Sem vídeos</p>';
    else {
      videosEl.innerHTML = '';
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;
        const row = document.createElement('div');
        row.className = 'admin-row';
        row.innerHTML = `
          <div><strong>${escapeHtml(d.title || '')}</strong><br><small>${escapeHtml(d.ytId)}</small></div>
          <div><button class="btn danger" onclick="removeVideo('${id}')">Remover</button></div>
        `;
        videosEl.appendChild(row);
      });
    }
  }
}

window.authorizeUser = async function(docId){
  if (!confirm('Autorizar este usuário?')) return;
  await db.collection('users').doc(docId).update({ authorized: true });
  loadAdminLists();
};
window.revokeUser = async function(docId){
  if (!confirm('Revogar autorização?')) return;
  await db.collection('users').doc(docId).update({ authorized: false });
  loadAdminLists();
};
window.removeVideo = async function(docId){
  if (!confirm('Remover vídeo?')) return;
  await db.collection('videos').doc(docId).delete();
  loadAdminLists();
};

// ---------- Dashboard protection: block context menu & keys ----------
function attachDashboardProtection(){
  // block right-click (dashboard only)
  document.addEventListener('contextmenu', e => {
    // allow for admin? we apply only on dashboard page where content is sensitive
    e.preventDefault();
  });

  // block some key combos
  document.addEventListener('keydown', function(e){
    if (e.key === 'F12') e.preventDefault();
    if (e.ctrlKey){
      const blocked = ['u','c','v','s','a','p'];
      if (blocked.includes(e.key.toLowerCase())) e.preventDefault();
    }
    if (e.ctrlKey && e.shiftKey){
      const blocked = ['i','j','c'];
      if (blocked.includes(e.key.toLowerCase())) e.preventDefault();
    }
  });
}

// ---------- Small toast helper ----------
function toast(msg){
  // small non-blocking message
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(()=> t.classList.add('visible'), 20);
  setTimeout(()=> { t.classList.remove('visible'); setTimeout(()=> t.remove(),300); }, 3500);
}
