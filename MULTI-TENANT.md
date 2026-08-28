# 하위 URL로 다른 조직 문서 시스템 추가하기

같은 저장소·같은 코드로 **조직마다 별도 문서 포털**을 하위 URL에 올리는 방법이다.
첫 적용 대상은 **소버린즈 문서관리 시스템**(`/doc/sovereigns/`)이며, 기능은 세일링스톤 포털과 동일하다.

```
https://sellect-team.github.io/doc/              세일링스톤 세일즈 그룹 문서 시스템 (기존)
https://sellect-team.github.io/doc/sovereigns/   소버린즈 문서관리 시스템 (새로 추가)
```

문서 작성 규칙([AUTHORING.md](AUTHORING.md))·변환 파이프라인·PPT 다운로드는 **그대로 공유**한다.
조직마다 다른 것은 **문서 폴더**와 **표시할 이름**뿐이다.

---

## 1. 현재 구조 (바꾸기 전)

```
docs/                     원본 문서 (카테고리 폴더 = company / solutions / proposals / reports)
  categories.json         카테고리 이름표
  order.json              메인 목록 기본 정렬
scripts/
  build.mjs               docs/ 스캔 -> site/data/docs.json + site/docs/ 복사 + 단일 HTML
  make-pdfs.mjs           PDF 생성 -> site/pdf/
  make-pptx.mjs           PPT 생성 -> site/pptx/
  check-overflow.mjs      슬라이드 전수검사
  audit.mjs               HTML 점검 (여백·잘림·폰트)
site/
  index.html              문서 목록      viewer.html  뷰어
  reports.html            작업 리포트    guide.html   작성 지침
  assets/{app,reports,viewer,gate,live}.js, style.css
.github/workflows/deploy.yml   빌드 -> 전수검사 -> PDF -> PPT -> Pages 배포
```

빌드 산출물(`site/data`, `site/docs`, `site/pdf`, `site/pptx`, `site/standalone`)은 `.gitignore`에 있고
CI가 매번 새로 만든다.

---

## 2. 설계 방침

**조직 폴더를 나란히 두고, 빌드를 조직별로 두 번 돌린다.** 코드는 한 벌만 유지한다.

```
docs/                  세일링스톤 (기존 그대로)
docs-sovereigns/       소버린즈 (새로 만듦, 구조 동일)
site/                  세일링스톤 포털 (기존 그대로)
site/sovereigns/       소버린즈 포털 (HTML 4장만, assets는 상위 것을 함께 씀)
```

이렇게 하는 이유:

- **URL이 깔끔하다** — 쿼리 파라미터가 아니라 진짜 하위 경로다.
- **코드 중복이 없다** — `site/sovereigns/*.html`이 `../assets/`를 참조하므로 JS·CSS는 한 벌이다.
- **서로 영향을 주지 않는다** — 한쪽 문서를 고쳐도 다른 쪽 빌드는 그대로다.
- **기존 URL이 안 바뀐다** — 이미 공유한 링크가 살아 있다.

---

## 3. 작업 순서

### 3-1. 조직 설정 파일 만들기

조직마다 다른 값만 모아 둔다. 코드가 이 파일을 읽어 제목·문구를 바꾼다.

`docs/tenant.json` (세일링스톤)

```json
{
  "id": "sailingstone",
  "base": "",
  "siteTitle": "세일링스톤 세일즈 그룹 문서 시스템",
  "eyebrow": "Sailingstone Sales Group",
  "heroLine1": "세일링스톤 세일즈 그룹",
  "heroLine2": "문서 시스템.",
  "heroDesc": "회사소개서부터 제안서까지 - 언제나 최신 버전으로 열람하고 PDF로 받아가세요.",
  "gateTitle": "세일링스톤 <b>세일즈 그룹</b><br>문서 시스템",
  "footerMark": "SAILINGSTONE"
}
```

`docs-sovereigns/tenant.json` (소버린즈)

```json
{
  "id": "sovereigns",
  "base": "sovereigns",
  "siteTitle": "소버린즈 문서관리 시스템",
  "eyebrow": "Sovereigns",
  "heroLine1": "소버린즈",
  "heroLine2": "문서관리 시스템.",
  "heroDesc": "프로젝트 문서를 한곳에서 최신 버전으로 열람하고 PDF·PPT로 받아가세요.",
  "gateTitle": "소버린즈<br><b>문서관리 시스템</b>",
  "footerMark": "SOVEREIGNS"
}
```

### 3-2. 문서 폴더 만들기

```
docs-sovereigns/
  tenant.json
  categories.json        예: { "proposals": "제안서", "reports": "작업 리포트" }
  order.json             { "docs": [] }  (문서를 넣으면서 채운다)
  proposals/             문서 HTML을 여기에
  reports/
```

`categories.json`의 키가 곧 폴더 이름이다. 필요한 카테고리만 만들면 된다.

### 3-3. 빌드 스크립트를 조직 인자로 받게 고치기

`scripts/build.mjs` 상단의 경로 상수를 인자로 바꾼다.

```js
// 조직 선택: node scripts/build.mjs [조직폴더]   (생략하면 docs)
const TENANT_DIR = process.argv[2] || "docs";
const DOCS = path.join(ROOT, TENANT_DIR);
const tenant = JSON.parse(fs.readFileSync(path.join(DOCS, "tenant.json"), "utf8"));
const SITE = path.join(ROOT, "site", tenant.base);   // base가 ""면 site/
```

`OUT_DOCS` `OUT_DATA` `OUT_VERSIONS`는 `SITE` 기준이라 자동으로 따라간다.
`docs.json`을 쓸 때 `tenant` 값도 함께 넣어 두면 화면에서 제목·문구를 꺼내 쓸 수 있다.

```js
fs.writeFileSync(path.join(OUT_DATA, "docs.json"), JSON.stringify({
  generated: new Date().toISOString(),
  tenant, categories, docs,
}, null, 2));
```

`make-pdfs.mjs` `make-pptx.mjs` `check-overflow.mjs` `audit.mjs`도 같은 방식으로
첫 인자를 받아 `SITE` / `DOCS`를 정하게 고친다.

### 3-4. 포털 화면 만들기

`site/index.html` `viewer.html` `reports.html` `guide.html`을 `site/sovereigns/`로 복사하고
**assets 경로만 상위로** 바꾼다.

```html
<!-- site/sovereigns/index.html -->
<link rel="stylesheet" href="../assets/style.css">
<script src="../assets/gate.js"></script>
<script src="../assets/live.js"></script>
…
<script src="../assets/app.js"></script>
```

제목·문구는 하드코딩하지 말고 `docs.json`의 `tenant`에서 읽어 채운다.
`site/assets/app.js` 맨 앞에 아래를 넣으면 두 포털이 같은 파일을 쓰면서 각자 이름을 갖는다.

```js
const t = data.tenant || {};
if (t.siteTitle) document.title = t.siteTitle;
const set = (sel, html) => { const el = document.querySelector(sel); if (el && html) el.innerHTML = html; };
set(".hero .eyebrow", t.eyebrow);
set(".hero h1", `${t.heroLine1}<br><span class="grad">${t.heroLine2}</span>`);
set(".hero p", t.heroDesc);
```

`data/docs.json` `pdf/…` `pptx/…` 같은 경로는 **상대 경로 그대로** 두면 각 포털의 자기 폴더를 가리킨다.

### 3-5. 게이트(비밀번호) 처리

비밀번호는 **0401로 동일**하다. `site/assets/gate.js`를 그대로 쓰되 두 가지만 본다.

- **세션 키**: 현재 `var KEY = "ss_gate_until"` 하나다. 그대로 두면 한 번 입력으로 두 포털이 함께 열린다.
  같은 회사 사람이 둘 다 보는 상황이면 이 편이 편하다.
  따로 받고 싶으면 `var KEY = "gate_until_" + (location.pathname.split("/")[2] || "root");` 로 바꾼다.
- **잠금 화면 문구**: 62행의 제목이 하드코딩돼 있다. `docs.json`을 읽기 전에 뜨는 화면이라
  간단히 경로로 판단하게 한다.

```js
var isSov = location.pathname.indexOf("/sovereigns/") !== -1;
var title = isSov ? "소버린즈<br><b>문서관리 시스템</b>"
                  : "세일링스톤 <b>세일즈 그룹</b><br>문서 시스템";
```

> 이 게이트는 화면을 가리는 커튼이다. GitHub Pages는 정적 호스팅이라
> 파일 URL을 직접 아는 사람까지 막지는 못한다. **공개해도 되는 문서만 올린다**는 전제는 그대로다.

### 3-6. CI에 조직 하나 더 추가

`.github/workflows/deploy.yml`의 빌드 단계들을 조직별로 두 번 돌린다.

```yaml
      - name: 사이트 데이터 빌드 (세일링스톤)
        run: node scripts/build.mjs docs

      - name: 사이트 데이터 빌드 (소버린즈)
        run: node scripts/build.mjs docs-sovereigns

      - name: 슬라이드 전수검사
        run: |
          node scripts/check-overflow.mjs docs
          node scripts/check-overflow.mjs docs-sovereigns

      - name: PDF 생성
        run: |
          node scripts/make-pdfs.mjs docs
          node scripts/make-pdfs.mjs docs-sovereigns

      - name: PPT 생성
        run: |
          npm install pptxgenjs
          node scripts/make-pptx.mjs docs
          node scripts/make-pptx.mjs docs-sovereigns
```

### 3-7. .gitignore 추가

```
site/sovereigns/data/
site/sovereigns/docs/
site/sovereigns/pdf/
site/sovereigns/pptx/
site/sovereigns/standalone/
```

---

## 4. 확인 절차

로컬에서 순서대로 돌려 본다.

```bash
node scripts/build.mjs docs-sovereigns
node scripts/check-overflow.mjs docs-sovereigns
node scripts/audit.mjs
npx http-server site -p 8787 -c-1
```

- `http://localhost:8787/` — 세일링스톤 포털이 그대로 뜨는지 (기존이 깨지지 않았는지 먼저 확인)
- `http://localhost:8787/sovereigns/` — 소버린즈 포털, 제목·문구가 바뀌었는지
- 비밀번호 0401로 들어가지는지, 문서 보기·HTML·PPT·PDF 버튼이 각자 자기 파일을 받는지
- 뷰어에서 `?doc=…&p=3` 딥링크가 동작하는지

배포 후에는 두 URL을 모두 눌러 보고, **기존 URL이 그대로 살아 있는지**를 반드시 확인한다.

---

## 5. 주의할 점

- **기존 것을 먼저 지킨다.** `build.mjs`를 고칠 때 인자를 생략하면 예전과 똑같이 동작해야 한다
  (`process.argv[2] || "docs"`). 세일링스톤 포털이 깨지면 안 된다.
- **문서 규칙은 공유한다.** 소버린즈 문서도 [AUTHORING.md](AUTHORING.md)를 그대로 따른다
  (16:9 고정 캔버스, SUIT 2종, slate/teal, 표준 표지, PPT 변환 고려).
- **작업 리포트는 `reports` 카테고리**로 만든다. `build.mjs`가 `kind: "report"`로 표시해
  메인 목록에서 빼고 리포트 탭에만 띄운다.
- **문서 안 푸터 문구**(`SAILINGSTONE`)는 문서마다 하드코딩돼 있다. 소버린즈 문서는
  `tenant.json`의 `footerMark` 값으로 직접 적는다.
- **`_source/` 폴더**에 원본 PPTX를 두면 PPT 다운로드가 원본을 그대로 제공한다.
  네이티브 HTML 문서는 도형으로 변환된다.
