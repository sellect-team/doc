# HTML 문서 작성 지침

> 이 문서는 문서 포털에 올라가는 모든 HTML 슬라이드 문서의 표준 양식입니다.
> **규격은 빌드 시 자동 검증되며, 위반한 문서는 사이트에 올라가지 않습니다.**
>
> 문서를 만드는 방법 세 가지:
> - 이 프로젝트에서 Claude Code에게: **"AUTHORING.md 지침대로 만들어줘"**
> - 다른 클로드(claude.ai 등)에서: **PROMPT.md 내용을 복사해 붙여넣고** 요청
> - **이미 만들어둔 PPT가 있으면 변환**합니다 (12절) - 원본과 100% 동일하게 올라갑니다
>
> 지침이 바뀌면 이 파일과 PROMPT.md를 함께 수정하고 커밋하세요. 사이트의 "작성 지침" 메뉴에 자동 반영됩니다.

---

# 1부. 필수 규격 (검증기가 강제)

## 1. 저장 위치와 파일명

```
docs/
├── company/      회사소개
├── solutions/    솔루션 소개
└── proposals/    제안서
```

- 카테고리 폴더는 자유롭게 추가할 수 있습니다. 추가하면 `docs/categories.json`에 한글 이름을 등록하세요.
- **파일명은 영문 소문자 + 하이픈**으로 짓습니다. (예: `company-intro.html`, `proposal-hanwha-2026.html`)
  - 한글 파일명은 URL/CI 호환성 문제로 금지합니다. 한글 제목은 문서 안의 `<title>`에 씁니다.
- `_`(밑줄)로 시작하는 파일/폴더는 빌드에서 제외됩니다. (작업 중 초안, 원본 PPTX 보관 등)
- 이미지는 `docs/<카테고리>/assets/<문서이름>/` 아래에 둡니다.

## 2. 필수 메타데이터

`<head>` 안에 반드시 아래 4개를 넣습니다. 사이트 목록과 뷰어가 이 값을 읽습니다.

```html
<meta charset="UTF-8">
<title>세일링스톤 회사소개서</title>
<meta name="doc-version" content="1.0">
<meta name="doc-description" content="회사 개요와 성장 지표, 솔루션 제품군을 담은 표준 회사소개서 (27p)">
```

| 항목 | 규칙 |
|---|---|
| `title` | 목록 카드에 표시되는 문서 제목 (한글 가능) |
| `doc-version` | `주.부` 숫자 형식만 허용. 내용이 크게 바뀌면 주 버전(1.0 → 2.0), 소폭 수정은 부 버전(1.0 → 1.1) |
| `doc-description` | 한 줄 요약. 목록 카드에 표시되므로 "무엇을 담은 문서인지"를 쓰고 페이지 수를 괄호로 붙입니다 |

## 3. 페이지(슬라이드) 구조

각 페이지는 `<section class="slide">` 하나입니다. **뷰어가 이 태그를 기준으로 페이지를 나누고, 왼쪽 목차와 페이지 넘김을 자동으로 만듭니다.**

```html
<body>
  <section class="slide" data-title="표지">…</section>
  <section class="slide" data-title="회사 연혁">…</section>
</body>
```

- `data-title`: 왼쪽 목차에 표시될 이름. **반드시 넣으세요.** (없으면 "페이지 N")
  - **15자 내외**로 짓습니다. 목차만 보고 원하는 페이지를 찾을 수 있어야 합니다.
  - 계열 슬라이드는 번호를 앞에 붙입니다: `시나리오 ① · 대시보드 제어`
- `<body>` 직속에는 section 외에 아무것도 두지 마세요.

## 4. 16:9 고정 캔버스 (중요)

슬라이드는 **크기가 변해도 전체가 같은 비율로 확대·축소**되어야 합니다. 아래 CSS를 그대로 포함하세요.

```css
* { margin: 0; padding: 0; box-sizing: border-box; }

/* 16:9 고정 캔버스 - 창 크기가 변해도 전체가 같은 비율로 확대·축소된다 */
html { font-size: min(1.25vw, 2.2222vh); }
body {
  font-family: "Pretendard", -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center; min-height: 100vh;
}
.slide {
  width: min(100vw, 177.7778vh);   /* 항상 16:9 */
  height: min(56.25vw, 100vh);
  overflow: hidden; position: relative; flex-shrink: 0;
  padding: 1.6rem 2.6rem 0.9rem;
  display: flex; flex-direction: column;
}
```

**지켜야 할 것**

- 글자 크기는 전부 **`rem` 단위**로 씁니다. `px` 고정은 화면이 커질 때 혼자 안 커져서 레이아웃을 깨뜨립니다.
- **`font-size`에 상한을 두지 마세요.** `clamp(8px, 1.25vw, 20px)`처럼 최대값을 걸면 화면이 커질 때 **글자만 멈추고 여백만 벌어져** 비율이 무너집니다. (실제로 겪은 문제)
- 한 슬라이드에 내용이 넘치면 스크롤이 아니라 **슬라이드를 나누세요.**

**왜 `min(1.25vw, 2.2222vh)`인가**: 16:9에서 두 값이 정확히 일치합니다. 창이 더 넓으면 세로가, 더 좁으면 가로가 기준이 되어 항상 화면 안에 딱 맞는 16:9 캔버스가 됩니다.

## 5. 자체 완결(Self-contained) 원칙

- CSS는 `<head>`의 `<style>`에 **인라인**으로 넣습니다. 외부 스크립트·스타일시트 금지.
  - 유일한 예외: Pretendard 폰트 CDN
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">`
- **페이지 넘김 기능(키보드 이벤트, 넘김 버튼)을 절대 넣지 마세요.** 뷰어가 자동으로 주입합니다.
  문서를 단독으로 열면 슬라이드가 세로로 이어져 보이는 게 정상입니다.

---

# 2부. 디자인 시스템

우리 공식 자료(세일링스톤 회사소개서·aisight 소개서)에서 실측한 시스템입니다. 이대로 쓰면 기존 자료와 톤이 맞습니다.

## 6. 색상 토큰

**slate 계열이 화면의 85%, teal은 강조에만** 씁니다. 이 비율이 무너지면 싸구려로 보입니다.

```css
:root {
  --s900: #0F172A;  --s800: #1E293B;  --s700: #334155;  --s600: #475569;
  --s500: #64748B;  --s400: #94A3B8;  --s300: #CBD5E1;  --s200: #E2E8F0;
  --s100: #F1F5F9;  --s50:  #F8FAFC;
  --t800: #115E59;  --t700: #0F766E;  --t600: #0D9488;
  --t400: #2DD4BF;  --t100: #CCFBF1;  --t50:  #F0FDFA;
}
```

| 용도 | 밝은 슬라이드 | 다크 슬라이드 |
|---|---|---|
| 배경 | `#fff` / `--s50` | `--s900` |
| 제목 | `--s900` | `#fff` |
| 본문 | `--s600` | `--s300` |
| 보조·캡션 | `--s500` / `--s400` | `--s400` |
| 테두리 | `--s200` | `--s700` |
| 강조 | `--t600` | `--t400` |

경고·주의를 표시할 때만 로즈(`#E11D48`, 배경 `#FFF1F2`, 테두리 `#FECDD3`)를 씁니다. 그 외 색은 쓰지 않습니다.

## 7. 타이포그래피

폰트는 **Pretendard** 하나만 씁니다. 실제 사용 중인 스케일:

| 용도 | 크기 | 굵기 |
|---|---|---|
| 표지 대형 카피 | 3.4rem | 700 |
| 슬라이드 제목 | 2rem | 700, letter-spacing -0.02em |
| 리드문 | 1.12rem | 400 |
| 카드 제목 | 1.3~1.4rem | 700 |
| 본문 | 1rem~1.08rem | 400 |
| 라벨·캡션 | 0.78~0.9rem | 600~800 |
| 푸터 | 0.78rem | 400 |

- 원본 PPT를 참고할 때 환산 공식: **`rem = 원본 pt ÷ 9`** (본문 11pt = 1.2rem, 제목 20pt = 2.2rem)
- 제목의 강조어는 `<em>`으로 감싸고 `font-style: normal; color: var(--t600)` 처리합니다.

## 8. 슬라이드 골격

모든 콘텐츠 슬라이드는 **헤더 - 리드 밴드 - 콘텐츠 - 푸터** 4단 구조를 지킵니다.

```html
<section class="slide" data-title="핵심 역량">
  <header class="s-head">
    <h2><span class="bullet"></span>핵심 역량, <em>주요 사업 영역</em></h2>
    <div class="s-right">
      <span class="sec">02 · Key Features</span>
      <span class="sep"></span>
      <img class="mk" src="assets/문서이름/logo.png" alt="">
      <span class="mkt">aisight</span>
    </div>
  </header>
  <div class="s-band"><p>이 슬라이드의 <strong>결론</strong>을 한두 줄로 먼저 말합니다.</p></div>
  <div class="content">
    <div class="cards c3 fill"> … </div>
    <div class="stripe"><span class="sicon">…</span><span>한 줄 요약</span></div>
  </div>
  <footer class="s-foot"><span class="pg">- 5 -</span><span class="mark">SAILINGSTONE</span></footer>
</section>
```

```css
.s-head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 0.8rem; }
.s-head h2 { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; color: var(--s900); }
.s-head h2 em { color: var(--t600); font-style: normal; }
.bullet { display: inline-block; width: 0.55rem; height: 0.55rem;
          background: var(--t400); margin-right: 0.75rem; vertical-align: middle; }
.s-right { display: flex; align-items: center; gap: 0.75rem; }
.s-right .sec { font-size: 0.95rem; color: var(--s400); letter-spacing: 0.04em; }
.s-right .sep { width: 1px; height: 1.2rem; background: var(--s300); }
.s-right .mk { width: 1.45rem; height: auto; }
.s-right .mkt { font-size: 1.3rem; font-weight: 700; color: var(--s700); }

/* 리드 밴드: 좌우 여백만큼 음수 마진으로 슬라이드 끝까지 채운다 */
.s-band { margin: 0 -2.6rem; background: var(--s50);
          border-top: 1px solid var(--s200); border-bottom: 1px solid var(--s200);
          padding: 0.8rem 2.6rem; }
.s-band p { font-size: 1.12rem; line-height: 1.6; color: var(--s600); }
.s-band strong { color: var(--t600); font-weight: 700; }

/* 콘텐츠 영역: fill 블록이 남는 높이를 가져간다 */
.content { flex: 1; min-height: 0; display: flex; flex-direction: column;
           gap: 1.6rem; padding-top: 1.2rem; }
.fill { flex: 1; min-height: 0; }

.s-foot { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center;
          font-size: 0.78rem; color: var(--s400); margin-top: 0.75rem; }
.s-foot .pg { grid-column: 2; }
.s-foot .mark { grid-column: 3; justify-self: end; letter-spacing: 0.14em; }
```

**표지와 맺음말은 다크 슬라이드**로 만듭니다. 그리드 배경 + 우측 로고 + 글로우가 표준입니다.

## 9. 간격 규칙

- **박스 사이 가로 간격 = 문서 좌우 여백(2.6rem)** 과 같게 맞춥니다. 세로 간격은 1.5~1.6rem.
- 카드 내부 패딩은 1.3~1.6rem.
- 간격을 아무 값이나 쓰지 말고 위 값들로 통일하세요.

```css
.cards { display: grid; gap: 1.6rem 2.6rem; grid-auto-rows: 1fr; }
.two   { display: flex; gap: 2.6rem; align-items: stretch; }
```

## 10. 아이콘과 선

- **이모지 금지.** 반드시 **단색 라인 SVG**를 씁니다. 컬러 이모지는 장난스러워 보입니다.
- 선은 가늘게. **굵으면 만화처럼 유치해집니다.**

```css
.i { width: 1em; height: 1em; fill: none; stroke: currentColor;
     stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round;
     display: inline-block; vertical-align: -0.12em; }
.card .ico .i { stroke-width: 1.3; }   /* 큰 아이콘은 더 가늘게 */
```

| 요소 | 굵기 |
|---|---|
| 아이콘 stroke | 1.6 (큰 아이콘 1.3) |
| 테두리·구분선 | 1px |
| 점선 | 1px dashed |
| 강조 상단 액센트 | 2px |

- 화살표는 회색(`--s400`) + 일반 굵기로. 굵은 색 화살표는 쓰지 않습니다.
- 아이콘 색은 `--t600`(밝은 배경) / `--t400`(다크 배경).

---

# 3부. 내용과 레이아웃

## 11. 콘텐츠 작성 규칙

- **결론을 먼저.** 리드 밴드에 주장을 쓰고, 아래 카드는 근거로 씁니다.
- **모든 주장에 숫자를 붙입니다.** 숫자가 없으면 그 주장은 넣지 않습니다.
- 카드 설명은 **2~3줄 이내**. 넘치면 카드 수를 줄입니다.
- 한 줄에 카드는 **최대 4개**.
- 한 슬라이드에 메시지는 **하나만**. 두 개면 슬라이드를 나눕니다.
- 예시 화면(목업)에는 `* 이해를 돕기 위한 예시 화면입니다` 캡션을 반드시 답니다.
- 고객사명·실적 등 대외 민감 정보는 배포용 문서에 넣지 않습니다.

## 12. 빈 공간 다루기

**빈 곳은 콘텐츠로 채웁니다. 요소를 억지로 늘리지 마세요.**

- 나쁜 방법: `justify-content: space-between`으로 요소 사이를 벌리기 → 내부 간격이 이상해집니다.
- 좋은 방법: 내용을 추가하거나(체크리스트, 인용구, 칩, 부연 설명), 타이포를 키웁니다.

자주 쓰는 채움 요소:

- 카드 하단 **인용구**: `"차트는 많은데, 정작 궁금한 건 화면 밖에 있어요."`
- 카드 하단 **칩 행**: `<span class="chip">요청 대기 제로</span>`
- **해결 예고 라인**: `→ aisight라면, 그 자리에서 답을 받습니다`
- **체크리스트**: `✓ 데이터 환경·업무 흐름 진단`
- 슬라이드 하단 **다크 스트라이프** 한 줄 요약

## 13. 자주 쓰는 컴포넌트

**카드 그리드** - 가장 기본. 문제·기능·혜택을 3~4개로 나열할 때.

```css
.card { background: var(--s50); border: 1px solid var(--s200); border-radius: 0.9rem;
        padding: 1.6rem 1.5rem 1.35rem; display: flex; flex-direction: column;
        box-shadow: 0 6px 18px rgba(15,23,42,0.05); }
.card .no { font-size: 0.78rem; font-weight: 800; color: var(--t600); letter-spacing: 0.1em; }
.card h3 { font-size: 1.4rem; font-weight: 700; color: var(--s900); margin-bottom: 0.55rem; }
.card p  { font-size: 1.08rem; line-height: 1.65; color: var(--s500); }
```

**아이콘 행(krow)** - 좌측 설명 + 우측 목업의 2단 레이아웃에서 왼쪽에 씁니다.

```css
.krow { flex: 1; display: flex; gap: 1rem; align-items: center;
        background: var(--s50); border: 1px solid var(--s200);
        border-radius: 0.85rem; padding: 1rem 1.25rem; }
.krow .kico { width: 2.5rem; height: 2.5rem; border-radius: 0.7rem; background: var(--t100);
              display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
```

**제품 목업 윈도우** - 화면을 보여줄 때. 상단 바(점 3개 + 제목 + LIVE 배지) + 본문.

```css
.win { background: #fff; border: 1px solid var(--s200); border-radius: 0.9rem;
       box-shadow: 0 14px 34px rgba(15,23,42,0.10); overflow: hidden;
       display: flex; flex-direction: column; }
.win .bar { display: flex; align-items: center; gap: 0.45rem; background: var(--s100);
            border-bottom: 1px solid var(--s200); padding: 0.5rem 0.9rem; }
.win .dot { width: 0.52rem; height: 0.52rem; border-radius: 50%; background: var(--s300); }
```

**하단 스트라이프** - 슬라이드의 결론을 한 줄로 못박을 때.

```css
.stripe { background: var(--s900); color: #E2E8F0; border-radius: 0.7rem;
          padding: 0.8rem 1.4rem; font-size: 1.03rem;
          display: flex; align-items: center; gap: 0.8rem; }
.stripe b { color: var(--t400); font-weight: 700; }
```

그 밖에 **비교 매트릭스**(도입 전/후), **아키텍처 다이어그램**(레이어 + 라벨 화살표), **KPI 스트립**, **타임라인**, **추적 로그**는 `docs/solutions/aisight-marketing.html`에 구현되어 있으니 필요할 때 그대로 가져다 쓰세요.

## 14. 문서 구성 리듬

```
표지 (다크)
├ 문제 제기 / 솔루션 정의 (밝음)
├ 전체 구성 한 장 (밝음)
├ 기능별 슬라이드 (밝음)
├ 신뢰·보안 (밝음)
└ 도입 절차 / 회사 소개 (밝음)
맺음말 (다크)
```

- 섹션은 3~4개. 5개를 넘으면 목차가 무너집니다.
- 한 섹션의 콘텐츠는 8장 이하.
- 긴 문서(20장 이상)는 섹션 표지를 다크로 넣어 구간을 끊습니다.

## 15. 금지 사항

- 컬러 이모지 (→ 단색 라인 SVG)
- 굵은 선·굵은 점선·굵은 컬러 화살표
- **긴 줄표(em dash, en dash)** - 구분은 반드시 하이픈(`-`)
- `px` 고정 글자 크기
- `font-size` 상한(`clamp`의 최대값)
- 요소를 억지로 늘려 여백 채우기
- 제목 아래 장식용 밑줄·색 띠
- 본문 텍스트 가운데 정렬 (제목만 가운데)
- teal을 넓은 면적 배경에 사용

---

# 4부. 작업 절차

## 16. 버전 관리

- 문서를 수정하면 `doc-version`을 올리고, 커밋 메시지를 아래 형식으로 씁니다:

```
[company-intro] v1.1 2026년 실적 슬라이드 추가
```

- **`[파일명(확장자 제외)] v버전 변경 요약`** - 사이트 "버전 기록"에 그대로 표시됩니다.
- 뷰어에서 이전 버전을 클릭하면 그 시점의 문서가 그대로 열립니다 (최근 8개 보관).
- 특정 고객용 분기는 파일 복사 대신 **브랜치**: `git checkout -b proposal-hanwha`

## 17. 만들고 올리는 절차

```bash
node scripts/validate.mjs        # 규격 검증
node scripts/build.mjs           # 목록·버전 이력 생성 (검증 포함)
node scripts/check-overflow.mjs  # 전수검사: 영역 이탈·잘림
npx http-server site -p 8787 -c-1   # 로컬 확인
```

1. `docs/` 아래에 문서를 저장하거나 수정합니다.
2. 위 세 명령을 실행해 **검증과 전수검사를 통과**시킵니다.
3. 커밋 & 푸시 - Claude에게: **"빌드하고 커밋, 푸시해줘"**
4. 푸시하면 GitHub Actions가 자동으로: 규격 검증 → 전수검사 → PDF 생성 → 사이트 배포 (2~3분)

**전수검사(`check-overflow.mjs`)는 반드시 돌리세요.** 모든 슬라이드를 렌더링해 요소가 화면을 벗어나거나 잘리는 곳을 픽셀 단위로 잡아냅니다. CI에서도 실행되며, 실패하면 배포가 중단됩니다.

공개 주소: **https://sellect-team.github.io/doc/**

## 18. 기존 PPT 변환해서 올리기

완성된 PPTX가 있으면 새로 만들지 말고 변환합니다. PowerPoint 자체 렌더링을 쓰므로 **원본과 100% 동일**하고, 텍스트가 선택되는 원본 PDF도 함께 배포됩니다.

```bash
powershell -File "scripts/convert-pptx.ps1" -Source "C:\경로\원본.pptx" -Category company -Name my-doc -TitlesOnly
```

제목 초안(`<이름>.titles.txt`)이 만들어지면 목차용으로 다듬은 뒤:

```bash
powershell -File "scripts/convert-pptx.ps1" -Source "C:\경로\원본.pptx" -Category company -Name my-doc -DocTitle "문서 제목" -Description "한 줄 요약" -Version "1.0"
```

자세한 절차, 원본 PPT 디자인 시스템 분석, 카드 액센트 정리 도구는 **CONVERSION-GUIDE.md**를 보세요.

## 19. 체크리스트

**규격**

- [ ] 파일명이 영문 소문자-하이픈인가?
- [ ] `charset`, `title`, `doc-version`, `doc-description` 4개 메타가 있는가?
- [ ] 모든 페이지가 `<section class="slide" data-title="...">`이고, 목차 이름이 15자 내외인가?
- [ ] 4절의 16:9 고정 캔버스 CSS를 넣었는가? `font-size`에 상한이 없는가?
- [ ] 글자 크기가 전부 `rem`인가?
- [ ] 외부 스크립트 없이 자체 완결인가? 넘김 기능을 넣지 않았는가?

**디자인**

- [ ] 색상이 slate 85% + teal 강조 비율인가?
- [ ] 이모지 대신 단색 라인 SVG를 썼는가? 선이 가는가?
- [ ] 박스 가로 간격이 문서 좌우 여백(2.6rem)과 같은가?
- [ ] 긴 줄표 대신 하이픈을 썼는가?

**내용**

- [ ] 모든 슬라이드가 헤더-리드밴드-콘텐츠-푸터 골격인가?
- [ ] 리드문에 결론이 먼저 오는가? 주장마다 숫자가 있는가?
- [ ] 빈 공간을 요소 스트레치가 아니라 콘텐츠로 채웠는가?

**마무리**

- [ ] `node scripts/build.mjs`와 `node scripts/check-overflow.mjs`를 통과했는가?
- [ ] 커밋 메시지가 `[파일명] v버전 요약` 형식인가?
