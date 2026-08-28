// 문서 전수 점검: 영역 이탈 · 글자 잘림 · 겹침 · 여백 일관성 · 폰트 로딩
//
// 사용법: node scripts/audit.mjs [문서.html ...]   (생략하면 네이티브 문서 전부)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// 검사할 조직 폴더 (--tenant docs-sovereigns, 생략하면 docs)
function tenantDir() {
  const i = process.argv.indexOf("--tenant");
  const eq = process.argv.find((a) => a.startsWith("--tenant="));
  const dir = i !== -1 ? process.argv[i + 1] : eq ? eq.slice("--tenant=".length) : "docs";
  return path.join(ROOT, dir);
}
const GAP_STD = 2.6;      // 박스 가로 간격 기준(rem) - AUTHORING.md 9절
const GAP_TOL = 0.25;     // 허용 오차(rem)

function nativeDocs() {
  const out = [];
  const DOCS = tenantDir();
  for (const cat of fs.readdirSync(DOCS, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith("_")) continue;
    for (const f of fs.readdirSync(path.join(DOCS, cat.name))) {
      if (!f.endsWith(".html") || f.startsWith("_")) continue;
      const p = path.join(DOCS, cat.name, f);
      // 이미지 변환 문서는 검사 대상이 아니다 (본문이 그림 한 장)
      if (/name="doc-source"/.test(fs.readFileSync(p, "utf8"))) continue;
      out.push(p);
    }
  }
  return out;
}

// 브라우저 안에서 실행되는 점검기
function inspect(cfg) {
  const { GAP_STD, GAP_TOL } = cfg;
  const rootFs = parseFloat(getComputedStyle(document.documentElement).fontSize);
  const rem = (px) => px / rootFs;
  const out = [];
  const name = (el) => {
    const c = (el.className && typeof el.className === "string" ? el.className : "").trim().split(/\s+/)[0];
    return el.tagName.toLowerCase() + (c ? "." + c : "");
  };

  document.querySelectorAll("section.slide").forEach((slide, si) => {
    const p = si + 1;
    const sr = slide.getBoundingClientRect();
    const add = (kind, msg, el) => out.push({ p, kind, msg, el: el ? name(el) : "" });

    const all = [...slide.querySelectorAll("*")];

    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const bleed = el.hasAttribute("data-bleed") || el.closest("[data-bleed]");

      // 1) 슬라이드 밖으로 나감
      if (!bleed) {
        const over = Math.max(r.right - sr.right, r.bottom - sr.bottom, sr.left - r.left, sr.top - r.top);
        if (over > 1) add("이탈", `슬라이드 밖 ${Math.round(over)}px`, el);
      }

      // 2) 글자 잘림 (넘치는데 숨김 처리됨)
      const hidesX = cs.overflowX === "hidden" || cs.overflowX === "clip";
      const hidesY = cs.overflowY === "hidden" || cs.overflowY === "clip";
      if (hidesY && el.scrollHeight - el.clientHeight > 2) {
        add("잘림", `세로 ${el.scrollHeight - el.clientHeight}px 넘침`, el);
      }
      if (hidesX && el.scrollWidth - el.clientWidth > 2 && cs.textOverflow !== "ellipsis") {
        add("잘림", `가로 ${el.scrollWidth - el.clientWidth}px 넘침`, el);
      }

      // 3) 부모 밖으로 삐져나온 글자 (넘침을 감추지 않아 겹쳐 보이는 경우)
      // 인라인 요소(em, b, span…)는 글자 상자가 줄 상자를 살짝 넘는 게 정상이라 제외
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (hasText && el.parentElement && /block|flex|grid|list-item/.test(cs.display)) {
        const pr = el.parentElement.getBoundingClientRect();
        const pcs = getComputedStyle(el.parentElement);
        if (pcs.overflow === "visible" && pr.width > 0) {
          const o = Math.max(r.right - pr.right, r.bottom - pr.bottom);
          if (o > 2 && !bleed) add("삐져나옴", `부모 밖 ${Math.round(o)}px`, el);
        }
      }
    }

    // 4) 여백 일관성: 그리드·플렉스의 가로 간격
    for (const box of all) {
      const cs = getComputedStyle(box);
      if (!/grid|flex/.test(cs.display)) continue;
      const kids = [...box.children].filter((k) => {
        const kc = getComputedStyle(k);
        if (kc.display === "none" || kc.position === "absolute") return false;
        const kr = k.getBoundingClientRect();
        return kr.width > 4 && kr.height > 4;
      });
      if (kids.length < 2) continue;
      const rects = kids.map((k) => k.getBoundingClientRect());
      // 같은 줄에 있는 이웃 사이의 실제 간격
      const gaps = [];
      for (let i = 1; i < rects.length; i++) {
        const a = rects[i - 1], b = rects[i];
        if (Math.abs(a.top - b.top) > 4) continue;          // 다른 줄
        const g = b.left - a.right;
        if (g > 0.5) gaps.push(rem(g));
      }
      if (!gaps.length) continue;
      // CSS에 지정한 간격을 기준으로 본다.
      // 실제 간격이 이보다 크면 auto 여백 등으로 일부러 밀어낸 것이라 정상이고,
      // 작으면 레이아웃이 눌린 것이므로 문제다.
      const gapCss = rem(parseFloat(cs.columnGap) || 0);
      const tooTight = gaps.filter((g) => g < gapCss - 0.06);
      if (tooTight.length) {
        add("여백", `지정 간격 ${gapCss.toFixed(2)}rem보다 좁아짐 (${Math.min(...tooTight).toFixed(2)}rem)`, box);
      }

      // 슬라이드 본문에 바로 놓인 카드 묶음은 문서 좌우 여백과 같은 간격이어야 한다.
      // 목업(윈도) 안의 미니 UI는 축소된 화면이라 이 기준을 적용하지 않는다.
      const inMock = box.closest(".win, .ewin, .mockcol, .duo, .dpane, .apane, .doc, .gflow");
      const isCards = /(^|\s)(cards|c2|c3|c4|two|worry|orgs|secs|checks|kpis)(\s|$)/.test(box.className || "");
      if (isCards && !inMock && gapCss > 0 && Math.abs(gapCss - GAP_STD) > GAP_TOL) {
        add("여백", `박스 가로 간격 ${gapCss.toFixed(2)}rem (기준 ${GAP_STD}rem)`, box);
      }
    }

    // 5) 좌우 문서 여백이 대칭인지
    const pad = getComputedStyle(slide);
    const pl = rem(parseFloat(pad.paddingLeft)), pr2 = rem(parseFloat(pad.paddingRight));
    if (Math.abs(pl - pr2) > 0.05) add("여백", `슬라이드 좌우 여백 불일치 ${pl.toFixed(2)} / ${pr2.toFixed(2)}rem`);

    // 6) 빈 상자 (배경만 있고 내용이 없는 것)
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      if (el.children.length || el.textContent.trim()) continue;
      if (el.hasAttribute("data-bleed")) continue;
      if (/accent|glow|bar|line|dot|sep|donut|varr/.test(el.className || "")) continue;
      // 막대·게이지·구분선처럼 모양만 내는 빈 태그는 정상이다
      const tag = el.tagName.toLowerCase();
      const upper = [el.parentElement, el.parentElement?.parentElement]
        .map((n) => (n && typeof n.className === "string" ? n.className : "")).join(" ");
      if ((tag === "i" || tag === "b" || tag === "span") &&
          /bars|ebars|grow|gantt|res|kpi|donut|line|slot|gauge|hl|on/.test(upper)) continue;
      const hasBg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" || cs.backgroundImage !== "none";
      if (hasBg) add("빈상자", `내용 없는 상자 ${Math.round(r.width)}x${Math.round(r.height)}px`, el);
    }
  });

  return out;
}

// ── 실행 ──
// 파일을 직접 지정하면 그 파일만, 없으면 조직 폴더의 네이티브 문서 전부
const files = [];
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === "--tenant") { i++; continue; }
  if (a.startsWith("--tenant=")) continue;
  files.push(a);
}
const targets = files.length ? files.map((f) => path.resolve(f)) : nativeDocs();
const ROUNDS = Number(process.env.AUDIT_ROUNDS || 1);

const browser = await chromium.launch();
const seen = new Map();   // 키 -> {건, 라운드들}

for (let round = 1; round <= ROUNDS; round++) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  for (const file of targets) {
    await page.goto("file:///" + file.replace(/\\/g, "/"), { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);

    // 폰트가 실제로 적용됐는지
    const fontOk = await page.evaluate(() => {
      const s = document.querySelector("section.slide");
      if (!s) return { ok: false, why: "슬라이드 없음" };
      const fam = getComputedStyle(s).fontFamily;
      return { ok: /SUIT/i.test(fam) && document.fonts.check("1rem SUIT"), fam, status: document.fonts.status };
    });
    const doc = path.basename(file);
    if (!fontOk.ok) {
      const k = `${doc}|폰트|-|SUIT 폰트 미적용 (${fontOk.fam})`;
      const e = seen.get(k) || { doc, p: "-", kind: "폰트", msg: `SUIT 미적용 (${fontOk.status})`, el: "", rounds: new Set() };
      e.rounds.add(round); seen.set(k, e);
    }

    const found = await page.evaluate(inspect, { GAP_STD, GAP_TOL });
    for (const f of found) {
      const k = `${doc}|${f.kind}|${f.p}|${f.el}|${f.msg}`;
      const e = seen.get(k) || { doc, ...f, rounds: new Set() };
      e.rounds.add(round);
      seen.set(k, e);
    }
  }
  await page.close();
  console.log(`${round}회차 완료`);
}
await browser.close();

// ── 보고 ──
const items = [...seen.values()];
const byDoc = new Map();
for (const it of items) {
  if (!byDoc.has(it.doc)) byDoc.set(it.doc, []);
  byDoc.get(it.doc).push(it);
}
const order = ["이탈", "잘림", "삐져나옴", "폰트", "여백", "빈상자"];
let total = 0;
console.log("");
for (const file of targets) {
  const doc = path.basename(file);
  const list = (byDoc.get(doc) || []).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.p - b.p);
  if (!list.length) { console.log(`${doc}: 이상 없음`); continue; }
  console.log(`${doc}: ${list.length}건`);
  for (const it of list) {
    const flaky = it.rounds.size < ROUNDS ? ` [${it.rounds.size}/${ROUNDS}회만]` : "";
    console.log(`  p${String(it.p).padStart(2)} [${it.kind}] ${it.msg}${it.el ? "  <" + it.el + ">" : ""}${flaky}`);
  }
  total += list.length;
}
console.log(`\n합계 ${total}건 (${ROUNDS}회 반복 검사)`);
process.exit(items.some((i) => ["이탈", "잘림", "폰트"].includes(i.kind)) ? 1 : 0);
