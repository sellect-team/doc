// 문서별 PPTX 생성 (다운로드용)
//
//   · 원본 PPTX가 있는 변환 문서  -> 원본을 그대로 배포한다 (100% 진짜 도형)
//   · 네이티브 HTML 문서          -> html2pptx로 도형·텍스트 상자로 변환한다
//
// 선행: node scripts/build.mjs   |  사용법: node scripts/make-pptx.mjs [--tenant docs-sovereigns] [문서id ...]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { resolveTenant, ROOT } from "./tenant.mjs";

const { siteDir: SITE, rest } = resolveTenant();
const OUT = path.join(SITE, "pptx");

const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "docs.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const only = rest;
let made = 0, copied = 0;

for (const doc of data.docs) {
  if (only.length && !only.includes(doc.id)) continue;
  const dest = path.join(OUT, `${doc.id}.pptx`);
  const srcHtml = path.join(ROOT, doc.src || doc.file); // 저장소 원본 (조직 폴더 기준)

  // 1) PPTX에서 변환된 문서는 원본이 가장 정확하다
  const meta = fs.readFileSync(srcHtml, "utf8").match(/name="doc-source"\s+content="([^"]+)"/);
  if (meta) {
    const origin = path.join(path.dirname(srcHtml), "_source", meta[1]);
    if (fs.existsSync(origin)) {
      fs.copyFileSync(origin, dest);
      console.log(`  원본 사용  ${doc.id}.pptx  (${(fs.statSync(dest).size / 1048576).toFixed(1)} MB)`);
      copied++;
      continue;
    }
    console.log(`  ! 원본 없음 ${doc.id} -> HTML에서 변환합니다`);
  }

  // 2) 네이티브 HTML은 도형·텍스트로 변환
  try {
    const out = execFileSync(process.execPath,
      [path.join(ROOT, "scripts", "html2pptx.mjs"), srcHtml, dest, doc.title],
      { cwd: ROOT, encoding: "utf8" });
    const line = out.trim().split("\n").pop().trim();
    console.log(`  변환      ${doc.id}.pptx  ${line}`);
    made++;
  } catch (e) {
    console.error(`  x 실패    ${doc.id}: ${e.message.split("\n")[0]}`);
  }
}

console.log(`
PPTX 준비 완료: 원본 ${copied}건 · 변환 ${made}건 -> ${path.relative(ROOT, OUT)}`);
