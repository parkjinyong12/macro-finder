import logging
import os
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import init_db
from scheduler import start_scheduler, stop_scheduler
from routers import bonds, exchange, commodities, news, scheduler_ctrl, macro, predictions, yield_curve

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="Macro Finder API", version="1.0.0")

_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bonds.router)
app.include_router(exchange.router)
app.include_router(commodities.router)
app.include_router(news.router)
app.include_router(macro.router)
app.include_router(predictions.router)
app.include_router(yield_curve.router)
app.include_router(scheduler_ctrl.router)


@app.on_event("startup")
def on_startup():
    init_db()
    start_scheduler()


@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()


@app.get("/api/health")
def health():
    return {"status": "ok"}


_dist = os.path.join(os.path.dirname(__file__), "frontend", "dist")
if os.path.exists(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        return FileResponse(os.path.join(_dist, "index.html"))
