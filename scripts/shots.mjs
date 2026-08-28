// 슬라이드 페이지별 PNG 캡처 - 디자인 자가 검토용
// 선행: node scripts/build.mjs [--tenant …]
//
//   node scripts/shots.mjs --tenant docs-sovereigns specs--lsv-tms-user-flow
//   node scripts/shots.mjs                                    (모든 문서)
//
// 결과는 site/<base>/_shots/<문서ID>/p01.png … 로 저장한다(배포에는 포함되지 않음).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolveTenant } from "./tenant.mjs";

const { siteDir: SITE, rest } = resolveTenant();
const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "docs.json"), "utf8"));
const docs = data.docs.filter((d) => !rest.length || rest.includes(d.id));
if (!docs.length) {
  console.error("대상 문서가 없습니다.");
  process.exit(1);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const doc of docs) {
  const out = path.join(SITE, "_shots", doc.id);
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  await page.goto(pathToFileURL(path.join(SITE, doc.file)).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const n = await page.evaluate(() => document.querySelectorAll("section.slide").length);

  for (let i = 0; i < n; i++) {
    await page.evaluate((k) => {
      document.querySelectorAll("section.slide").forEach((s, j) => (s.style.display = j === k ? "flex" : "none"));
      window.scrollTo(0, 0);
    }, i);
    await page.screenshot({ path: path.join(out, `p${String(i + 1).padStart(2, "0")}.png`) });
  }
  console.log(`${doc.title} - ${n}장 -> ${path.relative(process.cwd(), out)}`);
}

await browser.close();
