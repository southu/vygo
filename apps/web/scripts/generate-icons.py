#!/usr/bin/env python3
"""Generate Vygo favicon raster assets from the brand mark.

The mark is the "v" from the vygo.ai wordmark plus its signature purple accent
dot, rendered white on a Vygo-purple (#5b47e0) rounded tile. Geometry is kept
in sync with public/favicon.svg (512x512 viewBox).

Outputs (into apps/web/public):
  favicon.ico                    16 / 32 / 48
  favicon-96x96.png              modern PNG favicon
  apple-touch-icon.png           180x180, opaque square (iOS applies its own mask)
  web-app-manifest-192x192.png   PWA manifest icon
  web-app-manifest-512x512.png   PWA manifest icon

Run: python3 apps/web/scripts/generate-icons.py
Requires: Pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw

PURPLE = (0x5B, 0x47, 0xE0, 0xFF)  # --color-purple
WHITE = (0xFF, 0xFF, 0xFF, 0xFF)

# Design space: 512x512 (matches favicon.svg viewBox).
BASE = 512
RADIUS = 112
V_POINTS = [(120, 170), (208, 346), (296, 170)]  # left-top -> bottom -> right-top
V_WIDTH = 60
DOT = (358, 316, 32)  # cx, cy, r

# Supersample factor for crisp anti-aliased edges before downscaling.
SS = 4
HR = BASE * SS

PUBLIC = Path(__file__).resolve().parents[1] / "public"


def _scaled(value):
    return int(round(value * SS))


def render_master(rounded: bool) -> Image.Image:
    """Render the mark at high resolution (HR x HR) RGBA."""
    img = Image.new("RGBA", (HR, HR), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if rounded:
        draw.rounded_rectangle(
            (0, 0, HR - 1, HR - 1), radius=_scaled(RADIUS), fill=PURPLE
        )
    else:
        # Opaque full-bleed square (apple-touch-icon; iOS rounds it itself).
        draw.rectangle((0, 0, HR - 1, HR - 1), fill=PURPLE)

    pts = [(_scaled(x), _scaled(y)) for x, y in V_POINTS]
    width = _scaled(V_WIDTH)
    draw.line(pts, fill=WHITE, width=width, joint="curve")
    # Round caps on the two open ends of the "v".
    r = width / 2
    for x, y in (pts[0], pts[2]):
        draw.ellipse((x - r, y - r, x + r, y + r), fill=WHITE)

    cx, cy, dot_r = (_scaled(v) for v in DOT)
    draw.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=WHITE)

    return img


def resized(master: Image.Image, size: int) -> Image.Image:
    return master.resize((size, size), Image.Resampling.LANCZOS)


def main() -> None:
    rounded = render_master(rounded=True)
    square = render_master(rounded=False)

    # Multi-resolution favicon.ico (16/32/48). The base image must be the
    # largest frame so Pillow does not discard the larger requested sizes;
    # the smaller LANCZOS frames are supplied via append_images so they are
    # embedded verbatim rather than re-resized.
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    f16, f32, f48 = (resized(rounded, s) for s, _ in ico_sizes)
    f48.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=ico_sizes,
        append_images=[f16, f32],
    )

    resized(rounded, 96).save(PUBLIC / "favicon-96x96.png")
    resized(square, 180).save(PUBLIC / "apple-touch-icon.png")
    resized(rounded, 192).save(PUBLIC / "web-app-manifest-192x192.png")
    resized(rounded, 512).save(PUBLIC / "web-app-manifest-512x512.png")

    print(f"Wrote icons to {PUBLIC}")


if __name__ == "__main__":
    main()
