// LOGIN & REGISTER HANDLING
document.addEventListener("DOMContentLoaded", () => {
  // LOGIN FORM
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

  // REGISTER FORM
  const registerForm = document.getElementById("registerForm");

  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const email = document.getElementById("regEmail").value;
      const password = document.getElementById("regPassword").value;

      firebase.auth().createUserWithEmailAndPassword(email, password)
        .then(() => {
          alert("Conta criada com sucesso!");
          window.location.href = "home.html"; // entra direto
        })
        .catch((error) => {
          alert("Erro: " + error.message);
        });
    });
  }

  // PAGE PROTECTION
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
