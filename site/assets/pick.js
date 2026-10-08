// 페이지 선택 내려받기
// - PPT·HTML·PDF 버튼을 누르면 페이지 목록(번호·부제·미리보기)이 뜨고, 체크한 페이지만 받는다.
// - 기본은 전체 선택. 전체를 받을 때는 CI가 만든 원본 파일을 그대로 받는다(가장 정확).
// - 일부만 고르면 브라우저에서 바로 만든다:
//     HTML  : 단일 파일에서 안 고른 <section>과 쓰지 않는 내장 이미지를 뺀다
//     PDF   : pdf-lib로 고른 페이지만 복사한다 (글자·폰트 그대로)
//     PPTX  : JSZip으로 안 고른 슬라이드 파트와 노트, 관계, 콘텐츠 타입을 지운다
// - 미리보기 이미지는 scripts/thumbs.mjs가 만든 thumbs/<문서ID>/pNN.jpg 를 쓴다.
//   아직 없으면 자리만 보여준다.
// viewer.js와 app.js가 window.DocPick.open(doc, fmt)로 부른다.
(function () {
  const LIB = {
    jszip: "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js",
    pdflib: "https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js",
  };
  const LABEL = { pdf: "PDF", pptx: "PPT", html: "HTML" };
  const EXT = { pdf: "pdf", pptx: "pptx", html: "html" };

  const loaded = {};
  function loadLib(key) {
    if (loaded[key]) return loaded[key];
    loaded[key] = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = LIB[key];
      s.onload = ok;
      s.onerror = () => { delete loaded[key]; fail(new Error("라이브러리를 불러오지 못했습니다: " + key)); };
      document.head.appendChild(s);
    });
    return loaded[key];
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function save(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  function saveUrl(href, name) {
    const a = document.createElement("a");
    a.href = href; a.download = name; a.click();
  }

  // ── 부분 파일 생성 ──────────────────────────────────────────────
  async function partialHtml(doc, keep) {
    const html = await fetch(doc.html).then((r) => { if (!r.ok) throw new Error("HTML 없음"); return r.text(); });
    const dom = new DOMParser().parseFromString(html, "text/html");
    const slides = dom.querySelectorAll("section.slide");
    slides.forEach((s, i) => { if (!keep.has(i)) s.remove(); });
    // 남은 슬라이드가 쓰는 내장 이미지만 남긴다
    const used = new Set();
    dom.querySelectorAll("img[data-i]").forEach((im) => used.add(im.getAttribute("data-i")));
    let out = "<!DOCTYPE html>\n" + dom.documentElement.outerHTML;
    out = out.replace(/<script>window\.__I=(\{[\s\S]*?\});<\/script>/, (m, json) => {
      try {
        const dict = JSON.parse(json);
        const slim = {};
        for (const k of Object.keys(dict)) if (used.has(k)) slim[k] = dict[k];
        return `<script>window.__I=${JSON.stringify(slim)};</script>`;
      } catch { return m; }
    });
    return new Blob([out], { type: "text/html;charset=utf-8" });
  }

  async function partialPdf(doc, keep) {
    await loadLib("pdflib");
    const bytes = await fetch(doc.pdf).then((r) => { if (!r.ok) throw new Error("PDF 없음"); return r.arrayBuffer(); });
    const { PDFDocument } = window.PDFLib;
    const src = await PDFDocument.load(bytes);
    const out = await PDFDocument.create();
    const idx = [...keep].sort((a, b) => a - b).filter((i) => i < src.getPageCount());
    const pages = await out.copyPages(src, idx);
    pages.forEach((p) => out.addPage(p));
    out.setTitle(`${doc.title} v${doc.version}`);
    return new Blob([await out.save()], { type: "application/pdf" });
  }

  async function partialPptx(doc, keep) {
    await loadLib("jszip");
    const buf = await fetch(doc.pptx).then((r) => { if (!r.ok) throw new Error("PPT 없음"); return r.arrayBuffer(); });
    const zip = await window.JSZip.loadAsync(buf);
    const text = (p) => zip.file(p).async("string");

    let pres = await text("ppt/presentation.xml");
    let presRels = await text("ppt/_rels/presentation.xml.rels");
    let types = await text("[Content_Types].xml");

    const relTarget = {};
    presRels.replace(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g, (m, id, t) => { relTarget[id] = t; return m; });
    const sldIds = [];
    pres.replace(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/>/g, (m, rid) => { sldIds.push({ tag: m, rid }); return m; });

    const dropParts = [];
    for (let i = 0; i < sldIds.length; i++) {
      if (keep.has(i)) continue;
      const { tag, rid } = sldIds[i];
      const target = relTarget[rid];               // slides/slideN.xml
      if (!target) continue;
      pres = pres.replace(tag, "");
      presRels = presRels.replace(new RegExp(`<Relationship\\b[^>]*\\bId="${rid}"[^>]*/>`), "");
      const slidePath = "ppt/" + target;
      const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, "slides/_rels/$1.rels");
      dropParts.push(slidePath, relsPath);
      const rels = zip.file(relsPath) ? await text(relsPath) : "";
      const m = rels.match(/Type="[^"]*\/notesSlide"[^>]*Target="([^"]+)"/) || rels.match(/Target="([^"]+)"[^>]*Type="[^"]*\/notesSlide"/);
      if (m) {
        const notes = "ppt/" + m[1].replace(/^\.\.\//, "");
        dropParts.push(notes, notes.replace(/notesSlides\/(notesSlide\d+\.xml)$/, "notesSlides/_rels/$1.rels"));
      }
    }
    for (const p of dropParts) {
      if (!zip.file(p)) continue;
      zip.remove(p);
      types = types.replace(new RegExp(`<Override\\b[^>]*PartName="/${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*/>`), "");
    }
    // 지운 슬라이드만 쓰던 그림·동영상은 함께 뺀다 (남은 파트의 관계 파일에서 참조하는 미디어만 남긴다)
    const usedMedia = new Set();
    for (const name of Object.keys(zip.files)) {
      if (!name.endsWith(".rels") || !zip.file(name)) continue;
      const rels = await text(name);
      rels.replace(/Target="(?:\.\.\/)*media\/([^"]+)"/g, (m, f) => { usedMedia.add(f); return m; });
    }
    for (const name of Object.keys(zip.files)) {
      const m = name.match(/^ppt\/media\/([^/]+)$/);
      if (m && !usedMedia.has(m[1])) zip.remove(name);
    }
    zip.file("ppt/presentation.xml", pres);
    zip.file("ppt/_rels/presentation.xml.rels", presRels);
    zip.file("[Content_Types].xml", types);
    // 문서 속성의 슬라이드 수는 참고 값이라 맞춰만 둔다
    if (zip.file("docProps/app.xml")) {
      const app = await text("docProps/app.xml");
      zip.file("docProps/app.xml", app.replace(/<Slides>\d+<\/Slides>/, `<Slides>${keep.size}</Slides>`));
    }
    return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", compression: "DEFLATE" });
  }

  // ── 모달 ──────────────────────────────────────────────────────
  let root = null;
  function ensureRoot() {
    if (root) return root;
    root = document.createElement("div");
    root.className = "pick-overlay";
    root.innerHTML = `
      <div class="pick" role="dialog" aria-modal="true" aria-labelledby="pickTitle">
        <div class="pick-head">
          <div>
            <div class="pick-kicker" id="pickKicker"></div>
            <div class="pick-title" id="pickTitle"></div>
          </div>
          <button class="pick-x" id="pickClose" title="닫기 (Esc)">×</button>
        </div>
        <div class="pick-body">
          <div class="pick-list" id="pickList" tabindex="0"></div>
          <div class="pick-prev">
            <div class="pick-shot" id="pickShot">
              <img id="pickImg" alt="">
              <div class="pick-shot-empty" id="pickEmpty">미리보기 준비 중</div>
              <button class="pick-nav prev" id="pickPrev" title="이전 (←)">‹</button>
              <button class="pick-nav next" id="pickNext" title="다음 (→)">›</button>
            </div>
            <div class="pick-cap">
              <label class="pick-cur"><input type="checkbox" id="pickCurChk"><span id="pickCurTxt"></span></label>
              <span class="pick-cnt" id="pickPos"></span>
            </div>
          </div>
        </div>
        <div class="pick-foot">
          <div class="pick-bulk">
            <button id="pickAll">전체 선택</button>
            <button id="pickNone">전체 해제</button>
          </div>
          <div class="pick-sum" id="pickSum"></div>
          <div class="pick-act">
            <button class="pick-cancel" id="pickCancel">취소</button>
            <button class="pick-go" id="pickGo">내려받기</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(root);
    return root;
  }

  function open(doc, fmt, opts) {
    opts = opts || {};
    const n = doc.pages || (doc.pageTitles || []).length;
    if (!n) { fallback(doc, fmt); return; }
    const el = ensureRoot();
    const $ = (id) => el.querySelector("#" + id);
    const sel = new Set(Array.from({ length: n }, (_, i) => i));
    let cur = Math.max(0, Math.min(n - 1, opts.page || 0));
    let busy = false;
    const thumb = (i) => `thumbs/${doc.id}/p${String(i + 1).padStart(2, "0")}.jpg?v=${encodeURIComponent(doc.version)}`;

    $("pickKicker").textContent = `${LABEL[fmt]} 내려받기 · 페이지 선택`;
    $("pickTitle").textContent = `${doc.title} v${doc.version}`;
    $("pickGo").textContent = `${LABEL[fmt]} 내려받기`;

    const list = $("pickList");
    list.innerHTML = "";
    const rows = [];
    for (let i = 0; i < n; i++) {
      const row = document.createElement("label");
      row.className = "pick-row";
      row.innerHTML = `<input type="checkbox" checked><span class="no">${i + 1}</span><span class="t">${esc((doc.pageTitles || [])[i] || `페이지 ${i + 1}`)}</span>`;
      // 행 어디를 눌러도(부제목 포함) 체크가 바뀌고 그 페이지가 미리보기에 뜬다 - label이 체크박스를 토글한다
      const chk = row.querySelector("input");
      chk.onchange = () => { chk.checked ? sel.add(i) : sel.delete(i); setCur(i); };
      rows.push(row);
      list.appendChild(row);
    }

    function setCur(i) {
      cur = Math.max(0, Math.min(n - 1, i));
      const img = $("pickImg");
      $("pickEmpty").style.display = "none";
      img.style.visibility = "hidden";
      img.onload = () => { img.style.visibility = "visible"; };
      img.onerror = () => { img.style.visibility = "hidden"; $("pickEmpty").style.display = "flex"; };
      img.src = thumb(cur);
      $("pickCurTxt").textContent = `${cur + 1}. ${(doc.pageTitles || [])[cur] || ""}`;
      $("pickPos").textContent = `${cur + 1} / ${n}`;
      $("pickPrev").disabled = cur === 0;
      $("pickNext").disabled = cur >= n - 1;
      rows.forEach((r, j) => r.classList.toggle("cur", j === cur));
      rows[cur].scrollIntoView({ block: "nearest" });
      paint();
    }
    function paint() {
      rows.forEach((r, j) => { r.querySelector("input").checked = sel.has(j); r.classList.toggle("off", !sel.has(j)); });
      $("pickCurChk").checked = sel.has(cur);
      const all = sel.size === n;
      $("pickSum").innerHTML = all
        ? `<b>전체 ${n}페이지</b> 선택 - 원본 파일을 그대로 받습니다`
        : `<b>${sel.size}</b> / ${n} 페이지 선택`;
      $("pickGo").disabled = sel.size === 0 || busy;
    }
    function toggleCur() { sel.has(cur) ? sel.delete(cur) : sel.add(cur); paint(); }

    $("pickCurChk").onchange = toggleCur;
    $("pickPrev").onclick = () => setCur(cur - 1);
    $("pickNext").onclick = () => setCur(cur + 1);
    $("pickAll").onclick = () => { for (let i = 0; i < n; i++) sel.add(i); paint(); };
    $("pickNone").onclick = () => { sel.clear(); paint(); };
    $("pickClose").onclick = $("pickCancel").onclick = close;
    el.onclick = (e) => { if (e.target === el) close(); };

    function onKey(e) {
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); setCur(cur + 1); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); setCur(cur - 1); }
      else if (e.key === " ") { e.preventDefault(); toggleCur(); }
      else if (e.key === "Enter" && !busy) { e.preventDefault(); go(); }
    }
    document.addEventListener("keydown", onKey, true);
    function close() {
      document.removeEventListener("keydown", onKey, true);
      el.classList.remove("show");
    }

    async function go() {
      if (sel.size === 0 || busy) return;
      const base = `${doc.title} v${doc.version}`;
      if (sel.size === n) { fallback(doc, fmt, base); close(); return; }
      busy = true;
      const btn = $("pickGo");
      const label = btn.textContent;
      btn.textContent = "만드는 중…";
      paint();
      try {
        const blob = fmt === "html" ? await partialHtml(doc, sel)
                   : fmt === "pdf" ? await partialPdf(doc, sel)
                   : await partialPptx(doc, sel);
        save(blob, `${base} (${sel.size}p 선택).${EXT[fmt]}`);
        close();
      } catch (err) {
        console.error(err);
        alert(`선택 페이지로 만들지 못했습니다.\n${err.message}\n\n전체 파일로 받으시겠습니까?`) ;
        if (confirm("전체 파일을 받습니다.")) fallback(doc, fmt, base);
      } finally {
        busy = false;
        btn.textContent = label;
        paint();
      }
    }
    $("pickGo").onclick = go;

    el.classList.add("show");
    setCur(cur);
    list.focus();
  }

  // 전체 파일: 기존 동작 그대로 (CI 생성본 없으면 안내)
  async function fallback(doc, fmt, base) {
    base = base || `${doc.title} v${doc.version}`;
    const src = fmt === "html" ? doc.html : fmt === "pdf" ? doc.pdf : doc.pptx;
    if (fmt === "html") {
      const res = await fetch(src).catch(() => null);
      if (!res || !res.ok) { alert("HTML 파일을 찾을 수 없습니다. 빌드를 다시 실행하세요."); return; }
      save(await res.blob(), `${base}.html`);
      return;
    }
    const head = await fetch(src, { method: "HEAD" }).catch(() => null);
    if (!head || !head.ok) {
      if (fmt === "pdf" && typeof window.__printFallback === "function") { window.__printFallback(); return; }
      alert(`${LABEL[fmt]} 파일이 아직 준비되지 않았습니다.`);
      return;
    }
    saveUrl(src, `${base}.${EXT[fmt]}`);
  }

  window.DocPick = { open, fallback };
})();
