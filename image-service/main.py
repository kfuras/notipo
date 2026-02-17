"""
FastAPI image generation service.
Generates featured blog images with title text overlay on category backgrounds.
"""

from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from generator import generate_featured_image

app = FastAPI(title="Blog Compiler Image Service")


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
