"""
Turn generated sticker renders into cut-outs.

    python3 scripts/cutout-stickers.py <in-dir> <out-dir>

Each input is a raster sticker on a white background. The white *around* the
drawing becomes transparent (a flood fill from the image border, so white inside
the drawing stays), the result is trimmed to its content with a small margin,
and saved as a 512px PNG. Needs Pillow.
"""
import sys
from collections import deque
from pathlib import Path

from PIL import Image

WHITE = 238  # anything this bright (per channel) counts as background
SIZE = 384
MARGIN = 10


def cutout(src: Path, dst: Path) -> None:
    im = Image.open(src).convert("RGBA")
    w, h = im.size
    px = im.load()

    def is_bg(x: int, y: int) -> bool:
        r, g, b, _ = px[x, y]
        return r >= WHITE and g >= WHITE and b >= WHITE

    # Flood fill from every border pixel.
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if is_bg(x, y) and not seen[y * w + x]:
                seen[y * w + x] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and is_bg(nx, ny):
                seen[ny * w + nx] = 1
                q.append((nx, ny))

    bbox = im.getbbox()
    if not bbox:
        raise SystemExit(f"{src.name}: nothing left after cut-out")
    im = im.crop(bbox)

    # Square canvas with a margin, content centred.
    side = max(im.size) + MARGIN * 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    canvas = canvas.resize((SIZE, SIZE), Image.LANCZOS)
    # Black lines on white with soft edges: a 64-colour palette keeps the
    # anti-aliasing and the alpha, at about a third of the size.
    canvas = canvas.quantize(64, method=Image.Quantize.FASTOCTREE)
    canvas.save(dst, optimize=True)


def main() -> None:
    src_dir, dst_dir = Path(sys.argv[1]), Path(sys.argv[2])
    dst_dir.mkdir(parents=True, exist_ok=True)
    for src in sorted(src_dir.iterdir()):
        if src.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        dst = dst_dir / f"{src.stem}.png"
        cutout(src, dst)
        print(f"{src.name} -> {dst.name}")


if __name__ == "__main__":
    main()
