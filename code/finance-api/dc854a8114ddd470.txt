cat << 'EOF' > schemas.py
from pydantic import BaseModel, Field
from datetime import date
from typing import Optional
from models import TransactionType

class TransactionBase(BaseModel):
    amount: float = Field(..., gt=0, description="Amount must be greater than 0")
    type: TransactionType
    category: str
    date: date
    notes: Optional[str] = None

class TransactionCreate(TransactionBase):
    pass

class TransactionOut(TransactionBase):
    id: int

    class Config:
        from_attributes = True

class FinancialSummary(BaseModel):
    total_income: float
    total_expenses: float
    current_balance: float
EOF
