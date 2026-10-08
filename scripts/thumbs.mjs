// 페이지 선택 내려받기용 미리보기 썸네일 생성
// 선행: node scripts/build.mjs [--tenant …]
//
//   node scripts/thumbs.mjs                              (모든 문서)
//   node scripts/thumbs.mjs --tenant docs-sovereigns     (조직 포털)
//   node scripts/thumbs.mjs company--company-intro-2026  (특정 문서만)
//
// 결과: site/<base>/thumbs/<문서ID>/pNN.jpg (720x405, JPEG). 배포에 포함되며
// 뷰어·목록의 페이지 선택 창(assets/pick.js)이 읽는다. 문서 버전이 같으면 건너뛴다.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolveTenant } from "./tenant.mjs";

const { siteDir: SITE, rest } = resolveTenant();
const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "docs.json"), "utf8"));
const docs = data.docs.filter((d) => !rest.length || rest.includes(d.id));
if (!docs.length) { console.error("대상 문서가 없습니다."); process.exit(1); }

const W = 720, H = 405, QUALITY = 72;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

let made = 0, skipped = 0;
for (const doc of docs) {
  const out = path.join(SITE, "thumbs", doc.id);
  const stamp = path.join(out, ".version");
  const want = `${doc.version}|${doc.pages}`;
  if (fs.existsSync(stamp) && fs.readFileSync(stamp, "utf8") === want) { skipped++; continue; }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  await page.goto(pathToFileURL(path.join(SITE, doc.file)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  // 지연 로딩 이미지는 숨긴 상태에서 받아오지 않으므로 전부 즉시 로딩으로 바꾼다
  await page.evaluate(() => document.querySelectorAll("img[loading='lazy']").forEach((i) => (i.loading = "eager")));
  const n = await page.evaluate(() => document.querySelectorAll("section.slide").length);

  for (let i = 0; i < n; i++) {
    await page.evaluate(async (k) => {
      document.querySelectorAll("section.slide").forEach((s, j) => (s.style.display = j === k ? "" : "none"));
      window.scrollTo(0, 0);
      const imgs = [...document.querySelectorAll("section.slide")[k].querySelectorAll("img")];
      await Promise.all(imgs.map((im) => (im.complete ? Promise.resolve() : im.decode().catch(() => {}))));
    }, i);
    await page.screenshot({ path: path.join(out, `p${String(i + 1).padStart(2, "0")}.jpg`), type: "jpeg", quality: QUALITY });
  }
  fs.writeFileSync(stamp, want);
  made++;
  console.log(`  썸네일 ${doc.id} - ${n}장`);
}
await browser.close();
console.log(`썸네일 완료: 생성 ${made}건 · 변경 없음 ${skipped}건 -> ${path.relative(process.cwd(), path.join(SITE, "thumbs"))}`);
