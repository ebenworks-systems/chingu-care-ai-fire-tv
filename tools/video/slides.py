#!/usr/bin/env python3
"""Draws the film's closing stills at 1920x1080 on the light canvas.

    python3 tools/video/slides.py BEFORE_PARENT.png BEFORE_FAMILY.png TV_HOME.png

BEFORE_* are screenshots of the Chingu Care AI phone apps as they were before the
hackathon; TV_HOME is a screenshot of the new TV app. Output: tools/video/work/slides/.
"""
import io
import os
import subprocess
import sys
from pathlib import Path

import cairosvg
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "tools" / "video" / "work" / "slides"
FONTS = ROOT / "hub" / "media" / "fonts"
W, H = 1920, 1080
CANVAS, PAPER, NAVY, INK, MUTED, PERSIMMON, CELADON, CREAM, CELADON_SOFT = (
    "#FAF5EE", "#FFFFFF", "#1C3D52", "#24333D", "#5E6B72", "#C4613A", "#2B7A6B", "#F5E6D3", "#D5EAE4")


def font(name: str, size: int):
    return ImageFont.truetype(str(FONTS / name), size)


SERIF = lambda s: font("Fraunces_500Medium.ttf", s)  # noqa: E731
SANS = lambda s: font("Pretendard-Regular.otf", s)  # noqa: E731
SEMI = lambda s: font("Pretendard-SemiBold.otf", s)  # noqa: E731
BOLD = lambda s: font("Pretendard-Bold.otf", s)  # noqa: E731


def mark(px: int) -> Image.Image:
    svg = (ROOT / "hub" / "media" / "ripple.svg").read_bytes()
    return Image.open(io.BytesIO(cairosvg.svg2png(bytestring=svg, output_width=px, output_height=px))).convert("RGBA")


def card(base: Image.Image, img: Image.Image, xy, radius=28, shadow=True):
    """Paste an image with rounded corners and a soft shadow."""
    x, y = xy
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, img.size[0], img.size[1]], radius, fill=255)
    if shadow:
        sh = Image.new("RGBA", (img.size[0] + 80, img.size[1] + 80), (0, 0, 0, 0))
        ImageDraw.Draw(sh).rounded_rectangle([40, 52, 40 + img.size[0], 52 + img.size[1]], radius, fill=(28, 61, 82, 40))
        sh = sh.filter(ImageFilter.GaussianBlur(18))
        base.alpha_composite(sh, (x - 40, y - 40))
    base.paste(img.convert("RGB"), (x, y), mask)


def fit(img: Image.Image, h: int) -> Image.Image:
    return img.resize((round(img.size[0] * h / img.size[1]), h), Image.LANCZOS)


def new() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    im = Image.new("RGBA", (W, H), CANVAS)
    return im, ImageDraw.Draw(im)


def architecture():
    im, d = new()
    arch = Image.open(ROOT / "docs" / "architecture.png").convert("RGBA")
    arch = arch.resize((1820, round(arch.size[1] * 1820 / arch.size[0])), Image.LANCZOS)
    im.alpha_composite(arch, (50, (H - arch.size[1]) // 2))
    return im


def kit():
    im, d = new()
    d.text((110, 150), "tv-care-kit", font=SERIF(104), fill=NAVY)
    d.text((114, 290), "Open source · MIT · 17 tests · v0.1.1", font=SEMI(40), fill=PERSIMMON)
    items = [
        ("Focus you can see from the sofa", "Size, ring and lift, not colour alone"),
        ("A 10-foot type scale", "Six roles, nothing under 18 dp, two steps up"),
        ("Interrupt and resume", "A reminder pauses what plays, resumes only what it paused"),
    ]
    y = 410
    for title, sub in items:
        d.ellipse([112, y + 14, 136, y + 38], fill=CELADON)
        d.text((160, y), title, font=BOLD(44), fill=NAVY)
        d.text((160, y + 58), sub, font=SANS(30), fill=MUTED)
        y += 140
    # The real test run, on a light panel.
    panel = Image.new("RGBA", (800, 620), PAPER)
    pd = ImageDraw.Draw(panel)
    pd.text((36, 30), "$ npm test", font=SEMI(30), fill=NAVY)
    # The kit's own tests, run from a clone of tv-care-kit (KIT_REPO, default: a sibling checkout).
    kit = Path(os.environ.get("KIT_REPO", ROOT.parent.parent / "Open Source Projects" / "tv-care-kit"))
    out = subprocess.run(["node", "--test", *sorted(str(p) for p in (kit / "test").glob("*.test.ts"))],
                         capture_output=True, text=True, cwd=kit).stdout.splitlines()
    oks = [line for line in out if line.startswith("ok ")][:9]
    summary = [line for line in out if line.startswith(("# pass", "# fail"))]
    yy = 90
    for line in oks:
        text = line if len(line) < 50 else line[:48] + "…"
        pd.text((36, yy), text, font=SANS(25), fill=CELADON)
        yy += 48
    pd.text((36, yy + 12), "   ".join(summary), font=BOLD(28), fill=NAVY)
    card(im, panel, (1010, 300))
    d.text((110, 880), "gitlab.com/ebenworks-systems/tv-care-kit", font=SEMI(36), fill=NAVY)
    return im


def before_after(parent: Path, family: Path, tv: Path):
    im, d = new()
    d.text((110, 70), "Before and after the hackathon", font=SERIF(72), fill=NAVY)
    d.text((112, 178), "Before: Chingu Care AI phone apps, launched 20 October 2026", font=SEMI(32), fill=MUTED)
    p = fit(Image.open(parent), 600)
    f = fit(Image.open(family), 600)
    card(im, p, (110, 300), radius=36)
    card(im, f, (134 + p.size[0], 300), radius=36)
    d.text((112, 935), "Parent app and family app", font=SANS(30), fill=MUTED)
    tvim = Image.open(tv).convert("RGB").resize((920, 518), Image.LANCZOS)
    x = 1920 - 110 - 920
    d.text((x, 228), "New in the hackathon window", font=BOLD(40), fill=PERSIMMON)
    card(im, tvim, (x, 300), radius=28)
    lines = ["Chingu Care AI on Fire TV: TV app, care hub,", "routine learner, family page, tv-care-kit"]
    for i, line in enumerate(lines):
        d.text((x, 880 + i * 46), line, font=SANS(32), fill=INK)
    return im


def end_card():
    im, d = new()
    m = mark(260)
    im.alpha_composite(m, ((W - 260) // 2, 170))
    t = "Chingu Care AI"
    tw = d.textlength(t, font=SERIF(110))
    d.text(((W - tw) / 2, 470), t, font=SERIF(110), fill=NAVY)
    t2 = "Apart, but always near."
    tw = d.textlength(t2, font=SERIF(56))
    d.text(((W - tw) / 2, 620), t2, font=SERIF(56), fill=PERSIMMON)
    for i, t3 in enumerate(["gitlab.com/ebenworks-systems/chingu-care-ai-fire-tv", "gitlab.com/ebenworks-systems/tv-care-kit"]):
        tw = d.textlength(t3, font=SEMI(34))
        d.text(((W - tw) / 2, 760 + i * 52), t3, font=SEMI(34), fill=INK)
    t4 = "An Ebenworks product. Demo household: invented people and data. Not a medical device."
    tw = d.textlength(t4, font=SANS(28))
    d.text(((W - tw) / 2, 950), t4, font=SANS(28), fill=MUTED)
    return im


if __name__ == "__main__":
    parent, family, tv = (Path(a) for a in sys.argv[1:4])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, im in [("s1-architecture", architecture()), ("s2-kit", kit()), ("s3-before-after", before_after(parent, family, tv)), ("s4-end", end_card())]:
        im.convert("RGB").save(OUT / f"{name}.png")
        print(OUT / f"{name}.png")
