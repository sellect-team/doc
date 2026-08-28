// 메인 목록 페이지: 검색 · 카테고리 필터 · 정렬 · 순서 편집
(async function () {
  const [data, me] = await Promise.all([
    fetch("data/docs.json").then((r) => r.json()),
    fetch("/.auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  // 로그인 사용자 표시 (Azure SWA 환경에서만 동작, 로컬은 무시)
  const principal = me?.clientPrincipal;
  if (principal) {
    document.getElementById("userName").textContent = principal.userDetails;
    document.getElementById("logoutBtn").hidden = false;
  }

  // ── 조직(테넌트) 이름표 - 같은 화면 코드로 여러 조직 포털을 돌린다 ──
  const tn = data.tenant || {};
  const put = (sel, html) => { const el = document.querySelector(sel); if (el && html) el.innerHTML = html; };
  if (tn.siteTitle) document.title = tn.siteTitle;
  put(".hero .eyebrow", tn.eyebrow);
  if (tn.heroLine1) put(".hero h1", `${tn.heroLine1}<br><span class="grad">${tn.heroLine2 || ""}</span>`);
  put(".hero p", tn.heroDesc);

  const $ = (id) => document.getElementById(id);
  const grid = $("grid");
  const filtersEl = $("filters");
  let current = "all";
  let query = "";
  let sortMode = "default";
  let editMode = false;

  // ── 기본 순서: docs.json 배열 순서 + 내 브라우저에 저장한 순서(있으면) ──
  const LS_KEY = "docOrder.v1";
  function loadMyOrder() {
    try { return JSON.parse(localStorage.getItem(LS_KEY)) || null; } catch { return null; }
  }
  function applyOrder(list) {
    const my = loadMyOrder();
    if (!my) return list;
    const rank = (d) => { const i = my.indexOf(d.id); return i === -1 ? my.length : i; };
    return [...list].sort((a, b) => rank(a) - rank(b));
  }
  // 작업 리포트는 영업 자료가 아니므로 메인 목록에서 제외한다 (reports.html 탭에서 본다)
  const listDocs = data.docs.filter((d) => d.kind !== "report");
  let baseDocs = applyOrder(listDocs);

  // ── 카테고리 필터 (문서가 있는 카테고리만) ──
  const cats = [...new Set(listDocs.map((d) => d.category))];
  const mkBtn = (key, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.cat = key;
    b.onclick = () => { current = key; render(); };
    return b;
  };
  filtersEl.appendChild(mkBtn("all", "전체"));
  cats.forEach((c) => filtersEl.appendChild(mkBtn(c, data.categories[c] || c)));

  // ── 검색 · 정렬 ──
  $("searchInput").addEventListener("input", (e) => { query = e.target.value.trim(); render(); });
  $("searchInput").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.target.value = ""; query = ""; render(); }
  });
  $("sortSel").addEventListener("change", (e) => { sortMode = e.target.value; render(); });

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function norm(s) { return String(s || "").toLowerCase().replace(/\s+/g, ""); }

  // 검색 매칭: 제목·설명·카테고리는 문서 매치, 페이지 제목은 페이지 매치로 반환
  function match(d, q) {
    if (!q) return { hit: true, pages: [] };
    const nq = norm(q);
    const docHit = norm(d.title).includes(nq) || norm(d.description).includes(nq) ||
                   norm(d.categoryLabel).includes(nq) || norm("v" + d.version).includes(nq);
    const pages = [];
    (d.pageTitles || []).forEach((t, i) => {
      if (norm(t).includes(nq)) pages.push({ no: i + 1, title: t });
    });
    return { hit: docHit || pages.length > 0, pages };
  }

  function sortList(list) {
    if (sortMode === "updated") return [...list].sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
    if (sortMode === "name") return [...list].sort((a, b) => a.title.localeCompare(b.title, "ko"));
    return list; // default: baseDocs 순서
  }

  // ── 순서 편집 모드 ──
  $("orderBtn").onclick = () => setEdit(!editMode);
  $("orderDone").onclick = () => setEdit(false);
  $("orderReset").onclick = () => {
    localStorage.removeItem(LS_KEY);
    baseDocs = [...listDocs];
    render();
  };
  $("orderExport").onclick = async () => {
    const json = JSON.stringify({
      "_설명": "포털 기본 정렬. 여기 나열된 순서대로 표시되고, 없는 문서는 뒤에 최신순으로 붙는다.",
      docs: baseDocs.map((d) => d.id),
    }, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      alert("현재 순서를 복사했습니다.\n저장소의 docs/order.json에 붙여넣어 반영하면 모두에게 기본 순서가 됩니다.");
    } catch {
      prompt("복사해서 docs/order.json에 붙여넣으세요:", json);
    }
  };
  function setEdit(on) {
    editMode = on;
    $("orderbar").hidden = !on;
    $("orderBtn").classList.toggle("on", on);
    if (on) { // 편집은 기본 순서 기준에서만 의미가 있다
      $("sortSel").value = sortMode = "default";
      $("searchInput").value = query = "";
    }
    render();
  }
  function saveMyOrder() {
    localStorage.setItem(LS_KEY, JSON.stringify(baseDocs.map((d) => d.id)));
  }

  let dragId = null;
  function bindDrag(card, d) {
    card.draggable = true;
    card.addEventListener("dragstart", (e) => {
      dragId = d.id;
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    card.addEventListener("dragend", () => { card.classList.remove("dragging"); dragId = null; });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (!dragId || dragId === d.id) return;
      const from = baseDocs.findIndex((x) => x.id === dragId);
      const to = baseDocs.findIndex((x) => x.id === d.id);
      if (from === -1 || to === -1) return;
      const [moved] = baseDocs.splice(from, 1);
      baseDocs.splice(to, 0, moved);
      saveMyOrder();
      render();
    });
  }

  function render() {
    filtersEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.cat === current));
    const results = [];
    for (const d of sortList(baseDocs)) {
      if (current !== "all" && d.category !== current) continue;
      const m = match(d, query);
      if (!m.hit) continue;
      results.push({ d, pages: m.pages });
    }
    $("count").textContent = query
      ? `"${query}" 검색 결과 ${results.length}개`
      : `문서 ${results.length}개`;
    grid.innerHTML = results.length
      ? ""
      : `<div class="empty">${query ? "검색 결과가 없습니다." : "이 카테고리에는 아직 문서가 없습니다."}</div>`;

    for (const { d, pages } of results) {
      const card = document.createElement("article");
      card.className = "card" + (editMode ? " edit" : "");
      const pageChips = pages.slice(0, 3).map((p) =>
        `<button class="pgchip" data-p="${p.no}" title="해당 페이지로 이동">p.${p.no} ${esc(p.title)}</button>`).join("");
      card.innerHTML = `
        ${editMode ? '<div class="grip">⠿ 끌어서 이동</div>' : ""}
        <div class="cat">${esc(d.categoryLabel)}</div>
        <h3>${esc(d.title)}</h3>
        <p class="desc">${esc(d.description || "")}</p>
        ${pageChips ? `<div class="pgchips">${pageChips}</div>` : ""}
        <div class="meta">
          <span class="chip">v${esc(d.version)}</span>
          <span>${d.pages}페이지</span>
          <span>·</span>
          <span>${esc(d.updated || "")} 업데이트</span>
        </div>
        <div class="actions">
          <button class="btn primary" data-open>문서 보기</button>
          <button class="btn ghost" data-html>HTML</button>
          <button class="btn ghost" data-pptx>PPT</button>
          <button class="btn ghost" data-pdf>PDF</button>
        </div>`;
      const open = (p) => (location.href = `viewer.html?doc=${encodeURIComponent(d.id)}${p ? `&p=${p}` : ""}`);
      if (!editMode) card.onclick = () => open();
      card.querySelector("[data-open]").onclick = (e) => { e.stopPropagation(); open(); };
      card.querySelectorAll(".pgchip").forEach((b) => {
        b.onclick = (e) => { e.stopPropagation(); open(parseInt(b.dataset.p, 10)); };
      });
      card.querySelector("[data-pptx]").onclick = async (e) => {
        e.stopPropagation();
        const head = await fetch(d.pptx, { method: "HEAD" }).catch(() => null);
        if (head && head.ok) {
          const a = document.createElement("a");
          a.href = d.pptx;
          a.download = `${d.title} v${d.version}.pptx`;
          a.click();
        } else {
          alert("PPT 파일이 아직 준비되지 않았습니다.");
        }
      };
      card.querySelector("[data-html]").onclick = async (e) => {
        e.stopPropagation();
        const res = await fetch(d.html).catch(() => null);
        if (!res || !res.ok) { alert("HTML 파일을 찾을 수 없습니다."); return; }
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement("a");
        a.href = url;
        a.download = `${d.title} v${d.version}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
      card.querySelector("[data-pdf]").onclick = async (e) => {
        e.stopPropagation();
        // CI에서 생성된 PDF가 있으면 다운로드, 없으면(로컬) 뷰어에서 인쇄 안내
        const head = await fetch(d.pdf, { method: "HEAD" }).catch(() => null);
        if (head && head.ok) {
          const a = document.createElement("a");
          a.href = d.pdf;
          a.download = `${d.title} v${d.version}.pdf`;
          a.click();
        } else if (confirm("아직 PDF가 준비되지 않았습니다.\n뷰어에서 인쇄(PDF 저장)로 여시겠습니까?")) {
          location.href = `viewer.html?doc=${encodeURIComponent(d.id)}&print=1`;
        }
      };
      if (editMode) bindDrag(card, d);
      grid.appendChild(card);
    }
  }

  render();
  document.getElementById("footer").textContent =
    `문서 ${listDocs.length}개 · 마지막 빌드 ${new Date(data.generated).toLocaleString("ko-KR")}`;
})();
