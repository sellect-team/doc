// 문서별 PDF 생성 (Playwright/Chromium)
// 선행: node scripts/build.mjs  |  사용법: node scripts/make-pdfs.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const OUT = path.join(SITE, "pdf");

const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "docs.json"), "utf8"));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

for (const doc of data.docs) {
  const fileUrl = "file:///" + path.join(SITE, doc.file).replace(/\\/g, "/");
  await page.goto(fileUrl, { waitUntil: "networkidle" });
  // 인쇄 시 각 슬라이드를 한 페이지씩, 16:9 크기로
  await page.addStyleTag({
    content: `
      @page { size: 13.333in 7.5in; margin: 0; }
      html { font-size: 16px !important; }
      section.slide { width: 13.333in !important; height: 7.5in !important; page-break-after: always; overflow: hidden !important; }
    `,
  });
  await page.pdf({
    path: path.join(OUT, `${doc.id}.pdf`),
    width: "13.333in",
    height: "7.5in",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  console.log(`PDF 생성: ${doc.id}.pdf (${doc.pages}p)`);
}

await browser.close();
console.log("PDF 생성 완료");
