(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(text, tone) {
    var el = byId("authStatus");
    el.textContent = text;
    el.className = "party-status " + (tone || "info");
  }

  function getGoogleRedirectUrl() {
    var cfg = window.TYPO_SUPABASE_CONFIG || {};
    var custom = (cfg.authRedirectUrl || "").trim();
    if (custom) return custom;

    if (window.location.hostname === "typo.cool" || window.location.hostname === "www.typo.cool") {
      return "https://typo.cool/login.html";
    }

    return window.location.origin + "/login.html";
  }

  async function refreshUi(client) {
    var sessionResult = await client.auth.getSession();
    var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;

    if (session && session.user) {
      byId("googleLoginBtn").hidden = true;
      byId("logoutBtn").hidden = false;
      byId("userEmail").hidden = false;
      byId("userEmail").textContent = "Giris yapildi: " + (session.user.email || "Google kullanicisi");
      setStatus("Google girisi aktif.", "success");
      return;
    }

    byId("googleLoginBtn").hidden = false;
    byId("logoutBtn").hidden = true;
    byId("userEmail").hidden = true;
    byId("userEmail").textContent = "";
    setStatus("Giris yok.", "info");
  }

  async function signInGoogle(client) {
    var redirectTo = getGoogleRedirectUrl();
    var result = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo,
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

  async function init() {
    byId("yearValue").textContent = String(new Date().getFullYear());

    var ctx = window.typoSupabase.createSupabaseBrowserClient();
    if (ctx.error || !ctx.client) {
      setStatus(ctx.error || "Supabase baglantisi yok", "error");
      byId("googleLoginBtn").disabled = true;
      return;
    }

    var client = ctx.client;
    await refreshUi(client);

    byId("googleLoginBtn").addEventListener("click", function () {
      void signInGoogle(client);
    });

    byId("logoutBtn").addEventListener("click", function () {
      void signOut(client);
    });

    client.auth.onAuthStateChange(function () {
      void refreshUi(client);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    void init();
  });
})();
