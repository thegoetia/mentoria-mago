// auth.js – COMPLETO E ATUALIZADO

// ==========================
//  TEMA (dark/light)
// ==========================
const Theme = {
  init() {
    const saved = localStorage.getItem("theme");
    if (saved) document.documentElement.dataset.theme = saved;
  },
  toggle() {
    const root = document.documentElement;
    const current = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = current;
    localStorage.setItem("theme", current);
  }
};
Theme.init();

// ==========================
//  PROTEÇÃO DE PLAYER
// ==========================
function protectVideoElement(iframe) {
  // Remove picture-in-picture
  iframe.setAttribute("disablepictureinpicture", "");
  iframe.setAttribute("controlsList", "nodownload nofullscreen noplaybackrate");

  // Overlay invisível bloqueando clique direto
  const overlay = document.createElement("div");
  overlay.style.position = "absolute";
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = "100%";
  overlay.style.height = "100%";
  overlay.style.zIndex = 5;
  overlay.style.cursor = "default";
  overlay.style.background = "transparent";
  iframe.parentElement.style.position = "relative";
  iframe.parentElement.appendChild(overlay);
}

// BLOQUEAR BOTÃO DIREITO
document.addEventListener("contextmenu", e => e.preventDefault());

// BLOQUEAR ARRASTAR
document.addEventListener("dragstart", e => e.preventDefault());

// BLOQUEAR ATALHOS (Ctrl+S, Ctrl+U, etc)
document.addEventListener("keydown", e => {
  if (
    (e.ctrlKey && ["s", "u", "p", "S", "U", "P"].includes(e.key)) ||
    e.key === "F12"
  ) {
    e.preventDefault();
    return false;
  }
});

// ==========================
//  PARSE UNIVERSAL DE LINKS
// ==========================
function convertToEmbed(url) {
  // GOOGLE DRIVE
  if (url.includes("drive.google.com")) {
    let id = null;

    // Padrão /d/FILE_ID/
    const match1 = url.match(/\/d\/(.+?)\//);
    if (match1) id = match1[1];

    // Padrão ?id=FILE_ID
    const match2 = url.match(/id=([^&]+)/);
    if (!id && match2) id = match2[1];

    if (id) {
      return `https://drive.google.com/file/d/${id}/preview`;
    }
  }

  // YOUTUBE
  if (url.includes("youtube.com/watch") || url.includes("youtu.be")) {
    let id = null;

    const match1 = url.match(/v=([^&]+)/);
    if (match1) id = match1[1];

    const match2 = url.match(/youtu\.be\/(.+)/);
    if (!id && match2) id = match2[1];

    if (id) {
      return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&controls=0&disablekb=1`;
    }
  }

  // DROPBOX
  if (url.includes("dropbox.com")) {
    return url.replace("?dl=0", "?raw=1");
  }

  // MEGA (não tem embed real → player próprio)
  if (url.includes("mega.nz")) {
    return `https://embed.mega.nz/embed/${btoa(url)}`;
  }

  // MP4 direto
  if (url.endsWith(".mp4")) {
    return url;
  }

  return url;
}

// ==========================
//  FIREBASE AUTH
// ==========================
auth.onAuthStateChanged(async user => {
  const path = window.location.pathname;

  if (!user) {
    if (!path.includes("index") && !path.includes("register"))
      window.location.href = "index.html";
    return;
  }

  // ROTAS
  if (path.includes("admin")) {
    loadAdmin(user);
  } else if (path.includes("dashboard")) {
    loadDashboard(user);
  }
});

// ==========================
//  ADMIN PAGE
// ==========================
async function loadAdmin(user) {
  document.getElementById("logoutBtn").onclick = () => auth.signOut();

  // Autorizar alunos
  const addUserForm = document.getElementById("addUserForm");
  const usersList = document.getElementById("usersList");

  addUserForm.onsubmit = async e => {
    e.preventDefault();
    const email = document.getElementById("authEmail").value.trim();

    await db.collection("allowedUsers").doc(email).set({
      email,
      createdAt: Date.now()
    });

    addUserForm.reset();
    loadUsers();
  };

  async function loadUsers() {
    const snap = await db.collection("allowedUsers").get();
    usersList.innerHTML = "";

    snap.forEach(doc => {
      const u = doc.data();
      const div = document.createElement("div");
      div.className = "admin-row";
      div.innerHTML = `
        <span>${u.email}</span>
        <button class="btn danger" onclick="removeUser('${u.email}')">Remover</button>
      `;
      usersList.appendChild(div);
    });
  }

  window.removeUser = async email => {
    await db.collection("allowedUsers").doc(email).delete();
    loadUsers();
  };

  loadUsers();

  // VÍDEOS (Drive/YT/etc)
  const addVideoForm = document.getElementById("addVideoForm");
  const adminVideosList = document.getElementById("adminVideosList");

  addVideoForm.onsubmit = async e => {
    e.preventDefault();
    const title = document.getElementById("videoTitle").value.trim();
    const url = document.getElementById("videoUrl").value.trim();

    await db.collection("videos").add({
      title: title || "Aula",
      originalUrl: url,
      embedUrl: convertToEmbed(url),
      createdAt: Date.now()
    });

    addVideoForm.reset();
    loadVideos();
  };

  async function loadVideos() {
    const snap = await db.collection("videos").orderBy("createdAt").get();
    adminVideosList.innerHTML = "";

    snap.forEach(doc => {
      const v = doc.data();
      const div = document.createElement("div");
      div.className = "admin-row";
      div.innerHTML = `
        <span>${v.title}</span>
        <button class="btn danger" onclick="removeVideo('${doc.id}')">Remover</button>
      `;
      adminVideosList.appendChild(div);
    });
  }

  window.removeVideo = async id => {
    await db.collection("videos").doc(id).delete();
    loadVideos();
  };

  loadVideos();
}

// ==========================
//  DASHBOARD (ALUNOS)
// ==========================
async function loadDashboard(user) {
  document.getElementById("logoutBtn").onclick = () => auth.signOut();
  if (user.displayName) document.getElementById("userName").innerText = user.displayName;

  // Ver se aluno é autorizado
  const allowed = await db.collection("allowedUsers").doc(user.email).get();
  if (!allowed.exists) {
    document.body.innerHTML = "<h2 style='padding:40px;text-align:center'>Seu acesso não foi liberado ainda.</h2>";
    return;
  }

  const list = document.getElementById("videosList");

  const snap = await db.collection("videos").orderBy("createdAt").get();
  list.innerHTML = "";

  snap.forEach(doc => {
    const v = doc.data();

    const card = document.createElement("div");
    card.className = "video-card";

    card.innerHTML = `
      <h3>${v.title}</h3>
      <div class="video-embed">
        <iframe src="${v.embedUrl}"
          frameborder="0"
          allowfullscreen
        ></iframe>
      </div>
    `;

    list.appendChild(card);

    // Proteção
    const iframe = card.querySelector("iframe");
    protectVideoElement(iframe);
  });
}
