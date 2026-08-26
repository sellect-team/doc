"""PPTX → 포털 HTML 변환 도우미.

convert-pptx.ps1 이 호출한다. 두 개의 서브커맨드:

  titles  <source.pptx> <out.txt>
      슬라이드별 제목 후보를 추출해 텍스트 파일로 저장한다 (사람이 다듬어 쓰는 초안).

  build   --png <dir> --assets <dir> --html <file> --rel <경로> --titles <file>
          --title <문서제목> --desc <설명> --version <1.0>
      PNG를 WebP로 변환하고 포털 규격 HTML을 생성한다.
"""
import argparse
import html as htmlmod
import pathlib
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
P = "{http://schemas.openxmlformats.org/presentationml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"

WEBP_QUALITY = 88


def slide_parts(z):
    """<p:sldIdLst> 순서대로 슬라이드 XML 경로를 돌려준다."""
    rels = ET.fromstring(z.read("ppt/_rels/presentation.xml.rels"))
    rid = {r.get("Id"): r.get("Target") for r in rels}
    pres = ET.fromstring(z.read("ppt/presentation.xml"))
    out = []
    for sid in pres.find(f"{P}sldIdLst"):
        t = rid[sid.get(f"{R}id")]
        t = t[3:] if t.startswith("../") else t
        out.append(t if t.startswith("ppt/") else "ppt/" + t)
    return out


def cmd_titles(src, out):
    """각 슬라이드의 첫 번째 의미 있는 텍스트를 제목 후보로 뽑는다."""
    z = zipfile.ZipFile(src)
    lines = []
    for i, part in enumerate(slide_parts(z), 1):
        root = ET.fromstring(z.read(part))
        cand = ""
        for para in root.iter(f"{A}p"):
            text = "".join(t.text or "" for t in para.iter(f"{A}t")).strip()
            # 섹션 머리표(01 · Who We Are)나 숫자만 있는 줄은 건너뛴다
            if not text or re.fullmatch(r"[\d\s.·|-]+", text):
                continue
            cand = text
            break
        lines.append(f"{cand[:60]}" if cand else f"페이지 {i}")
    pathlib.Path(out).write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"제목 초안 {len(lines)}줄 저장: {out}")


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>{title}</title>
  <meta name="doc-version" content="{version}">
  <meta name="doc-description" content="{desc}">
  <meta name="doc-source" content="{source}">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    /* 16:9 고정 캔버스 - 창 크기가 변해도 전체가 같은 비율로 확대·축소된다 */
    html {{ font-size: min(1.25vw, 2.2222vh); }}
    body {{
      font-family: "Pretendard", -apple-system, "Segoe UI", "Malgun Gothic", sans-serif;
      background: #ffffff; color: #1d1d1f;
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 100vh;
    }}
    /* 원본 슬라이드를 그대로 담는 컨테이너 - 항상 16:9 */
    .slide {{
      width: min(100vw, 177.7778vh); height: min(56.25vw, 100vh);
      overflow: hidden; position: relative; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      background: #ffffff;
    }}
    .slide img {{
      width: 100%; height: 100%; object-fit: contain; display: block;
    }}
    @media print {{
      .slide img {{ width: 100%; height: 100%; object-fit: contain; }}
    }}
  </style>
</head>
<body>
{sections}
</body>
</html>
"""

# 앞 2장은 즉시, 나머지는 지연 로딩한다. 뷰어가 이동할 때 앞뒤 슬라이드를
# eager로 승격시켜 미리 받으므로, 큰 문서도 초기 로딩이 2장분으로 끝난다.
EAGER_SLIDES = 2

SECTION_TEMPLATE = (
    '  <section class="slide" data-title="{title}">\n'
    '    <img src="{rel}/{file}" alt="{alt}" decoding="async"{loading}>\n'
    "  </section>"
)


def cmd_build(a):
    from PIL import Image

    png_dir = pathlib.Path(a.png)
    assets = pathlib.Path(a.assets)
    assets.mkdir(parents=True, exist_ok=True)

    if a.skip_images:
        # 이미 만들어진 WebP를 그대로 쓴다 (HTML만 재생성)
        pngs = sorted(assets.glob("*.webp"))
        if not pngs:
            sys.exit(f"WebP가 없습니다: {assets}")
    else:
        for old in assets.glob("*.webp"):
            old.unlink()
        pngs = sorted(png_dir.glob("*.png"))
        if not pngs:
            sys.exit(f"PNG이 없습니다: {png_dir}")

    titles = []
    tf = pathlib.Path(a.titles)
    if tf.exists():
        titles = [ln.strip() for ln in tf.read_text(encoding="utf-8").splitlines()]

    total = 0
    sections = []
    for i, p in enumerate(pngs):
        out = assets / (p.stem + ".webp")
        if not a.skip_images:
            Image.open(p).convert("RGB").save(out, "WEBP", quality=WEBP_QUALITY, method=6)
        elif not out.exists():
            sys.exit(f"--skip-images 인데 WebP가 없습니다: {out}")
        total += out.stat().st_size

        title = titles[i] if i < len(titles) and titles[i] else f"페이지 {i + 1}"
        esc = htmlmod.escape(title, quote=True)
        sections.append(
            SECTION_TEMPLATE.format(
                title=esc, rel=a.rel, file=out.name, alt=esc,
                loading="" if i < EAGER_SLIDES else ' loading="lazy"',
            )
        )

    doc = HTML_TEMPLATE.format(
        title=htmlmod.escape(a.title, quote=True),
        version=htmlmod.escape(a.version, quote=True),
        desc=htmlmod.escape(a.desc, quote=True),
        source=htmlmod.escape(a.source, quote=True),
        sections="\n".join(sections),
    )
    pathlib.Path(a.html).write_text(doc, encoding="utf-8")
    print(f"WebP {len(pngs)}장 ({total / 1024 / 1024:.1f} MB) → {assets}")
    print(f"HTML 생성: {a.html}")


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)

    t = sub.add_parser("titles")
    t.add_argument("source")
    t.add_argument("out")

    b = sub.add_parser("build")
    for flag in ("png", "assets", "html", "rel", "titles", "title", "desc", "version", "source"):
        b.add_argument(f"--{flag}", required=True)
    # 이미지는 그대로 두고 HTML만 다시 만든다 (템플릿이 바뀌었을 때)
    b.add_argument("--skip-images", action="store_true")

    args = ap.parse_args()
    if args.cmd == "titles":
        cmd_titles(args.source, args.out)
    else:
        cmd_build(args)


if __name__ == "__main__":
    main()
