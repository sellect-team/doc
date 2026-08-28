# 소버린즈 문서 디자인 기준

소버린즈(`docs-sovereigns/`) 문서에만 적용하는 기준이다. 문서 **규격**(16:9 고정 캔버스, 메타 태그,
파일명 규칙, 자체 완결)은 [AUTHORING.md](AUTHORING.md)를 그대로 따르고, **디자인**만 이 문서가 대신한다.
세일링스톤 문서의 SUIT·slate/teal 시스템은 소버린즈 문서에 쓰지 않는다.

기준 출처: Cake Equity(cakeequity.com) 분석본. 시안 원본은 사용자가 제공한 `sovereigns-cake.html`,
토큰 정의는 `sovereigns-tokens.css`.

시작할 때는 [`docs-sovereigns/_template/document-template.html`](docs-sovereigns/_template/document-template.html)을
복사해서 쓴다. 표지 · 전환 · 본문 · 데이터(다크) · 맺음 5종이 들어 있다.

---

## 1. 색

| 이름 | 값 | 쓰는 곳 |
| --- | --- | --- |
| 일렉트릭 바이올렛 | `#4823FF` | 채움 버튼·강조·아이브로우. **유일한 채움색** |
| 볼티지 | `#7E78FF` | 호버, 보조 계열 |
| 아이리스 | `#6D67FB` | 3계열 데이터 |
| 라일락 워시 | `#EDE9FF` | 전환 슬라이드 배경, 보조 카드, 태그 |
| 페리윙클 | `#D9D2FF` | 카드 테두리 1px |
| 본 캔버스 | `#FAFAF8` | 슬라이드 바탕 |
| 페이퍼 | `#FFFFFF` | 카드 바탕 |
| 미드나잇 | `#1E1B22` | 데이터 슬라이드 배경 (덱당 1장) |
| 옵시디언 잉크 | `#18161A` | 본문 글자 |
| 슬레이트 | `#898B91` | 보조 텍스트·캡션 |
| 샤르트뢰즈 | `#E7FF6E` | 다크 슬라이드 안의 강조만 |

## 2. 폰트

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
```

- 디스플레이(제목): `'Plus Jakarta Sans','Pretendard Variable',Pretendard` · 가중치 **800**
- 본문·UI: `'Inter','Pretendard Variable',Pretendard`
- **스택 순서를 바꾸지 말 것.** 두 원본 폰트에 한글 글리프가 없어서, 폴백이 글리프 단위로 동작하는 덕에
  영문·숫자는 원본 폰트가, 한글은 Pretendard가 렌더된다. 순서를 바꾸면 영문까지 Pretendard로 떨어진다.
- 한글이 라틴보다 작아 보이므로 디스플레이 가중치는 원본 700 대신 **800**을 쓴다.
- 소버린즈는 굵기용 별도 패밀리가 없으므로 `font-weight`로 굵게 하는 것이 정상이다
  (`docs-sovereigns/tenant.json`의 `weightBold: true`가 검증기 경고를 끈다).

## 3. 슬라이드 마스터 5종

| 종류 | 배경 | 쓰는 곳 |
| --- | --- | --- |
| 표지 `.cover` | 본 캔버스 | 좌측 대형 카피 + 우측 요약 카드 2단 |
| 전환 `.tint .part` | 라일락 워시 | 파트 구분. 번호 + 한 줄 결론 |
| 본문 (기본) | 본 캔버스 | 머리말(아이브로우·제목·리드) → 카드 그리드 → 꼬리말 |
| 데이터 `.dark` | 미드나잇 | 숫자·수집 항목. **덱당 한 장만** |
| 맺음 `.end` | 본 캔버스 | 마지막 문장 + 회사 정보 |

본문 골격은 `.s-head`(eyebrow + `h2.title` + `.lead`) → `.body`(`.grid.g2/g3/g4`) → `.s-foot`이다.
리드문은 결론을 먼저 쓰고 핵심 구절만 `<b>`로 감싸 바이올렛 처리한다.

## 3-1. 문체와 페이지 형식

문서는 **국내 컨설팅 제안서의 문체**를 따른다. 마케팅 카피처럼 읽히는 표현은 쓰지 않는다.

- 제목은 **명사형**으로 끝낸다. "요구사항 구성과 단계 구분" (o) / "카트가 아니라 운영을 관제합니다" (x)
- 리드문은 **한 문장, 결론 먼저, 합니다체**. 핵심 구절만 `<b>`로 감싸 바이올렛 강조한다.
- 단정할 수 없는 값은 "(안)", "협의 후 확정"으로 표기한다. 추정치를 확정처럼 쓰지 않는다.
- 나열은 `·` 가운뎃점으로 잇고, 긴 줄표(—)는 쓰지 않는다.

페이지 구성 요소는 아래로 고정한다.

| 요소 | 규칙 |
| --- | --- |
| 아이브로우 | 본문 페이지는 `01. 과제 이해`처럼 **파트 번호 + 파트명**. 화면 정의서는 `SCR-010 · 대시보드`처럼 ID + 메뉴 |
| 제목 `h2.title` | 명사형, 한 줄 |
| 리드 `p.lead` | 한 문장. 목차 · 간지 · 맺음 페이지는 생략 가능 |
| 꼬리말 `.s-foot` | 좌측은 출처 · 대상 · 주석, 우측은 `SOVEREIGNS · 07` 형식의 페이지 번호 |
| 페이지 번호 | 표지 · 파트 간지 · 맺음에는 넣지 않는다 |
| 파트 간지 | `PART 01` + 파트명(명사형) + 한 문장 + `.part-list` 칩으로 그 파트의 내용 나열 |

## 3-2. 확장 구성 요소

제안서에서 검증된 구성 요소다. 같은 상황이면 새로 만들지 말고 이 패턴을 복사한다.
(마크업은 `docs-sovereigns/proposals/lsv-tms-proposal.html`에서 클래스명으로 찾는다.)

| 클래스 | 쓰임 |
| --- | --- |
| `.part .ghost` | 간지 우측 하단의 대형 파트 번호. 페리윙클, 반투명, `data-bleed`로 의도적 블리드 표시 |
| `.part-nav` | 간지 우상단의 파트 진행 표시(01~05 알약, 현재만 바이올렛 채움) |
| `.ratio` | 표 안의 1단계/2단계 비율 막대. `.p1` 바이올렛 = 이번 구축, `.p2` 페리윙클 = 확장. `.legend`와 함께 사용 |
| `.ba` | 현재 / 구축 후 대비 표. 3열 그리드, 구축 후 열만 라일락 틴트 |
| `.seq` | 착수 순서 등 짧은 순서 나열(알약 + 화살표) |
| `.lanes` | 역할 스윔레인(액션 플로우 문서). 행 = 역할, 칸 = 단계, `.hold`는 대기 |
| `.wf` / `.def` | 화면정의서의 와이어프레임 + 정의 블록 2단 구성 |

슬라이드 밖으로 의도적으로 내보내는 장식은 반드시 `data-bleed`를 붙인다.
check-overflow.mjs가 이 표시가 없는 이탈을 전부 결함으로 잡는다.

## 4. 형태

- 카드 라운드 **20px**(`1.25rem`), 버튼·태그는 알약(999px). 사각 버튼 금지.
- 카드는 그림자 대신 **1px 페리윙클 테두리**. `box-shadow` 금지.
- 테두리는 사방 균일 1px. 한쪽 모서리에 굵은 컬러 바 금지.
- 본 캔버스 위에 테두리 없는 흰 카드 금지 (명도가 가까워 경계가 사라진다).
- 제목 옆 번호 원형 배지·아이콘 타일 같은 장식 금지. 위계는 내용이 만든다.
- 아이브로우는 대문자 + 자간 0.05em + 가중치 700.
- 디스플레이 아래 서브카피는 가중치 300. 무겁게 외치고 가늘게 속삭이는 대비가 이 시스템의 핵심이다.
- 한글 줄바꿈이 어색해지므로 `body`에 `word-break: keep-all`을 넣는다.

## 5. 하지 말 것

- 채움 버튼에 바이올렛 외의 색 쓰기
- 샤르트뢰즈를 본문·아이콘·큰 면에 쓰기 (다크 슬라이드 안 강조 전용)
- 미드나잇 슬라이드 2장 이상
- 카드에 그림자, 도형에 그라디언트 (PPT 변환에서도 사라진다)
- 긴 줄표(—) 사용. 항상 하이픈(-)을 쓴다.

## 6. PowerPoint 테마 색 슬롯

디자인 → 색 → 사용자 지정에 그대로 입력한다.

| 슬롯 | 색 | 쓰이는 곳 |
| --- | --- | --- |
| 어둡게 1 | `#18161A` | 본문 글자 |
| 밝게 1 | `#FAFAF8` | 슬라이드 바탕 |
| 어둡게 2 | `#1E1B22` | 데이터 슬라이드 배경 |
| 밝게 2 | `#EDE9FF` | 전환 슬라이드·표 바탕 |
| 강조 1 | `#4823FF` | 버튼·차트 1계열 |
| 강조 2 | `#7E78FF` | 차트 2계열 |
| 강조 3 | `#99CEFE` | 차트 3계열 |
| 강조 4 | `#E7FF6E` | 다크 슬라이드 위 강조 막대 |
| 강조 5·6 | `#D9D2FF` · `#898B91` | 테두리 · 보조 텍스트 |
| 하이퍼링크 | `#4823FF` | 링크 |

## 7. 빌드

```bash
node scripts/build.mjs --tenant docs-sovereigns          # 빌드(규격 검증 포함)
node scripts/check-overflow.mjs --tenant docs-sovereigns # 영역 이탈·잘림·꼬리말 겹침
node scripts/check-docs.mjs --tenant docs-sovereigns     # 형식·문체·용어·화면 ID 교차 검증
node scripts/shots.mjs --tenant docs-sovereigns          # 페이지별 PNG 캡처(눈으로 검토)
```

`check-docs.mjs`는 이 문서 3-1절의 규칙을 그대로 검사한다. 머리말 3요소, 페이지 번호 순서,
제목의 명사형 종결, 리드문 한 문장·합니다체, 금지 표기(긴 줄표·이모지), 역할명 표기,
문서 사이의 화면 ID 일치를 본다. 조직 규격을 따르는 문서에만 적용되도록
`tenant.json`의 `docFormat: "strict"`로 켠다.

포털은 `http://localhost:8787/sovereigns/`, 배포는 `https://sellect-team.github.io/doc/sovereigns/`.
자세한 조직 분리 구조는 [MULTI-TENANT.md](MULTI-TENANT.md)에 있다.
