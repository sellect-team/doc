// 접속 게이트 - 두 가지 모드
//  1) MS 로그인 모드: AUTH.clientId가 설정되면 Microsoft(Entra ID) 로그인 후
//     이메일 도메인(@sailingstone.io)을 검사해 통과시킨다. (MSAL, 클라이언트 측)
//  2) 비밀번호 모드: clientId가 비어 있으면 기존 비밀번호(30분 세션) 방식.
// 주의: 둘 다 클라이언트 측 커튼이다. 정적 호스팅(GitHub Pages) 특성상
//       파일 직접 접근까지 막지는 못한다.
(function () {
  var AUTH = {
    clientId: "",                 // Entra 앱 등록의 Application (client) ID - 비우면 비밀번호 모드
    tenantId: "organizations",    // Directory (tenant) ID (조직 전용이면 해당 ID)
    domain: "sailingstone.io",    // 허용할 메일 도메인
  };
  // 조직 정보 (하위 URL 포털은 빌드가 window.__TENANT를 심어 준다)
  var T = window.__TENANT || {};
  var GATE_TITLE = T.gateTitle || "세일링스톤 <b>세일즈 그룹</b><br>문서 시스템";
  var GATE_MARK = T.footerMark || "SAILINGSTONE";
  var GATE_ACCENT = T.accent || "#2DD4BF";
  var GATE_BG = T.gateBg || "#0F172A";
  // 조직마다 비밀번호와 세션이 다르다 (한쪽을 열어도 다른 포털은 열리지 않는다)
  var KEY = T.gateKey || "ss_gate_until";
  var SESSION_MIN = 30;
  var PW = T.gatePw && T.gatePw.length
    ? String.fromCharCode.apply(null, T.gatePw)
    : String.fromCharCode(48, 52, 48, 49);

  // ── 공통: 잠금 + 오버레이 ──
  function lockNow() {
    document.documentElement.classList.add("gate-lock");
    var st = document.createElement("style");
    st.textContent = [
      "html.gate-lock body > *:not(#gateOv) { display: none !important; }",
      "#gateOv { position: fixed; inset: 0; z-index: 99999;",
      "  background: linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px),",
      "    linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px), " + GATE_BG + ";",
      "  background-size: 44px 44px, 44px 44px, auto;",
      "  display: flex; align-items: center; justify-content: center;",
      "  font-family: 'Pretendard', -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; }",
      "#gateOv .box { width: min(88vw, 400px); text-align: center; }",
      "#gateOv .lock { margin-bottom: 18px; }",
      "#gateOv .lock svg { width: 40px; height: 40px; stroke: " + GATE_ACCENT + "; fill: none;",
      "  stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }",
      "#gateOv h1 { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }",
      "#gateOv h1 b { color: " + GATE_ACCENT + "; font-weight: 700; }",
      "#gateOv p { color: #64748B; font-size: 13px; margin-top: 8px; line-height: 1.5; }",
      "#gateOv .row { display: flex; gap: 8px; margin-top: 24px; }",
      "#gateOv input { flex: 1; background: rgba(30,41,59,0.85); border: 1px solid #334155;",
      "  border-radius: 12px; padding: 13px 16px; font-size: 16px; color: #fff;",
      "  outline: none; letter-spacing: 0.35em; text-align: center; }",
      "#gateOv input:focus { border-color: " + GATE_ACCENT + "; }",
      "#gateOv button { background: " + GATE_ACCENT + "; color: " + GATE_BG + "; border: none; border-radius: 12px;",
      "  padding: 0 22px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }",
      "#gateOv button:hover { background: #5EEAD4; }",
      "#gateOv .msbtn { width: 100%; margin-top: 24px; padding: 13px 0; display: flex;",
      "  align-items: center; justify-content: center; gap: 10px; }",
      "#gateOv .msbtn .sq { display: grid; grid-template-columns: 7px 7px; gap: 1px; }",
      "#gateOv .msbtn .sq i { width: 7px; height: 7px; background: #0F172A; }",
      "#gateOv .err { color: #FB7185; font-size: 13px; margin-top: 12px; min-height: 18px; }",
      "#gateOv .foot { color: #475569; font-size: 11px; letter-spacing: 0.14em; margin-top: 34px; }",
      "@keyframes gateShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }",
      "#gateOv .shake { animation: gateShake 0.28s ease; }",
    ].join("\n");
    (document.head || document.documentElement).appendChild(st);
  }

  function overlay(inner) {
    var ov = document.createElement("div");
    ov.id = "gateOv";
    ov.innerHTML =
      '<div class="box">' +
      '<div class="lock"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></div>' +
      "<h1>" + GATE_TITLE + "</h1>" +
      inner +
      '<div class="err" id="gateErr"></div>' +
      '<div class="foot">' + GATE_MARK + ' · INTERNAL USE ONLY</div>' +
      "</div>";
    document.body.appendChild(ov);
    return ov;
  }

  function unlockUI() {
    var ov = document.getElementById("gateOv");
    if (ov) ov.remove();
    document.documentElement.classList.remove("gate-lock");
  }

  function shake(ov) {
    var box = ov.querySelector(".box");
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
  }

  // ── 모드 1: 비밀번호 (clientId 미설정 시) ──
  function passwordMode() {
    var now = Date.now();
    var until = parseInt(localStorage.getItem(KEY) || "0", 10) || 0;
    if (until > now) {
      localStorage.setItem(KEY, String(now + SESSION_MIN * 60 * 1000));
      return;
    }
    localStorage.removeItem(KEY);
    lockNow();
    document.addEventListener("DOMContentLoaded", function () {
      var ov = overlay(
        "<p>접속 비밀번호를 입력하세요 · 세션은 30분간 유지됩니다</p>" +
        '<div class="row"><input id="gatePw" type="password" inputmode="numeric" autocomplete="off" placeholder="••••">' +
        '<button id="gateGo">입장</button></div>'
      );
      var input = document.getElementById("gatePw");
      function submit() {
        if (input.value === PW) {
          localStorage.setItem(KEY, String(Date.now() + SESSION_MIN * 60 * 1000));
          unlockUI();
          return;
        }
        document.getElementById("gateErr").textContent = "비밀번호가 올바르지 않습니다.";
        input.value = "";
        shake(ov);
        input.focus();
      }
      document.getElementById("gateGo").addEventListener("click", submit);
      input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
      input.focus();
    });
  }

  // ── 모드 2: Microsoft 로그인 (MSAL) ──
  function msalMode() {
    lockNow();

    function start() {
      var sc = document.createElement("script");
      sc.src = "https://alcdn.msauth.net/browser/2.38.4/js/msal-browser.min.js";
      sc.onload = init;
      sc.onerror = function () { showError("로그인 모듈을 불러오지 못했습니다. 새로고침해 주세요."); };
      document.head.appendChild(sc);
    }

    var ov = null;
    function ensureOverlay() {
      if (!ov) {
        ov = overlay(
          "<p>회사 Microsoft 계정(@" + AUTH.domain + ")으로 로그인하세요</p>" +
          '<button class="msbtn" id="gateMs"><span class="sq"><i></i><i></i><i></i><i></i></span>Microsoft로 로그인</button>'
        );
      }
      return ov;
    }
    function showError(msg) {
      var el = document.getElementById("gateErr");
      if (el) el.textContent = msg;
      if (ov) shake(ov);
    }

    function init() {
      var msal = new window.msal.PublicClientApplication({
        auth: {
          clientId: AUTH.clientId,
          authority: "https://login.microsoftonline.com/" + AUTH.tenantId,
          redirectUri: window.location.origin + window.location.pathname,
        },
        cache: { cacheLocation: "localStorage" },
      });

      function domainOk(account) {
        var u = (account && (account.username || "")).toLowerCase();
        return u.endsWith("@" + AUTH.domain.toLowerCase());
      }

      function check() {
        var accounts = msal.getAllAccounts();
        if (accounts.length && domainOk(accounts[0])) { unlockUI(); return true; }
        if (accounts.length) {
          ensureOverlay();
          showError(accounts[0].username + " 계정은 접근 권한이 없습니다. 회사 계정으로 로그인하세요.");
          msal.logoutRedirect({ onRedirectNavigate: function () { return false; } });
        }
        return false;
      }

      msal.handleRedirectPromise().then(function () {
        if (check()) return;
        var o = ensureOverlay();
        o.querySelector("#gateMs").addEventListener("click", function () {
          msal.loginRedirect({ scopes: ["openid", "profile"] });
        });
      }).catch(function (e) {
        ensureOverlay();
        showError("로그인 오류: " + (e && e.errorCode ? e.errorCode : "알 수 없음"));
      });
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", start);
    } else {
      start();
    }
  }

  if (AUTH.clientId) msalMode();
  else passwordMode();
})();
