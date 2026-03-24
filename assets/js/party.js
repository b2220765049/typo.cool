(function () {
  "use strict";

  var IPC_QUESTIONS = [
    {
      statement: "Bir ekip toplantısında fikir ayrılığı çıktı.",
      options: [
        { text: "Hızlıca yön alıp kararı netleştiririm.", effect: { dom: 2, lov: 0 } },
        { text: "Herkesi dinleyip ortak zemini bulmaya çalışırım.", effect: { dom: 0, lov: 2 } },
        { text: "Tartışmadan uzak dururum.", effect: { dom: -1, lov: -1 } }
      ]
    },
    {
      statement: "Yakın arkadaşın sana kırıldığını söyledi.",
      options: [
        { text: "Sorunu açıkca konuşup net bir plan yaparım.", effect: { dom: 1, lov: 1 } },
        { text: "Onu sakinleştirip duygusunu anlamaya odaklanırım.", effect: { dom: 0, lov: 2 } },
        { text: "Konuyu ertelemeyi tercih ederim.", effect: { dom: -1, lov: -1 } }
      ]
    },
    {
      statement: "Kalabalık bir ortamda yeni insanlarla tanışıyorsun.",
      options: [
        { text: "Sohbeti ben başlatırım.", effect: { dom: 1, lov: 1 } },
        { text: "Biriyle derin bir sohbet açmaya çalışırım.", effect: { dom: 0, lov: 2 } },
        { text: "Sessiz kalıp izlerim.", effect: { dom: -1, lov: -1 } }
      ]
    },
    {
      statement: "Birisi seni haksızca eleştirdi.",
      options: [
        { text: "Sınırlarımı net koyarım.", effect: { dom: 2, lov: -1 } },
        { text: "Neden böyle hissettiğini anlamaya çalışırım.", effect: { dom: 0, lov: 2 } },
        { text: "Tepki vermeden geri çekilirim.", effect: { dom: -1, lov: -1 } }
      ]
    },
    {
      statement: "Takımda görev dağılımı yapılıyor.",
      options: [
        { text: "Liderlik alır, sorumluluk dağıtırım.", effect: { dom: 2, lov: 0 } },
        { text: "Herkesin güçlü yönüne göre paylaştırırım.", effect: { dom: 1, lov: 1 } },
        { text: "Bana ne verilirse onu yaparım.", effect: { dom: -1, lov: 0 } }
      ]
    },
    {
      statement: "Arkadaşın zor bir dönemden geçiyor.",
      options: [
        { text: "Pratik bir çözüm planı sunarım.", effect: { dom: 1, lov: 0 } },
        { text: "Dinlerim ve duygusal destek veririm.", effect: { dom: 0, lov: 2 } },
        { text: "Nasıl yaklaşacağımı bilemeyip uzak kalırım.", effect: { dom: -1, lov: -1 } }
      ]
    },
    {
      statement: "Bir konuda haklı olduğunu düşünüyorsun.",
      options: [
        { text: "Görüşümü açıkça savunurum.", effect: { dom: 2, lov: -1 } },
        { text: "Uzlaşma için orta yol ararım.", effect: { dom: 0, lov: 1 } },
        { text: "Konuyu kapatmayı tercih ederim.", effect: { dom: -1, lov: -1 } }
      ]
    },
    {
      statement: "Yeni bir gruba katıldın.",
      options: [
        { text: "Kendimi tanıtıp enerjiyi yükseltecek bir sohbet açarım.", effect: { dom: 1, lov: 1 } },
        { text: "İnsanları tanımak için soru sorarım.", effect: { dom: 0, lov: 2 } },
        { text: "Benimle konuşulunca cevap veririm.", effect: { dom: -1, lov: 0 } }
      ]
    }
  ];

  var OCTANT_ANGLES = {
    LM: 0,
    NO: 45,
    PA: 90,
    BC: 135,
    DE: 180,
    FG: 225,
    HI: 270,
    JK: 315
  };

  var OCTANT_NAMES = {
    LM: "Sıcak-Uyumlu",
    NO: "Dışadönük-Girişken",
    PA: "Güvenli-Lider",
    BC: "Mesafeli-Kontrolcü",
    DE: "Soğuk-Eleştirel",
    FG: "İçedönük-Mesafeli",
    HI: "Çekingen-Çekimser",
    JK: "Nazik-Uysal"
  };

  var state = {
    supabase: null,
    supabaseUrl: "",
    entryMode: "choice",
    room: null,
    session: null,
    hostSession: null,
    participantToken: "",
    nickname: "",
    entryHideTimers: {
      choice: null,
      create: null,
      join: null
    },
    channel: null,
    pollHandle: null,
    authSubscriptionBound: false,
    test: {
      active: false,
      index: 0,
      answers: [],
      scores: { dom: 0, lov: 0 },
      submitted: false
    }
  };

  var els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function setStatus(message, type) {
    if (!els.statusBar) return;
    var tone = type || "info";
    if (tone === "error") {
      els.statusBar.hidden = false;
      els.statusBar.textContent = message;
      els.statusBar.className = "party-status error";
      return;
    }
    els.statusBar.hidden = true;
    els.statusBar.textContent = "";
    els.statusBar.className = "party-status error";
  }

  function showSection(sectionName) {
    var sections = ["lobby", "room", "test", "results"];
    sections.forEach(function (name) {
      var section = byId("section-" + name);
      if (!section) return;
      section.hidden = name !== sectionName;
    });
  }

  function getEntryModeOrder(mode) {
    if (mode === "choice") return 0;
    if (mode === "create") return 1;
    if (mode === "join") return 2;
    return 0;
  }

  function setEntryMode(mode) {
    var previousMode = state.entryMode;
    state.entryMode = mode;

    var choiceCard = byId("entryChoiceCard");
    var createCard = byId("createPathCard");
    var joinCard = byId("joinPathCard");
    var chooseCreateBtn = byId("chooseCreateBtn");
    var chooseJoinBtn = byId("chooseJoinBtn");

    if (!choiceCard || !createCard || !joinCard || !chooseCreateBtn || !chooseJoinBtn) return;

    var cards = {
      choice: choiceCard,
      create: createCard,
      join: joinCard
    };

    Object.keys(cards).forEach(function (key) {
      var card = cards[key];
      if (!card) return;
      if (state.entryHideTimers[key]) {
        window.clearTimeout(state.entryHideTimers[key]);
        state.entryHideTimers[key] = null;
      }
      card.classList.remove("slide-out-left", "slide-out-right", "slide-in-left", "slide-in-right");
    });

    var incoming = cards[mode];
    var outgoing = previousMode !== mode ? cards[previousMode] : null;
    var direction = getEntryModeOrder(mode) >= getEntryModeOrder(previousMode) ? "forward" : "backward";

    function revealIncoming() {
      if (!incoming) return;
      incoming.hidden = false;
      // Reflow to reliably replay the slide-in animation.
      void incoming.offsetWidth;
      incoming.classList.add(direction === "forward" ? "slide-in-right" : "slide-in-left");
      state.entryHideTimers[mode] = window.setTimeout(function () {
        incoming.classList.remove("slide-in-right", "slide-in-left");
        state.entryHideTimers[mode] = null;
      }, 300);
    }

    if (outgoing && !outgoing.hidden) {
      outgoing.classList.add(direction === "forward" ? "slide-out-left" : "slide-out-right");
      state.entryHideTimers[previousMode] = window.setTimeout(function () {
        outgoing.hidden = true;
        outgoing.classList.remove("slide-out-left", "slide-out-right");
        state.entryHideTimers[previousMode] = null;
        revealIncoming();
      }, 250);
    } else {
      Object.keys(cards).forEach(function (key) {
        if (key !== mode && cards[key]) {
          cards[key].hidden = true;
        }
      });
      revealIncoming();
    }

    chooseCreateBtn.className = mode === "create" ? "btn primary" : "btn ghost";
    chooseJoinBtn.className = mode === "join" ? "btn primary" : "btn ghost";
  }

  function safeRoomCode(raw) {
    return (raw || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  }

  function parseQuery() {
    var params = new URLSearchParams(window.location.search);
    return {
      code: safeRoomCode(params.get("code"))
    };
  }

  function applyUrl(code) {
    var params = new URLSearchParams();
    if (code) params.set("code", code);
    var next = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", next);
  }

  function copyText(text) {
    if (!text) return Promise.resolve();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    document.body.removeChild(area);
    return Promise.resolve();
  }

  async function postFunction(name, payload, requireAuth) {
    if (!state.supabase || !state.supabaseUrl) {
      throw new Error("Supabase bağlantısı hazır değil.");
    }

    var headers = {
      "Content-Type": "application/json"
    };

    if (requireAuth) {
      var sessionResult = await state.supabase.auth.getSession();
      var accessToken = sessionResult && sessionResult.data && sessionResult.data.session
        ? sessionResult.data.session.access_token
        : "";
      if (!accessToken) {
        throw new Error("Bu işlem için host girişi gerekli.");
      }
      headers.Authorization = "Bearer " + accessToken;
    }

    var response = await fetch(state.supabaseUrl + "/functions/v1/" + name, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(payload || {})
    });

    var data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      var message = (data && (data.error || data.message)) || "Sunucu hatası";
      throw new Error(message);
    }

    return data || {};
  }

  function calculateOctant(dom, lov) {
    if (dom === 0 && lov === 0) return "LM";
    var angle = Math.atan2(dom, lov) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    var closest = "LM";
    var minDistance = 361;

    Object.keys(OCTANT_ANGLES).forEach(function (octant) {
      var octantAngle = OCTANT_ANGLES[octant];
      var distance = Math.abs(angle - octantAngle);
      if (distance > 180) distance = 360 - distance;
      if (distance < minDistance) {
        minDistance = distance;
        closest = octant;
      }
    });

    return closest;
  }

  function resetTestState() {
    state.test = {
      active: false,
      index: 0,
      answers: [],
      scores: { dom: 0, lov: 0 },
      submitted: false
    };
  }

  function renderQuestion() {
    var question = IPC_QUESTIONS[state.test.index];
    if (!question) {
      return;
    }

    byId("questionCounter").textContent = String(state.test.index + 1);
    byId("questionTotal").textContent = String(IPC_QUESTIONS.length);
    byId("questionText").textContent = question.statement;

    var optionsWrap = byId("questionOptions");
    optionsWrap.innerHTML = "";

    question.options.forEach(function (option, idx) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice-btn";
      btn.textContent = option.text;
      btn.addEventListener("click", function () {
        chooseOption(idx);
      });
      optionsWrap.appendChild(btn);
    });

    byId("testProgressFill").style.width = (((state.test.index + 1) / IPC_QUESTIONS.length) * 100).toFixed(2) + "%";
  }

  function chooseOption(optionIndex) {
    if (state.test.submitted) return;

    var question = IPC_QUESTIONS[state.test.index];
    var option = question.options[optionIndex];
    state.test.answers.push({
      questionIndex: state.test.index,
      optionIndex: optionIndex
    });
    state.test.scores.dom += option.effect.dom;
    state.test.scores.lov += option.effect.lov;

    if (state.test.index < IPC_QUESTIONS.length - 1) {
      state.test.index += 1;
      renderQuestion();
      return;
    }

    void submitTestResult();
  }

  async function submitTestResult() {
    var octant = calculateOctant(state.test.scores.dom, state.test.scores.lov);
    var payload = {
      roomCode: state.room && state.room.room_code,
      sessionId: state.session && state.session.id,
      participantToken: state.participantToken,
      result: {
        testType: "ipc",
        octant: octant,
        scores: state.test.scores,
        answers: state.test.answers,
        completedAt: new Date().toISOString()
      }
    };

    try {
      state.test.submitted = true;
      setStatus("Sonucun kaydediliyor...", "info");
      await postFunction("party-submit-result", payload, false);
      byId("myResultBadge").textContent = OCTANT_NAMES[octant] + " (" + octant + ")";
      setStatus("Test sonucu kaydedildi.", "success");
      showSection("results");
      await refreshRoomSnapshot();
    } catch (error) {
      state.test.submitted = false;
      setStatus(error.message, "error");
    }
  }

  function setHostControls(isHost) {
    byId("hostControls").hidden = !isHost;
  }

  function isHost() {
    return Boolean(
      state.hostSession &&
      state.hostSession.user &&
      state.room &&
      state.hostSession.user.id === state.room.host_user_id
    );
  }

  function updateCreateCardSignInStatus() {
    var googleLoginBtn = byId("party-google-login-btn");
    var createRoomForm = byId("createRoomForm");

    if (!googleLoginBtn || !createRoomForm) return;

    if (state.hostSession && state.hostSession.user) {
      // User is signed in - hide login button, show form
      googleLoginBtn.hidden = true;
      createRoomForm.hidden = false;
    } else {
      // User is not signed in - show login button, hide form
      googleLoginBtn.hidden = false;
      createRoomForm.hidden = true;
    }
  }

  function renderParticipants(participants) {
    var list = byId("participantsList");
    list.innerHTML = "";

    if (!participants || participants.length === 0) {
      var empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = "Henüz kimse katılmadı.";
      list.appendChild(empty);
      return;
    }

    participants.forEach(function (p) {
      var item = document.createElement("li");
      var hostMark = p.is_host ? " (Host)" : "";
      item.textContent = p.nickname + hostMark;
      list.appendChild(item);
    });
  }

  function renderResultsToList(listId, results) {
    var list = byId(listId);
    if (!list) return;
    list.innerHTML = "";

    if (!results || results.length === 0) {
      var empty = document.createElement("li");
      empty.className = "muted";
      empty.textContent = "Henüz sonuç gelmedi.";
      list.appendChild(empty);
      return;
    }

    results.forEach(function (r) {
      var item = document.createElement("li");
      var tag = r.result && r.result.octant ? r.result.octant : "-";
      item.textContent = r.nickname + ": " + (OCTANT_NAMES[tag] || tag) + " (" + tag + ")";
      list.appendChild(item);
    });
  }

  function renderResults(results) {
    renderResultsToList("resultsList", results);
    renderResultsToList("resultsFinalList", results);
  }

  function renderRoom(snapshot) {
    state.room = snapshot.room || null;
    state.session = snapshot.session || null;

    if (!state.room) {
      setStatus("Oda bulunamadı.", "error");
      showSection("lobby");
      return;
    }

    byId("roomNameView").textContent = state.room.room_name;
    byId("roomCodeView").textContent = state.room.room_code;

    var deepLink = window.location.origin + "/party/?code=" + encodeURIComponent(state.room.room_code);
    byId("roomLinkView").value = deepLink;

    var participants = snapshot.participants || [];
    var results = snapshot.results || [];

    renderParticipants(participants);
    renderResults(results);

    var progress = byId("resultsProgressText");
    if (progress) {
      progress.textContent = "Tamamlayan kişi: " + results.length + "/" + participants.length;
    }

    var statusText = "Durum: Açık";
    if (state.room.status === "locked") statusText = "Durum: Kilitli";
    if (state.room.status === "testing") statusText = "Durum: Test Başladı";
    if (state.room.status === "completed") statusText = "Durum: Tamamlandı";
    byId("roomStatusView").textContent = statusText;

    setHostControls(isHost());

    if (state.room.status === "testing") {
      if (!state.test.submitted) {
        state.test.active = true;
        showSection("test");
        renderQuestion();
      } else {
        showSection("results");
      }
      return;
    }

    if (state.room.status === "completed") {
      showSection("results");
      return;
    }

    showSection("room");
  }

  async function refreshRoomSnapshot() {
    if (!state.room) return;
    try {
      var snapshot = await postFunction("party-resolve-room", {
        roomCode: state.room.room_code,
        participantToken: state.participantToken || ""
      }, false);
      renderRoom(snapshot);
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function createRoom(evt) {
    evt.preventDefault();
    var roomName = (byId("createRoomName").value || "").trim();
    var hostNickname = (byId("hostNickname").value || "").trim();
    var maxParticipants = Number(byId("maxParticipants").value || "12");

    if (!roomName || !hostNickname) {
      setStatus("Oda adı ve host kullanıcı adı gerekli.", "error");
      return;
    }

    try {
      setStatus("Oda oluşturuluyor...", "info");
      var payload = {
        roomName: roomName,
        hostNickname: hostNickname,
        maxParticipants: maxParticipants
      };
      var result = await postFunction("party-create-room", payload, true);

      state.participantToken = result.participantToken || "";
      state.nickname = hostNickname;
      resetTestState();

      applyUrl(result.room.room_code);
      renderRoom(result);
      subscribeRealtime(result.room.id, result.room.room_code);
      setStatus("Oda oluşturuldu.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function joinRoom(evt) {
    evt.preventDefault();
    var roomCodeInput = safeRoomCode((byId("joinRoomCode").value || "").trim());
    var nickname = (byId("joinNickname").value || "").trim();

    if (!nickname) {
      setStatus("Katılmak için kullanıcı adı gerekli.", "error");
      return;
    }

    if (!roomCodeInput) {
      setStatus("Oda kodu gerekli.", "error");
      return;
    }

    try {
      setStatus("Odaya katılınıyor...", "info");
      var result = await postFunction("party-join-room", {
        roomCode: roomCodeInput,
        nickname: nickname
      }, false);

      state.participantToken = result.participantToken || "";
      state.nickname = nickname;
      resetTestState();

      applyUrl(result.room.room_code);
      renderRoom(result);
      subscribeRealtime(result.room.id, result.room.room_code);
      setStatus("Odaya katıldın.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function lockAndStart() {
    if (!state.room) return;
    try {
      setStatus("Oda kilitleniyor ve test başlatılıyor...", "info");
      await postFunction("party-lock-start", {
        roomCode: state.room.room_code
      }, true);
      await refreshRoomSnapshot();
      setStatus("Test başlatıldı.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  async function endSession() {
    if (!state.room) return;
    try {
      setStatus("Oturum sonlandırılıyor...", "info");
      await postFunction("party-end-session", {
        roomCode: state.room.room_code
      }, true);
      await refreshRoomSnapshot();
      setStatus("Oturum sonlandı.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function bindEvents() {
    byId("chooseCreateBtn").addEventListener("click", function () {
      setEntryMode("create");
      setStatus("Oda oluşturma adımını doldur.", "info");
    });
    byId("chooseJoinBtn").addEventListener("click", function () {
      setEntryMode("join");
      setStatus("Oda kodunu girip katıl.", "info");
    });
    byId("switchToJoinBtn").addEventListener("click", function () {
      setEntryMode("join");
    });
    byId("switchToCreateBtn").addEventListener("click", function () {
      setEntryMode("create");
    });

    byId("createRoomForm").addEventListener("submit", createRoom);
    byId("joinRoomForm").addEventListener("submit", joinRoom);
    byId("copyRoomLinkBtn").addEventListener("click", function () {
      void copyText(byId("roomLinkView").value)
        .then(function () {
          setStatus("Oda bağlantısı kopyalandı.", "success");
        })
        .catch(function () {
          setStatus("Link kopyalanamadi.", "error");
        });
    });
    byId("lockStartBtn").addEventListener("click", function () {
      void lockAndStart();
    });
    byId("endSessionBtn").addEventListener("click", function () {
      void endSession();
    });
    byId("leaveRoomBtn").addEventListener("click", function () {
      state.room = null;
      state.session = null;
      state.participantToken = "";
      resetTestState();
      unsubscribeRealtime();
      applyUrl("");
      setEntryMode("choice");
      showSection("lobby");
      setStatus("Odadan çıkıldı.", "info");
    });
    byId("backToLobbyBtn").addEventListener("click", function () {
      setEntryMode("choice");
      showSection("lobby");
    });
  }

  function unsubscribeRealtime() {
    if (state.channel) {
      state.supabase.removeChannel(state.channel);
      state.channel = null;
    }
    if (state.pollHandle) {
      window.clearInterval(state.pollHandle);
      state.pollHandle = null;
    }
  }

  function subscribeRealtime(roomId, roomCode) {
    unsubscribeRealtime();
    if (!state.supabase || !roomId) return;

    state.channel = state.supabase
      .channel("party-room-" + roomId)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "party_rooms",
        filter: "id=eq." + roomId
      }, function () {
        void refreshRoomSnapshot();
      })
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "party_room_members",
        filter: "room_id=eq." + roomId
      }, function () {
        void refreshRoomSnapshot();
      })
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "party_test_results",
        filter: "room_id=eq." + roomId
      }, function () {
        void refreshRoomSnapshot();
      })
      .subscribe(function (status) {
        if (status === "SUBSCRIBED") {
          setStatus("Oda canlı bağlantısı aktif.", "success");
        }
      });

    state.pollHandle = window.setInterval(function () {
      if (state.room && state.room.room_code === roomCode) {
        void refreshRoomSnapshot();
      }
    }, 8000);
  }

  async function hydrateHostSession() {
    if (!state.supabase) return;

    var sessionResult = await state.supabase.auth.getSession();
    state.hostSession = sessionResult && sessionResult.data ? sessionResult.data.session : null;

    updateCreateCardSignInStatus();

    if (!state.authSubscriptionBound) {
      state.authSubscriptionBound = true;
      state.supabase.auth.onAuthStateChange(function () {
        void hydrateHostSession();
        if (state.room) {
          setHostControls(isHost());
        }
      });
    }
  }

  async function tryAutoJoinFromUrl() {
    var query = parseQuery();
    if (!query.code) {
      return;
    }

    byId("joinRoomCode").value = query.code;
    setEntryMode("join");

    try {
      setStatus("Oda bilgisi yükleniyor...", "info");
      var snapshot = await postFunction("party-resolve-room", {
        roomCode: query.code,
        participantToken: ""
      }, false);

      state.room = snapshot.room;
      state.session = snapshot.session || null;

      if (snapshot.room && snapshot.room.status === "locked") {
        setStatus("Bu oda kilitli. Yeni katılım kabul edilmiyor.", "error");
      } else if (snapshot.room && snapshot.room.status === "testing") {
        setStatus("Bu odada test başladı. Yeni katılım kabul edilmiyor.", "error");
      } else {
        setStatus("Oda bulundu. Katılmak için kullanıcı adı gir.", "info");
      }
    } catch (error) {
      setStatus(error.message, "error");
    }
  }

  function cacheElements() {
    els.statusBar = byId("statusBar");
  }

  function initClient() {
    var ctx = window.typoSupabase.createSupabaseBrowserClient();
    state.supabase = ctx.client;
    state.supabaseUrl = ctx.config ? ctx.config.url : "";

    if (ctx.error) {
      setStatus("Bağlantı kurulamadı. Lütfen daha sonra tekrar dene.", "error");
      return false;
    }

    return true;
  }

  async function init() {
    cacheElements();
    bindEvents();
    setEntryMode("choice");

    var ok = initClient();
    if (!ok) {
      showSection("lobby");
      return;
    }

    await hydrateHostSession();
    await tryAutoJoinFromUrl();
    if (!state.room) {
      showSection("lobby");
    }
    setStatus("Typo Party hazır.", "info");
  }

  window.addEventListener("beforeunload", function () {
    unsubscribeRealtime();
  });

  document.addEventListener("DOMContentLoaded", function () {
    void init();
    byId("yearValue").textContent = String(new Date().getFullYear());
  });
})();
