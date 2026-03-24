(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function getRedirectUrl() {
    return window.location.origin + window.location.pathname;
  }

  function init() {
    var modal = byId("loginModal");
    var backdrop = byId("loginModalBackdrop");
    var openBtn = byId("openLoginModalBtn");
    var closeBtn = byId("closeLoginModalBtn");
    var googleBtn = byId("googleModalLoginBtn");
    var logoutBtn = byId("logoutModalBtn");
    var statusEl = byId("authModalStatus");
    var userEmailEl = byId("authModalUserEmail");

    if (!modal || !backdrop || !openBtn || !closeBtn || !googleBtn || !logoutBtn || !statusEl || !userEmailEl) {
      return;
    }

    function setStatus(text, tone) {
      statusEl.textContent = text;
      statusEl.className = "party-status " + (tone || "info");
    }

    function openModal() {
      modal.classList.add("is-open");
      modal.setAttribute("aria-hidden", "false");
      document.body.style.overflow = "hidden";
    }

    function closeModal() {
      modal.classList.remove("is-open");
      modal.setAttribute("aria-hidden", "true");
      document.body.style.overflow = "";
    }

    function updateUiFromSession(session) {
      if (session && session.user) {
        googleBtn.hidden = true;
        logoutBtn.hidden = false;
        userEmailEl.hidden = false;
        userEmailEl.textContent = "Giris yapildi: " + (session.user.email || "Google kullanicisi");
        setStatus("Google girisi aktif.", "success");
        return;
      }

      googleBtn.hidden = false;
      logoutBtn.hidden = true;
      userEmailEl.hidden = true;
      userEmailEl.textContent = "";
      setStatus("Giris yok.", "info");
    }

    async function refreshUi(client) {
      var sessionResult = await client.auth.getSession();
      var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;
      updateUiFromSession(session);
    }

    async function signInGoogle(client) {
      var result = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getRedirectUrl(),
          queryParams: {
            prompt: "select_account"
          }
        }
      });

      if (result.error) {
        setStatus(result.error.message, "error");
      }
    }

    async function signOut(client) {
      var result = await client.auth.signOut();
      if (result.error) {
        setStatus(result.error.message, "error");
        return;
      }
      await refreshUi(client);
    }

    openBtn.addEventListener("click", function () {
      openModal();
    });

    closeBtn.addEventListener("click", function () {
      closeModal();
    });

    backdrop.addEventListener("click", function () {
      closeModal();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && modal.classList.contains("is-open")) {
        closeModal();
      }
    });

    var hasSupabase = window.typoSupabase && typeof window.typoSupabase.createSupabaseBrowserClient === "function";
    if (!hasSupabase) {
      setStatus("Supabase baglantisi yuklenemedi.", "error");
      googleBtn.disabled = true;
      return;
    }

    var ctx = window.typoSupabase.createSupabaseBrowserClient();
    if (ctx.error || !ctx.client) {
      setStatus(ctx.error || "Supabase baglantisi yok.", "error");
      googleBtn.disabled = true;
      return;
    }

    var client = ctx.client;
    void refreshUi(client);

    googleBtn.addEventListener("click", function () {
      void signInGoogle(client);
    });

    logoutBtn.addEventListener("click", function () {
      void signOut(client);
    });

    client.auth.onAuthStateChange(function () {
      void refreshUi(client);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
