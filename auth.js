// LOGIN
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const email = document.getElementById("email").value;
      const password = document.getElementById("password").value;

      firebase.auth().signInWithEmailAndPassword(email, password)
        .then(() => {
          window.location.href = "home.html";
        })
        .catch((error) => {
          alert("Erro: " + error.message);
        });
    });
  }

  // PROTEÇÃO DE PÁGINA
  firebase.auth().onAuthStateChanged((user) => {
    const protectedContent = document.getElementById("protected-content");

    if (protectedContent) {
      if (!user) {
        window.location.href = "index.html";
      }
    }
  });
});

// LOGOUT
function logout() {
  firebase.auth().signOut().then(() => {
    window.location.href = "index.html";
  });
}
