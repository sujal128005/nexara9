"""Deterministic engine tests. The maths must be exactly right."""
import math

import pytest

from app.engine.cashflow import (CardModel, CashFlow, Fee, InvestmentModel, LoanModel, build_card, build_investment,
                                 build_loan, ear_to_nominal, emi, implied_reducing_rate, normalize_rate, solve_ear)


def test_emi_matches_standard_formula():
    # ₹40 lakh, 8.75 %, 20 years -> ₹35,348 (bank calculators)
    assert round(emi(4_000_000, 0.0875, 240)) == 35348


def test_zero_rate_emi():
    assert emi(12000, 0.0, 12) == 1000


def test_xirr_simple_year():
    flows = [CashFlow(0, 100, "in"), CashFlow(365, -110, "out")]
    assert solve_ear(flows) == pytest.approx(0.10, abs=1e-9)


def test_xirr_handles_extreme_rates():
    flows = [CashFlow(0, 3938, "in"), CashFlow(15, -5075, "out")]
    ear = solve_ear(flows)
    assert ear > 400  # > 40,000 % effective
    assert ear_to_nominal(ear) == pytest.approx(8.0707, rel=1e-3)


def test_no_sign_change_returns_none():
    assert solve_ear([CashFlow(0, -1, "a"), CashFlow(10, -1, "b")]) is None


def test_normalize_rate():
    assert normalize_rate(0.1, "day") == pytest.approx(0.365)
    assert normalize_rate(2, "month") == pytest.approx(0.24)
    assert normalize_rate(12, "year") == pytest.approx(0.12)


def test_flat_rate_disguise():
    r = build_loan(LoanModel(principal=80000, tenure_days=730, rate_annual=0.09, rate_method="flat", n_installments=24))
    assert r["installment"] == pytest.approx(3933.33, abs=0.01)
    assert r["implied_reducing_rate"] == pytest.approx(0.1643, abs=0.001)


def test_implied_rate_roundtrip():
    e = emi(100000, 0.14, 36)
    assert implied_reducing_rate(100000, e, 36) == pytest.approx(0.14, abs=1e-6)


def test_fair_loan_apr_matches_kfs():
    r = build_loan(LoanModel(principal=200000, tenure_days=36 * 30.4167, rate_annual=0.115, n_installments=36,
                             fees=[Fee("Processing fee", 2360, base_amount=2000, gst=360)]))
    assert r["installment"] == pytest.approx(6595.2, abs=0.5)
    assert r["apr"] == pytest.approx(0.1233, abs=0.0005)
    assert r["net_received"] == 197640


def test_no_cost_emi_is_not_free():
    r = build_loan(LoanModel(principal=27500, tenure_days=182.5, n_installments=6, installment=5000,
                             fees=[Fee("Processing", 234.82, "upfront_paid"), Fee("GST on interest", 236, "with_first_installment")]))
    assert r["apr"] > 0.30


def test_prepayment_simulation_reduces_total():
    base = build_loan(LoanModel(principal=100000, tenure_days=365 * 3, rate_annual=0.15, n_installments=36))
    pre = build_loan(LoanModel(principal=100000, tenure_days=365 * 3, rate_annual=0.15, n_installments=36, prepay_month=12))
    assert pre["total_paid"] < base["total_paid"]


def test_credit_card_minimum_due_trap():
    r = build_card(CardModel(outstanding=50000, monthly_rate=0.0375))
    assert r["years_to_repay"] > 25
    assert r["total_paid"] > 5 * 50000
    fast = build_card(CardModel(outstanding=50000, monthly_rate=0.0375, fixed_payment=5000))
    assert fast["months_to_repay"] <= 14


def test_investment_irr():
    r = build_investment(InvestmentModel(premium=100000, premium_frequency="yearly", paying_term_years=10,
                                         policy_term_years=20, maturity_benefit=1650000, benchmark_rate=0.071))
    assert r["irr"] == pytest.approx(0.0326, abs=0.0005)
    assert r["benchmark_maturity"] > r["maturity_benefit"]
