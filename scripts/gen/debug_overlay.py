"""Draws every recorded bbox onto a copy of each page PNG for visual verification.

Header fields in red, line-item cells in blue. Output: scripts/gen/out/debug/<id>.png

Usage: python scripts/gen/debug_overlay.py
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "invoices"
PUBLIC = ROOT / "public"
DEBUG = ROOT / "scripts" / "gen" / "out" / "debug"

HEADER_COLOR = (220, 30, 30)
LINE_COLOR = (30, 60, 220)


def label_font() -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    arial = Path("C:/Windows/Fonts/arial.ttf")
    if arial.exists():
        return ImageFont.truetype(str(arial), 11)
    return ImageFont.load_default()


def draw_box(draw: ImageDraw.ImageDraw, bbox: list[float], width: int, height: int, color, label: str, font) -> None:
    x0, y0, x1, y1 = bbox[0] * width, bbox[1] * height, bbox[2] * width, bbox[3] * height
    draw.rectangle([x0, y0, x1, y1], outline=color, width=1)
    draw.text((x0, max(0, y0 - 12)), label, fill=color, font=font)


def overlay(doc_path: Path, font) -> Path:
    doc = json.loads(doc_path.read_text(encoding="utf-8"))
    page = doc["pages"][0]
    img = Image.open(PUBLIC / page["image"].lstrip("/")).convert("RGB")
    width, height = img.size
    assert (width, height) == (page["width_px"], page["height_px"]), doc["id"]
    draw = ImageDraw.Draw(img)
    for key, field in doc["fields"].items():
        draw_box(draw, field["bbox"], width, height, HEADER_COLOR, key, font)
    for item in doc["line_items"]:
        for cell, bbox in item["bbox"].items():
            draw_box(draw, bbox, width, height, LINE_COLOR, f"L{item['line']}:{cell}", font)
    out = DEBUG / f"{doc['id']}.png"
    img.save(out, "PNG")
    return out


def main() -> None:
    DEBUG.mkdir(parents=True, exist_ok=True)
    font = label_font()
    for doc_path in sorted(DATA.glob("*.json")):
        print(overlay(doc_path, font))


if __name__ == "__main__":
    main()
