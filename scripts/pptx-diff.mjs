// PPT 변환 품질 자동 검사: 원본 HTML 슬라이드와 변환된 PPTX 슬라이드를 겹쳐 비교한다.
//
//   1) HTML을 슬라이드별 PNG로 렌더
//   2) PowerShell + PowerPoint COM으로 PPTX를 슬라이드별 PNG로 내보내기
//   3) 두 이미지의 픽셀 차이를 재고, 차이가 큰 슬라이드와 영역을 보고
//
// 사용법: node scripts/pptx-diff.mjs <문서.html> <문서.pptx> [출력폴더]
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const [htmlPath, pptxPath, outArg] = process.argv.slice(2);
if (!htmlPath || !pptxPath) {
  console.error("사용법: node scripts/pptx-diff.mjs <문서.html> <문서.pptx> [출력폴더]");
  process.exit(1);
}
const OUT = path.resolve(outArg || path.join(os.tmpdir(), "pptx-diff"));
const dirHtml = path.join(OUT, "html"), dirPptx = path.join(OUT, "pptx"), dirDiff = path.join(OUT, "diff");
for (const d of [dirHtml, dirPptx, dirDiff]) fs.mkdirSync(d, { recursive: true });

const W = 1600, H = 900;

// ── 1) HTML 렌더 ──
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
await page.goto("file:///" + path.resolve(htmlPath).replace(/\\/g, "/"), { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(500);
const n = await page.locator("section.slide").count();
for (let i = 0; i < n; i++) {
  await page.locator("section.slide").nth(i).screenshot({ path: path.join(dirHtml, `${String(i + 1).padStart(2, "0")}.png`) });
}
await browser.close();

// ── 2) PPTX 내보내기 (PowerPoint COM) ──
const ps = `
$ErrorActionPreference = "Stop"
$ppt = New-Object -ComObject PowerPoint.Application
$pres = $ppt.Presentations.Open("${path.resolve(pptxPath).replace(/\\/g, "\\\\")}", $true, $false, $false)
for ($i = 1; $i -le $pres.Slides.Count; $i++) {
  $name = "{0:d2}" -f $i
  $pres.Slides.Item($i).Export("${dirPptx.replace(/\\/g, "\\\\")}\\$name.png", "PNG", ${W}, ${H})
}
$pres.Close(); $ppt.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
[GC]::Collect()
`;
const psFile = path.join(OUT, "_export.ps1");
fs.writeFileSync(psFile, "﻿" + ps, "utf8");
execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psFile], { stdio: "pipe" });

// ── 3) 비교 ──
const read = (f) => PNG.sync.read(fs.readFileSync(f));
const results = [];
for (let i = 1; i <= n; i++) {
  const name = String(i).padStart(2, "0") + ".png";
  const fa = path.join(dirHtml, name), fb = path.join(dirPptx, name);
  if (!fs.existsSync(fa) || !fs.existsSync(fb)) { results.push({ i, err: "이미지 없음" }); continue; }
  const a = read(fa), b = read(fb);
  const w = Math.min(a.width, b.width), h = Math.min(a.height, b.height);
  const diff = new PNG({ width: w, height: h });
  // 격자(48x27)별로 차이를 모아 어느 영역이 어긋났는지 본다
  const GX = 48, GY = 27;
  const cells = Array.from({ length: GY }, () => new Array(GX).fill(0));
  let bad = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = (a.width * y + x) << 2, ib = (b.width * y + x) << 2, id = (w * y + x) << 2;
      const d = Math.abs(a.data[ia] - b.data[ib]) + Math.abs(a.data[ia + 1] - b.data[ib + 1]) + Math.abs(a.data[ia + 2] - b.data[ib + 2]);
      const on = d > 90; // 눈에 띄는 차이만
      if (on) {
        bad++;
        cells[Math.floor(y / (h / GY))][Math.floor(x / (w / GX))]++;
        diff.data[id] = 255; diff.data[id + 1] = 0; diff.data[id + 2] = 0; diff.data[id + 3] = 255;
      } else {
        const g = 235;
        diff.data[id] = g; diff.data[id + 1] = g; diff.data[id + 2] = g; diff.data[id + 3] = 255;
      }
    }
  }
  fs.writeFileSync(path.join(dirDiff, name), PNG.sync.write(diff));
  const pct = (bad / (w * h)) * 100;
  // 가장 어긋난 격자 3곳
  const flat = [];
  cells.forEach((row, gy) => row.forEach((v, gx) => { if (v > 0) flat.push({ gx, gy, v }); }));
  flat.sort((p, q) => q.v - p.v);
  const cellArea = (w / GX) * (h / GY);
  const hot = flat.slice(0, 3).map((c) => `(${Math.round((c.gx / GX) * 100)}%,${Math.round((c.gy / GY) * 100)}%)${Math.round((c.v / cellArea) * 100)}%`);
  results.push({ i, pct, hot });
}

results.sort((p, q) => (q.pct || 0) - (p.pct || 0));
const avg = results.reduce((s, r) => s + (r.pct || 0), 0) / results.length;
console.log(`\n비교 완료: ${n}장 · 평균 차이 ${avg.toFixed(2)}%`);
console.log(`  결과 이미지: ${dirDiff}`);
console.log(`\n차이가 큰 슬라이드`);
for (const r of results.slice(0, 8)) {
  if (r.err) { console.log(`  p${r.i}: ${r.err}`); continue; }
  console.log(`  p${String(r.i).padStart(2)} ${r.pct.toFixed(2).padStart(6)}%  집중 영역 ${r.hot.join(" ")}`);
}
const good = results.filter((r) => (r.pct || 0) < 2).length;
console.log(`\n차이 2% 미만: ${good}/${n}장`);
