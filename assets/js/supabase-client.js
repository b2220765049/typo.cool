(function () {
  function getSupabaseConfig() {
    var config = window.TYPO_SUPABASE_CONFIG || {};
    var url = (config.url || "").trim();
    var anonKey = (config.anonKey || "").trim();

    return {
      url: url,
      anonKey: anonKey,
      isConfigured: Boolean(url && anonKey)
    };
  }

  function createSupabaseBrowserClient() {
    var config = getSupabaseConfig();
    if (!config.isConfigured) {
      return {
        client: null,
        config: config,
        error: "Supabase config missing. Fill assets/js/supabase-config.js with project URL and anon key."
      };
    }

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      return {
        client: null,
        config: config,
        error: "Supabase JS SDK not loaded."
      };
    }

    var client = window.supabase.createClient(config.url, config.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });

    return {
      client: client,
      config: config,
      error: null
    };
  }

  window.typoSupabase = {
    getSupabaseConfig: getSupabaseConfig,
    createSupabaseBrowserClient: createSupabaseBrowserClient
  };
})();
