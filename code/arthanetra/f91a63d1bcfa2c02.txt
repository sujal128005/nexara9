"""
Regulation-as-Code rule pack (India).

Every rule is a small, versioned, citable function. Rules never use the LLM:
they read the *verified* facts and the deterministic engine output, so every
finding is reproducible and auditable.

IMPORTANT: Informational only, not legal advice. Citations reflect our reading
of public RBI / IRDAI circulars as of the pack date; users should verify
against the latest official text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, asdict
from typing import Callable, Optional

from ..i18n import inr, pct as _pct, t as _t

RULE_PACK_VERSION = "IN-2026.11"


@dataclass
class Finding:
    rule_id: str
    title: str
    severity: str  # high | medium | low | info | good
    regulator: str
    citation: str
    explanation: str
    evidence: Optional[str] = None
    msg_key: str = ""
    params: Optional[dict] = None

    def to_dict(self):
        return asdict(self)


@dataclass
class Rule:
    rule_id: str
    title: str
    severity: str
    regulator: str
    citation: str
    applies_to: tuple[str, ...]
    check: Callable[[dict, dict, str], Optional[tuple[str, Optional[str]]]]


LOANS = ("instant_app_loan", "personal_loan", "home_loan", "vehicle_loan", "education_loan",
         "no_cost_emi", "bnpl", "gold_loan", "business_loan", "other_loan")
DIGITAL = ("instant_app_loan", "bnpl", "no_cost_emi")
INSURANCE = ("insurance_investment",)
CARDS = ("credit_card",)


def _snip(text: str, pattern: str, width: int = 160) -> Optional[str]:
    """Return the whole line(s) containing the match, so quotes never start mid-word."""
    m = re.search(pattern, text, re.I)
    if not m:
        return None
    s = text.rfind("\n", 0, m.start()) + 1
    e = text.find("\n", m.end())
    e = len(text) if e == -1 else e
    line = text[s:e].strip()
    if len(line) > width:
        cut = line.rfind(" ", 0, width)
        line = line[: cut if cut > 40 else width].rstrip(" ,;:") + "..."
    return line


def pct(x: Optional[float]) -> str:
    return _pct(x)


# ---------------------------------------------------------------------------------- rules
# Each rule returns (message_key, params, evidence). Params are already formatted strings,
# so the same message can be shown in any of the 12 languages (see app/i18n).

def r_apr_missing(f, c, t):
    if f.get("disclosed_apr") is None and c.get("apr") is not None:
        return "msg.apr_missing", {"apr": pct(c["apr"])}, None


def r_apr_mismatch(f, c, t):
    d, a = f.get("disclosed_apr"), c.get("apr")
    if d is not None and a is not None and (a - d) > 0.002:
        return "msg.apr_mismatch", {"disclosed": _pct(d, 2), "apr": _pct(a, 2)}, f.get("_q_disclosed_apr")


def r_disclosure_gap(f, c, t):
    adv, a = f.get("advertised_rate"), c.get("apr")
    if adv is None and f.get("disclosed_apr") is None:
        adv = f.get("stated_rate")  # the only rate the customer was shown
    if adv is not None and a is not None and a - adv > 0.05:
        p = {"apr": pct(a), "shown": pct(adv), "claim": f.get("advertised_claim") or "", "mult": f"{a / adv:.1f}" if adv > 0.001 else ""}
        key = "msg.gap_claim" if f.get("advertised_claim") else "msg.gap_rate"
        if adv > 0.001:
            key += "_mult"
        return key, p, f.get("_q_advertised_rate")


def r_zero_cost_claim(f, c, t):
    claim = (f.get("advertised_claim") or "") + " " + t[:4000]
    if re.search(r"no[\s-]?cost\s*emi|0\s*%\s*(interest|emi)|zero\s*(interest|cost)", claim, re.I) and (c.get("apr") or 0) > 0.01:
        return "msg.zero_cost", {"apr": pct(c["apr"])}, _snip(t, r"no[\s-]?cost|0\s*%|zero")


def r_flat_rate(f, c, t):
    stated, method, implied = f.get("stated_rate"), f.get("rate_method"), c.get("implied_reducing_rate")
    if stated and implied and method == "flat" and implied - stated > 0.02:
        return "msg.flat", {"stated": pct(stated), "implied": pct(implied)}, f.get("_q_stated_rate")
    if (stated and implied and method != "flat" and implied - stated > 0.015 and f.get("installment_stated")
            and f.get("product_type") not in ("no_cost_emi", "bnpl")):
        return "msg.flat_implied", {"stated": pct(stated), "implied": pct(implied)}, f.get("_q_stated_rate")


def r_upfront_deduction(f, c, t):
    p, net = f.get("principal"), c.get("net_received")
    if p and net is not None and c.get("kind") == "loan" and (p - net) / p > 0.05:
        return "msg.upfront", {"principal": inr(p), "net": inr(net), "share": f"{(p - net) / p * 100:.1f}%"}, f.get("_q_disbursed")


def r_cooling_off(f, c, t):
    days = f.get("cooling_off_days")
    tenor = c.get("tenure_days") or f.get("tenure_days") or 0
    need = 3 if tenor >= 7 else 1
    if days is None:
        return ("msg.cooling_missing" if need > 1 else "msg.cooling_missing_one"), {"need": need}, None
    if days < need:
        key = "msg.cooling_none" if days == 0 else "msg.cooling_short"
        return key, {"need": need, "days": days}, _snip(t, r"cooling|look[\s-]?up")


def r_permissions(f, c, t):
    bad = [p for p in f.get("permissions", []) if p in ("contacts", "gallery", "call_logs", "files", "sms", "media")]
    if bad:
        return "msg.permissions", {"items": bad}, _snip(t, r"permission|contacts|gallery")


def r_recovery_threat(f, c, t):
    q = _snip(t, r"(contacts?|relatives?|friends?|family|employer)\s+(will|may|shall)\s+be\s+(informed|contacted|notified|called)|"
                 r"(inform|contact|notify|call)\s+your\s+(contacts|relatives|friends|family|employer)")
    if q:
        return "msg.recovery", {}, q


def r_penal_interest(f, c, t):
    if f.get("penal_compounding") or f.get("penal_as_interest"):
        return "msg.penal", {}, f.get("_q_penal") or _snip(t, r"penal|late payment|overdue")


def r_foreclosure_floating(f, c, t):
    if (f.get("rate_type") == "floating" and f.get("borrower_type") != "business"
            and (f.get("foreclosure_pct") or 0) > 0):
        return "msg.foreclosure", {"pct": f"{f['foreclosure_pct'] * 100:.1f}%"}, f.get("_q_foreclosure")


def r_bundled_insurance(f, c, t):
    if f.get("insurance_bundled"):
        return "msg.insurance", {}, _snip(t, r"insurance")


def r_extreme_cost(f, c, t):
    a = c.get("apr")
    if a is not None and a > 0.6:
        return "msg.extreme", {"apr": pct(a)}, None


def r_unregistered(f, c, t):
    if not re.search(r"\b(NBFC|bank|RBI|regulated entity|lending partner|CIN|registration)\b", t, re.I):
        return "msg.unregistered", {}, None


def r_card_min_due(f, c, t):
    yrs, total, spent = c.get("years_to_repay"), c.get("total_paid"), c.get("net_received")
    if yrs is None and c.get("balance_left"):
        return "msg.card_never", {}, _snip(t, r"minimum")
    if yrs and yrs > 3:
        return "msg.card_min", {"years": f"{yrs:.0f}", "total": inr(total), "spent": inr(spent)}, _snip(t, r"minimum (amount )?due")


def r_card_gst(f, c, t):
    a = c.get("apr")
    if a and f.get("disclosed_apr") and a - f["disclosed_apr"] > 0.03:
        return "msg.card_gst", {"disclosed": pct(f["disclosed_apr"]), "apr": pct(a), "ear": pct(c.get("ear"))}, f.get("_q_disclosed_apr")


def r_free_look(f, c, t):
    d = f.get("free_look_days")
    if d is not None and d < 30:
        return "msg.freelook_short", {"days": d}, _snip(t, r"free[\s-]?look")
    if d is None:
        return "msg.freelook_missing", {}, None


def r_guaranteed_market(f, c, t):
    g = re.search(r"guarante|assured|double (your )?money|risk[\s-]?free", t, re.I)
    if g and (f.get("market_linked") or re.search(r"market[\s-]?linked|ULIP|NAV|equity", t, re.I)):
        return "msg.guaranteed", {}, _snip(t, r"guarante|assured|double")


def r_low_irr(f, c, t):
    irr, bench = c.get("irr"), c.get("benchmark_rate")
    if irr is not None and bench is not None and irr < bench - 0.01:
        return "msg.low_irr", {"irr": _pct(irr, 2), "bench": pct(bench), "bench_value": inr(c.get("benchmark_maturity", 0)),
                               "maturity": inr(c.get("maturity_benefit", 0))}, None


def r_good_kfs(f, c, t):
    if f.get("disclosed_apr") is not None and c.get("apr") is not None and abs(c["apr"] - f["disclosed_apr"]) <= 0.002:
        return "msg.good_kfs", {"disclosed": pct(f["disclosed_apr"]), "apr": pct(c["apr"])}, f.get("_q_disclosed_apr")


def r_good_cooling(f, c, t):
    tenor = c.get("tenure_days") or 0
    need = 3 if tenor >= 7 else 1
    if f.get("cooling_off_days") is not None and f["cooling_off_days"] >= need:
        return "msg.good_cooling", {"days": f["cooling_off_days"]}, _snip(t, r"cooling|look[\s-]?up")


RULES: list[Rule] = [
    Rule("DISC-01", "Advertised rate hides the real cost", "high", "RBI",
         "RBI Key Facts Statement for Loans & Advances (Apr 2024, effective 1 Oct 2024): APR must reflect all-in cost",
         LOANS, r_disclosure_gap),
    Rule("DISC-02", "APR not disclosed", "medium", "RBI",
         "RBI KFS circular (Apr 2024): APR mandatory in the Key Facts Statement for retail & MSME term loans",
         LOANS, r_apr_missing),
    Rule("DISC-03", "Disclosed APR does not match the numbers", "high", "RBI",
         "RBI KFS circular (Apr 2024): fees not in the KFS cannot be charged; APR must include all charges",
         LOANS, r_apr_mismatch),
    Rule("DISC-04", "'No-Cost EMI' is not free", "high", "RBI",
         "RBI circular on 0% interest EMI schemes (Sep 2013); KFS APR disclosure (2024)",
         ("no_cost_emi", "bnpl", "personal_loan", "other_loan"), r_zero_cost_claim),
    Rule("DISC-05", "Flat-rate disguise", "high", "RBI",
         "RBI Fair Practices Code: interest must be clearly disclosed; KFS illustrates reducing-balance APR",
         LOANS, r_flat_rate),
    Rule("COST-01", "Large upfront deduction", "medium", "RBI",
         "RBI Digital Lending Directions: all fees must be disclosed in KFS; disbursal directly to borrower",
         LOANS, r_upfront_deduction),
    Rule("COST-02", "Extremely high cost of credit", "high", "ArthaNetra",
         "ArthaNetra risk heuristic (APR > 60%)", LOANS, r_extreme_cost),
    Rule("DL-01", "No proper cooling-off period", "medium", "RBI",
         "RBI Digital Lending Guidelines (Sep 2022) / Digital Lending Directions 2025: min 3 days (tenor of 7 days or more), 1 day otherwise",
         DIGITAL + ("personal_loan",), r_cooling_off),
    Rule("DL-02", "Invasive phone permissions", "high", "RBI",
         "RBI Digital Lending Guidelines (Sep 2022): no access to file & media, contacts, call logs, telephony",
         DIGITAL + ("personal_loan", "other_loan"), r_permissions),
    Rule("DL-03", "Recovery harassment threat", "high", "RBI",
         "RBI Fair Practices Code & outsourcing guidelines: no intimidation or contacting relatives/friends",
         LOANS + CARDS, r_recovery_threat),
    Rule("DL-04", "Lender identity not disclosed", "medium", "RBI",
         "RBI Digital Lending Guidelines: name of regulated entity must be disclosed to the borrower",
         DIGITAL, r_unregistered),
    Rule("PEN-01", "Compounding penal interest", "high", "RBI",
         "RBI 'Fair Lending Practice - Penal Charges in Loan Accounts' (18 Aug 2023, effective 1 Jan 2024)",
         LOANS, r_penal_interest),
    Rule("PRE-01", "Foreclosure charge on a floating-rate loan", "high", "RBI",
         "RBI circulars (2012, 2014; Pre-payment Charges Directions 2025): no foreclosure charges on floating-rate loans to individuals",
         LOANS, r_foreclosure_floating),
    Rule("INS-01", "Bundled insurance", "low", "RBI / IRDAI",
         "IRDAI & RBI guidance: insurance must not be forced as a condition; borrower's choice of insurer",
         LOANS, r_bundled_insurance),
    Rule("CC-01", "Minimum-due debt trap", "high", "RBI",
         "RBI Master Direction - Credit Card and Debit Card (2022): MAD must not cause negative amortisation",
         CARDS, r_card_min_due),
    Rule("CC-02", "GST left out of the headline rate", "medium", "RBI",
         "RBI Credit Card Master Direction (2022): APR & charges to be disclosed in the MITC",
         CARDS, r_card_gst),
    Rule("IRDAI-01", "Free-look period", "medium", "IRDAI",
         "IRDAI (Protection of Policyholders' Interests) Regulations 2024: 30-day free-look period",
         INSURANCE, r_free_look),
    Rule("IRDAI-02", "'Guaranteed' claim on a market-linked product", "high", "IRDAI",
         "IRDAI advertisement & disclosure norms: no guaranteed-return claims on market-linked products",
         INSURANCE, r_guaranteed_market),
    Rule("INV-01", "Return below a safe benchmark", "high", "ArthaNetra",
         "ArthaNetra IRR comparison vs user-editable benchmark (default: PPF rate)", INSURANCE, r_low_irr),
    Rule("GOOD-01", "Transparent APR", "good", "RBI", "RBI KFS circular (Apr 2024)", LOANS, r_good_kfs),
    Rule("GOOD-02", "Cooling-off period provided", "good", "RBI", "RBI Digital Lending Guidelines (2022)",
         DIGITAL + ("personal_loan",), r_good_cooling),
]


def evaluate(product_type: str, facts: dict, computed: dict, text: str) -> list[dict]:
    out = []
    for rule in RULES:
        if product_type not in rule.applies_to and not (product_type == "other" and rule.applies_to is LOANS):
            continue
        try:
            res = rule.check(facts, computed, text)
        except Exception:  # a broken rule must never break an analysis
            res = None
        if res:
            key, params, ev = res
            out.append(Finding(rule.rule_id, rule.title, rule.severity, rule.regulator, rule.citation,
                               _t("en", key, **params), ev, key, params).to_dict())
    order = {"high": 0, "medium": 1, "low": 2, "info": 3, "good": 4}
    out.sort(key=lambda x: order.get(x["severity"], 9))
    return out
