
from decimal import Decimal
from sqlalchemy import text
from database import engine


SUCCESS_STATUSES = {"success", "successful", "completed", "paid"}


def investigate_exception(exception_id: int):
    print("DEBUG: investigation.py function entered", flush=True)
    """
    Gather evidence for an exception and produce an explainable
    investigation result. This function does not change financial records.
    """

    with engine.connect() as conn:
        exception = conn.execute(
            text("""
                SELECT
                    exception_id,
                    invoice_id,
                    transaction_id,
                    exception_type,
                    difference_amount,
                    status,
                    root_cause
                FROM exceptions
                WHERE exception_id = :exception_id
            """),
            {"exception_id": exception_id},
        ).mappings().first()

        if exception is None:
            return {
                "success": False,
                "error": f"Exception {exception_id} not found",
            }

        evidence = []
        invoice = None
        transaction = None
        settlements = []
        
        customer_payments = []



        if exception["invoice_id"] is not None:
            invoice = conn.execute(
                text("""
                    SELECT invoice_id, invoice_number, customer_id,
                           amount, status, invoice_date
                    FROM invoices
                    WHERE invoice_id = :invoice_id
                """),
                {"invoice_id": exception["invoice_id"]},
            ).mappings().first()

        
        if invoice is not None:
             customer_payments = conn.execute(
                text("""
                    SELECT
                            transaction_id,
                            transaction_reference,
                            customer_id,
                            amount,
                            status,
                            transaction_date,
                            invoice_id
                        FROM transactions
                        WHERE customer_id = :customer_id
                          AND LOWER(COALESCE(status, '')) IN
                              ('success', 'successful', 'completed', 'paid')
                        ORDER BY transaction_date DESC, transaction_id DESC
                        LIMIT 20
                    """),
                    {"customer_id": invoice["customer_id"]},
                ).mappings().all()

        print(
            "DEBUG: customer ID:",
            invoice["customer_id"],
            "| payments found:",
            len(customer_payments),
            flush=True,
        )


        if exception["transaction_id"] is not None:
            transaction = conn.execute(
                text("""
                    SELECT transaction_id, transaction_reference,
                           customer_id, amount, status, invoice_id, transaction_date
                    FROM transactions
                    WHERE transaction_id = :transaction_id
                """),
                {"transaction_id": exception["transaction_id"]},
            ).mappings().first()

        if transaction is not None:
            settlements = conn.execute(
                text("""
                    SELECT settlement_id, gross_amount, fee_amount,
                           settled_amount, settlement_date
                    FROM settlements
                    WHERE transaction_id = :transaction_id
                """),
                {"transaction_id": transaction["transaction_id"]},
            ).mappings().all()

    if invoice:
        evidence.append({
            "source": "invoice",
            "detail": f"Invoice {invoice['invoice_number']} exists",
            "amount": float(invoice["amount"]),
        })
    else:
        evidence.append({
            "source": "invoice",
            "detail": "No invoice record was found for this exception",
        })

    if transaction:
        evidence.append({
            "source": "transaction",
            "detail": (
                f"Transaction reference: "
                f"{transaction['transaction_reference'] or 'Unavailable'}"
            ),
            "amount": float(transaction["amount"]),
            "status": transaction["status"],
        })
    else:
        evidence.append({
            "source": "transaction",
            "detail": "No transaction is directly linked to this exception",
        })

    for settlement in settlements:
        evidence.append({
            "source": "settlement",
            "detail": "Settlement record found",
            "gross_amount": float(settlement["gross_amount"] or 0),
            "fee_amount": float(settlement["fee_amount"] or 0),
            "settled_amount": float(settlement["settled_amount"] or 0),
        })

    
    if invoice and exception["exception_type"] == "missing_payment":
        linked_elsewhere = [
            payment for payment in customer_payments
            if payment["invoice_id"] != invoice["invoice_id"]
        ]

        evidence.append({
            "source": "customer_payment_history",
            "detail": (
                "Successful transactions exist for this customer, "
                "but they are linked to other invoices."
                if linked_elsewhere
                else "No successful customer transactions were found "
                     "in the retrieved payment history."
            ),
            "customer_id": invoice["customer_id"],
            "transactions_found": len(customer_payments),
            "linked_to_other_invoices": len(linked_elsewhere),
            "payments": [
                {
                    "transaction_id": payment["transaction_id"],
                    "reference": payment["transaction_reference"],
                    "amount": float(payment["amount"] or 0),
                    "linked_invoice_id": payment["invoice_id"],
                    "transaction_date": (
                        payment["transaction_date"].isoformat()
                        if payment["transaction_date"]
                        else None
                    ),
                }
                for payment in customer_payments
            ],
        })


    exception_type = exception["exception_type"]
    root_cause = exception["root_cause"] or "Cause not yet established"
    resolution = "Review the evidence and determine the appropriate next step."
    confidence = 0.55

    if exception_type == "missing_payment":
        resolution = (
        "Check other payment channels and customer payment history. "
        "Verify transaction-to-invoice mappings before concluding payment "
        "is missing. Do not automatically reassign transactions."
    )
        confidence = 0.75

    elif exception_type == "partial_payment":
        resolution = (
            "Verify the amount received and check whether another partial "
            "payment exists before updating the invoice balance."
        )
        confidence = 0.80

        if invoice and transaction:
            invoice_amount = Decimal(str(invoice["amount"]))
            received_amount = Decimal(str(transaction["amount"]))
            outstanding = invoice_amount - received_amount

            evidence.append({
                "source": "calculation",
                "detail": "Calculated outstanding amount",
                "amount": float(outstanding),
            })

    
    elif exception_type in {"duplicate_candidate", "duplicate_payment"}:
        resolution = (
            "Compare payment references, timestamps, and settlement records. "
            "Do not issue a refund until a duplicate is confirmed."
        )
        confidence = 0.65

        if invoice:
            with engine.connect() as conn:
                linked_payments = conn.execute(
                    text("""
                        SELECT
                            transaction_id,
                            transaction_reference,
                            customer_id,
                            amount,
                            status,
                            transaction_date
                        FROM transactions
                        WHERE invoice_id = :invoice_id
                          AND LOWER(COALESCE(status, '')) IN
                              ('success', 'successful', 'completed', 'paid')
                        ORDER BY transaction_date, transaction_id
                    """),
                    {"invoice_id": invoice["invoice_id"]},
                ).mappings().all()

                payment_total = sum(
                    (Decimal(str(payment["amount"] or 0))
                     for payment in linked_payments),
                    Decimal("0.00"),
                )

            invoice_total = Decimal(str(invoice["amount"] or 0))
            excess_amount = payment_total - invoice_total

            evidence.append({
                "source": "duplicate_analysis",
                "detail": "All successful transactions linked to this invoice",
                "successful_payment_count": len(linked_payments),
                "invoice_amount": float(invoice_total),
                "combined_payment_amount": float(payment_total),
                "amount_above_invoice": float(max(excess_amount, Decimal("0.00"))),
                "payments": [
                    {
                        "transaction_id": payment["transaction_id"],
                        "reference": payment["transaction_reference"],
                        "customer_id": payment["customer_id"],
                        "amount": float(payment["amount"] or 0),
                        "status": payment["status"],
                        "transaction_date": (
                            payment["transaction_date"].isoformat()
                            if payment["transaction_date"]
                            else None
                        ),
                    }
                    for payment in linked_payments
                ],
            })

            if len(linked_payments) > 1 and excess_amount > 0:
                resolution = (
                    f"{len(linked_payments)} successful payments total "
                    f"₹{payment_total:,.2f}, which is "
                    f"₹{excess_amount:,.2f} above the invoice amount. "
                    "Compare references, customer identity, dates, and "
                    "settlements. Human review is required before any refund "
                    "or invoice adjustment."
                )
                confidence = 0.80

            elif len(linked_payments) > 1:
                resolution = (
                    "Multiple successful payments are linked to this invoice, "
                    "but their combined amount does not exceed the invoice. "
                    "They may be legitimate split payments. Verify payment "
                    "references before classifying a duplicate."
                )
                confidence = 0.65

            else:
                resolution = (
                    "The available records do not establish a duplicate. "
                    "Review the payment reference and settlement evidence "
                    "before taking action."
                )
                confidence = 0.40


    elif exception_type == "wrong_mapping":
        resolution = (
            "Verify invoice ownership and customer identity before "
            "correcting the transaction-to-invoice mapping."
        )
        confidence = 0.70

    elif exception_type == "fee_discrepancy":
        resolution = (
            "Compare the gateway fee and settlement report before "
            "adjusting accounting records."
        )
        confidence = 0.70

    # Conflicting customer IDs lower confidence and require human review.
    
    if invoice and transaction:
        if invoice["customer_id"] != transaction["customer_id"]:
            root_cause = (
                "The linked transaction belongs to a different customer "
                "than the invoice."
            )
            resolution = (
                "Escalate for human review. Verify customer identity and "
                "invoice mapping before making any accounting changes."
            )
            confidence = 0.95

    # Check every payment included in duplicate_analysis.
    duplicate_analysis = next(
        (
            item for item in evidence
            if item.get("source") == "duplicate_analysis"
        ),
        None,
    )

    if invoice and duplicate_analysis:
        mismatched_payments = [
            payment
            for payment in duplicate_analysis.get("payments", [])
            if payment.get("customer_id") != invoice["customer_id"]
        ]

        if mismatched_payments:
            mismatched_ids = [
                payment["transaction_id"]
                for payment in mismatched_payments
            ]

            root_cause = (
                "One or more successful transactions linked to this invoice "
                "belong to a different customer."
            )
            resolution = (
                f"Human review required: transaction IDs {mismatched_ids} "
                "have a customer ID that differs from the invoice owner. "
                "Verify the mapping before changing the invoice or issuing "
                "a refund."
            )
            confidence = 0.95


    return {
        "success": True,
        "exception": dict(exception),
        "investigation": {
            "root_cause": root_cause,
            "confidence": confidence,
            "evidence": evidence,
            "recommended_resolution": resolution,
            "requires_human_approval": True,
        },
    }
