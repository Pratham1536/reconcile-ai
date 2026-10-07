from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine

app = FastAPI(
    title="ReconcileAI API",
    description="Agentic Exception Resolution Platform",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "message": "ReconcileAI Backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


@app.get("/database-health")
def database_health():
    try:
        with engine.connect():
            return {
                "database": "connected"
            }

    except Exception as e:
        return {
            "database": "connection failed",
            "error": str(e)
        }