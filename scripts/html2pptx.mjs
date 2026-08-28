// 네이티브 HTML 슬라이드 → 진짜 PPTX (이미지가 아니라 도형·텍스트 상자로)
//
// 핵심 원리: PowerPoint에게 줄바꿈을 다시 계산시키지 않는다.
// 브라우저가 이미 배치를 끝냈으므로 Range API로 "화면에 그려진 줄"의 좌표를 그대로 읽어
// 줄 단위 텍스트 상자로 옮긴다. 그래서 폰트 대체가 일어나도 레이아웃이 무너지지 않는다.
//
// 도형: 배경·테두리가 있는 요소 -> 사각형/둥근 사각형/타원 (진짜 PPT 도형, 편집 가능)
// 아이콘: SVG는 도형화가 불가능하므로 배경 투명 PNG로 떠서 그림으로 심는다
//
// 사용법: node scripts/html2pptx.mjs <입력.html> <출력.pptx> ["문서 제목"]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import PptxGenJS from "pptxgenjs";

const SLIDE_W = 13.333; // in (16:9)
const SLIDE_H = 7.5;
const RENDER_W = 1600; // 브라우저에서 슬라이드를 렌더하는 가로 픽셀
// 슬라이드 폭 13.333in(=960pt)이 1600px에 대응하므로 실효 120dpi다.
// 96dpi 기준 0.75를 쓰면 글자가 1.25배 커진다.
const PX2PT = 72 / (RENDER_W / SLIDE_W);
// PowerPoint의 폰트 이름 해석은 브라우저와 다르다.
// 이 PC 기준 "SUIT"를 지정하면 Regular가 아니라 Bold 페이스가 잡혀(100pt에서 'n' 폭 53.20 -> 56.70)
// 본문이 굵어지고 라틴이 6.7% 넓어진다. 웨이트별 패밀리명을 직접 지정해야 한다.
// SUIT Regular와 가장 가까운 것은 SUIT Medium이다.
const FACE_MAP = {
  "SUIT": "SUIT Medium",              // Regular 의도 -> Medium (SUIT는 Bold로 잡힘)
  "SUIT ExtraBold": "SUIT ExtraBold", // 그대로 정확히 대응
};
const mapFace = (f) => FACE_MAP[f] || f || "SUIT Medium";
// 폰트 페이스를 바로잡은 뒤에는 추가 보정이 오히려 오차를 키운다(실측 스윕 결과 0이 최적).
// 필요하면 환경변수로 조절한다.
const LATIN_FIX = Number(process.env.PPTX_LATIN_FIX ?? 0);
const HANGUL_FIX = Number(process.env.PPTX_HANGUL_FIX ?? 0);

// ─────────────────────────────────────────────
// 브라우저 안에서 실행: 슬라이드별 도형·아이콘·줄 목록 추출
// ─────────────────────────────────────────────
function extract() {
  const round = (v) => Math.round(v * 10000) / 10000;

  const toHex = (c) => {
    if (!c) return null;
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a] = m[1].split(",").map((x) => parseFloat(x));
    if (a !== undefined && a < 0.06) return null;
    const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return { hex: (h(r) + h(g) + h(b)).toUpperCase(), alpha: a === undefined ? 1 : a };
  };

  // 선형 그라디언트만 대표색으로 근사한다.
  // radial-gradient(글로우)나 반복 배경(그리드 라인)은 도형으로 옮기면 오히려 지저분해져 건너뛴다.
  const gradientStops = (bg) => {
    if (/radial-gradient|repeating-/.test(bg)) return null;
    const cols = (bg.match(/rgba?\([^)]+\)/g) || []).map(toHex).filter(Boolean);
    if (cols.length < 2) return null;
    // 발표용은 단색이 낫다. 양 끝 색의 중간값을 쓴다.
    const mix = (a, b) => {
      const v = (h, i) => parseInt(h.slice(i, i + 2), 16);
      const c = (i) => Math.round((v(a, i) + v(b, i)) / 2).toString(16).padStart(2, "0");
      return (c(0) + c(2) + c(4)).toUpperCase();
    };
    return { to: mix(cols[0].hex, cols[cols.length - 1].hex) };
  };

  const out = [];

  document.querySelectorAll("section.slide").forEach((slide) => {
    const sr = slide.getBoundingClientRect();
    const shapes = [], images = [], lines = [];
    const rel = (r) => ({
      x: round((r.left - sr.left) / sr.width),
      y: round((r.top - sr.top) / sr.height),
      w: round(r.width / sr.width),
      h: round(r.height / sr.height),
    });
    const inside = (r) =>
      r.right > sr.left - 2 && r.left < sr.right + 2 && r.bottom > sr.top - 2 && r.top < sr.bottom + 2;

    const sst = getComputedStyle(slide);
    const sbg = toHex(sst.backgroundColor) || { hex: "FFFFFF", alpha: 1 };
    const dark = (parseInt(sbg.hex.slice(0, 2), 16) + parseInt(sbg.hex.slice(2, 4), 16) + parseInt(sbg.hex.slice(4, 6), 16)) / 3 < 128;

    // ── 1) 도형 · 아이콘 수집 (모든 요소를 훑는다) ──
    const collect = (el) => {
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || parseFloat(st.opacity) === 0) return;
      const r = el.getBoundingClientRect();
      if (r.width < 0.5 || r.height < 0.5 || !inside(r)) return;
      const tag = el.tagName.toLowerCase();

      if (tag === "img") {
        images.push({ kind: "img", src: el.currentSrc || el.src, ...rel(r) });
        return;
      }
      if (tag === "svg") {
        // 완벽히 옮겨지는 아이콘만 진짜 벡터 도형으로. 나머지는 투명 PNG로 남긴다.
        let vec = null;
        try { vec = window.__svg2vec ? window.__svg2vec(el) : null; } catch (e) { vec = { ok: false, reason: e.message }; }
        if (vec && vec.ok) {
          images.push({ kind: "vec", mark: el.dataset.pptxMark, ...rel(r), vb: vec.vb, shapes: vec.shapes });
        } else {
          images.push({ kind: "svg", mark: el.dataset.pptxMark, ...rel(r), why: (vec && vec.reason) || "알 수 없음" });
        }
        return; // SVG 내부는 안 들어간다
      }

      if (el !== slide) {
        const fill = toHex(st.backgroundColor);
        const grad = !fill && /gradient/.test(st.backgroundImage) ? gradientStops(st.backgroundImage) : null;
        // 테두리는 변이 다를 수 있어 각각 본다 (밑줄만 있는 헤더 등)
        const sides = ["Top", "Right", "Bottom", "Left"].map((s) => ({
          side: s,
          w: parseFloat(st[`border${s}Width`]) || 0,
          c: toHex(st[`border${s}Color`]),
          style: st[`border${s}Style`],
        })).filter((b) => b.w > 0 && b.c && b.style !== "none");
        const allSame = sides.length === 4 &&
          sides.every((b) => b.c.hex === sides[0].c.hex && Math.abs(b.w - sides[0].w) < 0.2);
        const rTL = parseFloat(st.borderTopLeftRadius) || 0;
        const rTR = parseFloat(st.borderTopRightRadius) || 0;
        const rBR = parseFloat(st.borderBottomRightRadius) || 0;
        const rBL = parseFloat(st.borderBottomLeftRadius) || 0;
        const radius = Math.max(rTL, rTR, rBR, rBL);
        const minSide = Math.min(r.width, r.height);
        const isEllipse = radius >= minSide / 2 - 0.5 && Math.abs(r.width - r.height) < 1.5;
        // 어느 모서리만 둥근지 판정한다 (상단만 둥근 액센트 바 등)
        const on = (v) => v > 1;
        let corner = "none";
        if (on(rTL) && on(rTR) && on(rBR) && on(rBL)) corner = "all";
        else if (on(rTL) && on(rTR)) corner = "top";
        else if (on(rBL) && on(rBR)) corner = "bottom";
        else if (on(rTL) || on(rTR) || on(rBR) || on(rBL)) corner = "all";

        // 발표용 PPT에서는 도형 그라디언트를 쓰지 않는다. 대표 단색으로 채운다.
        if (fill || grad || allSame) {
          shapes.push({
            kind: isEllipse ? "ellipse" : (radius > 1 ? "round" : "rect"),
            corner,
            ...rel(r),
            fill: fill ? fill.hex : null,
            fillAlpha: fill ? fill.alpha : 1,
            grad,
            line: allSame ? sides[0].c.hex : null,
            lineW: allSame ? sides[0].w : 0,
            radiusPx: radius,
          });
        }
        // 한쪽 변만 있는 테두리는 선으로 그린다 (구분선 · 강조선)
        if (!allSame) {
          for (const b of sides) {
            const seg = { Top: [r.left, r.top, r.right, r.top], Bottom: [r.left, r.bottom, r.right, r.bottom],
                          Left: [r.left, r.top, r.left, r.bottom], Right: [r.right, r.top, r.right, r.bottom] }[b.side];
            shapes.push({
              kind: "line", color: b.c.hex, lineW: b.w, dash: b.style === "dashed" ? "dash" : (b.style === "dotted" ? "sysDot" : null),
              x: round((seg[0] - sr.left) / sr.width), y: round((seg[1] - sr.top) / sr.height),
              w: round((seg[2] - seg[0]) / sr.width), h: round((seg[3] - seg[1]) / sr.height),
            });
          }
        }
      }
      [...el.children].forEach(collect);
    };
    collect(slide);

    // ── 2) 텍스트: 화면에 그려진 "줄" 단위로 추출 ──
    // 단어마다 Range로 실제 좌표를 재고 같은 줄끼리 묶는다.
    const style = (el) => {
      const cs = getComputedStyle(el);
      const fam = cs.fontFamily.split(",")[0].replace(/["']/g, "").trim();
      return {
        font: fam,
        bold: /ExtraBold|Bold|Heavy|Black/i.test(fam) || parseInt(cs.fontWeight, 10) >= 600,
        italic: cs.fontStyle === "italic",
        size: parseFloat(cs.fontSize),
        color: (toHex(cs.color) || { hex: dark ? "FFFFFF" : "0F172A" }).hex,
        spacing: parseFloat(cs.letterSpacing) || 0,
        lineH: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.4,
      };
    };

    const words = [];
    let blockSeq = 0;
    const blockIds = new WeakMap();
    // 텍스트가 속한 "문단 상자"를 찾는다. 이 상자가 다르면 절대 같은 줄로 묶지 않는다.
    const blockOf = (el) => {
      let n = el;
      while (n && n !== slide) {
        const d = getComputedStyle(n).display;
        if (/^(block|flex|grid|list-item|table-cell)$/.test(d)) break;
        n = n.parentElement;
      }
      n = n || slide;
      if (!blockIds.has(n)) blockIds.set(n, ++blockSeq);
      return blockIds.get(n);
    };
    const collectWords = (el) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return;
      for (const n of el.childNodes) {
        if (n.nodeType === 3) {
          const txt = n.textContent;
          const re = /\S+/g;
          let m;
          while ((m = re.exec(txt))) {
            const rg = document.createRange();
            rg.setStart(n, m.index);
            rg.setEnd(n, m.index + m[0].length);
            const rects = [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
            if (!rects.length || !inside(rects[0])) continue;
            const r = rects[0];
            const hb = el.getBoundingClientRect();
            const ecs = getComputedStyle(el);
            const hostRect = {
              left: hb.left + (parseFloat(ecs.paddingLeft) || 0),
              right: hb.right - (parseFloat(ecs.paddingRight) || 0),
              width: hb.width - (parseFloat(ecs.paddingLeft) || 0) - (parseFloat(ecs.paddingRight) || 0),
            };
            words.push({ text: m[0], left: r.left, right: r.right, top: r.top, bottom: r.bottom,
                         st: style(el), block: blockOf(el), hostRect });
          }
        } else if (n.nodeType === 1) {
          const tg = n.tagName.toLowerCase();
          if (tg === "svg" || tg === "img" || tg === "br") continue;
          collectWords(n);
        }
      }
    };
    collectWords(slide);

    // 같은 줄 묶기: 세로 중심이 서로의 높이 절반 안에 들어오면 한 줄
    words.sort((a, b) => (a.top - b.top) || (a.left - b.left));
    const rows = [];
    for (const w of words) {
      const mid = (w.top + w.bottom) / 2;
      // 일반 띄어쓰기는 0.3em 안팎이다. 그보다 크게 벌어져 있으면(flex gap 등)
      // 한 상자에 넣지 않고 각자의 좌표에 놓아야 원래 간격이 유지된다.
      const gap = w.st.size * 0.7;
      const row = rows.find((g) =>
        g.block === w.block &&
        Math.abs(mid - (g.top + g.bottom) / 2) < Math.min(w.bottom - w.top, g.bottom - g.top) * 0.6 &&
        w.left < g.right + gap && w.right > g.left - gap);
      if (row) {
        row.words.push(w);
        row.top = Math.min(row.top, w.top); row.bottom = Math.max(row.bottom, w.bottom);
        row.left = Math.min(row.left, w.left); row.right = Math.max(row.right, w.right);
      } else {
        rows.push({ words: [w], block: w.block, top: w.top, bottom: w.bottom, left: w.left, right: w.right });
      }
    }

    for (const row of rows) {
      row.words.sort((a, b) => a.left - b.left);
      // 서식이 같고 이어지는 단어는 하나의 조각으로 합친다
      const runs = [];
      let prevRight = null;
      for (const w of row.words) {
        // 앞 단어와 실제로 떨어져 있었는지(공백이 있었는지)를 좌표로 판단한다.
        // <b>붙은글자</b>처럼 공백 없이 이어진 경우 공백을 넣으면 안 된다.
        const spaced = prevRight !== null && (w.left - prevRight) > w.st.size * 0.12;
        const p = runs[runs.length - 1];
        const same = p && p.st.font === w.st.font && p.st.color === w.st.color &&
                     Math.abs(p.st.size - w.st.size) < 0.4 && p.st.bold === w.st.bold;
        if (same) { p.text += (spaced ? " " : "") + w.text; p.right = w.right; }
        else runs.push({ text: (spaced && runs.length ? " " : "") + w.text, st: w.st, left: w.left, right: w.right });
        prevRight = w.right;
      }
      const base = row.words[0].st;
      const lineH = Math.max(base.lineH, row.bottom - row.top);
      const cy = (row.top + row.bottom) / 2;
      // 이 줄이 담긴 상자 기준으로 왼쪽/가운데/오른쪽 중 어디에 붙어 있었는지 본다.
      // PPT 텍스트가 조금 더 넓어져도 원래 붙어 있던 쪽을 유지해야 화면 밖으로 나가지 않는다.
      let anchor = "left";
      const host = row.words[0].hostRect;
      if (host && host.width > 2) {
        const gl = row.left - host.left, gr = host.right - row.right;
        if (Math.abs(gl - gr) < Math.max(2, host.width * 0.02)) anchor = "center";
        else if (gr < gl - 2) anchor = "right";
      }
      lines.push({
        runs: runs.map((r) => ({ text: r.text, font: r.st.font, bold: r.st.bold, italic: r.st.italic,
                                 color: r.st.color, size: r.st.size, spacing: r.st.spacing,
                                 pxW: round(r.right - r.left) })),
        anchor,
        x: round((row.left - sr.left) / sr.width),
        y: round((cy - lineH / 2 - sr.top) / sr.height),
        w: round((row.right - row.left) / sr.width),
        h: round(lineH / sr.height),
        pxW: round(row.right - row.left),
      });
    }

    out.push({ title: slide.dataset.title || "", bg: sbg.hex, shapes, images, lines });
  });
  return out;
}

// ─────────────────────────────────────────────
const [input, output, docTitle] = process.argv.slice(2);
if (!input || !output) {
  console.error("사용법: node scripts/html2pptx.mjs <입력.html> <출력.pptx> [문서 제목]");
  process.exit(1);
}

const abs = path.resolve(input);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: RENDER_W, height: Math.round(RENDER_W * 9 / 16) }, deviceScaleFactor: 2 });
await page.goto("file:///" + abs.replace(/\\/g, "/"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
await page.addScriptTag({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), "svg-vector.js") });
await page.evaluate(() => {
  document.querySelectorAll("section.slide svg").forEach((s, i) => { s.dataset.pptxMark = "svg" + i; });
});

const slides = await page.evaluate(extract);

// SVG 아이콘 → 배경 투명 PNG (선 아이콘은 도형으로 못 옮긴다)
const tmpDir = fs.mkdtempSync(path.join(process.env.TEMP || "/tmp", "pptx-assets-"));
const icons = new Map();
for (const s of slides) {
  for (const it of s.images) {
    if (it.kind !== "svg" || !it.mark || icons.has(it.mark)) continue;
    const file = path.join(tmpDir, `${it.mark}.png`);
    try {
      await page.locator(`[data-pptx-mark="${it.mark}"]`).screenshot({ path: file, omitBackground: true, scale: "device" });
      icons.set(it.mark, "data:image/png;base64," + fs.readFileSync(file).toString("base64"));
    } catch { /* 화면 밖 아이콘 */ }
  }
}
const imgs = new Map();
for (const s of slides) {
  for (const it of s.images) {
    if (it.kind !== "img" || !it.src || imgs.has(it.src)) continue;
    try {
      if (it.src.startsWith("data:")) { imgs.set(it.src, it.src); continue; }
      const p = decodeURIComponent(new URL(it.src).pathname.replace(/^\//, ""));
      const buf = fs.readFileSync(p);
      const ext = path.extname(p).slice(1).toLowerCase();
      imgs.set(it.src, `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${buf.toString("base64")}`);
    } catch { /* 못 읽으면 건너뜀 */ }
  }
}
await browser.close();

// ─────────────────────────────────────────────
// PPTX 조립: 도형 → 그림 → 텍스트 (뒤에서 앞 순서)
// ─────────────────────────────────────────────
const pptx = new PptxGenJS();
pptx.defineLayout({ name: "SS16x9", width: SLIDE_W, height: SLIDE_H });
pptx.layout = "SS16x9";
pptx.company = "SAILINGSTONE";
if (docTitle) pptx.title = docTitle;

let nShape = 0, nText = 0, nImg = 0, nVec = 0;

// CSS 색 문자열 -> 6자리 hex
function hex(c) {
  const m = String(c).match(/rgba?\(([^)]+)\)/);
  if (!m) return String(c).replace("#", "").slice(0, 6).toUpperCase() || "000000";
  const [r, g, b] = m[1].split(",").map((v) => parseFloat(v));
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return (h(r) + h(g) + h(b)).toUpperCase();
}

for (const s of slides) {
  const slide = pptx.addSlide();
  slide.background = { color: s.bg };
  const X = (v) => v * SLIDE_W, Y = (v) => v * SLIDE_H;

  for (const sh of s.shapes) {
    const x = X(sh.x), y = Y(sh.y), w = X(sh.w), h = Y(sh.h);
    if (sh.kind === "line") {
      slide.addShape(pptx.ShapeType.line, {
        x, y, w: Math.max(w, 0.001), h: Math.max(h, 0.001),
        line: { color: sh.color, width: Math.max(0.5, sh.lineW * PX2PT), dashType: sh.dash || "solid" },
      });
      nShape++;
      continue;
    }
    if (w <= 0 || h <= 0) continue;
    const opts = { x, y, w, h };
    if (sh.grad) {
      // pptxgenjs는 그라디언트 채우기를 직접 지원하지 않아 중간색으로 근사한다
      opts.fill = { color: sh.grad.to };
    } else if (sh.fill) {
      opts.fill = { color: sh.fill, transparency: Math.round((1 - sh.fillAlpha) * 100) };
    } else {
      opts.fill = { type: "none" };
    }
    opts.line = sh.line ? { color: sh.line, width: Math.max(0.5, sh.lineW * PX2PT) } : { type: "none" };
    let type = pptx.ShapeType.rect;
    if (sh.kind === "ellipse") {
      type = pptx.ShapeType.ellipse;
    } else if (sh.kind === "round") {
      // 상단/하단만 둥근 경우 해당 도형을 써야 라운드가 매끄럽게 이어진다.
      // 단 round2SameRect에 rectRadius를 주면 PowerPoint가 열지 못하는 파일이 되므로 기본 반경을 쓴다.
      if (sh.corner === "top" || sh.corner === "bottom") {
        type = "round2SameRect";
        if (sh.corner === "bottom") opts.rotate = 180;
      } else {
        type = pptx.ShapeType.roundRect;
        // rectRadius는 인치 단위. 짧은 변의 절반을 넘기면 안 된다
        opts.rectRadius = Math.min(Math.min(w, h) / 2, (sh.radiusPx / RENDER_W) * SLIDE_W);
      }
    }
    slide.addShape(type, opts);
    nShape++;
  }

  for (const it of s.images) {
    // 벡터로 옮길 수 있었던 아이콘: 진짜 PPT 도형으로 그린다 (편집·확대 가능)
    if (it.kind === "vec") {
      const [vx, vy, vw, vh] = it.vb;
      const bx = X(it.x), by = Y(it.y), bw = X(it.w), bh = Y(it.h);
      const kx = bw / vw, ky = bh / vh;                 // viewBox -> 인치
      const px = (u) => bx + (u - vx) * kx;
      const py = (u) => by + (u - vy) * ky;
      const kAvg = (kx + ky) / 2;
      const lineOf = (st) => st.stroke
        ? { color: hex(st.stroke), width: Math.max(0.25, st.strokeW * kAvg * 72),
            dashType: st.dash ? "dash" : "solid" }
        : { type: "none" };
      const fillOf = (st) => st.fill ? { color: hex(st.fill) } : { type: "none" };

      for (const sh of it.shapes) {
        if (sh.kind === "ellipse") {
          slide.addShape(pptx.ShapeType.ellipse, {
            x: px(sh.cx - sh.rx), y: py(sh.cy - sh.ry),
            w: sh.rx * 2 * kx, h: sh.ry * 2 * ky,
            fill: fillOf(sh.style), line: lineOf(sh.style),
          });
        } else if (sh.kind === "rect") {
          const o = { x: px(sh.x), y: py(sh.y), w: sh.w * kx, h: sh.h * ky,
                      fill: fillOf(sh.style), line: lineOf(sh.style) };
          if (sh.rx > 0.01) { o.rectRadius = Math.min(Math.min(o.w, o.h) / 2, sh.rx * kAvg); }
          slide.addShape(sh.rx > 0.01 ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, o);
        } else if (sh.kind === "path") {
          // custGeom: 좌표는 도형 원점 기준이라 상자를 경로의 경계로 잡는다
          let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
          const see = (pt) => { x0 = Math.min(x0, pt[0]); y0 = Math.min(y0, pt[1]);
                                x1 = Math.max(x1, pt[0]); y1 = Math.max(y1, pt[1]); };
          for (const sub of sh.subs) {
            see(sub.start);
            for (const g of sub.segs) { if (g.c1) { see(g.c1); see(g.c2); } see(g.to); }
          }
          const ox = px(x0), oy = py(y0);
          const ow = Math.max((x1 - x0) * kx, 0.004), oh = Math.max((y1 - y0) * ky, 0.004);
          const rx = (u) => (u - x0) * kx;
          const ry = (u) => (u - y0) * ky;
          const points = [];
          for (const sub of sh.subs) {
            points.push({ x: rx(sub.start[0]), y: ry(sub.start[1]), moveTo: true });
            for (const g of sub.segs) {
              if (g.type === "L") points.push({ x: rx(g.to[0]), y: ry(g.to[1]) });
              else points.push({ x: rx(g.to[0]), y: ry(g.to[1]),
                                 curve: { type: "cubic", x1: rx(g.c1[0]), y1: ry(g.c1[1]),
                                          x2: rx(g.c2[0]), y2: ry(g.c2[1]) } });
            }
            if (sub.closed) points.push({ close: true });
          }
          slide.addShape(pptx.ShapeType.custGeom, {
            x: ox, y: oy, w: ow, h: oh, points,
            fill: fillOf(sh.style), line: lineOf(sh.style),
          });
        }
        nVec++;
      }
      continue;
    }
    const data = it.kind === "svg" ? icons.get(it.mark) : imgs.get(it.src);
    if (!data) continue;
    slide.addImage({ data, x: X(it.x), y: Y(it.y), w: X(it.w), h: Y(it.h) });
    nImg++;
  }

  for (const ln of s.lines) {
    // PowerPoint는 같은 폰트라도 라틴 문자를 브라우저보다 약 5.5% 넓게 그린다(한글은 약 1%).
    // 그대로 두면 영문 라벨이 상자 밖으로 밀리므로 자간을 음수로 보정해 폭을 맞춘다.
    const runs = ln.runs.map((r) => {
      const chars = [...r.text];
      const latin = chars.filter((c) => /[ -ɏ -⁯]/.test(c)).length;
      const frac = chars.length ? latin / chars.length : 0;
      // 크기 환산을 바로잡은 뒤 남는 폭 오차만 보정한다 (라틴이 약간 넓게 그려진다)
      const fixPx = -(LATIN_FIX * frac + HANGUL_FIX * (1 - frac)) * r.size;
      const spacingPt = ((r.spacing || 0) + fixPx) * PX2PT;
      return {
        text: r.text,
        options: {
          // bold 플래그를 켜면 짝 없는 페이스에 합성 굵게가 적용돼 5% 더 벌어진다. 항상 끄고 페이스로 지정한다.
          bold: false, italic: r.italic, color: r.color,
          fontSize: Math.round(r.size * PX2PT * 10) / 10,
          fontFace: mapFace(r.font),
          charSpacing: Math.round(spacingPt * 100) / 100,
        },
      };
    });
    // 줄 단위라 다시 줄바꿈될 일이 없다. 브라우저가 잰 왼쪽 좌표에 그대로 놓는다.
    // (정렬 기준을 추론해 옮기면 오히려 어긋나므로 실측 위치를 신뢰한다)
    const x = X(ln.x), y = Y(ln.y), h = Y(ln.h);
    const w = Math.min(SLIDE_W - x, X(ln.w) + 0.12);
    slide.addText(runs, {
      x, y, w, h,
      align: "left", valign: "middle",
      margin: 0, wrap: false, isTextBox: true, inset: 0,
    });
    nText++;
  }
}

await pptx.writeFile({ fileName: output });
fs.rmSync(tmpDir, { recursive: true, force: true });
const fails = new Map();
for (const s of slides) for (const it of s.images) if (it.kind === "svg" && it.why) fails.set(it.why, (fails.get(it.why) || 0) + 1);
const nVecIcon = slides.reduce((a, s) => a + s.images.filter((i) => i.kind === "vec").length, 0);
const nPngIcon = slides.reduce((a, s) => a + s.images.filter((i) => i.kind === "svg").length, 0);
console.log(`PPTX 생성: ${output}`);
console.log(`  ${slides.length}장 · 도형 ${nShape}개 · 텍스트 줄 ${nText}개 · 그림 ${nImg}개`);
console.log(`  아이콘 ${nVecIcon + nPngIcon}개 중 벡터 도형 ${nVecIcon}개(하위 도형 ${nVec}개) · PNG ${nPngIcon}개`);
if (fails.size) {
  console.log("  PNG로 남긴 이유:");
  for (const [why, n] of [...fails].sort((a, b) => b[1] - a[1])) console.log(`    ${n}개 - ${why}`);
}
