"""Generates the PWA icons (public/icons/*) and app/apple-icon.png.

Run once (needs Pillow):  ..\\..\\agent\\.venv\\Scripts\\python scripts\\make-icons.py
A white "D" on the dashboard accent colour; the maskable icon keeps the letter inside the 80% safe zone.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ACCENT = (31, 79, 209)  # --accent in app/globals.css
WEB = Path(__file__).resolve().parent.parent
FONT = Path(r"C:\Windows\Fonts\segoeuib.ttf")


def icon(size: int, maskable: bool = False, rounded: bool = True) -> Image.Image:
    scale = 4  # draw large, then downsample for smooth edges
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable or not rounded:
        d.rectangle([0, 0, s, s], fill=ACCENT)
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=ACCENT)
    font = ImageFont.truetype(str(FONT), int(s * (0.46 if maskable else 0.6)))
    box = d.textbbox((0, 0), "D", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((s - w) / 2 - box[0], (s - h) / 2 - box[1]), "D", font=font, fill="white")
    return img.resize((size, size), Image.LANCZOS)


out = WEB / "public" / "icons"
out.mkdir(parents=True, exist_ok=True)
icon(192).save(out / "icon-192.png")
icon(512).save(out / "icon-512.png")
icon(512, maskable=True).save(out / "icon-maskable-512.png")
icon(180, rounded=False).convert("RGB").save(WEB / "app" / "apple-icon.png")  # iOS rounds the corners itself
icon(32).save(WEB / "app" / "icon.png")
for p in [*out.iterdir(), WEB / "app" / "apple-icon.png", WEB / "app" / "icon.png"]:
    print(p.relative_to(WEB), Image.open(p).size)
