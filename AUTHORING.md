# HTML 문서 작성 지침

> 이 문서는 문서 포털에 올라가는 모든 HTML 슬라이드 문서의 표준 양식입니다.
> **이 규격은 빌드 시 자동 검증되며, 위반한 문서는 사이트에 올라가지 않습니다.** (`node scripts/validate.mjs`로 미리 확인 가능)
>
> 문서를 만드는 방법 두 가지:
> - 이 프로젝트에서 Claude Code에게: **"AUTHORING.md 지침대로 만들어줘"**
> - 다른 클로드(claude.ai 등)에서: **PROMPT.md 내용을 복사해 붙여넣고** 요청 — 규격에 맞는 완성 파일이 나옵니다
>
> 지침이 바뀌면 이 파일과 PROMPT.md를 함께 수정하고 커밋하세요. 사이트의 "작성 지침" 메뉴에 자동 반영됩니다.

---

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
- `_`(밑줄)로 시작하는 파일/폴더는 빌드에서 제외됩니다. (작업 중 초안용)

## 2. 필수 메타데이터

`<head>` 안에 반드시 아래 4개를 넣습니다. 사이트 목록/뷰어가 이 값을 읽습니다.

```html
<title>회사소개 2026</title>
<meta charset="UTF-8">
<meta name="doc-version" content="1.0">
<meta name="doc-description" content="회사 연혁, 조직, 주요 실적을 담은 표준 회사소개서">
```

| 항목 | 규칙 |
|---|---|
| `title` | 목록 카드에 표시되는 문서 제목 (한글 가능) |
| `doc-version` | `주.부` 형식. 내용이 크게 바뀌면 주 버전 올림 (1.0 → 2.0), 소폭 수정은 부 버전 (1.0 → 1.1) |
| `doc-description` | 한 줄 요약. 목록 카드에 표시됨 |

## 3. 페이지(슬라이드) 구조

문서의 각 페이지는 `<section class="slide">` 하나입니다. **뷰어가 이 태그를 기준으로 페이지를 나누고, 왼쪽 목차와 페이지 넘김을 자동으로 만들어 줍니다.**

```html
<body>
  <section class="slide" data-title="표지">
    ...첫 페이지 내용...
  </section>
  <section class="slide" data-title="회사 연혁">
    ...두 번째 페이지 내용...
  </section>
</body>
```

- `data-title`: 왼쪽 목차에 표시될 페이지 이름. **반드시 넣으세요.** (없으면 "페이지 N"으로 표시)
- 슬라이드 바깥(`<body>` 직속)에는 다른 요소를 두지 마세요.

## 4. 슬라이드 크기와 반응형 글자

슬라이드는 **16:9 화면을 꽉 채우는 기준**으로 디자인합니다. 아래 기본 CSS를 문서에 포함하세요.

```html
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { font-size: clamp(8px, 1.25vw, 20px); }  /* 화면 크기에 따라 글자가 함께 커지고 작아짐 */
  .slide {
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    position: relative;
    padding: 4rem 5rem;
  }
</style>
```

- **글자 크기는 반드시 `rem` 단위**로 씁니다. (`px` 고정 금지 — 창 크기가 바뀌면 레이아웃이 깨집니다)
- 한 슬라이드에 내용이 넘치면 스크롤이 아니라 **슬라이드를 나누세요.**

## 5. 자체 완결(Self-contained) 원칙

- CSS와 JS는 문서 안에 **인라인**으로 넣습니다. 외부 CDN 스크립트/스타일시트는 사용하지 않습니다. (예외: 폰트는 Pretendard CDN 허용)
- 이미지는 `docs/<카테고리>/assets/` 폴더에 넣고 상대 경로로 참조하거나, 작은 이미지는 data URI로 넣습니다.
- **자체 페이지 내비게이션(넘김 버튼, 키보드 이벤트)을 넣지 마세요.** 뷰어가 자동으로 주입합니다. 문서 단독으로 열면 슬라이드가 세로로 이어져 보이는 게 정상입니다.

## 6. 디자인 가이드 (Apple 스타일)

- 배경: 흰색 `#ffffff` 또는 연회색 `#f5f5f7`, 강조 섹션은 검정 `#1d1d1f`
- 본문 텍스트: `#1d1d1f`, 보조 텍스트: `#6e6e73`
- 포인트 컬러: 인디고 `#4f46e5` (필요 시 시트러스 `#f56300`, 블러시 `#f5a8b8` 보조 사용)
- 제목은 크고 굵게(3~4.5rem, font-weight 700), 여백은 아낌없이
- 폰트 스택: `"Pretendard", -apple-system, "Segoe UI", "Malgun Gothic", sans-serif`

## 7. 버전 관리 규칙

- 문서를 수정하면 `doc-version` 메타를 올리고, 커밋 메시지는 아래 형식으로 씁니다:

```
[company-intro] v1.1 2026년 실적 슬라이드 추가
```

- **`[파일명(확장자 제외)] v버전 변경 요약`** — 사이트의 "버전 기록"에 이 메시지가 그대로 표시됩니다.
- 특정 고객용으로 분기할 때는 파일을 복사하지 말고 **브랜치**를 만듭니다: `git checkout -b proposal-hanwha`
  - 분기 버전을 사이트에도 올리고 싶으면 별도 파일로 저장하세요. (예: `proposal-hanwha-2026.html`)

## 8. 업로드(배포) 절차

1. `docs/` 아래에 문서 저장 (또는 수정)
2. 커밋 & 푸시 — Claude에게: **"빌드하고 커밋, 푸시해줘"**
3. 푸시하면 GitHub Actions가 자동으로: **규격 검증** → 목록 갱신 → PDF 생성 → 사이트 배포 (2~3분 소요)

규격 위반이 있으면 빌드가 실패하며 무엇이 틀렸는지 한글 오류 메시지로 알려줍니다.
올리기 전에 로컬에서 미리 확인하려면: `node scripts/validate.mjs`

## 9. 체크리스트

- [ ] 파일명이 영문 소문자-하이픈인가?
- [ ] `title`, `doc-version`, `doc-description` 메타가 있는가?
- [ ] 모든 페이지가 `<section class="slide" data-title="...">`인가?
- [ ] 글자 크기가 `rem` 단위인가? (`html { font-size: clamp(...) }` 포함)
- [ ] 외부 스크립트 없이 자체 완결인가?
- [ ] 커밋 메시지가 `[파일명] v버전 요약` 형식인가?
