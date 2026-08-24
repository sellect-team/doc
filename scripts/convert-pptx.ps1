<#
.SYNOPSIS
  PPTX를 포털 규격 HTML 문서로 변환한다. PowerPoint 자체 렌더링을 사용해 원본과 100% 동일하게 재현한다.

.EXAMPLE
  # 1단계: 제목 초안 생성 (한 번만)
  .\scripts\convert-pptx.ps1 -Source "C:\...\회사소개서.pptx" -Category company -Name company-intro-2026 -TitlesOnly

  # 2단계: <Name>.titles.txt 를 열어 페이지 제목을 다듬은 뒤 변환 실행
  .\scripts\convert-pptx.ps1 -Source "C:\...\회사소개서.pptx" -Category company -Name company-intro-2026 `
      -DocTitle "세일링스톤 회사소개서" -Description "회사 개요와 솔루션, 활용 사례" -Version "1.0"

.NOTES
  요구사항: PowerPoint 설치(COM), Python + Pillow
  자세한 배경과 판단 기준은 CONVERSION-GUIDE.md 참고
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Source,      # 원본 .pptx 경로
  [Parameter(Mandatory = $true)][string]$Category,    # docs/ 아래 카테고리 폴더명 (company/solutions/proposals…)
  [Parameter(Mandatory = $true)][string]$Name,        # 파일명(확장자 제외), 영문 소문자-하이픈
  [string]$DocTitle = "",
  [string]$Description = "",
  [string]$Version = "1.0",
  [int]$Width = 2560,                                 # 슬라이드 내보내기 해상도
  [int]$Height = 1440,
  [switch]$TitlesOnly                                 # 제목 초안만 만들고 종료
)

$ErrorActionPreference = "Stop"
if ($Name -notmatch '^[a-z0-9][a-z0-9-]*$') {
  throw "Name은 영문 소문자·숫자·하이픈만 사용해야 합니다: '$Name'"
}

$root     = Split-Path -Parent $PSScriptRoot
$docsDir  = Join-Path $root "docs\$Category"
$htmlPath = Join-Path $docsDir "$Name.html"
$pdfPath  = Join-Path $docsDir "$Name.pdf"
$titles   = Join-Path $docsDir "$Name.titles.txt"
$assets   = Join-Path $docsDir "assets\$Name"
$tmp      = Join-Path $env:TEMP "pptx-convert-$Name"
$png      = Join-Path $tmp "png"
$work     = Join-Path $tmp "source.pptx"

if (-not (Test-Path $docsDir)) { throw "카테고리 폴더가 없습니다: $docsDir (docs/categories.json에도 등록하세요)" }
New-Item -ItemType Directory -Force -Path $png | Out-Null

# OneDrive 동기화·잠금을 피하려고 작업 사본으로 처리한다
Copy-Item -LiteralPath $Source -Destination $work -Force
Write-Host "원본 복사: $work"

# 제목 초안만 필요한 경우
if ($TitlesOnly) {
  py (Join-Path $PSScriptRoot "pptx_build.py") titles $work $titles
  Write-Host "`n$titles 를 열어 페이지 제목을 다듬은 뒤 -TitlesOnly 없이 다시 실행하세요." -ForegroundColor Yellow
  exit 0
}
if (-not (Test-Path $titles)) {
  py (Join-Path $PSScriptRoot "pptx_build.py") titles $work $titles
  Write-Host "제목 파일이 없어 자동 생성했습니다. 필요하면 다듬고 다시 실행하세요: $titles" -ForegroundColor Yellow
}

# ── PowerPoint COM: 슬라이드별 PNG + 원본 PDF 내보내기 ──
Get-ChildItem $png -Filter *.png -ErrorAction SilentlyContinue | Remove-Item -Force -Confirm:$false
$ppt = New-Object -ComObject PowerPoint.Application
try {
  # ReadOnly=-1, Untitled=0, WithWindow=0
  $pres = $ppt.Presentations.Open($work, -1, 0, 0)
  $count = $pres.Slides.Count
  Write-Host "슬라이드 $count 장, 원본 크기 $($pres.PageSetup.SlideWidth) x $($pres.PageSetup.SlideHeight) pt"

  # 텍스트가 선택 가능한 원본 PDF — 포털의 PDF 다운로드에 그대로 쓰인다
  if (Test-Path $pdfPath) { Remove-Item $pdfPath -Force -Confirm:$false }
  $pres.SaveCopyAs($pdfPath, 32)   # 32 = ppSaveAsPDF
  Write-Host "PDF 저장: $pdfPath"

  for ($i = 1; $i -le $count; $i++) {
    $pres.Slides.Item($i).Export((Join-Path $png ("slide-{0:d2}.png" -f $i)), "PNG", $Width, $Height)
  }
  Write-Host "PNG $count 장 내보내기 완료 (${Width}x${Height})"
  $pres.Close()
}
finally {
  $ppt.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
  [GC]::Collect()
}

# ── WebP 변환 + HTML 생성 ──
if (-not $DocTitle) { $DocTitle = $Name }
py (Join-Path $PSScriptRoot "pptx_build.py") build `
  --png $png --assets $assets --html $htmlPath --rel "assets/$Name" `
  --titles $titles --title $DocTitle --desc $Description --version $Version `
  --source (Split-Path -Leaf $Source)

Remove-Item $tmp -Recurse -Force -Confirm:$false
Write-Host "`n변환 완료. 이어서 실행하세요:" -ForegroundColor Green
Write-Host "  node scripts/build.mjs" -ForegroundColor Green
