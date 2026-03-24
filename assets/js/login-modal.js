(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function getRedirectUrl() {
    var cfg = window.TYPO_SUPABASE_CONFIG || {};
    var custom = (cfg.authRedirectUrl || "").trim();
    if (custom && !/localhost:\\d+/i.test(custom)) {
      return custom;
    }

    if (window.location.hostname === "typo.cool" || window.location.hostname === "www.typo.cool") {
      return "https://typo.cool/";
    }

    return window.location.origin + "/";
  }

  function init() {
    var modal = byId("loginModal");
    var backdrop = byId("loginModalBackdrop");
    var openBtn = byId("openLoginModalBtn");
    var profileMenuWrap = byId("profileMenuWrap");
    var profileMenuToggleBtn = byId("profileMenuToggleBtn");
    var profileDropdownMenu = byId("profileDropdownMenu");
    var profileLogoutBtn = byId("profileLogoutBtn");
    var closeBtn = byId("closeLoginModalBtn");
    var googleBtn = byId("googleModalLoginBtn");
    var logoutBtn = byId("logoutModalBtn");

    if (!modal || !backdrop || !openBtn || !profileMenuWrap || !profileMenuToggleBtn || !profileDropdownMenu || !profileLogoutBtn || !closeBtn || !googleBtn || !logoutBtn) {
      return;
    }

    var isSignedIn = false;

    function closeProfileDropdown() {
      profileDropdownMenu.hidden = true;
      profileMenuToggleBtn.setAttribute("aria-expanded", "false");
    }

    function openProfileDropdown() {
      profileDropdownMenu.hidden = false;
      profileMenuToggleBtn.setAttribute("aria-expanded", "true");
    }

    function toggleProfileDropdown() {
      if (profileDropdownMenu.hidden) {
        openProfileDropdown();
        return;
      }
      closeProfileDropdown();
    }

    function updateHeaderButton() {
      if (isSignedIn) {
        openBtn.hidden = true;
        profileMenuWrap.hidden = false;
        closeProfileDropdown();
      } else {
        openBtn.hidden = false;
        openBtn.textContent = "Giriş Yap";
        openBtn.setAttribute("aria-label", "Giris yap");
        profileMenuWrap.hidden = true;
        closeProfileDropdown();
      }
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
        isSignedIn = true;
        googleBtn.hidden = true;
        logoutBtn.hidden = false;
        updateHeaderButton();
        return;
      }

      isSignedIn = false;
      googleBtn.hidden = false;
      logoutBtn.hidden = true;
      updateHeaderButton();
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
        console.error(result.error.message);
      }
    }

    async function signOut(client) {
      var result = await client.auth.signOut();
      if (result.error) {
        console.error(result.error.message);
        return;
      }
      await refreshUi(client);
    }

    openBtn.addEventListener("click", function () {
      openModal();
    });

    profileMenuToggleBtn.addEventListener("click", function () {
      if (!isSignedIn) return;
      toggleProfileDropdown();
    });

    profileLogoutBtn.addEventListener("click", function () {
      void signOut(client);
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

      if (event.key === "Escape" && !profileDropdownMenu.hidden) {
        closeProfileDropdown();
      }
    });

    document.addEventListener("click", function (event) {
      if (profileMenuWrap.hidden) return;
      if (!profileMenuWrap.contains(event.target)) {
        closeProfileDropdown();
      }
    });

    var hasSupabase = window.typoSupabase && typeof window.typoSupabase.createSupabaseBrowserClient === "function";
    if (!hasSupabase) {
      console.error("Supabase baglantisi yuklenemedi.");
      googleBtn.disabled = true;
      return;
    }

    var ctx = window.typoSupabase.createSupabaseBrowserClient();
    if (ctx.error || !ctx.client) {
      console.error(ctx.error || "Supabase baglantisi yok.");
      googleBtn.disabled = true;
      return;
    }

    var client = ctx.client;
    updateHeaderButton();
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
