// 문서 규격 검증기 — AUTHORING.md 규칙을 강제한다.
// build.mjs가 사용하며, 단독 실행도 가능: node scripts/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateDoc(html, filename) {
  const errors = [];
  const warnings = [];

  // 1. 파일명: 영문 소문자/숫자/하이픈
  if (!/^[a-z0-9][a-z0-9-]*\.html$/.test(filename)) {
    errors.push(`파일명 규칙 위반: "${filename}" — 영문 소문자·숫자·하이픈만 사용 (예: proposal-hanwha-2026.html)`);
  }

  // 2. 필수 메타
  if (!/<meta\s+charset=["']?utf-8["']?/i.test(html)) {
    errors.push('<meta charset="UTF-8"> 누락');
  }
  const title = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!title || !title[1].trim()) {
    errors.push("<title> 누락 또는 비어 있음 — 목록 카드에 표시될 문서 제목");
  }
  const ver = html.match(/<meta\s+name=["']doc-version["']\s+content=["']([^"']*)["']/i);
  if (!ver) {
    errors.push('doc-version 메타 누락 — <meta name="doc-version" content="1.0">');
  } else if (!/^\d+\.\d+$/.test(ver[1])) {
    errors.push(`doc-version 형식 오류: "${ver[1]}" — "1.0"처럼 숫자 주.부 형식만 허용`);
  }
  const desc = html.match(/<meta\s+name=["']doc-description["']\s+content=["']([^"']*)["']/i);
  if (!desc || !desc[1].trim()) {
    errors.push('doc-description 메타 누락 또는 비어 있음 — 한 줄 요약');
  }

  // 3. 슬라이드 구조
  const slideTags = [...html.matchAll(/<section[^>]*class=["'][^"']*\bslide\b[^"']*["'][^>]*>/gi)];
  if (slideTags.length === 0) {
    errors.push('<section class="slide"> 가 하나도 없음 — 모든 페이지는 이 태그여야 함');
  }
  slideTags.forEach((m, i) => {
    if (!/data-title=["'][^"']+["']/i.test(m[0])) {
      errors.push(`${i + 1}번째 슬라이드에 data-title 없음 — 왼쪽 목차에 표시될 페이지 이름 필수`);
    }
  });

  // 4. body 직속에는 슬라이드만
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (body) {
    const leftover = body[1]
      .replace(/<section[\s\S]*?<\/section>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .trim();
    if (leftover) {
      errors.push(`body 직속에 슬라이드 밖 콘텐츠가 있음 (모든 내용은 section.slide 안에): "${leftover.slice(0, 60)}…"`);
    }
  } else {
    errors.push("<body> 태그가 없음");
  }

  // 5. 자체 완결: 외부 스크립트/스타일시트 금지 (Pretendard 폰트 CSS만 예외)
  if (/<script[^>]*\ssrc=/i.test(html)) {
    errors.push("외부 스크립트(<script src=…>) 금지 — JS는 인라인만 허용");
  }
  for (const m of html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1] || "";
    if (/^https?:/i.test(href) && !/pretendard/i.test(href)) {
      errors.push(`외부 스타일시트 금지: ${href} (예외: Pretendard 폰트 CSS)`);
    }
  }

  // 6. 자체 내비게이션 금지 (뷰어가 주입)
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (/keydown|ArrowRight|ArrowLeft|PageDown/i.test(noComments)) {
    errors.push("문서 자체 페이지 내비게이션(키보드 이벤트 등) 금지 — 뷰어가 자동 주입함");
  }

  // 권장 사항 (경고 — 빌드는 통과)
  if (!/font-size:\s*clamp\(/i.test(html)) {
    warnings.push("html { font-size: clamp(8px, 1.25vw, 20px) } 반응형 글자 기준이 없음 — 창 크기에 따라 레이아웃이 깨질 수 있음");
  }
  const px = noComments.match(/font-size:\s*\d+px/gi);
  if (px) {
    warnings.push(`font-size가 px로 고정된 곳 ${px.length}건 — rem 단위 권장`);
  }
  if (!/Pretendard/i.test(html)) {
    warnings.push("Pretendard 폰트 스택이 없음 — 디자인 일관성을 위해 권장");
  }

  return { errors, warnings };
}

// 모든 문서 검증 후 리포트 출력. 오류가 있으면 exit 1.
export function validateAll(docsDir) {
  let errCount = 0;
  for (const catDir of fs.readdirSync(docsDir, { withFileTypes: true })) {
    if (!catDir.isDirectory() || catDir.name.startsWith("_")) continue;
    for (const f of fs.readdirSync(path.join(docsDir, catDir.name))) {
      if (!f.endsWith(".html") || f.startsWith("_")) continue;
      const html = fs.readFileSync(path.join(docsDir, catDir.name, f), "utf8");
      const { errors, warnings } = validateDoc(html, f);
      if (errors.length || warnings.length) {
        console.log(`\ndocs/${catDir.name}/${f}`);
        errors.forEach((e) => console.log(`  ✗ [오류] ${e}`));
        warnings.forEach((w) => console.log(`  ! [경고] ${w}`));
      }
      errCount += errors.length;
    }
  }
  if (errCount > 0) {
    console.error(`\n검증 실패: 오류 ${errCount}건. AUTHORING.md 규격에 맞게 수정해야 사이트에 올라갑니다.`);
    return false;
  }
  return true;
}

// 단독 실행
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const ok = validateAll(path.join(ROOT, "docs"));
  if (!ok) process.exit(1);
  console.log("검증 통과: 모든 문서가 규격에 맞습니다.");
}
