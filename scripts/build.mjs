// 문서 포털 빌드 스크립트
// docs/ 를 스캔해 메타데이터와 Git 이력을 추출하고 site/ 에 배포용 데이터를 생성한다.
// 사용법: node scripts/build.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAll } from "./validate.mjs";
import { buildStandalone } from "./standalone.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = path.join(ROOT, "docs");
const SITE = path.join(ROOT, "site");
const OUT_DOCS = path.join(SITE, "docs");
const OUT_DATA = path.join(SITE, "data");
const OUT_VERSIONS = path.join(OUT_DOCS, "_versions");
const MAX_OLD_VERSIONS = 8; // 문서당 열람 가능한 이전 버전 수
// 영업 자료가 아닌 내부 문서 카테고리 — 메인 목록이 아니라 별도 탭에서 본다
const REPORT_CATEGORIES = new Set(["reports"]);

function git(args, opts = {}) {
  try {
    return execFileSync("git", ["-c", "core.quotepath=false", ...args], {
      cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts,
    });
  } catch {
    return null;
  }
}

function readMeta(html, name) {
  const re = new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, "i");
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function readTitle(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim() : null;
}

function readSlides(html) {
  const titles = [];
  const re = /<section[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const t = m[0].match(/data-title=["']([^"']*)["']/i);
    titles.push(t ? t[1] : `페이지 ${titles.length + 1}`);
  }
  return titles;
}

function fileHistory(relPath) {
  const out = git(["log", "--follow", "--format=%H%x09%ad%x09%s", "--date=format:%Y-%m-%d %H:%M", "--", relPath]);
  if (!out) return [];
  return out.trim().split("\n").filter(Boolean).map((line) => {
    const [hash, date, ...rest] = line.split("\t");
    return { hash, date, message: rest.join("\t") };
  });
}

// --- 준비 ---
if (!fs.existsSync(DOCS)) {
  console.error("docs/ 폴더가 없습니다.");
  process.exit(1);
}
// 규격 검증 — 위반 문서가 있으면 빌드 중단 (AUTHORING.md 강제)
if (!validateAll(DOCS)) process.exit(1);
fs.rmSync(OUT_DOCS, { recursive: true, force: true });
fs.rmSync(OUT_DATA, { recursive: true, force: true });
fs.mkdirSync(OUT_DATA, { recursive: true });
fs.mkdirSync(OUT_VERSIONS, { recursive: true });

const categories = JSON.parse(fs.readFileSync(path.join(DOCS, "categories.json"), "utf8"));

// --- 문서 스캔 ---
const docs = [];
for (const catDir of fs.readdirSync(DOCS, { withFileTypes: true })) {
  if (!catDir.isDirectory() || catDir.name.startsWith("_")) continue;
  const catPath = path.join(DOCS, catDir.name);

  // 카테고리 폴더 전체(assets 포함)를 사이트로 복사
  fs.cpSync(catPath, path.join(OUT_DOCS, catDir.name), {
    recursive: true,
    filter: (src) => {
      const base = path.basename(src);
      // 작업용 파일과 원본 PDF는 사이트로 복사하지 않는다 (PDF는 site/pdf/로 따로 배치)
      return !base.startsWith("_") && !base.endsWith(".titles.txt") && !base.endsWith(".pdf");
    },
  });

  for (const f of fs.readdirSync(catPath)) {
    if (!f.endsWith(".html") || f.startsWith("_")) continue;
    const abs = path.join(catPath, f);
    const rel = `docs/${catDir.name}/${f}`; // git용 posix 경로
    const html = fs.readFileSync(abs, "utf8");
    const slides = readSlides(html);
    const history = fileHistory(rel);
    const id = `${catDir.name}--${f.replace(/\.html$/, "")}`;

    // 이전 버전 내보내기 (현재 커밋 제외, 최대 MAX_OLD_VERSIONS개)
    const oldVersions = [];
    for (const h of history.slice(1, 1 + MAX_OLD_VERSIONS)) {
      const content = git(["show", `${h.hash}:${rel}`]);
      if (content === null) continue;
      const dir = path.join(OUT_VERSIONS, id);
      fs.mkdirSync(dir, { recursive: true });
      const vfile = `${h.hash.slice(0, 10)}.html`;
      fs.writeFileSync(path.join(dir, vfile), content);
      oldVersions.push({ ...h, file: `docs/_versions/${id}/${vfile}` });
    }

    // 원본 PDF가 같은 이름으로 있으면(PPTX 변환 문서) 그것을 그대로 배포한다.
    // PowerPoint가 만든 PDF라 텍스트 선택이 되고 재현도가 완벽하다.
    const srcPdf = abs.replace(/\.html$/, ".pdf");
    const hasSrcPdf = fs.existsSync(srcPdf);
    if (hasSrcPdf) {
      fs.mkdirSync(path.join(SITE, "pdf"), { recursive: true });
      fs.copyFileSync(srcPdf, path.join(SITE, "pdf", `${id}.pdf`));
    }

    const stat = fs.statSync(abs);
    docs.push({
      pdfSource: hasSrcPdf ? "original" : "generated",
      pptxSource: readMeta(html, "doc-source") ? "original" : "generated",
      id,
      kind: REPORT_CATEGORIES.has(catDir.name) ? "report" : "doc",
      category: catDir.name,
      categoryLabel: categories[catDir.name] || catDir.name,
      file: rel,
      title: readTitle(html) || f,
      version: readMeta(html, "doc-version") || "1.0",
      description: readMeta(html, "doc-description") || "",
      pages: slides.length,
      pageTitles: slides,
      updated: history[0]?.date || stat.mtime.toISOString().slice(0, 16).replace("T", " "),
      latest: history[0] || null,
      history,
      oldVersions,
      pdf: `pdf/${id}.pdf`,
      pptx: `pptx/${id}.pptx`,
      html: `standalone/${id}.html`,
    });
  }
}

// 정렬: docs/order.json에 나열된 순서 우선, 나머지는 최근 수정순으로 뒤에
docs.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));
const orderFile = path.join(DOCS, "order.json");
if (fs.existsSync(orderFile)) {
  const order = JSON.parse(fs.readFileSync(orderFile, "utf8")).docs || [];
  const rank = (d) => { const i = order.indexOf(d.id); return i === -1 ? order.length : i; };
  docs.sort((a, b) => rank(a) - rank(b));
}

fs.writeFileSync(path.join(OUT_DATA, "docs.json"), JSON.stringify({
  generated: new Date().toISOString(),
  categories,
  docs,
}, null, 2));

// 작성 지침 문서들을 사이트에서 열람·내려받을 수 있게 복사한다.
// 합본(all-guides.md)도 함께 만들어 한 번에 받을 수 있게 한다.
const GUIDE_DOCS = [
  { file: "AUTHORING.md", title: "HTML 문서 작성 지침", desc: "규격·디자인 시스템·레이아웃·작업 절차" },
  { file: "PROMPT.md", title: "문서 제작 프롬프트", desc: "클로드에 그대로 붙여 쓰는 지시문" },
  { file: "CONVERSION-GUIDE.md", title: "PPT 변환 가이드", desc: "기존 PPTX를 포털 문서로 변환하는 방법" },
  { file: "MULTI-TENANT.md", title: "하위 URL 문서 시스템 추가", desc: "다른 조직 포털을 같은 저장소에 붙이는 방법" },
  { file: "README.md", title: "저장소 안내", desc: "폴더 구조와 기본 명령" },
];
const guideList = [];
const bundle = [];
for (const g of GUIDE_DOCS) {
  const src = path.join(ROOT, g.file);
  if (!fs.existsSync(src)) continue;
  const body = fs.readFileSync(src, "utf8");
  fs.writeFileSync(path.join(OUT_DATA, g.file), body);
  guideList.push({ ...g, bytes: Buffer.byteLength(body, "utf8") });
  bundle.push(`<!-- ===== ${g.file} — ${g.title} ===== -->\n\n${body.trim()}\n`);
}
fs.copyFileSync(path.join(ROOT, "AUTHORING.md"), path.join(OUT_DATA, "authoring.md"));
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
const toc = guideList.map((g, i) => `${i + 1}. **${g.title}** (${g.file}) - ${g.desc}`).join("\n");
const bundled = `# 세일링스톤 문서 시스템 지침 모음\n\n`
  + `생성 ${stamp} · 문서 ${guideList.length}건\n\n`
  + toc + `\n\n---\n\n` + bundle.join("\n---\n\n");
fs.writeFileSync(path.join(OUT_DATA, "all-guides.md"), bundled);
fs.writeFileSync(path.join(OUT_DATA, "guides.json"), JSON.stringify({
  docs: guideList,
  bundle: { file: "all-guides.md", bytes: Buffer.byteLength(bundled, "utf8") },
}, null, 2));

// 단일 파일 HTML (이미지 내장 + 페이지 넘김 주입)
const standalone = buildStandalone(docs, SITE);

const nDocs = docs.filter((d) => d.kind !== "report").length;
const nReports = docs.length - nDocs;
console.log(`빌드 완료: 문서 ${nDocs}개, 작업 리포트 ${nReports}개, 카테고리 ${Object.keys(categories).length}개`);
for (const r of standalone) {
  console.log(`  · 단일 HTML ${r.id}.html - 이미지 ${r.images}개 내장, ${r.mb.toFixed(1)} MB`);
}
for (const d of docs) console.log(`  - [${d.categoryLabel}] ${d.title} v${d.version} (${d.pages}p, 이력 ${d.history.length}건)`);
