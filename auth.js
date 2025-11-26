// =======================
// AUTH.JS (Firebase intacto + Supabase seguro no upload)
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

  // ------------------ LOGIN ------------------
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

  // ------------------ REGISTER ------------------
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

  // ------------------ LOGOUT ------------------
  document.querySelectorAll('[data-logout]').forEach(b => {
    b.addEventListener('click', async () => {
      await auth.signOut();
      window.location.href = 'index.html';
    });
  });

  // ------------------ ADMIN UPLOAD (Supabase seguro) ------------------
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

      try {
        // -------------------- Supabase client carregado só no upload --------------------
        const SUPABASE_URL = "https://xjmmgvbzfsgjltzggysv.supabase.co";
        const SUPABASE_ANON_KEY = "COLOQUE_AQUI_SUA_ANON_KEY_VALIDA";
        const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

        const { data, error } = await supabaseClient
          .storage
          .from("aulas")
          .upload(fileName, file);

        if (error) throw error;

        const { data: publicData } = supabaseClient
          .storage
          .from("aulas")
          .getPublicUrl(fileName);

        const publicUrl = publicData?.publicUrl;
        if (!publicUrl) throw new Error("Não foi possível obter a URL pública do arquivo.");

        await db.collection("videos").add({
          title,
          url: publicUrl,
          filePath: fileName,
          type: "mp4",
          createdAt: Date.now()
        });

        status.textContent = "Vídeo enviado com sucesso!";
        uploadForm.reset();
        loadAdminLists();

      } catch(err) {
        console.error("Erro no upload:", err);
        status.textContent = "Erro ao enviar: " + err.message;
      }
    });
  }

  // ------------------ PROTEÇÃO DAS PÁGINAS ------------------
  auth.onAuthStateChanged(async (user) => {
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
// RESTANTE DO CÓDIGO (Firebase intacto)
// ==============================
