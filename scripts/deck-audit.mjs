// 변환 문서(PPTX 기반) 전수 점검
//
// 이미지로 변환된 문서는 audit.mjs(HTML 레이아웃 검사) 대상이 아니다.
// 대신 원본 PPTX의 텍스트와 산출물을 맞춰 보며 아래를 확인한다.
//   · 쪽번호가 실제 위치와 어긋난 곳 (이미지로 박힌 번호)
//   · 목차(titles.txt)와 장수 불일치
//   · 옛 표기가 남은 곳 (AiSight 대문자, innermate, 옛 수치 등)
//   · 슬라이드별 산출 이미지 누락
//
// 사용법: node scripts/deck-audit.mjs docs/company/company-intro-2026
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("사용법: node scripts/deck-audit.mjs docs/<카테고리>/<문서이름>");
  process.exit(1);
}
const base = path.resolve(ROOT, target);
const dir = path.dirname(base);
const name = path.basename(base);
const htmlPath = `${base}.html`;
const titlesPath = `${base}.titles.txt`;
const pptxPath = path.join(dir, "_source", `${name}.pptx`);
const assetsDir = path.join(dir, "assets", name);

// 금지·주의 표기 (정규식, 설명)
const BAD_TEXT = [
  [/AiSight/g, "대문자 AiSight (소문자 aisight로 통일)"],
  [/innermate/gi, "옛 제품명 innermate"],
  [/[—–]/g, "긴 줄표 (하이픈으로)"],
  [/\bTBD\b/g, "TBD 표시"],
  [/설립은?\s*5년|설립 기간은?\s*5년/g, "옛 연차 (설립 5년)"],
  [/팀워크는?\s*10년/g, "옛 연차 (팀워크 10년)"],
  [/\b73명/g, "옛 인원수 (73명)"],
];

const issues = [];
const add = (p, kind, msg) => issues.push({ p, kind, msg });

// ── PPTX 텍스트 추출 ──
function slideTexts() {
  if (!fs.existsSync(pptxPath)) return null;
  const py = `
import zipfile, re, json, sys
z = zipfile.ZipFile(r"${pptxPath.replace(/\\/g, "\\\\")}")
names = [n for n in z.namelist() if re.match(r"ppt/slides/slide\\d+\\.xml$", n)]
names.sort(key=lambda n: int(re.search(r"(\\d+)", n.split("/")[-1]).group(1)))
out = []
for n in names:
    xml = z.read(n).decode("utf-8")
    out.append([t for t in re.findall(r"<a:t>([^<]*)</a:t>", xml)])
print(json.dumps(out, ensure_ascii=False))
`;
  const r = execFileSync("py", ["-c", py], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
  return JSON.parse(r);
}

const texts = slideTexts();
if (!texts) {
  console.error(`원본 PPTX가 없습니다: ${pptxPath}`);
  process.exit(1);
}
const n = texts.length;

// ── 1. 목차 대조 ──
const titles = fs.existsSync(titlesPath)
  ? fs.readFileSync(titlesPath, "utf8").split(/\r?\n/).filter((l) => l.trim())
  : [];
if (titles.length !== n) {
  add("-", "목차", `목차 ${titles.length}줄 vs 슬라이드 ${n}장 - 개수가 다름`);
}

// ── 2. 산출 이미지 누락 ──
for (let i = 1; i <= n; i++) {
  const f = path.join(assetsDir, `slide-${String(i).padStart(2, "0")}.webp`);
  if (!fs.existsSync(f)) add(i, "이미지", "슬라이드 이미지 없음");
}
const extra = fs.existsSync(assetsDir)
  ? fs.readdirSync(assetsDir).filter((f) => /^slide-\d+\.webp$/.test(f)).length - n
  : 0;
if (extra > 0) add("-", "이미지", `쓰이지 않는 슬라이드 이미지 ${extra}개가 남아 있음`);

// ── 3. 쪽번호 대조 (텍스트에 박힌 "- 12 -" 형태) ──
texts.forEach((ts, i) => {
  const p = i + 1;
  for (const t of ts) {
    const m = t.match(/^\s*[-–]\s*(\d+)\s*[-–]\s*$/);
    if (m && Number(m[1]) !== p) {
      add(p, "쪽번호", `슬라이드에 "${t.trim()}"이 박혀 있음 (실제 ${p}p)`);
    }
  }
});

// ── 4. 옛 표기 ──
texts.forEach((ts, i) => {
  const joined = ts.join(" ");
  for (const [re, why] of BAD_TEXT) {
    const hit = joined.match(re);
    if (hit) add(i + 1, "표기", `${why} - ${hit.length}건`);
  }
});

// ── 5. HTML 산출물 확인 ──
if (fs.existsSync(htmlPath)) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const secs = (html.match(/<section[^>]*class=["'][^"']*\bslide\b/g) || []).length;
  if (secs !== n) add("-", "산출물", `HTML 슬라이드 ${secs}장 vs 원본 ${n}장`);
  const t = html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!t) add("-", "산출물", "HTML에 <title>이 없음");
}

// ── 6. PDF 제목 ──
const pdfPath = `${base}.pdf`;
if (fs.existsSync(pdfPath)) {
  try {
    const py = `
from pypdf import PdfReader
r = PdfReader(r"${pdfPath.replace(/\\/g, "\\\\")}")
m = r.metadata or {}
print((m.get("/Title") or "") + "\\t" + str(len(r.pages)))
`;
    const [title, pages] = execFileSync("py", ["-c", py], { encoding: "utf8" }).trim().split("\t");
    if (!title) add("-", "PDF", "PDF 제목(문서 속성)이 비어 있음 - 탭 이름이 파일명으로 뜬다");
    else if (/innermate/i.test(title)) add("-", "PDF", `PDF 제목이 옛 이름: "${title}"`);
    if (Number(pages) !== n) add("-", "PDF", `PDF ${pages}쪽 vs 원본 ${n}장`);
  } catch { /* pypdf 없으면 건너뜀 */ }
}

// ── 보고 ──
console.log(`${name}: 슬라이드 ${n}장 · 목차 ${titles.length}줄`);
if (!issues.length) {
  console.log("이상 없음");
  process.exit(0);
}
const order = ["쪽번호", "표기", "목차", "이미지", "산출물", "PDF"];
issues.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || (a.p > b.p ? 1 : -1));
console.log(`${issues.length}건 발견`);
for (const it of issues) {
  const where = it.p === "-" ? "   " : `p${String(it.p).padStart(2)}`;
  const t = it.p !== "-" && titles[Number(it.p) - 1] ? `  (${titles[Number(it.p) - 1]})` : "";
  console.log(`  ${where} [${it.kind}] ${it.msg}${t}`);
}
process.exit(1);
