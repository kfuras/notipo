"""
Featured image generator using Pillow.
Ported from n8n workflow Y6O8LzWsujHZz3G5, node "Build Python Payload".

Generates a 1200x628 PNG with:
- Category background image
- Dark overlay
- Category label (top-left)
- Title text (centered, word-wrapped, with drop shadow)
"""

from PIL import Image, ImageDraw, ImageFont
import requests
from io import BytesIO
import os

WIDTH = 1200
HEIGHT = 628
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_SIZE = 50
SMALL_FONT_SIZE = 24
TEXT_COLOR = "white"
SHADOW_COLOR = "black"
CATEGORY_COLOR = "#94a3b8"


def generate_featured_image(
    title: str,
    category: str,
    background_url: str,
) -> bytes:
    """Generate featured image and return PNG bytes."""

    # Load background image — supports full URLs or local filenames in category-images/
    if background_url.startswith("http://") or background_url.startswith("https://"):
        response = requests.get(background_url, timeout=30)
        response.raise_for_status()
        bg_data = BytesIO(response.content)
    else:
        # Treat as a filename relative to the category-images directory
        local_path = os.path.join(os.path.dirname(__file__), "category-images", os.path.basename(background_url))
        with open(local_path, "rb") as f:
            bg_data = BytesIO(f.read())
    bg = Image.open(bg_data).resize((WIDTH, HEIGHT)).convert("RGBA")

    # Apply dark overlay
    overlay = Image.new("RGBA", bg.size, (0, 0, 0, 100))
    img = Image.alpha_composite(bg, overlay)
    draw = ImageDraw.Draw(img)

    # Load fonts
    try:
        font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
        small_font = ImageFont.truetype(FONT_PATH, SMALL_FONT_SIZE)
    except Exception:
        font = ImageFont.load_default()
        small_font = ImageFont.load_default()

    # Draw category label
    draw.text((40, 30), category, font=small_font, fill=CATEGORY_COLOR)

    # Word-wrap title
    words = title.split()
    lines = []
    line = ""
    for word in words:
        test = f"{line} {word}".strip()
        if draw.textlength(test, font=font) < WIDTH - 100:
            line = test
        else:
            lines.append(line)
            line = word
    lines.append(line)

    # Draw title centered with drop shadow
    y_start = (HEIGHT - len(lines) * FONT_SIZE) // 2
    for i, l in enumerate(lines):
        text_width = draw.textlength(l, font=font)
        x = (WIDTH - text_width) // 2
        y = y_start + i * FONT_SIZE
        draw.text((x + 2, y + 2), l, font=font, fill=SHADOW_COLOR)
        draw.text((x, y), l, font=font, fill=TEXT_COLOR)

    # Return PNG bytes
    buf = BytesIO()
    img.convert("RGB").save(buf, format="PNG", quality=95)
    return buf.getvalue()
