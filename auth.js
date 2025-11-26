// auth.js
// Usa Firebase v8 (compatível com firebase.js acima)

// === Helpers ===
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"'\/]/g, function(c){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'}[c];
  });
}

// === Video platform detection & embed generation ===
function getVideoEmbed(url){
  if(!url) return null;

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if(ytMatch) return `<iframe src="https://www.youtube.com/embed/${ytMatch[1]}?rel=0&modestbranding=1&controls=0" frameborder="0" allowfullscreen style="width:100%;height:100%;pointer-events:none;"></iframe>`;

  // Google Drive
  const gdMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if(gdMatch) return `<video controls preload="metadata" style="width:100%;border-radius:8px;" oncontextmenu="return false" ondragstart="return false" onselectstart="return false" controlsList="nodownload nofullscreen noremoteplayback" disablePictureInPicture><source src="https://drive.google.com/uc?export=download&id=${gdMatch[1]}" type="video/mp4"></video>`;

  // Dropbox
  const dbMatch = url.match(/dropbox\.com\/s\/([a-zA-Z0-9_-]+)\//);
  if(dbMatch) return `<video controls preload="metadata" style="width:100%;border-radius:8px;" oncontextmenu="return false" ondragstart="return false" onselectstart="return false" controlsList="nodownload nofullscreen noremoteplayback" disablePictureInPicture><source src="${url.replace('?dl=0','?raw=1')}" type="video/mp4"></video>`;

  // Mega
  const megaMatch = url.match(/mega\.nz\/file\/([a-zA-Z0-9_-]+)/);
  if(megaMatch) return `<a href="${url}" target="_blank" class="btn primary">Abrir no Mega</a>`;

  // MP4 direto
  if(url.match(/\.(mp4|webm|ogg)(\?.*)?$/i)) return `<video controls preload="metadata" style="width:100%;border-radius:8px;" oncontextmenu="return false" ondragstart="return false" onselectstart="return false" controlsList="nodownload nofullscreen noremoteplayback" disablePictureInPicture><source src="${url}" type="video/mp4"></video>`;

  return `<p>Link de vídeo inválido ou não suportado.</p>`;
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

// Bloqueio global de clique direito e arrastar
document.addEventListener("DOMContentLoaded", () => {
  document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("dragstart", e => e.preventDefault());
});

// === Auth & UI wiring ===
document.addEventListener('DOMContentLoaded', () => {
  Theme.load();

  // --- Login / Register / Logout / Admin / Firebase --- //
  // Não alterei nenhuma função de login, registro ou admin

  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    await auth.signOut();
    window.location.href = 'index.html';
  });

  auth.onAuthStateChanged(async (user) => {
    // Dashboard protection
    const dashboardArea = document.getElementById('dashboard-content');
    if (dashboardArea){
      if (!user){ window.location.href = 'index.html'; return; }
      const udoc = await db.collection('users').doc(user.uid).get();
      if(!udoc.exists){ await auth.signOut(); window.location.href='index.html'; return; }
      const udata = udoc.data();
      if(udata.authorized!==true && udata.role!=='admin'){ await auth.signOut(); window.location.href='index.html'; return; }
      document.getElementById('userName') && (document.getElementById('userName').textContent = udata.name||udata.email);
      loadStudentVideos();
    }

    // Admin area protection
    const adminArea = document.getElementById('admin-area');
    if(adminArea){
      if(!user){ window.location.href='index.html'; return; }
      const udoc = await db.collection('users').doc(user.uid).get();
      if(!udoc.exists || udoc.data().role!=='admin'){ window.location.href='dashboard.html'; return; }
      loadAdminLists();
    }
  });
});

// === Load student videos (Dashboard) ===
async function loadStudentVideos(){
  const listEl = document.getElementById('videosList');
  if (!listEl) return;
  listEl.innerHTML = '<p>Carregando vídeos...</p>';
  const snap = await db.collection('videos').orderBy('createdAt','asc').get();
  if (snap.empty){ listEl.innerHTML='<p>Nenhum vídeo disponível ainda.</p>'; return; }
  listEl.innerHTML = '';
  snap.forEach(doc => {
    const d = doc.data();
    const card = document.createElement('div');
    card.className = 'video-card';
    card.innerHTML = `
      <h3>${escapeHtml(d.title||'Mentoria')}</h3>
      ${getVideoEmbed(d.ytId)}
    `;
    listEl.appendChild(card);
  });
}

// === Admin actions / lists (sem alterações) ===
async function loadAdminLists(){
  const usersEl = document.getElementById('usersList');
  if (usersEl){
    usersEl.innerHTML = 'Carregando usuários...';
    const snap = await db.collection('users').orderBy('createdAt','desc').get();
    if (snap.empty){ usersEl.innerHTML='<p>Sem usuários registrados</p>'; }
    else {
      usersEl.innerHTML='';
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        const row = document.createElement('div');
        row.className='admin-row';
        row.innerHTML=`
          <div>
            <strong>${escapeHtml(d.name||d.email)}</strong><br>
            <small>${escapeHtml(d.email)}</small>
          </div>
          <div>
            ${d.authorized ? `<button class="btn secondary" onclick="revokeUser('${id}')">Revogar</button>` : `<button class="btn" onclick="authorizeUser('${id}')">Autorizar</button>`}
            ${d.role==='admin'?'<span style="margin-left:8px;font-weight:600;color:var(--accent)">ADMIN</span>':''}
          </div>
        `;
        usersEl.appendChild(row);
      });
    }
  }

  const videosEl = document.getElementById('adminVideosList');
  if(videosEl){
    videosEl.innerHTML='Carregando vídeos...';
    const snap = await db.collection('videos').orderBy('createdAt','desc').get();
    if(snap.empty) videosEl.innerHTML='<p>Sem vídeos</p>';
    else {
      videosEl.innerHTML='';
      snap.forEach(doc => {
        const d = doc.data();
        const id = doc.id;
        const row = document.createElement('div');
        row.className='admin-row';
        row.innerHTML=`
          <div><strong>${escapeHtml(d.title||'')}</strong><br><small>${escapeHtml(d.ytId)}</small></div>
          <div><button class="btn danger" onclick="removeVideo('${id}')">Remover</button></div>
        `;
        videosEl.appendChild(row);
      });
    }
  }
}

// --- Admin action helpers ---
async function authorizeUser(docId){
  if(!confirm('Autorizar este usuário?')) return;
  await db.collection('users').doc(docId).update({ authorized:true });
  alert('Usuário autorizado.');
  loadAdminLists();
}

async function revokeUser(docId){
  if(!confirm('Revogar autorização deste usuário?')) return;
  await db.collection('users').doc(docId).update({ authorized:false });
  alert('Autorização revogada.');
  loadAdminLists();
}

async function removeVideo(docId){
  if(!confirm('Remover este vídeo?')) return;
  await db.collection('videos').doc(docId).delete();
  alert('Vídeo removido.');
  loadAdminLists();
}
