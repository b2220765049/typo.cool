(function () {
  "use strict";

  function byId(id) {
    return document.getElementById(id);
  }

  function getNextPath() {
    var params = new URLSearchParams(window.location.search);
    var next = (params.get("next") || "").trim();
    if (!next) return "/";

    if (next[0] !== "/") {
      return "/";
    }

    if (next.indexOf("//") === 0) {
      return "/";
    }

    return next;
  }

  function getGoogleRedirectUrl() {
    var cfg = window.TYPO_SUPABASE_CONFIG || {};
    var custom = (cfg.authRedirectUrl || "").trim();
    var nextPath = getNextPath();
    var origin = window.location.origin;

    if (custom && !/localhost:\\d+/i.test(custom)) {
      try {
        var parsed = new URL(custom);
        return parsed.origin + nextPath;
      } catch (error) {
        return custom;
      }
    }

    if (window.location.hostname === "typo.cool" || window.location.hostname === "www.typo.cool") {
      return "https://typo.cool" + nextPath;
    }

    return origin + nextPath;
  }

  async function refreshUi(client) {
    var sessionResult = await client.auth.getSession();
    var session = sessionResult && sessionResult.data ? sessionResult.data.session : null;

    if (session && session.user) {
      byId("googleLoginBtn").hidden = true;
      byId("logoutBtn").hidden = false;
      return;
    }

    byId("googleLoginBtn").hidden = false;
    byId("logoutBtn").hidden = true;
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

  async function init() {
    byId("yearValue").textContent = String(new Date().getFullYear());

    var ctx = window.typoSupabase.createSupabaseBrowserClient();
    if (ctx.error || !ctx.client) {
      console.error(ctx.error || "Supabase bağlantısı yok");
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
