<#
.SYNOPSIS
  변환된 PPTX를 PowerPoint로 열어 점검한다.
  · 슬라이드 밖으로 나간 개체
  · 텍스트 상자보다 글자가 커서 잘리는 곳
  · 글꼴이 SUIT 계열이 아닌 곳 (대체 글꼴로 떨어진 경우)
  · 빈 텍스트 상자

.EXAMPLE
  powershell -File scripts\pptx-audit.ps1
  powershell -File scripts\pptx-audit.ps1 -Path "site\pptx\proposals--proposal-template.pptx"
#>
[CmdletBinding()]
param([string]$Path = "")

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$files = if ($Path) { @(Get-Item (Join-Path $root $Path)) } else { Get-ChildItem (Join-Path $root "site\pptx\*.pptx") }

$ppt = New-Object -ComObject PowerPoint.Application
$total = 0

foreach ($f in $files) {
  $issues = @()
  try { $pres = $ppt.Presentations.Open($f.FullName, $true, $false, $false) }
  catch { Write-Host "$($f.Name): 열기 실패 - $($_.Exception.Message)" -ForegroundColor Red; $total++; continue }

  $W = $pres.PageSetup.SlideWidth
  $H = $pres.PageSetup.SlideHeight

  for ($i = 1; $i -le $pres.Slides.Count; $i++) {
    $sl = $pres.Slides.Item($i)
    foreach ($sh in $sl.Shapes) {
      $nm = if ($sh.HasTextFrame -and $sh.TextFrame.HasText) {
              $t = $sh.TextFrame.TextRange.Text -replace '\s+', ' '
              '"' + $t.Substring(0, [Math]::Min(24, $t.Length)) + '"'
            } else { "Type$($sh.Type)" }

      # 1) 슬라이드 밖으로 나간 개체 (1pt 이상)
      $over = [Math]::Max([Math]::Max(-$sh.Left, -$sh.Top),
              [Math]::Max(($sh.Left + $sh.Width) - $W, ($sh.Top + $sh.Height) - $H))
      if ($over -gt 1) { $issues += "p$i [이탈] {0:N0}pt 밖으로 $nm" -f $over }

      if (-not $sh.HasTextFrame) { continue }
      $tf = $sh.TextFrame
      if (-not $tf.HasText) {
        if ($sh.Type -eq 17) { $issues += "p$i [빈상자] 글자 없는 텍스트 상자" }
        continue
      }

      # 2) 글꼴 확인 (SUIT 계열이 아니면 대체 글꼴로 떨어진 것)
      $face = $tf.TextRange.Font.Name
      if ($face -and $face -notmatch '^SUIT') {
        $issues += "p$i [글꼴] '$face' 사용 $nm"
      }

      # 3) 글자가 상자보다 큰지 (상자에 맞추면 얼마나 커지는지로 판정)
      $w0 = $sh.Width; $h0 = $sh.Height
      try {
        $tf.AutoSize = 1                     # 글자에 맞춰 상자를 늘려본다
        $needW = $sh.Width; $needH = $sh.Height
        $tf.AutoSize = 0
        $sh.Width = $w0; $sh.Height = $h0
        if ($needW - $w0 -gt 2) { $issues += "p$i [잘림] 가로 {0:N0}pt 넘침 $nm" -f ($needW - $w0) }
        if ($needH - $h0 -gt 2) { $issues += "p$i [잘림] 세로 {0:N0}pt 넘침 $nm" -f ($needH - $h0) }
      } catch { }
    }
  }
  $pres.Close()

  if ($issues.Count -eq 0) {
    Write-Host "$($f.Name): 이상 없음" -ForegroundColor Green
  } else {
    Write-Host "$($f.Name): $($issues.Count)건" -ForegroundColor Yellow
    $issues | Group-Object { ($_ -split '\]')[0] + ']' } | ForEach-Object {
      $_.Group | Select-Object -First 6 | ForEach-Object { "  $_" }
      if ($_.Count -gt 6) { "  … 같은 유형 $($_.Count - 6)건 더" }
    }
    $total += $issues.Count
  }
}

$ppt.Quit()
[System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null
[GC]::Collect()
Write-Host ""
Write-Host "합계 $total 건"
