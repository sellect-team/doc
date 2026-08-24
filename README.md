# 사내 문서 포털

HTML 슬라이드 문서를 웹에서 열람하고, PDF로 내려받고, 버전 이력을 관리하는 영업용 문서 포털.
MS 계정(Microsoft 365)으로 로그인한 초대된 사용자만 접근할 수 있다.

## 구조

```
docs/                  원본 HTML 문서 (여기에만 문서를 넣는다)
├── categories.json    카테고리 폴더 → 한글 이름 매핑
├── company/           회사소개
├── solutions/         솔루션
└── proposals/         제안서
site/                  웹사이트 (index/viewer/guide + 빌드 산출물)
scripts/build.mjs      문서 스캔 + Git 이력 → site/data/docs.json 생성 (규격 검증 포함)
scripts/validate.mjs   규격 검증기 — 위반 시 빌드 실패
scripts/make-pdfs.mjs  문서별 PDF 생성 (Playwright). 원본 PDF가 있으면 건너뜀
scripts/convert-pptx.ps1  기존 PPTX → 포털 HTML 변환 (PowerPoint 렌더링, 100% 동일)
AUTHORING.md           ★ 문서 작성 지침 (사이트 "작성 지침" 메뉴에 자동 반영)
PROMPT.md              클로드에 복사해 붙여넣는 문서 제작 프롬프트
CONVERSION-GUIDE.md    PPTX 변환 절차 + 원본 디자인 시스템 분석 + 품질 기준
.github/workflows/     push 시 자동 빌드 + PDF + Azure 배포
```

## 일상 워크플로우

**새로 만들 때**
1. Claude에게: "AUTHORING.md 지침대로 ~~ 문서 만들어줘" → `docs/`에 저장됨
2. Claude에게: "빌드하고 커밋, 푸시해줘"
3. 2~3분 뒤 사이트에 자동 반영 (PDF 포함)

**기존 PPT를 올릴 때**
```bash
powershell -File "scripts/convert-pptx.ps1" -Source "C:\경로\원본.pptx" -Category company -Name my-doc -TitlesOnly
```
제목 초안을 다듬은 뒤 `-TitlesOnly` 없이 다시 실행하면 변환된다. 자세한 내용은 CONVERSION-GUIDE.md 참고.

커밋 메시지 형식: `[파일명] v버전 변경 요약` — 사이트의 버전 기록에 그대로 표시된다.

## 로컬 미리보기

```
node scripts/build.mjs
npx http-server site -p 8123 -c-1
```

로컬에서는 로그인 없이 열린다(인증은 Azure에서만 동작). PDF 버튼은 브라우저 인쇄로 대체된다.

## 최초 배포 (1회)

1. **GitHub 비공개 저장소** 생성 후 push
2. **Azure Portal → Static Web App 생성** (무료 플랜)
   - 소스: GitHub 저장소 연결 없이 "기타" 선택 (배포는 우리 워크플로우가 함)
   - 생성 후 **배포 토큰** 복사 → GitHub 저장소 Settings → Secrets → `AZURE_STATIC_WEB_APPS_API_TOKEN` 등록
3. push하면 Actions가 빌드 + PDF + 배포 실행

## 사용자 초대 (접근 제어)

이 사이트는 `employee` 역할이 있는 사용자만 열람할 수 있다 (`site/staticwebapp.config.json`).

- Azure Portal → 해당 Static Web App → **역할 관리(Role management) → 초대(Invite)**
  - 공급자: **Microsoft Entra ID (AAD)**
  - 초대할 이메일: 영업 직원의 M365 계정
  - 역할: `employee`
- 무료 플랜은 초대 사용자 최대 25명. 본인(관리자)도 초대해야 열람 가능.
- 초대되지 않은 계정으로 로그인하면 "접근 권한 필요" 안내 페이지가 뜬다.

## 버전 관리

- **이력**: 커밋 = 변경 이력. 뷰어 왼쪽 하단 "버전 기록"에 문서별로 표시
- **이전 버전 열람**: 버전 기록에서 클릭 (최근 8개 버전까지 사이트에 보관)
- **버전 분기**: 고객사 커스텀은 Git 브랜치로 작업, 사이트에도 올리려면 별도 파일로 저장
