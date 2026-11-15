cat << 'EOF' > main.py
from fastapi import FastAPI, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional

import models
import schemas
from database import engine, get_db

models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Finance Tracking API")

def verify_role(x_user_role: str = Header("viewer")):
    role = x_user_role.lower()
    if role not in ["admin", "analyst", "viewer"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    return role

def require_admin(role: str = Depends(verify_role)):
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return role

def require_analyst_or_admin(role: str = Depends(verify_role)):
    if role not in ["admin", "analyst"]:
        raise HTTPException(status_code=403, detail="Analyst or Admin required")
    return role

@app.post("/transactions/", response_model=schemas.TransactionOut, status_code=201)
def create_transaction(transaction: schemas.TransactionCreate, db: Session = Depends(get_db), role: str = Depends(require_admin)):
    db_transaction = models.Transaction(**transaction.model_dump())
    db.add(db_transaction)
    db.commit()
    db.refresh(db_transaction)
    return db_transaction

@app.get("/transactions/", response_model=List[schemas.TransactionOut])
def read_transactions(skip: int = 0, limit: int = 100, type: Optional[models.TransactionType] = None, db: Session = Depends(get_db), role: str = Depends(verify_role)):
    query = db.query(models.Transaction)
    if type:
        query = query.filter(models.Transaction.type == type.value)
    return query.offset(skip).limit(limit).all()

@app.delete("/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db), role: str = Depends(require_admin)):
    transaction = db.query(models.Transaction).filter(models.Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(transaction)
    db.commit()
    return {"ok": True}

@app.get("/summary/", response_model=schemas.FinancialSummary)
def get_financial_summary(db: Session = Depends(get_db), role: str = Depends(require_analyst_or_admin)):
    income = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.type == "income").scalar() or 0.0
    expense = db.query(func.sum(models.Transaction.amount)).filter(models.Transaction.type == "expense").scalar() or 0.0
    return schemas.FinancialSummary(total_income=income, total_expenses=expense, current_balance=income - expense)
EOF
