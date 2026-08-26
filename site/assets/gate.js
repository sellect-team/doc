// 간단 접속 게이트 — 비밀번호 입력 후 30분 세션 유지 (페이지를 쓸 때마다 연장)
// 주의: 클라이언트 측 잠금이라 가벼운 커튼 역할이다. 실질 보안은 Azure의 MS 로그인이 담당한다.
(function () {
  var KEY = "ss_gate_until";
  var SESSION_MIN = 30;
  var PW = String.fromCharCode(48, 52, 48, 49);

  var now = Date.now();
  var until = parseInt(localStorage.getItem(KEY) || "0", 10) || 0;
  if (until > now) {
    // 유효한 세션 — 사용 중이면 30분 슬라이딩 연장
    localStorage.setItem(KEY, String(now + SESSION_MIN * 60 * 1000));
    return;
  }
  localStorage.removeItem(KEY);

  // 잠금: 오버레이 외의 모든 콘텐츠 숨김 (head에서 실행되어 렌더 전에 적용됨)
  document.documentElement.classList.add("gate-lock");
  var st = document.createElement("style");
  st.textContent = [
    "html.gate-lock body > *:not(#gateOv) { display: none !important; }",
    "#gateOv { position: fixed; inset: 0; z-index: 99999;",
    "  background: linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px),",
    "    linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px), #0F172A;",
    "  background-size: 44px 44px, 44px 44px, auto;",
    "  display: flex; align-items: center; justify-content: center;",
    "  font-family: 'Pretendard', -apple-system, 'Segoe UI', 'Malgun Gothic', sans-serif; }",
    "#gateOv .box { width: min(88vw, 380px); text-align: center; }",
    "#gateOv .lock { font-size: 40px; margin-bottom: 18px; }",
    "#gateOv h1 { color: #fff; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }",
    "#gateOv h1 b { color: #2DD4BF; font-weight: 700; }",
    "#gateOv p { color: #64748B; font-size: 13px; margin-top: 8px; }",
    "#gateOv .row { display: flex; gap: 8px; margin-top: 24px; }",
    "#gateOv input { flex: 1; background: rgba(30,41,59,0.85); border: 1px solid #334155;",
    "  border-radius: 12px; padding: 13px 16px; font-size: 16px; color: #fff;",
    "  outline: none; letter-spacing: 0.35em; text-align: center; }",
    "#gateOv input:focus { border-color: #2DD4BF; }",
    "#gateOv button { background: #2DD4BF; color: #0F172A; border: none; border-radius: 12px;",
    "  padding: 0 22px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; }",
    "#gateOv button:hover { background: #5EEAD4; }",
    "#gateOv .err { color: #FB7185; font-size: 13px; margin-top: 12px; min-height: 18px; }",
    "#gateOv .foot { color: #475569; font-size: 11px; letter-spacing: 0.14em; margin-top: 34px; }",
    "@keyframes gateShake { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-7px)} 75%{transform:translateX(7px)} }",
    "#gateOv .shake { animation: gateShake 0.28s ease; }",
  ].join("\n");
  (document.head || document.documentElement).appendChild(st);

  function unlock() {
    localStorage.setItem(KEY, String(Date.now() + SESSION_MIN * 60 * 1000));
    var ov = document.getElementById("gateOv");
    if (ov) ov.remove();
    document.documentElement.classList.remove("gate-lock");
  }

  document.addEventListener("DOMContentLoaded", function () {
    var ov = document.createElement("div");
    ov.id = "gateOv";
    ov.innerHTML =
      '<div class="box">' +
      '<div class="lock">🔒</div>' +
      "<h1>세일링스톤 <b>세일즈 그룹</b><br>문서 시스템</h1>" +
      "<p>접속 비밀번호를 입력하세요 · 세션은 30분간 유지됩니다</p>" +
      '<div class="row"><input id="gatePw" type="password" inputmode="numeric" autocomplete="off" placeholder="••••">' +
      '<button id="gateGo">입장</button></div>' +
      '<div class="err" id="gateErr"></div>' +
      '<div class="foot">SAILINGSTONE · INTERNAL USE ONLY</div>' +
      "</div>";
    document.body.appendChild(ov);

    var input = document.getElementById("gatePw");
    var err = document.getElementById("gateErr");
    function submit() {
      if (input.value === PW) { unlock(); return; }
      err.textContent = "비밀번호가 올바르지 않습니다.";
      input.value = "";
      var box = ov.querySelector(".box");
      box.classList.remove("shake");
      void box.offsetWidth; // 애니메이션 재시작
      box.classList.add("shake");
      input.focus();
    }
    document.getElementById("gateGo").addEventListener("click", submit);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") submit(); });
    input.focus();
  });
})();
