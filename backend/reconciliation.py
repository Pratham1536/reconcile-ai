
from collections import defaultdict
from decimal import Decimal
from sqlalchemy import text
from database import engine


def money(value):
    """Convert database numeric values safely to Decimal."""
    return Decimal(str(value or 0)).quantize(Decimal("0.01"))


def reconcile_transactions():
    """
    Classify reconciliation exceptions using deterministic rules.

    Multiple payments are treated as duplicate candidates for review,
    not as confirmed duplicate payments.
    """

    query = text("""
        SELECT
            t.transaction_id,
            t.transaction_reference,
            t.customer_id AS transaction_customer_id,
            t.amount AS transaction_amount,
            t.invoice_id,
            t.status AS transaction_status,
            i.customer_id AS invoice_customer_id,
            i.invoice_number,
            i.amount AS invoice_amount,
            s.gross_amount,
            s.fee_amount,
            s.settled_amount
        FROM transactions t
        LEFT JOIN invoices i
            ON t.invoice_id = i.invoice_id
        LEFT JOIN settlements s
            ON t.transaction_id = s.transaction_id
        ORDER BY t.transaction_id
    """)

    with engine.connect() as conn:
        records = conn.execute(query).mappings().all()

    exceptions = []
    matched_count = 0
    invoice_payments = defaultdict(list)

    # Only successful transactions count as received payments.
    for row in records:
        invoice_id = row["invoice_id"]
        status = str(row["transaction_status"] or "").lower()

        if invoice_id is not None and status in {
            "success", "successful", "completed", "paid"
        }:
            invoice_payments[invoice_id].append(row)

    def add_exception(row, exception_type, difference, explanation):
        exceptions.append({
            "invoice_id": row["invoice_id"],
            "transaction_id": row["transaction_id"],
            "exception_type": exception_type,
            "difference_amount": float(difference),
            "status": "open",
            "root_cause": explanation,
        })

    for row in records:
        transaction_id = row["transaction_id"]
        invoice_id = row["invoice_id"]
        status = str(row["transaction_status"] or "").lower()
        transaction_amount = money(row["transaction_amount"])
        invoice_amount = (
            money(row["invoice_amount"])
            if row["invoice_amount"] is not None
            else None
        )

        # Failed/pending transactions are not treated as received money.
        if status not in {"success", "successful", "completed", "paid"}:
            add_exception(
                row,
                "payment_not_successful",
                transaction_amount,
                f"Transaction status is '{status or 'unknown'}'; "
                "confirm payment before marking the invoice paid.",
            )
            continue

        if (
            invoice_id is None
            or invoice_amount is None
            or row["transaction_customer_id"] != row["invoice_customer_id"]
        ):
            add_exception(
                row,
                "wrong_mapping",
                transaction_amount,
                "Transaction has a missing invoice or a customer mismatch.",
            )
            continue

        # A repeated invoice link is a candidate, not proof of duplication.
        linked_payments = invoice_payments[invoice_id]

        if len(linked_payments) > 1:
            total_received = sum(
                (money(payment["transaction_amount"])
                 for payment in linked_payments),
                Decimal("0.00"),
            )

            if total_received > invoice_amount:
                difference = total_received - invoice_amount
                explanation = (
                    "Multiple successful payments are linked to this invoice "
                    "and their combined amount exceeds the invoice amount. "
                    "Review references and payment records for a duplicate."
                )
            else:
                difference = total_received
                explanation = (
                    "Multiple successful payments are linked to this invoice. "
                    "They may be split payments; verify their references and "
                    "combined amount before deciding how to classify them."
                )

            add_exception(
                row,
                "duplicate_candidate",
                difference,
                explanation,
            )
            continue

        if transaction_amount < invoice_amount:
            add_exception(
                row,
                "partial_payment",
                invoice_amount - transaction_amount,
                "The successful payment is lower than the invoice amount.",
            )
            continue

        if transaction_amount > invoice_amount:
            add_exception(
                row,
                "overpayment",
                transaction_amount - invoice_amount,
                "The successful payment exceeds the invoice amount.",
            )
            continue

        # Check settlement only after the invoice amount matches.
        if row["settled_amount"] is not None:
            expected_settlement = (
                money(row["gross_amount"]) - money(row["fee_amount"])
            )
            actual_settlement = money(row["settled_amount"])
            settlement_difference = expected_settlement - actual_settlement

            if abs(settlement_difference) > Decimal("0.01"):
                add_exception(
                    row,
                    "fee_discrepancy",
                    settlement_difference,
                    "Settlement differs from gross amount minus recorded fees.",
                )
                continue

        matched_count += 1

    # Find invoices without successful linked transactions.
    missing_query = text("""
        SELECT
            i.invoice_id,
            i.amount AS invoice_amount,
            i.customer_id AS invoice_customer_id,
            i.invoice_number
        FROM invoices i
        WHERE NOT EXISTS (
            SELECT 1
            FROM transactions t
            WHERE t.invoice_id = i.invoice_id
              AND t.customer_id = i.customer_id
              AND LOWER(COALESCE(t.status, '')) IN
                  ('success', 'successful', 'completed', 'paid')
        )
    """)

    with engine.connect() as conn:
        missing_invoices = conn.execute(
            missing_query
        ).mappings().all()

    # Avoid calling an invoice missing if a transaction was already
    # classified as a mapping issue for that invoice.
    mapped_issue_invoice_ids = {
        item["invoice_id"]
        for item in exceptions
        if item["exception_type"] == "wrong_mapping"
        and item["invoice_id"] is not None
    }

    for invoice in missing_invoices:
        if invoice["invoice_id"] in mapped_issue_invoice_ids:
            continue

        exceptions.append({
            "invoice_id": invoice["invoice_id"],
            "transaction_id": None,
            "exception_type": "missing_payment",
            "difference_amount": float(money(invoice["invoice_amount"])),
            "status": "open",
            "root_cause": (
                "No successful transaction from the same customer is linked "
                "to this invoice. Verify other payment channels before "
                "concluding that payment is missing."
            ),
        })

    # Development-stage replacement. We will replace this with a safe,
    # idempotent update before introducing persistent investigations.
    
    
    with engine.begin() as conn:
        if exceptions:
            conn.execute(
                text("""
                    INSERT INTO exceptions (
                        invoice_id,
                        transaction_id,
                        exception_type,
                        difference_amount,
                        status,
                        root_cause
                    )
                    VALUES (
                        :invoice_id,
                        :transaction_id,
                        :exception_type,
                        :difference_amount,
                        :status,
                        :root_cause
                    )
                    ON CONFLICT (invoice_id, transaction_id, exception_type)
                    DO UPDATE SET
                        difference_amount = CASE
                            WHEN exceptions.status = 'resolved'
                            THEN exceptions.difference_amount
                            ELSE EXCLUDED.difference_amount
                        END,
                        root_cause = CASE
                            WHEN exceptions.status = 'resolved'
                            THEN exceptions.root_cause
                            ELSE EXCLUDED.root_cause
                        END
                """),
                exceptions,
            )



    summary = {}
    for item in exceptions:
        kind = item["exception_type"]
        summary[kind] = summary.get(kind, 0) + 1

    return {
        "transactions_checked": len(records),
        "matched": matched_count,
        "exceptions_created": len(exceptions),
        "exception_breakdown": summary,
    }


if __name__ == "__main__":
    print(reconcile_transactions())
