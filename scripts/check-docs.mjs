// 문서 자가 점검기 - 페이지 형식·문체·용어 일관성을 기계적으로 검사한다.
// 검사 항목은 SOVEREIGNS-DESIGN.md 3-1절(문체와 페이지 형식) 기준이다.
//
//   node scripts/check-docs.mjs --tenant docs-sovereigns
//   node scripts/check-docs.mjs --tenant docs-sovereigns docs-sovereigns/specs/lsv-tms-user-flow.html
import fs from "node:fs";
import path from "node:path";
import { resolveTenant, ROOT } from "./tenant.mjs";

const { docsDir: DOCS, dir: TENANT_DIR, tenant, rest } = resolveTenant();
// 머리말·꼬리말·문체 규칙은 조직 규격을 따르는 문서에만 적용한다 (tenant.json의 docFormat)
const STRICT_FORMAT = tenant.docFormat === "strict";

// ── 대상 문서 수집 ──
function docsIn(dir) {
  const out = [];
  for (const cat of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!cat.isDirectory() || cat.name.startsWith("_")) continue;
    for (const f of fs.readdirSync(path.join(dir, cat.name))) {
      if (f.endsWith(".html") && !f.startsWith("_")) out.push(path.join(dir, cat.name, f));
    }
  }
  return out;
}
const targets = rest.length ? rest.map((f) => path.resolve(f)) : docsIn(DOCS);

// ── 용어 사전: 왼쪽이 표준, 오른쪽은 쓰면 안 되는 표기 ──
const TERMS = [
  ["고장 코드", /고장코드/g],
  ["지오펜스", /지오 펜스|지오휀스/g],
  ["대시보드", /데시보드|대쉬보드/g],
  ["SoC", /\bSOC\b(?!\s*·\s*SOH)(?!\s*신호)/g],   // CAN 신호명(SOC · SOH, SOC 신호)은 원문 표기 그대로 둔다
  ["1단계 · 2단계", /\bP1\b|\bP2\b/g],
  ["하이픈(-)", /[–—]/g],
  ["트립", /트립리포트/g],
];
// 역할·상태·등급은 문서 사이에서 같은 낱말을 써야 한다
const ROLES = ["전역 관리자", "골프장 관리자", "관제 운영자", "정비 담당자", "조회 전용"];
const STATES = ["대기", "배차", "운행", "복귀", "충전", "정비"];
const LEVELS = ["긴급", "경고", "주의"];

const strip = (html) => html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

let problems = 0;
const seenScr = new Map();   // 문서 -> 참조한 화면 ID
const definedScr = new Set(); // 화면정의서가 정의한 화면 ID

for (const file of targets) {
  const html = fs.readFileSync(file, "utf8");
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  const issues = [];

  // 슬라이드 분해
  const slides = [];
  const re = /<section\b([^>]*)>([\s\S]*?)<\/section>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!/class=["'][^"']*\bslide\b/.test(m[1])) continue;
    slides.push({ attrs: m[1], body: m[2] });
  }

  const titles = new Set();
  slides.forEach((s, i) => {
    const n = i + 1;
    const at = (msg) => issues.push(`${String(n).padStart(2, "0")}p ${msg}`);
    const title = s.attrs.match(/data-title=["']([^"']+)["']/)?.[1];

    // 1. data-title
    if (!title) at("data-title 없음");
    else if (titles.has(title)) at(`data-title 중복: "${title}"`);
    else titles.add(title);

    const isCover = /\bcover\b/.test(s.attrs);
    const isPart = /\bpart\b/.test(s.attrs);
    const isEnd = /\bend\b/.test(s.attrs);

    if (!STRICT_FORMAT) return;

    // 2. 페이지 번호 - 본문 페이지만, 순서와 일치
    const mark = s.body.match(/<span class="mark">([^<]*)<\/span>/);
    if (isCover || isPart || isEnd) {
      if (mark) at(`표지·간지·맺음에는 페이지 번호를 넣지 않는다 (${mark[1]})`);
    } else if (!mark) {
      at("꼬리말(.s-foot)이 없음");
    } else {
      const num = mark[1].match(/·\s*(\d+)/)?.[1];
      if (!num) at(`페이지 번호 표기 없음: "${mark[1]}"`);
      else if (Number(num) !== n) at(`페이지 번호 불일치: 표기 ${num}, 실제 ${n}`);
    }

    // 3. 머리말 3요소
    if (!isCover && !isPart && !isEnd) {
      const head = s.body.match(/<div class="s-head">([\s\S]*?)<\/div>\s*<div class="body">/);
      if (!head) at("s-head 블록 없음");
      else {
        const h = head[1];
        if (!/class="eyebrow"/.test(h)) at("아이브로우 없음");
        const t = h.match(/<h2 class="title">([\s\S]*?)<\/h2>/);
        if (!t) at("h2.title 없음");
        else {
          const txt = strip(t[1]);
          if (/(습니다|합니다|입니다|니다|한다|된다|이다)\.?$/.test(txt)) at(`제목이 서술형: "${txt}" - 명사형으로`);
          if (txt.length > 28) at(`제목이 김(${txt.length}자): "${txt}"`);
        }
        const lead = h.match(/<p class="lead">([\s\S]*?)<\/p>/);
        if (lead) {
          const txt = strip(lead[1]);
          const sentences = (txt.match(/[.!?]|다\.|요\./g) || []).length;
          if (sentences > 1) at(`리드문이 두 문장 이상: "${txt.slice(0, 40)}…"`);
          if (!/니다\.?$/.test(txt)) at(`리드문 종결 확인(합니다체): "${txt.slice(-24)}"`);
        }
      }
    }
  });

  // 4. 금지 표기·용어
  const text = strip(html.replace(/<style[\s\S]*?<\/style>/gi, ""));
  for (const [std, bad] of TERMS) {
    const hits = text.match(bad);
    if (hits) issues.push(`용어: "${hits[0]}" ${hits.length}건 - "${std}" 표기로 통일`);
  }
  // 화살표·체크 같은 활자 기호(U+2700~27BF)는 이모지로 보지 않는다
  const emoji = text.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/gu);
  if (emoji) issues.push(`이모지 ${emoji.length}건 - 단색 도형·텍스트로 대체`);

  // 5. 화면 ID 수집
  const scr = [...text.matchAll(/SCR-(\d{3})/g)].map((x) => x[0]);
  if (scr.length) seenScr.set(rel, new Set(scr));
  if (/화면정의서/.test(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "")) {
    for (const id of scr) definedScr.add(id);
  }

  // 6. 역할·상태·등급 표기 흔들림
  for (const r of ROLES) {
    const loose = new RegExp(r.replace(/\s/g, ""), "g");
    const hit = text.match(loose);
    if (hit && !text.includes(r)) issues.push(`역할 표기: "${hit[0]}" - "${r}"로 띄어쓰기 통일`);
  }

  if (issues.length) {
    problems += issues.length;
    console.log(`\n${rel}`);
    for (const i of issues) console.log(`  ! ${i}`);
  }
}

// 7. 문서 간 화면 ID 교차 검증
if (definedScr.size) {
  for (const [rel, ids] of seenScr) {
    const missing = [...ids].filter((id) => !definedScr.has(id));
    if (missing.length) {
      problems += missing.length;
      console.log(`\n${rel}`);
      console.log(`  ! 화면정의서에 없는 화면 ID: ${[...new Set(missing)].join(", ")}`);
    }
  }
}

console.log(
  problems === 0
    ? `\n자가 점검 통과: 문서 ${targets.length}건, 지적 사항 없음`
    : `\n자가 점검: 지적 사항 ${problems}건 (문서 ${targets.length}건)`
);
if (process.env.CHECK_STRICT && problems) process.exit(1);
