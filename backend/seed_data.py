import random
from datetime import datetime, timedelta

from sqlalchemy import text

from database import engine


# ============================================
# SETTINGS
# ============================================

random.seed(42)

NUM_CUSTOMERS = 300
NUM_INVOICES = 1000
NUM_TRANSACTIONS = 1000

PAYMENT_METHODS = [
    "UPI",
    "Bank Transfer",
    "Credit Card",
    "Debit Card",
    "Payment Gateway",
]


FIRST_NAMES = [
    "Aarav", "Aditya", "Arjun", "Ishaan", "Kabir",
    "Rohan", "Rahul", "Karan", "Vikram", "Yash",
    "Ananya", "Aditi", "Priya", "Sneha", "Riya",
    "Neha", "Kavya", "Pooja", "Isha", "Meera"
]

LAST_NAMES = [
    "Sharma", "Patel", "Singh", "Verma", "Gupta",
    "Joshi", "Shah", "Mehta", "Kumar", "Choudhary"
]


def random_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"


def random_amount():
    return random.choice([
        500,
        750,
        1000,
        1250,
        1500,
        2000,
        2500,
        3000,
        5000,
        7500,
        10000,
        12500,
        15000,
        20000,
        25000,
        50000,
    ])


def generate_data():

    # ----------------------------------------
    # Clear existing data
    # ----------------------------------------

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                TRUNCATE TABLE
                    audit_logs,
                    agent_actions,
                    investigations,
                    exceptions,
                    settlements,
                    transactions,
                    invoices,
                    customers
                RESTART IDENTITY CASCADE
                """
            )
        )

    print("Existing data cleared.")

    # ----------------------------------------
    # CUSTOMERS
    # ----------------------------------------

    customers = []

    for i in range(1, NUM_CUSTOMERS + 1):

        name = random_name()

        customer = {
            "name": name,
            "email": f"customer{i}@example.com",
            "phone": f"9{random.randint(100000000, 999999999)}",
        }

        customers.append(customer)

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO customers
                    (name, email, phone)
                VALUES
                    (:name, :email, :phone)
                """
            ),
            customers,
        )

    print(f"Created {NUM_CUSTOMERS} customers.")

    # ----------------------------------------
    # INVOICES
    # ----------------------------------------

    invoices = []

    start_date = datetime(2026, 1, 1)

    for i in range(1, NUM_INVOICES + 1):

        customer_id = random.randint(1, NUM_CUSTOMERS)

        amount = random_amount()

        invoice_date = (
            start_date
            + timedelta(days=random.randint(0, 270))
        )

        due_date = invoice_date + timedelta(days=30)

        invoices.append(
            {
                "customer_id": customer_id,
                "invoice_number": f"INV-2026-{i:05d}",
                "amount": amount,
                "invoice_date": invoice_date.date(),
                "due_date": due_date.date(),
                "status": "unpaid",
            }
        )

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO invoices
                    (
                        customer_id,
                        invoice_number,
                        amount,
                        invoice_date,
                        due_date,
                        status
                    )
                VALUES
                    (
                        :customer_id,
                        :invoice_number,
                        :amount,
                        :invoice_date,
                        :due_date,
                        :status
                    )
                """
            ),
            invoices,
        )

    print(f"Created {NUM_INVOICES} invoices.")

    # ----------------------------------------
    # EXCEPTION PLAN
    # ----------------------------------------

    partial_ids = set(random.sample(range(1, 1001), 50))

    duplicate_ids = set(
        random.sample(
            list(set(range(1, 1001)) - partial_ids),
            20
        )
    )

    wrong_mapping_ids = set(
        random.sample(
            list(
                set(range(1, 1001))
                - partial_ids
                - duplicate_ids
            ),
            30
        )
    )

    fee_mismatch_ids = set(
        random.sample(
            list(
                set(range(1, 1001))
                - partial_ids
                - duplicate_ids
                - wrong_mapping_ids
            ),
            30
        )
    )

    # 20 invoices will have no payment
    missing_payment_ids = set(
        random.sample(
            list(
                set(range(1, 1001))
                - partial_ids
                - duplicate_ids
                - wrong_mapping_ids
                - fee_mismatch_ids
            ),
            20
        )
    )

    # ----------------------------------------
    # TRANSACTIONS
    # ----------------------------------------

    transactions = []

    transaction_counter = 1

    # First create one transaction for most invoices
    for invoice_id in range(1, 1001):

        # Skip missing-payment invoices
        if invoice_id in missing_payment_ids:
            continue

        invoice = invoices[invoice_id - 1]

        invoice_amount = float(invoice["amount"])

        transaction_amount = invoice_amount

        # Partial payment
        if invoice_id in partial_ids:
            transaction_amount = round(
                invoice_amount * random.uniform(0.50, 0.90),
                2
            )

        # Wrong invoice mapping
        mapped_invoice_id = invoice_id

        if invoice_id in wrong_mapping_ids:

            possible_ids = list(
                set(range(1, 1001)) - {invoice_id}
            )

            mapped_invoice_id = random.choice(possible_ids)

        transactions.append(
            {
                "customer_id": invoice["customer_id"],
                "transaction_reference":
                    f"TXN-2026-{transaction_counter:06d}",
                "amount": transaction_amount,
                "transaction_date":
                    invoice["invoice_date"]
                    + timedelta(
                        days=random.randint(0, 5)
                    ),
                "payment_method":
                    random.choice(PAYMENT_METHODS),
                "status": "success",
                "invoice_id": mapped_invoice_id,
            }
        )

        transaction_counter += 1

    # ----------------------------------------
    # DUPLICATE PAYMENTS
    # ----------------------------------------

    for invoice_id in duplicate_ids:

        invoice = invoices[invoice_id - 1]

        transactions.append(
            {
                "customer_id": invoice["customer_id"],
                "transaction_reference":
                    f"TXN-2026-{transaction_counter:06d}",
                "amount": float(invoice["amount"]),
                "transaction_date":
                    invoice["invoice_date"]
                    + timedelta(days=1),
                "payment_method":
                    random.choice(PAYMENT_METHODS),
                "status": "success",
                "invoice_id": invoice_id,
            }
        )

        transaction_counter += 1

    # ----------------------------------------
    # Make sure we have exactly 1000
    # ----------------------------------------

    while len(transactions) < NUM_TRANSACTIONS:

        invoice_id = random.randint(1, NUM_INVOICES)

        invoice = invoices[invoice_id - 1]

        transactions.append(
            {
                "customer_id": invoice["customer_id"],
                "transaction_reference":
                    f"TXN-2026-{transaction_counter:06d}",
                "amount": float(invoice["amount"]),
                "transaction_date":
                    invoice["invoice_date"]
                    + timedelta(days=random.randint(0, 5)),
                "payment_method":
                    random.choice(PAYMENT_METHODS),
                "status": "success",
                "invoice_id": invoice_id,
            }
        )

        transaction_counter += 1

    transactions = transactions[:NUM_TRANSACTIONS]

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO transactions
                    (
                        customer_id,
                        transaction_reference,
                        amount,
                        transaction_date,
                        payment_method,
                        status,
                        invoice_id
                    )
                VALUES
                    (
                        :customer_id,
                        :transaction_reference,
                        :amount,
                        :transaction_date,
                        :payment_method,
                        :status,
                        :invoice_id
                    )
                """
            ),
            transactions,
        )

    print(f"Created {len(transactions)} transactions.")

    # ----------------------------------------
    # SETTLEMENTS
    # ----------------------------------------

    settlements = []

    for transaction_id, transaction in enumerate(
        transactions,
        start=1
    ):

        gross_amount = float(transaction["amount"])

        fee = round(gross_amount * 0.02, 2)

        settled_amount = round(
            gross_amount - fee,
            2
        )

        # Create intentional fee discrepancies
        invoice_id = transaction["invoice_id"]

        if invoice_id in fee_mismatch_ids:
            settled_amount = round(
                settled_amount - random.uniform(50, 200),
                2
            )

        settlements.append(
            {
                "transaction_id": transaction_id,
                "gross_amount": gross_amount,
                "fee_amount": fee,
                "settled_amount": settled_amount,
               "settlement_date":
                    transaction["transaction_date"],
            }
        )

    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO settlements
                    (
                        transaction_id,
                        gross_amount,
                        fee_amount,
                        settled_amount,
                        settlement_date
                    )
                VALUES
                    (
                        :transaction_id,
                        :gross_amount,
                        :fee_amount,
                        :settled_amount,
                        :settlement_date
                    )
                """
            ),
            settlements,
        )

    print(f"Created {len(settlements)} settlements.")

    print()
    print("====================================")
    print("DATA GENERATION COMPLETE")
    print("====================================")
    print(f"Customers:     {NUM_CUSTOMERS}")
    print(f"Invoices:      {NUM_INVOICES}")
    print(f"Transactions:  {NUM_TRANSACTIONS}")
    print(f"Settlements:   {NUM_TRANSACTIONS}")
    print("====================================")


if __name__ == "__main__":
    generate_data()