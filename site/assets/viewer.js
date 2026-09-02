// 문서 뷰어: 슬라이드 분할, 목차, 키보드/버튼/휠 내비게이션, 버전 기록
(async function () {
  const params = new URLSearchParams(location.search);
  const docId = params.get("doc");
  const data = await fetch("data/docs.json", { cache: "no-store" }).then((r) => r.json());
  const doc = data.docs.find((d) => d.id === docId);
  if (!doc) {
    document.getElementById("docTitle").textContent = "문서를 찾을 수 없습니다";
    return;
  }

  const $ = (id) => document.getElementById(id);
  const frame = $("frame");
  let total = 0;
  let cur = 0;
  let viewingOld = null; // 열람 중인 이전 버전 (null = 최신)

  document.title = `${doc.title} — 문서 뷰어`;
  $("docTitle").textContent = doc.title;
  $("verChip").textContent = `v${doc.version}`;

  // ── 문서 로드: HTML을 fetch해서 내비게이션 스크립트를 주입한 뒤 iframe에 표시 ──
  // (문서 원본은 손대지 않고 뷰어에서만 주입한다 — AUTHORING.md 5절)
  const NAV_SCRIPT = `
<script>(function(){
  var slides = Array.prototype.slice.call(document.querySelectorAll("section.slide"));
  var cur = 0;
  // 지연 로딩된 이미지는 display:none 상태에서 받아오지 않는다.
  // 현재 위치 앞뒤를 eager로 승격시켜 이동 전에 미리 받아둔다.
  function preload(i) {
    for (var j = i - 1; j <= i + 2; j++) {
      var s = slides[j];
      if (!s) continue;
      var img = s.querySelector("img[loading='lazy']");
      if (img) img.loading = "eager";
    }
  }
  function show(i, quiet) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    slides.forEach(function(s, j) { s.style.display = j === cur ? "" : "none"; });
    preload(cur);
    if (!quiet) parent.postMessage({ __viewer: true, t: "cur", i: cur }, "*");
  }
  window.addEventListener("message", function(e) {
    var d = e.data;
    if (!d || !d.__viewer) return;
    if (d.t === "goto") show(d.i);
    if (d.t === "print") window.print();
  });
  document.addEventListener("keydown", function(e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); show(cur + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(cur - 1); }
    if (e.key === "Home") { e.preventDefault(); show(0); }
    if (e.key === "End") { e.preventDefault(); show(slides.length - 1); }
  });
  var wheelLock = 0;
  window.addEventListener("wheel", function(e) {
    var now = Date.now();
    if (now - wheelLock < 450 || Math.abs(e.deltaY) < 12) return;
    wheelLock = now;
    show(cur + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  var style = document.createElement("style");
  style.textContent = "@media print { section.slide { display: block !important; width: 100% !important; height: 100vh !important; page-break-after: always; overflow: hidden; } } @page { size: landscape; margin: 0; }";
  document.head.appendChild(style);
  parent.postMessage({ __viewer: true, t: "ready", n: slides.length }, "*");
  show(0, true);
})();<\/script>`;

  async function loadInto(fileRel, oldInfo) {
    viewingOld = oldInfo || null;
    // 문서 버전을 쿼리로 붙여 브라우저가 옛 캐시를 재사용하지 않게 한다
    const bust = fileRel.includes("?") ? "" : `?v=${encodeURIComponent(doc.version)}`;
    const html = await fetch(fileRel + bust).then((r) => r.text());
    // 상대 경로(assets 이미지 등)가 원본 위치 기준으로 동작하도록 <base> 주입
    const baseHref = new URL(doc.file.replace(/[^/]+$/, ""), location.href).href;
    const baseTag = `<base href="${baseHref}">`;
    let out = /<head[^>]*>/i.test(html)
      ? html.replace(/<head[^>]*>/i, (m) => m + baseTag)
      : baseTag + html;
    out += NAV_SCRIPT;
    frame.srcdoc = out;

    // 이전 버전 배너
    const banner = $("oldBanner");
    if (viewingOld) {
      $("oldBannerText").textContent = `이전 버전 열람 중 — ${viewingOld.date} · ${viewingOld.message}`;
      banner.classList.add("show");
      $("verChip").className = "chip old";
      $("verChip").textContent = "이전 버전";
    } else {
      banner.classList.remove("show");
      $("verChip").className = "chip";
      $("verChip").textContent = `v${doc.version}`;
    }
    renderHistory();
  }

  // ── iframe → 부모 메시지 ──
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (!d || !d.__viewer) return;
    if (d.t === "ready") {
      total = d.n;
      renderPages();
      update(0);
      // ?p=17 딥링크: 최초 로드에서 한 번만 해당 페이지로 이동
      const p = parseInt(params.get("p"), 10);
      if (p >= 2 && p <= total && !viewingOld && !window.__pJumped) {
        window.__pJumped = true;
        goto(p - 1);
      }
      if (params.get("print") === "1" && !viewingOld) {
        setTimeout(() => frame.contentWindow.postMessage({ __viewer: true, t: "print" }, "*"), 600);
      }
    }
    if (d.t === "cur") update(d.i);
  });

  function goto(i) {
    // iframe 왕복을 기다리지 않고 위치를 먼저 확정한다.
    // 그러지 않으면 방향키를 빠르게 연속 입력할 때 같은 cur 값이 재사용돼 단계가 누락된다.
    const target = Math.max(0, Math.min(total - 1, i));
    update(target);
    frame.contentWindow.postMessage({ __viewer: true, t: "goto", i: target }, "*");
  }

  function update(i) {
    cur = i;
    $("counter").textContent = `${cur + 1} / ${total}`;
    $("prevBtn").disabled = cur === 0;
    $("nextBtn").disabled = cur >= total - 1;
    document.querySelectorAll(".pages .pg").forEach((el, j) => el.classList.toggle("on", j === cur));
    const on = document.querySelector(".pages .pg.on");
    if (on) on.scrollIntoView({ block: "nearest" });
  }

  // ── 왼쪽 페이지 목차 ──
  function renderPages() {
    const list = $("pageList");
    list.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const el = document.createElement("div");
      el.className = "pg";
      const title = doc.pageTitles[i] || `페이지 ${i + 1}`;
      el.innerHTML = `<span class="no">${i + 1}</span><span>${escHtml(title)}</span>`;
      el.onclick = () => goto(i);
      list.appendChild(el);
    }
  }

  // ── 버전 기록 (클릭하면 해당 시점 문서 열람) ──
  function renderHistory() {
    const list = $("histList");
    list.innerHTML = "";
    if (!doc.history.length) {
      list.innerHTML = '<div class="h-item"><div class="h-date">아직 커밋 이력이 없습니다</div></div>';
      return;
    }
    doc.history.forEach((h, idx) => {
      const el = document.createElement("div");
      el.className = "h-item";
      const isCurrent = idx === 0;
      const old = doc.oldVersions.find((o) => o.hash === h.hash);
      const active = viewingOld ? viewingOld.hash === h.hash : isCurrent;
      if (active) el.classList.add("on");
      el.innerHTML = `
        <div class="h-msg">${isCurrent ? '<span class="h-cur">최신</span>' : ""}${escHtml(h.message)}</div>
        <div class="h-date">${escHtml(h.date)}</div>`;
      if (isCurrent) el.onclick = () => loadInto(doc.file, null);
      else if (old) el.onclick = () => loadInto(old.file, old);
      else el.style.opacity = "0.45"; // 보관 범위를 벗어난 오래된 버전
      list.appendChild(el);
    });
  }

  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ── 부모 창 키보드/버튼 ──
  $("prevBtn").onclick = () => goto(cur - 1);
  $("nextBtn").onclick = () => goto(cur + 1);
  document.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); goto(cur + 1); }
    if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); goto(cur - 1); }
    if (e.key === "Home") { e.preventDefault(); goto(0); }
    if (e.key === "End") { e.preventDefault(); goto(total - 1); }
  });

  // ── PPT 다운로드: 도형·텍스트 상자로 된 편집 가능한 PPTX ──
  $("pptxBtn").onclick = async () => {
    const head = await fetch(doc.pptx, { method: "HEAD" }).catch(() => null);
    if (!head || !head.ok) { alert("PPT 파일이 아직 준비되지 않았습니다."); return; }
    const a = document.createElement("a");
    a.href = doc.pptx;
    a.download = `${doc.title} v${doc.version}.pptx`;
    a.click();
  };

  // ── HTML 다운로드: 이미지가 내장된 단일 파일 ──
  $("htmlBtn").onclick = async () => {
    const res = await fetch(doc.html).catch(() => null);
    if (!res || !res.ok) { alert("HTML 파일을 찾을 수 없습니다. 빌드를 다시 실행하세요."); return; }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title} v${doc.version}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── PDF: CI 생성본이 있으면 다운로드, 없으면 브라우저 인쇄 ──
  $("pdfBtn").onclick = async () => {
    const head = await fetch(doc.pdf, { method: "HEAD" }).catch(() => null);
    if (head && head.ok && !viewingOld) {
      const a = document.createElement("a");
      a.href = doc.pdf;
      a.download = `${doc.title} v${doc.version}.pdf`;
      a.click();
    } else {
      frame.contentWindow.postMessage({ __viewer: true, t: "print" }, "*");
    }
  };

  loadInto(doc.file, null);
})();
