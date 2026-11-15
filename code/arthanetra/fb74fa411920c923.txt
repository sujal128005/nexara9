"""
ArthaNetra: deterministic true-cost engine
============================================

All money maths in ArthaNetra happens here, in plain deterministic Python.
The LLM is NEVER trusted to do arithmetic: it only *reads* the document.
This module turns the extracted terms into a dated cash-flow ledger and solves
for the internal rate of return (IRR), the one number that cannot be gamed by
flat-rate tricks, upfront fee deductions, "no-cost" EMIs or bundled insurance.

Sign convention (borrower / investor perspective):
    +amount  => money that reaches the user
    -amount  => money that leaves the user
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from typing import Optional

DAYS_PER_YEAR = 365.0
DAYS_PER_MONTH = DAYS_PER_YEAR / 12.0
GST_RATE = 0.18

FREQ_DAYS = {
    "daily": 1.0,
    "weekly": 7.0,
    "fortnightly": 14.0,
    "monthly": DAYS_PER_MONTH,
    "quarterly": DAYS_PER_YEAR / 4,
    "half_yearly": DAYS_PER_YEAR / 2,
    "yearly": DAYS_PER_YEAR,
}


@dataclass
class CashFlow:
    day: float
    amount: float
    label: str
    kind: str = "other"  # disbursal | principal | interest | fee | gst | insurance | premium | benefit | payment

    def to_dict(self):
        return {"day": round(self.day, 2), "amount": round(self.amount, 2), "label": self.label, "kind": self.kind}


# --------------------------------------------------------------------------------------
# IRR solver
# --------------------------------------------------------------------------------------

def _npv_log(x: float, flows: list[CashFlow]) -> float:
    """NPV where x = ln(1 + EAR). Using log-space keeps the solver stable for
    rates from -99.99 % to well over 1,000,000 % (real instant-loan-app territory)."""
    total = 0.0
    for cf in flows:
        e = -x * (cf.day / DAYS_PER_YEAR)
        if e > 700:  # would overflow; contributes +/- inf -> clamp
            e = 700
        total += cf.amount * math.exp(e)
    return total


def solve_ear(flows: list[CashFlow]) -> Optional[float]:
    """Effective Annual Rate (XIRR) via robust bisection in log space.
    Returns None if the flows do not have both an inflow and an outflow."""
    if not flows:
        return None
    if not (any(f.amount > 0 for f in flows) and any(f.amount < 0 for f in flows)):
        return None
    lo, hi = -9.0, 30.0  # EAR from ~-99.99 % to e^30 (astronomical)
    f_lo, f_hi = _npv_log(lo, flows), _npv_log(hi, flows)
    if f_lo == 0:
        return math.expm1(lo)
    if f_lo * f_hi > 0:
        return None
    for _ in range(300):
        mid = (lo + hi) / 2
        f_mid = _npv_log(mid, flows)
        if f_mid == 0 or (hi - lo) < 1e-13:
            break
        if f_lo * f_mid < 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return math.expm1((lo + hi) / 2)


def ear_to_nominal(ear: Optional[float], periods_per_year: int = 12) -> Optional[float]:
    """RBI's Key Facts Statement convention: APR = periodic IRR x periods per year."""
    if ear is None:
        return None
    return math.expm1(math.log1p(ear) / periods_per_year) * periods_per_year


def nominal_to_ear(nominal: float, periods_per_year: int = 12) -> float:
    return (1 + nominal / periods_per_year) ** periods_per_year - 1


def emi(principal: float, annual_nominal: float, n: int, periods_per_year: float = 12) -> float:
    r = annual_nominal / periods_per_year
    if n <= 0:
        return principal
    if abs(r) < 1e-12:
        return principal / n
    f = (1 + r) ** n
    return principal * r * f / (f - 1)


def implied_reducing_rate(principal: float, installment: float, n: int, periods_per_year: float = 12) -> Optional[float]:
    """Solve the annual reducing-balance rate implied by a stated EMI.
    Exposes 'flat-rate disguise': 9 % flat often equals ~16-17 % reducing."""
    if principal <= 0 or installment <= 0 or n <= 0:
        return None
    if installment * n < principal:
        return None
    lo, hi = 0.0, 10.0  # per-period rate
    for _ in range(200):
        mid = (lo + hi) / 2
        if mid == 0:
            val = principal / n
        else:
            val = emi(principal, mid * periods_per_year, n, periods_per_year)
        if val > installment:
            hi = mid
        else:
            lo = mid
    return (lo + hi) / 2 * periods_per_year


def normalize_rate(value: Optional[float], period: Optional[str]) -> Optional[float]:
    """Convert a quoted rate (in percent) to an annual nominal decimal."""
    if value is None:
        return None
    period = (period or "year").lower()
    v = float(value) / 100.0
    if period.startswith("day"):
        return v * DAYS_PER_YEAR
    if period.startswith("week"):
        return v * 52
    if period.startswith("month"):
        return v * 12
    if period.startswith("quarter"):
        return v * 4
    return v


# --------------------------------------------------------------------------------------
# Normalised model inputs (what the simulator manipulates)
# --------------------------------------------------------------------------------------

@dataclass
class Fee:
    name: str
    amount: float  # INR, already including GST if applicable
    timing: str = "upfront_deducted"  # upfront_deducted | upfront_paid | with_first_installment | at_end | per_installment
    base_amount: Optional[float] = None
    gst: float = 0.0


@dataclass
class LoanModel:
    principal: float
    tenure_days: float
    rate_annual: Optional[float] = None  # nominal decimal
    rate_method: str = "reducing"  # reducing | flat | simple
    frequency: str = "monthly"  # installment frequency, or "bullet"
    n_installments: Optional[int] = None
    installment: Optional[float] = None
    bullet_repayment: Optional[float] = None
    disbursed: Optional[float] = None
    fees: list[Fee] = field(default_factory=list)
    prepay_month: Optional[int] = None  # simulator: foreclose after N installments
    foreclosure_pct: float = 0.0


@dataclass
class CardModel:
    outstanding: float
    monthly_rate: float  # decimal, e.g. 0.0375
    min_due_pct: float = 0.05
    min_due_floor: float = 200.0
    gst_on_interest: bool = True
    fixed_payment: Optional[float] = None  # simulator: pay this much each month instead of minimum due


@dataclass
class InvestmentModel:
    premium: float
    premium_frequency: str = "yearly"  # yearly | half_yearly | quarterly | monthly | single
    paying_term_years: float = 1
    policy_term_years: float = 1
    maturity_benefit: float = 0.0
    benchmark_rate: float = 0.071  # user-editable comparison (e.g. PPF)


# --------------------------------------------------------------------------------------
# Builders
# --------------------------------------------------------------------------------------

def _fee_sum(fees: list[Fee], timings: set[str]) -> float:
    return sum(f.amount for f in fees if f.timing in timings)


def build_loan(m: LoanModel) -> dict:
    flows: list[CashFlow] = []
    notes: list[str] = []
    upfront_deducted = _fee_sum(m.fees, {"upfront_deducted"})
    upfront_paid = _fee_sum(m.fees, {"upfront_paid"})

    if m.disbursed is not None and m.disbursed > 0:
        net_in = m.disbursed
        if upfront_deducted and abs((m.principal - upfront_deducted) - m.disbursed) > max(2.0, 0.005 * m.principal):
            notes.append(
                f"Stated disbursal (₹{m.disbursed:,.0f}) differs from principal minus deducted fees "
                f"(₹{m.principal - upfront_deducted:,.0f}); the stated disbursal was used."
            )
    else:
        net_in = m.principal - upfront_deducted
    flows.append(CashFlow(0, net_in, "Money credited to you", "disbursal"))
    if upfront_paid:
        flows.append(CashFlow(0, -upfront_paid, "Fees paid upfront", "fee"))

    # ---- repayment schedule -------------------------------------------------------
    schedule: list[tuple[float, float, float, float]] = []  # (day, payment, principal_part, interest_part)
    freq = m.frequency if m.frequency in FREQ_DAYS else "monthly"
    period_days = FREQ_DAYS[freq]
    ppy = DAYS_PER_YEAR / period_days

    if m.frequency == "bullet" or (not m.n_installments and not m.installment):
        # single repayment at end of tenure
        if m.bullet_repayment:
            pay = m.bullet_repayment
        elif m.rate_annual is not None:
            pay = m.principal * (1 + m.rate_annual * m.tenure_days / DAYS_PER_YEAR)
        else:
            pay = m.principal
            notes.append("No interest rate or repayment amount found; assumed principal-only repayment.")
        schedule.append((m.tenure_days, pay, m.principal, pay - m.principal))
    else:
        n = m.n_installments or max(1, round(m.tenure_days / period_days))
        if m.installment:
            inst = m.installment
            method = "stated"
        elif m.rate_annual is not None and m.rate_method == "flat":
            interest_total = m.principal * m.rate_annual * (n * period_days / DAYS_PER_YEAR)
            inst = (m.principal + interest_total) / n
            method = "flat"
        elif m.rate_annual is not None:
            inst = emi(m.principal, m.rate_annual, n, ppy)
            method = "reducing"
        else:
            inst = m.principal / n
            method = "none"
            notes.append("No rate or EMI found; assumed zero interest instalments.")
        # split into principal/interest using the implied reducing rate (for charts)
        r_imp = implied_reducing_rate(m.principal, inst, n, ppy) or 0.0
        bal = m.principal
        for k in range(1, n + 1):
            interest = bal * r_imp / ppy
            princ = min(bal, inst - interest)
            bal -= princ
            schedule.append((k * period_days, inst, princ, interest))
            if m.prepay_month and k == m.prepay_month and k < n:
                charge = max(bal, 0) * m.foreclosure_pct
                schedule.append((k * period_days + 0.01, bal + charge, bal, charge))
                notes.append(
                    f"Simulated foreclosure after instalment {k}: outstanding ₹{bal:,.0f}"
                    + (f" + foreclosure charge ₹{charge:,.0f}" if charge else "")
                )
                bal = 0
                break
        if method == "stated" and m.rate_annual is None:
            notes.append("Interest rate derived from the stated instalment.")

    first_day = schedule[0][0] if schedule else 0
    last_day = schedule[-1][0] if schedule else m.tenure_days
    for day, pay, _, _ in schedule:
        flows.append(CashFlow(day, -pay, "Repayment", "payment"))
    first_fee = _fee_sum(m.fees, {"with_first_installment"})
    if first_fee:
        flows.append(CashFlow(first_day, -first_fee, "Charges billed with 1st instalment", "fee"))
    end_fee = _fee_sum(m.fees, {"at_end"})
    if end_fee:
        flows.append(CashFlow(last_day, -end_fee, "Charges at closure", "fee"))
    per_inst = [f for f in m.fees if f.timing == "per_installment"]
    for f in per_inst:
        for day, *_ in schedule:
            flows.append(CashFlow(day, -f.amount, f.name, "fee"))

    ear = solve_ear(flows)
    total_repaid = sum(p for _, p, _, _ in schedule)
    total_fees = sum(f.amount for f in m.fees) + (sum(f.amount for f in per_inst) * (len(schedule) - 1) if per_inst else 0)
    total_out = -sum(cf.amount for cf in flows if cf.amount < 0)
    interest_total = total_repaid - m.principal
    return {
        "kind": "loan",
        "flows": [cf.to_dict() for cf in sorted(flows, key=lambda c: c.day)],
        "net_received": round(net_in - upfront_paid, 2),
        "total_paid": round(total_out, 2),
        "cost_of_credit": round(total_out - (net_in - upfront_paid), 2),
        "interest_total": round(interest_total, 2),
        "fees_total": round(total_fees, 2),
        "installment": round(schedule[0][1], 2) if schedule else None,
        "n_payments": len(schedule),
        "tenure_days": round(last_day, 1),
        "ear": ear,
        "apr": ear_to_nominal(ear),
        "implied_reducing_rate": (
            implied_reducing_rate(m.principal, schedule[0][1], len(schedule), ppy)
            if (m.frequency != "bullet" and len(schedule) > 1 and not m.prepay_month) else None
        ),
        "breakdown": _breakdown(m.principal, interest_total, m.fees, per_inst, len(schedule)),
        "notes": notes,
    }


def _breakdown(principal, interest, fees, per_inst, n):
    parts = [{"label": "Principal", "key": "bd.principal", "amount": round(principal, 2), "kind": "principal"},
             {"label": "Interest", "key": "bd.interest", "amount": round(max(interest, 0), 2), "kind": "interest"}]
    for f in fees:
        mult = n if f in per_inst else 1
        if f.gst and f.base_amount is not None:
            parts.append({"label": f.name, "amount": round(f.base_amount * mult, 2), "kind": "fee"})
            parts.append({"label": f"GST on {f.name.lower()}", "key": "bd.gst_on", "params": {"name": f.name},
                          "amount": round(f.gst * mult, 2), "kind": "gst"})
        else:
            kind = "insurance" if "insur" in f.name.lower() else "fee"
            parts.append({"label": f.name, "amount": round(f.amount * mult, 2), "kind": kind})
    return parts


def build_card(m: CardModel, max_months: int = 1200) -> dict:
    flows = [CashFlow(0, m.outstanding, "Outstanding balance (credit used)", "disbursal")]
    bal = m.outstanding
    total_interest = total_gst = total_paid = 0.0
    months = 0
    negative_amortisation = False
    for k in range(1, max_months + 1):
        interest = bal * m.monthly_rate
        gst = interest * GST_RATE if m.gst_on_interest else 0.0
        bal += interest + gst
        total_interest += interest
        total_gst += gst
        if m.fixed_payment:
            pay = min(bal, m.fixed_payment)
        else:
            pay = min(bal, max(m.min_due_pct * bal, m.min_due_floor))
        if pay <= interest + gst and k == 1:
            negative_amortisation = True
        bal -= pay
        total_paid += pay
        flows.append(CashFlow(k * DAYS_PER_MONTH, -pay, "Monthly payment", "payment"))
        months = k
        if bal <= 0.5:
            bal = 0
            break
    ear = solve_ear(flows) if bal == 0 else nominal_to_ear((m.monthly_rate * (1 + (GST_RATE if m.gst_on_interest else 0))) * 12)
    # keep the flow list light for the UI
    light = flows if len(flows) <= 120 else flows[:1] + flows[1::max(1, len(flows) // 120)]
    return {
        "kind": "credit_card",
        "flows": [cf.to_dict() for cf in light],
        "net_received": round(m.outstanding, 2),
        "total_paid": round(total_paid, 2),
        "cost_of_credit": round(total_paid - m.outstanding + bal, 2),
        "interest_total": round(total_interest, 2),
        "gst_total": round(total_gst, 2),
        "fees_total": round(total_gst, 2),
        "months_to_repay": months if bal == 0 else None,
        "years_to_repay": round(months / 12, 1) if bal == 0 else None,
        "balance_left": round(bal, 2),
        "first_payment": round(-flows[1].amount, 2) if len(flows) > 1 else None,
        "negative_amortisation": negative_amortisation,
        "ear": ear,
        "apr": ear_to_nominal(ear),
        "breakdown": [
            {"label": "Amount you spent", "key": "bd.spent", "amount": round(m.outstanding, 2), "kind": "principal"},
            {"label": "Interest (finance charges)", "key": "bd.finance", "amount": round(total_interest, 2), "kind": "interest"},
            {"label": "GST on interest", "key": "bd.gst_interest", "amount": round(total_gst, 2), "kind": "gst"},
        ],
        "notes": [] if bal == 0 else [f"Still unpaid after {max_months // 12} years of payments."],
    }


def build_investment(m: InvestmentModel) -> dict:
    flows: list[CashFlow] = []
    freq = m.premium_frequency
    if freq == "single":
        flows.append(CashFlow(0, -m.premium, "Single premium", "premium"))
        n = 1
    else:
        pdays = FREQ_DAYS.get(freq, DAYS_PER_YEAR)
        n = max(1, round(m.paying_term_years * DAYS_PER_YEAR / pdays))
        for k in range(n):
            flows.append(CashFlow(k * pdays, -m.premium, "Premium", "premium"))
    end_day = m.policy_term_years * DAYS_PER_YEAR
    flows.append(CashFlow(end_day, m.maturity_benefit, "Maturity benefit", "benefit"))
    ear = solve_ear(flows)
    total_premium = m.premium * n
    # what the same premiums would grow to at the benchmark rate
    bench_fv = sum(-cf.amount * (1 + m.benchmark_rate) ** ((end_day - cf.day) / DAYS_PER_YEAR)
                   for cf in flows if cf.kind == "premium")
    return {
        "kind": "investment",
        "flows": [cf.to_dict() for cf in flows],
        "total_premium": round(total_premium, 2),
        "maturity_benefit": round(m.maturity_benefit, 2),
        "money_multiple": round(m.maturity_benefit / total_premium, 3) if total_premium else None,
        "irr": ear,
        "ear": ear,
        "apr": ear,
        "benchmark_rate": m.benchmark_rate,
        "benchmark_maturity": round(bench_fv, 2),
        "opportunity_loss": round(bench_fv - m.maturity_benefit, 2),
        "breakdown": [
            {"label": "Total premiums paid", "key": "bd.premiums", "amount": round(total_premium, 2), "kind": "principal"},
            {"label": "Growth credited to you", "key": "bd.growth", "amount": round(max(m.maturity_benefit - total_premium, 0), 2), "kind": "interest"},
            {"label": f"Lost vs {m.benchmark_rate * 100:.1f}% benchmark", "key": "bd.lost", "params": {"rate": f"{m.benchmark_rate * 100:.1f}%"},
             "amount": round(max(bench_fv - m.maturity_benefit, 0), 2), "kind": "fee"},
        ],
        "notes": [],
    }


def model_to_dict(m) -> dict:
    d = asdict(m)
    d["model_type"] = type(m).__name__
    return d


def model_from_dict(d: dict):
    d = dict(d)
    t = d.pop("model_type", "LoanModel")
    if t == "CardModel":
        return CardModel(**d)
    if t == "InvestmentModel":
        return InvestmentModel(**d)
    fees = [Fee(**f) for f in d.pop("fees", [])]
    return LoanModel(fees=fees, **d)


def compute(model) -> dict:
    if isinstance(model, CardModel):
        return build_card(model)
    if isinstance(model, InvestmentModel):
        return build_investment(model)
    return build_loan(model)
