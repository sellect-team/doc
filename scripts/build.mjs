// 문서 포털 빌드 스크립트
// docs/ 를 스캔해 메타데이터와 Git 이력을 추출하고 site/ 에 배포용 데이터를 생성한다.
// 사용법: node scripts/build.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DOCS = path.join(ROOT, "docs");
const SITE = path.join(ROOT, "site");
const OUT_DOCS = path.join(SITE, "docs");
const OUT_DATA = path.join(SITE, "data");
const OUT_VERSIONS = path.join(OUT_DOCS, "_versions");
const MAX_OLD_VERSIONS = 8; // 문서당 열람 가능한 이전 버전 수

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
    filter: (src) => !path.basename(src).startsWith("_"),
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

    const stat = fs.statSync(abs);
    docs.push({
      id,
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
    });
  }
}

// 최근 수정순 정렬
docs.sort((a, b) => (b.updated || "").localeCompare(a.updated || ""));

fs.writeFileSync(path.join(OUT_DATA, "docs.json"), JSON.stringify({
  generated: new Date().toISOString(),
  categories,
  docs,
}, null, 2));

// 작성 지침을 사이트에서 열람할 수 있게 복사
fs.copyFileSync(path.join(ROOT, "AUTHORING.md"), path.join(OUT_DATA, "authoring.md"));

console.log(`빌드 완료: 문서 ${docs.length}개, 카테고리 ${Object.keys(categories).length}개`);
for (const d of docs) console.log(`  - [${d.categoryLabel}] ${d.title} v${d.version} (${d.pages}p, 이력 ${d.history.length}건)`);
