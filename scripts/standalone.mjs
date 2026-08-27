// 단일 파일로 배포 가능한 HTML 생성
// - 로컬 이미지를 파일 안에 심어 넣는다 (같은 이미지는 한 번만 저장)
// - 페이지 넘김(키보드·버튼·휠)과 하단 컨트롤을 주입한다
// build.mjs가 호출한다.
import fs from "node:fs";
import path from "node:path";

const MIME = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
};

// 문서 안에서 슬라이드를 넘기게 해주는 주입 스크립트 (뷰어가 하던 일을 파일 자체가 한다)
const NAV = `
<style>
  .__nav { position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%);
           display: flex; align-items: center; gap: 4px; z-index: 99999;
           background: rgba(255,255,255,0.92); border: 1px solid rgba(15,23,42,0.10);
           border-radius: 999px; padding: 5px 6px; box-shadow: 0 6px 22px rgba(15,23,42,0.16);
           font-family: "Pretendard", -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
           opacity: 0.25; transition: opacity 0.25s; }
  .__nav:hover, .__nav.__on { opacity: 1; }
  .__nav button { width: 30px; height: 30px; border: 0; border-radius: 50%; cursor: pointer;
                  background: transparent; color: #334155; font-size: 15px; line-height: 1; }
  .__nav button:hover { background: #F1F5F9; }
  .__nav button:disabled { opacity: 0.28; cursor: default; background: transparent; }
  .__nav .__c { font-size: 12.5px; color: #475569; min-width: 54px; text-align: center;
                font-variant-numeric: tabular-nums; }
  @media print { .__nav { display: none !important; }
    section.slide { display: block !important; page-break-after: always; } }
</style>
<div class="__nav" id="__nav">
  <button id="__p" title="이전 (←)">‹</button>
  <span class="__c" id="__c"></span>
  <button id="__n" title="다음 (→)">›</button>
</div>
<script>
(function () {
  var imgs = document.querySelectorAll("img[data-i]");
  for (var i = 0; i < imgs.length; i++) imgs[i].src = window.__I[imgs[i].getAttribute("data-i")];

  var slides = [].slice.call(document.querySelectorAll("section.slide"));
  var nav = document.getElementById("__nav");
  var counter = document.getElementById("__c");
  var prev = document.getElementById("__p");
  var next = document.getElementById("__n");
  var cur = 0, hideTimer;

  function flash() {
    nav.classList.add("__on");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { nav.classList.remove("__on"); }, 1400);
  }
  function show(i) {
    cur = Math.max(0, Math.min(slides.length - 1, i));
    for (var j = 0; j < slides.length; j++) slides[j].style.display = j === cur ? "" : "none";
    counter.textContent = (cur + 1) + " / " + slides.length;
    prev.disabled = cur === 0;
    next.disabled = cur >= slides.length - 1;
    window.scrollTo(0, 0);
    flash();
  }
  prev.onclick = function () { show(cur - 1); };
  next.onclick = function () { show(cur + 1); };
  document.addEventListener("keydown", function (e) {
    if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") { e.preventDefault(); show(cur + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(cur - 1); }
    else if (e.key === "Home") { e.preventDefault(); show(0); }
    else if (e.key === "End") { e.preventDefault(); show(slides.length - 1); }
  });
  var lock = 0;
  window.addEventListener("wheel", function (e) {
    var t = Date.now();
    if (t - lock < 450 || Math.abs(e.deltaY) < 12) return;
    lock = t;
    show(cur + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  show(0);
})();
</script>
`;

export function buildStandalone(docs, SITE) {
  const outDir = path.join(SITE, "standalone");
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const report = [];
  for (const doc of docs) {
    const src = path.join(SITE, doc.file);
    if (!fs.existsSync(src)) continue;
    const baseDir = path.dirname(src);
    let html = fs.readFileSync(src, "utf8");

    // 로컬 이미지를 수집해 키로 치환한다 (동일 이미지는 한 번만 저장)
    const store = new Map();
    html = html.replace(/<img([^>]*?)\ssrc="([^"]+)"([^>]*?)>/gi, (m, a, ref, b) => {
      if (/^(https?:|data:)/i.test(ref)) return m;
      const file = path.join(baseDir, decodeURIComponent(ref));
      const mime = MIME[path.extname(file).toLowerCase()];
      if (!mime || !fs.existsSync(file)) return m;
      if (!store.has(file)) {
        store.set(file, {
          key: "i" + store.size,
          uri: `data:${mime};base64,${fs.readFileSync(file).toString("base64")}`,
        });
      }
      // loading=lazy는 data URI에서 의미가 없어 제거한다
      const attrs = (a + b).replace(/\sloading="lazy"/gi, "");
      return `<img${attrs} data-i="${store.get(file).key}">`;
    });

    const dict = {};
    for (const { key, uri } of store.values()) dict[key] = uri;
    const inject = `<script>window.__I=${JSON.stringify(dict)};</script>\n`;

    html = html.replace(/<\/body>/i, inject + NAV + "\n</body>");
    const out = path.join(outDir, `${doc.id}.html`);
    fs.writeFileSync(out, html);
    report.push({ id: doc.id, images: store.size, mb: fs.statSync(out).size / 1024 / 1024 });
  }
  return report;
}
