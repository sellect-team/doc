// 메인 목록 페이지
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

  const grid = document.getElementById("grid");
  const filtersEl = document.getElementById("filters");
  let current = "all";

  // 카테고리 필터 (문서가 있는 카테고리만)
  const cats = [...new Set(data.docs.map((d) => d.category))];
  const mkBtn = (key, label) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.dataset.cat = key;
    b.onclick = () => { current = key; render(); };
    return b;
  };
  filtersEl.appendChild(mkBtn("all", "전체"));
  cats.forEach((c) => filtersEl.appendChild(mkBtn(c, data.categories[c] || c)));

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  async function render() {
    filtersEl.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.cat === current));
    const list = data.docs.filter((d) => current === "all" || d.category === current);
    grid.innerHTML = list.length
      ? ""
      : '<div class="empty">이 카테고리에는 아직 문서가 없습니다.</div>';

    for (const d of list) {
      const card = document.createElement("article");
      card.className = "card";
      card.innerHTML = `
        <div class="cat">${esc(d.categoryLabel)}</div>
        <h3>${esc(d.title)}</h3>
        <p class="desc">${esc(d.description || "")}</p>
        <div class="meta">
          <span class="chip">v${esc(d.version)}</span>
          <span>${d.pages}페이지</span>
          <span>·</span>
          <span>${esc(d.updated || "")} 업데이트</span>
        </div>
        <div class="actions">
          <button class="btn primary" data-open>문서 보기</button>
          <button class="btn ghost" data-html>HTML</button>
          <button class="btn ghost" data-pdf>PDF</button>
        </div>`;
      const open = () => (location.href = `viewer.html?doc=${encodeURIComponent(d.id)}`);
      card.onclick = open;
      card.querySelector("[data-open]").onclick = (e) => { e.stopPropagation(); open(); };
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
        } else {
          location.href = `viewer.html?doc=${encodeURIComponent(d.id)}&print=1`;
        }
      };
      grid.appendChild(card);
    }
  }

  render();
  document.getElementById("footer").textContent =
    `문서 ${data.docs.length}개 · 마지막 빌드 ${new Date(data.generated).toLocaleString("ko-KR")}`;
})();
