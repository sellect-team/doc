// 작업 리포트 목록 (메인 문서 목록과 분리된 탭)
(async function () {
  const [data, me] = await Promise.all([
    fetch("data/docs.json", { cache: "no-store" }).then((r) => r.json()),
    fetch("/.auth/me").then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ]);

  const principal = me?.clientPrincipal;
  if (principal) {
    document.getElementById("userName").textContent = principal.userDetails;
    document.getElementById("logoutBtn").hidden = false;
  }

  if (data.tenant?.siteTitle) document.title = `작업 리포트 - ${data.tenant.siteTitle}`;

  const grid = document.getElementById("grid");
  const reports = data.docs
    .filter((d) => d.kind === "report")
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || "")); // 최신 리포트가 위로

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  document.getElementById("count").textContent = `리포트 ${reports.length}개`;
  grid.innerHTML = reports.length ? "" : '<div class="empty">아직 작업 리포트가 없습니다.</div>';

  for (const d of reports) {
    const card = document.createElement("article");
    card.className = "card";
    // 리포트는 목차(페이지 제목)를 카드에 펼쳐 보여준다 - 어느 장에 무엇이 있는지 바로 보이게
    const toc = (d.pageTitles || []).map((t, i) =>
      `<button class="pgchip" data-p="${i + 1}">${i + 1}. ${esc(t)}</button>`).join("");
    card.innerHTML = `
      <div class="cat">${esc(d.categoryLabel)}</div>
      <h3>${esc(d.title)}</h3>
      <p class="desc">${esc(d.description || "")}</p>
      ${toc ? `<div class="pgchips">${toc}</div>` : ""}
      <div class="meta">
        <span class="chip">v${esc(d.version)}</span>
        <span>${d.pages}페이지</span>
        <span>·</span>
        <span>${esc(d.updated || "")} 작성</span>
      </div>
      <div class="actions">
        <button class="btn primary" data-open>리포트 열기</button>
        <button class="btn ghost" data-pptx>PPT</button>
        <button class="btn ghost" data-pdf>PDF</button>
      </div>`;
    const open = (p) => (location.href = `viewer.html?doc=${encodeURIComponent(d.id)}${p ? `&p=${p}` : ""}`);
    card.onclick = () => open();
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
        a.download = `${d.title}.pptx`;
        a.click();
      } else {
        alert("PPT 파일이 아직 준비되지 않았습니다.");
      }
    };
    card.querySelector("[data-pdf]").onclick = async (e) => {
      e.stopPropagation();
      const head = await fetch(d.pdf, { method: "HEAD" }).catch(() => null);
      if (head && head.ok) {
        const a = document.createElement("a");
        a.href = d.pdf;
        a.download = `${d.title}.pdf`;
        a.click();
      } else {
        location.href = `viewer.html?doc=${encodeURIComponent(d.id)}&print=1`;
      }
    };
    grid.appendChild(card);
  }

  document.getElementById("footer").textContent =
    `작업 리포트 ${reports.length}개 · 마지막 빌드 ${new Date(data.generated).toLocaleString("ko-KR")}`;
})();
