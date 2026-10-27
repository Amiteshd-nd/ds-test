"""
Paints the hover fills: for every sticker in public/stickers/, a matching PNG in
public/stickers/fill/ with each enclosed white region of the drawing filled with a
flat colour, and the lines and the outside left transparent.

    python3 scripts/colour-stickers.py            # all
    python3 scripts/colour-stickers.py qutub-minar

Colours come from src/lib/landmarks.ts: `color` is the body, `tint` (if any) the
upper material, and `base` (if any, else a darker step of `color`) the bottom. Each region is painted
by where its centre sits in the drawing (top third, middle, bottom), and small
regions (windows, details) one step darker than their band, so the building reads
as solid colour blocks bounded by its own lines. Needs Pillow and Node.
"""
import json
import subprocess
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "public" / "stickers"
OUT = SRC / "fill"

LIGHT = 150  # a pixel this bright (every channel) is "white", including anti-aliasing
SMALL = 0.012  # regions under this share of the drawing's white area are "details"


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def darken(c: tuple[int, int, int], f: float) -> tuple[int, int, int]:
    return tuple(int(v * (1 - f)) for v in c)  # type: ignore[return-value]


def palette() -> dict[str, dict]:
    js = "import {LANDMARKS} from './src/lib/landmarks.ts'; console.log(JSON.stringify(LANDMARKS))"
    out = subprocess.run(["node", "--input-type=module", "-e", js], cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def regions(im: Image.Image):
    """Connected white regions. Yields (pixels, touches_outside)."""
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)

    def white(x: int, y: int) -> bool:
        r, g, b, a = px[x, y]
        return a > 60 and r >= LIGHT and g >= LIGHT and b >= LIGHT

    for sy in range(h):
        for sx in range(w):
            if seen[sy * w + sx] or not white(sx, sy):
                continue
            pixels = []
            outside = False
            q = deque([(sx, sy)])
            seen[sy * w + sx] = 1
            while q:
                x, y = q.popleft()
                pixels.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if not (0 <= nx < w and 0 <= ny < h):
                        outside = True
                        continue
                    if px[nx, ny][3] <= 60:
                        outside = True
                        continue
                    if not seen[ny * w + nx] and white(nx, ny):
                        seen[ny * w + nx] = 1
                        q.append((nx, ny))
            yield pixels, outside


def paint(src: Path, dst: Path, spec: dict) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    body = hex_rgb(spec["color"])
    top = hex_rgb(spec["tint"]) if spec.get("tint") else body
    base = hex_rgb(spec["base"]) if spec.get("base") else darken(body, 0.22)

    inner = [(p, o) for p, o in regions(im) if not o]
    if not inner:
        raise SystemExit(f"{src.name}: no enclosed regions")
    # The die-cut halo is the white ring between the sticker's outer edge line and
    # the drawing: the one region whose box spans nearly the whole drawing. It
    # stays white; everything else is the building.
    all_x = [x for p, _ in inner for x, _ in p]
    all_y = [y for p, _ in inner for _, y in p]
    span = (max(all_x) - min(all_x)) * (max(all_y) - min(all_y))

    def box_area(p):
        xs = [x for x, _ in p]
        ys = [y for _, y in p]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))

    inner = [(p, o) for p, o in inner if box_area(p) < 0.9 * span]
    ys = [y for p, _ in inner for _, y in p]
    y0, y1 = min(ys), max(ys)
    total = sum(len(p) for p, _ in inner)

    fill = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    fp = fill.load()
    for pixels, _ in inner:
        cy = sum(y for _, y in pixels) / len(pixels)
        band = (cy - y0) / max(1, y1 - y0)
        colour = top if band < 0.33 else body if band < 0.72 else base
        if len(pixels) < SMALL * total:
            colour = darken(colour, 0.18)
        for x, y in pixels:
            fp[x, y] = (*colour, 255)
    fill.save(dst, optimize=True)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    specs = palette()
    only = sys.argv[1:]
    for slug, spec in specs.items():
        if only and slug not in only:
            continue
        src = SRC / f"{slug}.png"
        if not src.exists():
            print(f"{slug}: no sticker yet, skipped")
            continue
        paint(src, OUT / f"{slug}.png", spec)
        print(f"{slug}: painted")


if __name__ == "__main__":
    main()
