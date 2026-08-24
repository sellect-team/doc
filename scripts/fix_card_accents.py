"""카드 왼쪽 '번지는 그라데이션 액센트'를 얇은 단색 선으로 바꾼다.

원본 PPT는 카드 배경 전체에 그라데이션을 깔고 왼쪽만 색이 남도록 만들었다.
그 결과 색 번짐이 카드 폭의 5% 이상을 차지해 시각적으로 과하다.
이 스크립트는 해당 패턴만 골라 '지정한 두께의 단색 막대 + 즉시 배경색'으로 바꾼다.

대상 판별 (배경 글로우·진행 바 등 다른 그라데이션은 건드리지 않는다):
  - 가로 선형 그라데이션(lin ang=10800000)
  - 첫 정지점이 pos=0 이고
  - 마지막 정지점의 색(=배경색)이 pos<=3000 지점에서 이미 시작하며
  - pos=0 의 색이 배경색과 다르다

사용법:
  py scripts/fix_card_accents.py 원본.pptx 결과.pptx [--bar-pt 3] [--dry-run]
"""
import argparse
import pathlib
import re
import shutil
import sys
import zipfile

EMU_PER_PT = 12700.0
MAX_TRANSITION = 3000      # 배경색이 이 위치 이전에 시작해야 '액센트 바'로 본다
MAX_BAR_RATIO = 0.06       # 아주 좁은 도형에서 막대가 과해지지 않도록 상한

SP_RE = re.compile(r"<p:sp>.*?</p:sp>", re.S)
EXT_RE = re.compile(r'<a:ext cx="(\d+)" cy="(\d+)"\s*/>')
GRAD_RE = re.compile(r"<a:gradFill[^>]*>.*?</a:gradFill>", re.S)
GS_RE = re.compile(r'<a:gs pos="(\d+)">(.*?)</a:gs>', re.S)
LIN_RE = re.compile(r'<a:lin ang="10800000"')


def parse_stops(grad):
    """[(pos, 색 XML 문자열)] 을 pos 순으로 돌려준다."""
    return sorted(((int(p), c) for p, c in GS_RE.findall(grad)), key=lambda s: s[0])


def is_card_accent(grad):
    if not LIN_RE.search(grad):
        return False
    stops = parse_stops(grad)
    if len(stops) < 3 or stops[0][0] != 0:
        return False
    bg = stops[-1][1]
    if stops[0][1] == bg:
        return False                       # 단색 채움 — 액센트가 아니다
    first_bg = next((p for p, c in stops if c == bg), None)
    return first_bg is not None and 0 < first_bg <= MAX_TRANSITION


def rebuild(grad, width_pt, bar_pt):
    """액센트 색을 bar_pt 두께의 단색으로 유지한 뒤 배경색으로 즉시 전환한다."""
    stops = parse_stops(grad)
    accent = stops[0][1]
    bg = stops[-1][1]
    ratio = min(bar_pt / width_pt, MAX_BAR_RATIO) if width_pt > 0 else 0.012
    end = max(200, int(round(ratio * 100000)))
    gs = (
        f'<a:gs pos="0">{accent}</a:gs>'
        f'<a:gs pos="{end}">{accent}</a:gs>'
        f'<a:gs pos="{end + 1}">{bg}</a:gs>'
        f'<a:gs pos="100000">{bg}</a:gs>'
    )
    return re.sub(r"<a:gsLst>.*?</a:gsLst>", f"<a:gsLst>{gs}</a:gsLst>", grad, flags=re.S)


def process_slide(xml, bar_pt, report, slide_name):
    def fix_sp(m):
        sp = m.group(0)
        grad_m = GRAD_RE.search(sp)
        if not grad_m or not is_card_accent(grad_m.group(0)):
            return sp
        ext_m = EXT_RE.search(sp)
        width_pt = int(ext_m.group(1)) / EMU_PER_PT if ext_m else 0
        new_grad = rebuild(grad_m.group(0), width_pt, bar_pt)
        report.append(f"  {slide_name}: 폭 {width_pt:6.1f}pt 카드 → {bar_pt}pt 단색 액센트")
        return sp[: grad_m.start()] + new_grad + sp[grad_m.end():]

    return SP_RE.sub(fix_sp, xml)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("source")
    ap.add_argument("out")
    ap.add_argument("--bar-pt", type=float, default=3.0)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()

    src = pathlib.Path(a.source)
    zin = zipfile.ZipFile(src)
    report = []
    changed = {}

    for name in zin.namelist():
        if not re.match(r"ppt/slides/slide\d+\.xml$", name):
            continue
        xml = zin.read(name).decode("utf-8")
        new = process_slide(xml, a.bar_pt, report, name.split("/")[-1].replace(".xml", ""))
        if new != xml:
            changed[name] = new.encode("utf-8")

    print("\n".join(report) if report else "대상 없음")
    print(f"\n총 {len(report)}개 도형 / {len(changed)}개 슬라이드 수정")

    if a.dry_run:
        print("(dry-run — 파일을 쓰지 않음)")
        return
    if not changed:
        sys.exit("바꿀 대상이 없어 종료합니다.")

    out = pathlib.Path(a.out)
    if src.resolve() != out.resolve():
        shutil.copyfile(src, out)
    # 원본 압축 항목을 순서대로 다시 쓰되 수정된 슬라이드만 교체한다
    tmp = out.with_suffix(".tmp.pptx")
    with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            data = changed.get(item.filename) or zin.read(item.filename)
            zout.writestr(item, data)
    zin.close()
    tmp.replace(out)
    print(f"저장: {out}")


if __name__ == "__main__":
    main()
