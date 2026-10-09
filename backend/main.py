from investigation import investigate_exception
from reconciliation import reconcile_transactions
from sqlalchemy import text
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

@app.post("/reconcile")
def run_reconciliation():
    try:
        result = reconcile_transactions()
        return {
            "success": True,
            "result": result
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }
    
from sqlalchemy import text
from database import engine


@app.get("/exceptions")
def get_exceptions():
    query = text("""
        SELECT
            e.exception_id,
            e.invoice_id,
            i.invoice_number,
            e.transaction_id,
            t.transaction_reference,
            e.exception_type,
            e.difference_amount,
            e.status,
            e.root_cause,
            e.created_at
        FROM exceptions e
        LEFT JOIN invoices i
            ON e.invoice_id = i.invoice_id
        LEFT JOIN transactions t
            ON e.transaction_id = t.transaction_id
        ORDER BY e.exception_id DESC
    """)

    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()

    return {
        "total": len(rows),
        "exceptions": [
            dict(row) for row in rows
        ]
    }


@app.get("/exceptions/{exception_id}")
def get_exception(exception_id: int):
    query = text("""
        SELECT
            exception_id,
            invoice_id,
            transaction_id,
            exception_type,
            difference_amount,
            status,
            root_cause,
            confidence,
            created_at
        FROM exceptions
        WHERE exception_id = :exception_id
    """)

    with engine.connect() as conn:
        result = conn.execute(
            query,
            {"exception_id": exception_id}
        ).mappings().first()

    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"Exception {exception_id} not found"
        )

    return dict(result)


@app.post("/exceptions/{exception_id}/investigate")
def run_exception_investigation(exception_id: int):
    print("DEBUG: Investigation endpoint called for", exception_id, flush=True)
    result = investigate_exception(exception_id)

    if not result["success"]:
        raise HTTPException(
            status_code=404,
            detail=result["error"],
        )

    return result


