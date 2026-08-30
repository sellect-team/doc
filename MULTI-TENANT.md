# 하위 URL로 다른 조직 문서 시스템 운영하기

같은 저장소·같은 코드로 **조직마다 별도 문서 포털**을 하위 URL에 올린다.
첫 적용 대상은 **소버린즈 문서관리 시스템**(`/doc/sovereigns/`)이고, 2026-08-28에 실제로 붙였다.

```
https://sellect-team.github.io/doc/              세일링스톤 세일즈 그룹 문서 시스템
https://sellect-team.github.io/doc/sovereigns/   소버린즈 문서관리 시스템
```

문서 **규격**([AUTHORING.md](AUTHORING.md))·변환 파이프라인·PDF/PPT 생성은 그대로 공유한다.
조직마다 다른 것은 **문서 폴더 · 표시 문구 · 디자인 테마** 셋뿐이다.
소버린즈 문서의 디자인 기준은 [SOVEREIGNS-DESIGN.md](SOVEREIGNS-DESIGN.md)에 따로 있다.

---

## 1. 폴더 구조

```
docs/                      세일링스톤 문서 (기존)
  tenant.json              조직 설정
docs-sovereigns/           소버린즈 문서
  tenant.json  categories.json  order.json
  company/  proposals/  reports/
  _template/               문서 템플릿 (_로 시작해 빌드가 건너뜀)
site/                      세일링스톤 포털 (화면 HTML 원본 + 공용 assets)
  assets/theme-sovereigns.css   조직 테마 (토큰만 덮어씀)
site/sovereigns/           소버린즈 포털 - 빌드가 통째로 생성. git에 넣지 않는다
```

`site/sovereigns/`의 `index/viewer/reports/guide.html`은 **빌드가 상위 `site/*.html`을 읽어 만든다.**
`assets/` 경로만 `../assets/`로 바꾸고, 제목·테마 링크·웹폰트·잠금 화면 정보를 끼워 넣는다.
따라서 화면 코드(JS·CSS)는 한 벌만 유지되고, 상위 화면을 고치면 두 포털에 함께 반영된다.

## 2. 조직 설정 - tenant.json

`docs-<조직>/tenant.json`이 그 조직의 모든 표시 문구를 갖는다.

| 키 | 뜻 |
| --- | --- |
| `id` | 조직 식별자 |
| `base` | 하위 URL 경로. 빈 문자열이면 최상위(`site/`) |
| `siteTitle` `eyebrow` `heroLine1` `heroLine2` `heroDesc` | 목록 화면 문구 |
| `gateTitle` `footerMark` | 잠금 화면 제목과 하단 마크 |
| `theme` | `site/assets/theme-<값>.css`를 추가로 불러온다 (없으면 생략) |
| `accent` `gateBg` | 잠금 화면 강조색·배경색 |
| `fontLinks` | `<head>`에 추가할 웹폰트 링크 배열 |
| `brandFont` `weightBold` | 검증기(validate.mjs)의 폰트·굵기 경고 기준 |

빌드는 이 값을 `data/docs.json`의 `tenant`에도 넣고, `app.js`가 목록 화면 제목·히어로 문구를 여기서 채운다.

## 3. 명령 - `--tenant` 인자

모든 스크립트가 `--tenant <폴더>`를 받는다. **생략하면 예전과 똑같이** `docs/` + `site/`로 동작한다.

```bash
node scripts/build.mjs           --tenant docs-sovereigns
node scripts/check-overflow.mjs  --tenant docs-sovereigns
node scripts/make-pdfs.mjs       --tenant docs-sovereigns
node scripts/make-pptx.mjs       --tenant docs-sovereigns
node scripts/audit.mjs           --tenant docs-sovereigns
```

`package.json`에 단축 명령도 있다: `npm run build:sov` `check:sov` `pdf:sov` `pptx:sov`.

문서 경로는 두 가지로 나뉜다. `docs.json`의 `file`은 **포털 기준**(`docs/<카테고리>/<파일>`)이고,
`src`는 **저장소 기준**(`docs-sovereigns/<카테고리>/<파일>`)이다. git 이력 조회와 원본 PPTX 탐색은 `src`를 쓴다.

## 4. 게이트(비밀번호)

비밀번호와 세션은 **조직마다 따로**다. `tenant.json`의 `gatePw`(문자 코드 배열)와 `gateKey`(세션 키)를
빌드가 `window.__TENANT`로 심어 주고 `gate.js`가 읽어 쓴다. 값이 없으면 기존 세일링스톤 설정을 그대로 쓴다.
한쪽 포털을 열어도 다른 포털은 다시 입력해야 한다. 잠금 화면 문구·색도 같은 방식으로 조직별로 바뀐다.

> 이 게이트는 화면을 가리는 커튼이다. GitHub Pages는 정적 호스팅이라 파일 URL을 직접 아는 사람까지
> 막지 못한다. **공개해도 되는 문서만 올린다**는 전제는 그대로다.

## 5. 배포

`.github/workflows/deploy.yml`이 빌드·전수검사·PDF·PPT 단계를 조직마다 한 번씩 돌린 뒤 `site/`를 통째로 올린다.
조직을 하나 더 붙일 때는 문서 폴더와 `tenant.json`을 만들고, 워크플로 각 단계에 `--tenant` 줄을 하나씩 추가하면 된다.
`.gitignore`에 그 조직의 산출물 폴더(`site/<base>/`)도 추가한다.

## 6. 확인 절차

```bash
node scripts/build.mjs
node scripts/build.mjs --tenant docs-sovereigns
node scripts/check-overflow.mjs --tenant docs-sovereigns
npx http-server site -p 8787 -c-1
```

- `http://localhost:8787/` - 세일링스톤 포털이 그대로인지 **먼저** 확인
- `http://localhost:8787/sovereigns/` - 제목·문구·테마가 바뀌었는지
- 비밀번호 0401 입장, 문서 보기·HTML·PPT·PDF 버튼이 각자 자기 파일을 받는지
- 뷰어 딥링크 `?doc=…&p=3` 동작 여부

## 7. 주의할 점

- **기존 것을 먼저 지킨다.** 인자를 생략했을 때의 동작이 예전과 같아야 한다.
- **문서 규칙은 공유, 디자인은 분리.** 소버린즈 문서는 SUIT·slate/teal 대신 [SOVEREIGNS-DESIGN.md](SOVEREIGNS-DESIGN.md)를 따른다.
- 문서 안 푸터 마크(`SOVEREIGNS`)는 문서마다 하드코딩한다. `tenant.json`의 `footerMark`와 맞춘다.
- 작업 리포트는 `reports` 카테고리에 두면 메인 목록에서 빠지고 리포트 탭에만 뜬다.
- `_source/` 폴더에 원본 PPTX를 두면 PPT 다운로드가 원본을 그대로 제공한다.
