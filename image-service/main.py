"""
FastAPI image generation service.
Generates featured blog images with title text overlay on category backgrounds.
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from generator import generate_featured_image
import os

app = FastAPI(title="Blog Compiler Image Service")

# Serve local category background images at /categories/<filename>
_images_dir = os.path.join(os.path.dirname(__file__), "category-images")
os.makedirs(_images_dir, exist_ok=True)
app.mount("/categories", StaticFiles(directory=_images_dir), name="categories")


class ImageRequest(BaseModel):
    title: str
    category: str
    background_url: str


@app.post("/generate")
def generate_image(req: ImageRequest):
    """Generate a featured image and return PNG bytes."""
    try:
        image_bytes = generate_featured_image(
            title=req.title,
            category=req.category,
            background_url=req.background_url,
        )
        return Response(content=image_bytes, media_type="image/png")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
def health():
    return {"status": "ok"}
