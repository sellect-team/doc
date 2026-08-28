// 슬라이드 전수검사: 요소가 슬라이드 영역(1280x720)을 벗어나거나
// overflow:hidden 컨테이너 안에서 잘리는 곳을 모두 찾아 보고한다.
// 선행: node scripts/build.mjs  |  사용법: node scripts/check-overflow.mjs [--tenant docs-sovereigns] [문서ID]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { resolveTenant } from "./tenant.mjs";

const { siteDir: SITE, rest } = resolveTenant();
const W = 1280, H = 720, TOL = 2; // 허용 오차 px

const data = JSON.parse(fs.readFileSync(path.join(SITE, "data", "docs.json"), "utf8"));
const only = rest[0];
const docs = data.docs.filter((d) => !only || d.id === only);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H } });
let problems = 0;

for (const doc of docs) {
  await page.goto(pathToFileURL(path.join(SITE, doc.file)).href, { waitUntil: "networkidle" });
  const n = await page.evaluate(() => document.querySelectorAll("section.slide").length);

  for (let i = 0; i < n; i++) {
    const issues = await page.evaluate(({ k, W, H, TOL }) => {
      const slides = [...document.querySelectorAll("section.slide")];
      slides.forEach((s, j) => (s.style.display = j === k ? "" : "none"));
      window.scrollTo(0, 0);
      const cur = slides[k];
      const out = [];
      const label = (el) => {
        const cls = (typeof el.className === "string" ? el.className : "").trim().split(/\s+/)[0];
        const txt = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
        return `<${el.tagName.toLowerCase()}${cls ? "." + cls : ""}> "${txt}"`;
      };
      for (const el of cur.querySelectorAll("*")) {
        if (el.closest("[data-bleed]")) continue; // 의도된 배경 블리드는 제외
        const r = el.getBoundingClientRect();
        if (r.width === 0 && r.height === 0) continue;
        // 1) 슬라이드 화면 영역 이탈
        if (r.bottom > H + TOL) out.push(`아래로 ${Math.round(r.bottom - H)}px 이탈: ${label(el)}`);
        if (r.right > W + TOL) out.push(`오른쪽으로 ${Math.round(r.right - W)}px 이탈: ${label(el)}`);
        if (r.top < -TOL) out.push(`위로 ${Math.round(-r.top)}px 이탈: ${label(el)}`);
        if (r.left < -TOL) out.push(`왼쪽으로 ${Math.round(-r.left)}px 이탈: ${label(el)}`);
        // 2) overflow:hidden 컨테이너 내부 잘림 (스크롤 생기는 만큼 내용이 가려짐)
        const st = getComputedStyle(el);
        if ((st.overflow === "hidden" || st.overflowY === "hidden") &&
            el.scrollHeight > el.clientHeight + TOL) {
          out.push(`내부 세로 잘림 ${el.scrollHeight - el.clientHeight}px: ${label(el)}`);
        }
        if ((st.overflow === "hidden" || st.overflowX === "hidden") &&
            el.scrollWidth > el.clientWidth + TOL) {
          out.push(`내부 가로 잘림 ${el.scrollWidth - el.clientWidth}px: ${label(el)}`);
        }
      }
      // 3) 본문이 꼬리말 영역을 침범 (슬라이드 안에는 있지만 겹쳐 보이는 경우)
      const foot = cur.querySelector(".s-foot");
      if (foot) {
        const fr = foot.getBoundingClientRect();
        for (const el of cur.querySelectorAll(".body > *, .body table, .body .grid > *")) {
          const r = el.getBoundingClientRect();
          if (r.height && r.bottom > fr.top + TOL) {
            out.push(`꼬리말과 ${Math.round(r.bottom - fr.top)}px 겹침: ${label(el)}`);
          }
        }
      }
      return [...new Set(out)];
    }, { k: i, W, H, TOL });

    if (issues.length) {
      problems += issues.length;
      console.log(`\n[${doc.id}] ${i + 1}페이지:`);
      issues.forEach((m) => console.log(`  ✗ ${m}`));
    }
  }
}

await browser.close();
if (problems) {
  console.error(`\n전수검사 실패: ${problems}건. 레이아웃을 수정하세요.`);
  process.exit(1);
}
console.log("전수검사 통과: 영역 이탈·잘림 없음");
