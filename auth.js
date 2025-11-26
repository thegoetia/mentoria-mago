// =======================
//  AUTH.JS (CORRIGIDO)
// =======================

// ---------- Helpers ----------
function escapeHtml(s){
  if(!s) return '';
  return s.replace(/[&<>"'\/]/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'}[c])
  );
}

function extractYouTubeID(url){
  if(!url) return null;
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

// ---------- Page Wiring ----------
document.addEventListener('DOMContentLoaded', () => {

  Theme.load();

  // ==========================
  // SUPABASE CLIENT UNIFICADO
  // ==========================
  const supabaseClient = window.supabaseClient;
  if (!supabaseClient){
    console.warn("⚠ SupabaseClient não disponível");
  }

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

        await db.collection('users').doc(uid).set({
          uid,
          email,
          emailLower: email.toLowerCase(),
          name: name || null,
          authorized: false,
          role: 'user',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        toast('Conta criada! Aguarde autorização do admin.');
        await auth.signOut();
        setTimeout(()=> window.location.href = 'index.html', 1200);

      } catch(err){
        toast(err.message);
      }
    });
  }

  // LOGOUT
  document.querySelectorAll('[data-logout]').forEach(b => {
    b.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'index.html';
    });
  });

  // ==========================================
  // ADMIN — UPLOAD DE VÍDEO (SUPABASE STORAGE)
  // ==========================================
  const uploadForm = document.getElementById("uploadVideoForm");

  if (uploadForm){
    uploadForm.addEventListener("submit", async (e)=>{
      e.preventDefault();

      const title = document.getElementById("uploadTitle").value.trim();
      const file = document.getElementById("uploadFile").files[0];
      const status = document.getElementById("uploadStatus");

      if (!title) return toast("Digite um título.");
      if (!file) return toast("Selecione um arquivo MP4.");

      status.textContent = "Enviando vídeo...";

      const fileName = Date.now() + "-" + file.name.replace(/[^a-zA-Z0-9\.]/g, "_");

      // UPLOAD Supabase
      const { data, error } = await supabaseClient
        .storage
        .from("aulas") // bucket unificado
        .upload(fileName, file, { upsert: false });

      if (error){
        status.textContent = "Erro ao enviar: " + error.message;
        return;
      }

      // URL pública
      const publicUrl = supabaseClient
        .storage
        .from("aulas")
        .getPublicUrl(fileName).data.publicUrl;

      // Registrar no Firestore
      await db.collection("aulas").add({
        title,
        url: publicUrl,
        filePath: fileName,
        type: "mp4",
        createdAt: Date.now()
      });

      status.textContent = "Vídeo enviado com sucesso!";
      uploadForm.reset();
      loadAdminLists();
    });
  }


  // =====================
  // PROTEÇÃO DAS PÁGINAS
  // =====================
  auth.onAuthStateChanged(async (user) => {

    // ---------- DASHBOARD ----------
    const dashArea = document.getElementById('dashboard-content');
    if (dashArea){
      if(!user) return window.location.href = 'index.html';

      const udoc = await db.collection('users').doc(user.uid).get();
      const udata = udoc.data();

      if (udata.authorized !== true && udata.role !== 'admin'){
        toast("Conta não autorizada.");
        await auth.signOut();
        return window.location.href = 'index.html';
      }

      document.getElementById("userName").textContent = udata.name || udata.email;
      dashArea.style.display = "block";

      loadStudentVideos();
      attachDashboardProtection();
    }

    // ---------- ADMIN ----------
    const adminArea = document.getElementById('admin-area');
    if (adminArea){
      if(!user) return window.location.href = 'index.html';

      const udoc = await db.collection('users').doc(user.uid).get();
      if (!udoc.exists || udoc.data().role !== 'admin'){
        toast("Acesso negado.");
        return window.location.href = 'dashboard.html';
      }

      adminArea.style.display = 'block';
      loadAdminLists();
    }

  });

}); // DOMContentLoaded END



// ==============================
// STUDENT — LISTAR E MOSTRAR MP4
// ==============================
async function loadStudentVideos(){
  const listEl = document.getElementById("videosList");
  if (!listEl) return;

  listEl.innerHTML = "<p>Carregando...</p>";

  const snap = await db.collection("aulas").orderBy("createdAt","asc").get();
  if (snap.empty){
    listEl.innerHTML = "<p>Nenhum vídeo disponível.</p>";
    return;
  }

  listEl.innerHTML = "";

  snap.forEach(docSnap => {
    const d = docSnap.data();

    const wrapper = document.createElement("div");
    wrapper.className = "video-card";

    wrapper.innerHTML = `
      <div class="iframe-protect">
        <div class="video-overlay" onclick="playVideo(this)"></div>
        <video
          preload="none"
          src="${escapeHtml(d.url)}"
          controls
          style="width:100%; height:100%; pointer-events:none; border-radius:12px;"
        ></video>
      </div>
      <h3 class="video-title">${escapeHtml(d.title)}</h3>
    `;

    listEl.appendChild(wrapper);
  });
}

window.playVideo = function(overlay){
  const video = overlay.parentElement.querySelector("video");

  overlay.style.display = "none";
  video.style.pointerEvents = "auto";

  video.play().catch(()=>{});
};



// ==============================
// ADMIN — LISTAS (Usuários e Vídeos)
// ==============================
async function loadAdminLists(){

  // ----- USERS -----
  const usersEl = document.getElementById('usersList');
  if (usersEl){
    usersEl.innerHTML = "Carregando...";
    const snap = await db.collection('users').orderBy('createdAt','desc').get();

    if (snap.empty){
      usersEl.innerHTML = "<p>Sem usuários</p>";
    } else {
      usersEl.innerHTML = "";
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;

        const row = document.createElement("div");
        row.className = "admin-row";

        row.innerHTML = `
          <div>
            <strong>${escapeHtml(d.name || d.email)}</strong><br>
            <small>${escapeHtml(d.email)}</small>
          </div>
          <div>
            ${
              d.authorized
              ? `<button class="btn secondary" onclick="revokeUser('${id}')">Revogar</button>`
              : `<button class="btn" onclick="authorizeUser('${id}')">Autorizar</button>`
            }
            ${d.role === "admin" ? "<span class='badge'>ADMIN</span>" : ""}
          </div>
        `;

        usersEl.appendChild(row);
      });
    }
  }

  // ----- VIDEOS -----
  const videosEl = document.getElementById('adminVideosList');
  if (videosEl){
    videosEl.innerHTML = "Carregando...";
    const snap = await db.collection('aulas').orderBy('createdAt','asc').get();

    if (snap.empty){
      videosEl.innerHTML = "<p>Sem vídeos</p>";
    } else {
      videosEl.innerHTML = "";
      snap.forEach(docSnap => {
        const d = docSnap.data();
        const id = docSnap.id;

        const row = document.createElement("div");
        row.className = "admin-row";

        row.innerHTML = `
          <div>
            <strong>${escapeHtml(d.title)}</strong><br>
            <small>${escapeHtml(d.filePath)}</small>
          </div>
          <div>
            <button class="btn danger" onclick="removeVideo('${id}')">Remover</button>
          </div>
        `;

        videosEl.appendChild(row);
      });
    }
  }

}

window.authorizeUser = async function(docId){
  if (!confirm("Autorizar este usuário?")) return;
  await db.collection('users').doc(docId).update({ authorized: true });
  loadAdminLists();
};

window.revokeUser = async function(docId){
  if (!confirm("Revogar autorização?")) return;
  await db.collection('users').doc(docId).update({ authorized: false });
  loadAdminLists();
};

window.removeVideo = async function(docId){
  if (!confirm("Remover vídeo?")) return;
  await db.collection('videos').doc(docId).delete();
  loadAdminLists();
};



// ==============================
// PROTEÇÃO DO DASHBOARD
// ==============================
function attachDashboardProtection(){
  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('keydown', function(e){
    if (e.key === 'F12') e.preventDefault();
    if (e.ctrlKey){
      if (['u','c','v','s','a','p'].includes(e.key.toLowerCase())) e.preventDefault();
    }
    if (e.ctrlKey && e.shiftKey){
      if (['i','j','c'].includes(e.key.toLowerCase())) e.preventDefault();
    }
  });
}


// ==============================
// TOAST
// ==============================
function toast(msg){
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);

  setTimeout(()=> t.classList.add('visible'), 20);
  setTimeout(()=>{
    t.classList.remove('visible');
    setTimeout(()=> t.remove(), 300);
  }, 3500);
}
