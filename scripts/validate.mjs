// 문서 규격 검증기 — AUTHORING.md 규칙을 강제한다.
// build.mjs가 사용하며, 단독 실행도 가능: node scripts/validate.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function validateDoc(html, filename, docDir) {
  const errors = [];
  const warnings = [];

  // 0. 참조한 로컬 이미지가 실제로 있는지 (변환 문서의 깨진 이미지 방지)
  if (docDir) {
    for (const m of html.matchAll(/<img[^>]*\ssrc=["']([^"']+)["']/gi)) {
      const src = m[1];
      if (/^(https?:|data:)/i.test(src)) continue;
      if (!fs.existsSync(path.join(docDir, decodeURIComponent(src)))) {
        errors.push(`이미지 파일이 없음: ${src}`);
      }
    }
  }

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

  // 5. 자체 완결: 외부 스크립트/스타일시트 금지 (폰트는 @font-face로만)
  if (/<script[^>]*\ssrc=/i.test(html)) {
    errors.push("외부 스크립트(<script src=…>) 금지 — JS는 인라인만 허용");
  }
  for (const m of html.matchAll(/<link[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
    const href = m[0].match(/href=["']([^"']+)["']/i)?.[1] || "";
    if (/^https?:/i.test(href) && !/(pretendard|sun-typeface|SUIT)/i.test(href)) {
      errors.push(`외부 스타일시트 금지: ${href} (폰트는 @font-face로 불러오세요)`);
    }
  }

  // 6. 자체 내비게이션 금지 (뷰어가 주입)
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  if (/keydown|ArrowRight|ArrowLeft|PageDown/i.test(noComments)) {
    errors.push("문서 자체 페이지 내비게이션(키보드 이벤트 등) 금지 — 뷰어가 자동 주입함");
  }

  // 권장 사항 (경고 - 빌드는 통과)
  // 루트 글자 크기는 뷰포트에 비례해야 슬라이드가 통째로 확대·축소된다.
  const rootFs = html.match(/html\s*\{[^}]*font-size:\s*([^;}]+)/i)?.[1] || "";
  if (!/\d(vw|vh)/i.test(rootFs)) {
    warnings.push("html의 font-size가 뷰포트 기준(vw/vh)이 아님 - 16:9 고정 캔버스 CSS를 넣으세요 (AUTHORING.md 4절)");
  } else if (/clamp\([^)]*\d+(px|rem)\s*\)/i.test(rootFs)) {
    warnings.push("html의 font-size에 상한이 있음 - 화면이 커지면 글자만 멈추고 여백만 벌어집니다. min(1.25vw, 2.2222vh) 사용");
  }
  if (!/width:\s*min\(100vw/i.test(html)) {
    warnings.push("슬라이드가 16:9 고정 캔버스가 아님 - .slide { width: min(100vw, 177.7778vh); height: min(56.25vw, 100vh) }");
  }
  const px = noComments.match(/font-size:\s*\d+px/gi);
  if (px) {
    warnings.push(`font-size가 px로 고정된 곳 ${px.length}건 — rem 단위 권장`);
  }
  // PPTX에서 변환한 이미지 기반 문서는 본문 텍스트가 없어 폰트 검사 대상이 아니다
  const isConverted = /<meta\s+name=["']doc-source["']/i.test(html);
  if (!isConverted && !/SUIT/i.test(html)) {
    warnings.push("SUIT 폰트가 없음 - 브랜드 폰트를 @font-face로 불러오세요 (AUTHORING.md 7절)");
  }
  // 굵기용 폰트가 따로 있으므로 font-weight로 굵게 하면 가짜 굵게가 만들어진다
  const heavy = noComments.match(/font-weight:\s*(?:[5-9]00|bold(?:er)?)/gi);
  if (heavy) {
    warnings.push(`font-weight로 굵게 지정한 곳 ${heavy.length}건 - var(--fx) 패밀리를 쓰세요 (가짜 굵게 방지)`);
  }

  // ── PPT 변환 품질 (AUTHORING.md 16절) ──
  if (!isConverted) {
    // 도형 배경 그라디언트는 PPT로 옮겨지지 않는다. 슬라이드 배경 격자·글로우는 예외.
    const grads = (noComments.match(/background(?:-image)?:[^;}]*linear-gradient\([^)]*\)/gi) || [])
      .filter((g) => !/1px,\s*transparent 1px/.test(g));
    if (grads.length) {
      warnings.push(`도형 배경에 그라디언트 ${grads.length}건 - 단색을 쓰고 색상 포인트는 도형을 겹쳐 표현하세요 (AUTHORING.md 16절)`);
    }
    // 아이콘 SVG가 벡터로 변환되지 못하는 요소들
    // (<text>는 PPT 텍스트 상자로 옮겨지므로 문제되지 않는다)
    const svgs = html.match(/<svg\b[\s\S]*?<\/svg>/gi) || [];
    const bad = { "transform": 0, "g/use/defs": 0, "tspan": 0, "서브패스 다중": 0 };
    for (const sv of svgs) {
      if (/\btransform=/i.test(sv)) bad.transform++;
      if (/<(g|use|defs|mask|clipPath|image)\b/i.test(sv)) bad["g/use/defs"]++;
      if (/<tspan\b/i.test(sv)) bad.tspan++;
      for (const d of sv.match(/\bd="([^"]+)"/gi) || []) {
        if ((d.match(/[Mm]/g) || []).length > 1) { bad["서브패스 다중"]++; break; }
      }
    }
    const parts = Object.entries(bad).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}건`);
    if (parts.length) {
      warnings.push(`PPT에서 벡터로 못 옮기는 SVG - ${parts.join(", ")} (해당 아이콘은 PNG로 들어갑니다, AUTHORING.md 16절)`);
    }
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
      const catPath = path.join(docsDir, catDir.name);
      const html = fs.readFileSync(path.join(catPath, f), "utf8");
      const { errors, warnings } = validateDoc(html, f, catPath);
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
