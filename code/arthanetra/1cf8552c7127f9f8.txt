"""
ArthaNetra Trap Score and Disclosure Gap Index (DGI).

The Trap Score is a transparent 0-100 composite. Every component is returned
with its raw value, normalised value and weight, so the user (or a regulator)
can see exactly why a product scored the way it did. No black boxes.
"""
from __future__ import annotations


def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


WEIGHTS = {
    "true_cost": 0.30,
    "disclosure_gap": 0.20,
    "hidden_fees": 0.10,
    "rule_violations": 0.25,
    "dark_patterns": 0.15,
}

SEVERITY_POINTS = {"high": 0.40, "medium": 0.20, "low": 0.08}

BANDS = [
    (25, "Fair", "This offer looks broadly transparent. Still read the KFS before signing."),
    (50, "Caution", "Some costs or terms are not what they seem. Negotiate or compare before signing."),
    (75, "Risky", "Significant hidden costs or unfair terms. Strongly consider alternatives."),
    (101, "Predatory", "This offer shows multiple hallmarks of predatory finance. Do not sign without independent advice."),
]


def disclosure_gap(product_kind: str, facts: dict, computed: dict) -> dict | None:
    """DGI = how far reality is from the most prominent number the customer was shown.
    For loans: true APR minus the advertised/disclosed rate (percentage points).
    For investments: claimed/implied return minus true IRR."""
    if product_kind == "investment":
        claimed = facts.get("claimed_return")
        irr = computed.get("irr")
        if claimed is None or irr is None:
            return None
        return {"shown": claimed, "actual": irr, "gap_pp": round((claimed - irr) * 100, 2),
                "ratio": round(claimed / irr, 2) if irr > 0 else None, "basis": "claimed return vs true IRR"}
    shown = facts.get("advertised_rate")
    basis = "advertised rate vs true APR"
    if shown is None:
        shown = facts.get("disclosed_apr")
        basis = "disclosed APR vs true APR"
    if shown is None:
        shown = facts.get("stated_rate")
        basis = "stated interest rate vs true APR"
    actual = computed.get("apr")
    if shown is None or actual is None:
        return None
    return {"shown": shown, "actual": actual, "gap_pp": round((actual - shown) * 100, 2),
            "ratio": round(actual / shown, 2) if shown > 0.0005 else None, "basis": basis}


def trap_score(product_kind: str, facts: dict, computed: dict, findings: list[dict], patterns: list[dict]) -> dict:
    comps = {}

    # 1. True cost level
    if product_kind == "investment":
        irr, bench = computed.get("irr"), computed.get("benchmark_rate", 0.071)
        raw = irr
        norm = _clamp(((bench or 0) - (irr or 0)) / 0.05) if irr is not None else 0.5
        label = "True return (IRR)"
    else:
        apr = computed.get("apr")
        raw = apr
        # 14 % ≈ mainstream unsecured borrowing; 60 %+ saturates
        norm = _clamp(((apr or 0) - 0.14) / 0.46) if apr is not None else 0.5
        label = "True annual cost (APR)"
    comps["true_cost"] = {"label": label, "raw": raw, "norm": norm}

    # 2. Disclosure gap
    dgi = disclosure_gap(product_kind, facts, computed)
    if dgi is None:
        g = 0.5 if product_kind != "investment" else 0.3  # nothing disclosed is itself a gap
    else:
        g = _clamp(dgi["gap_pp"] / 15.0)
    comps["disclosure_gap"] = {"label": "Disclosure Gap Index", "raw": dgi["gap_pp"] if dgi else None, "norm": g}

    # 3. Hidden / upfront fees
    p = facts.get("principal") or computed.get("net_received") or computed.get("total_premium") or 0
    fees = computed.get("fees_total") or 0
    ratio = fees / p if p else 0
    comps["hidden_fees"] = {"label": "Fees as % of amount", "raw": round(ratio * 100, 2), "norm": _clamp(ratio / 0.10)}

    # 4. Rule violations
    pts = sum(SEVERITY_POINTS.get(f["severity"], 0) for f in findings)
    comps["rule_violations"] = {"label": "Regulatory red flags",
                                "raw": sum(1 for f in findings if f["severity"] in SEVERITY_POINTS),
                                "norm": _clamp(pts)}

    # 5. Dark patterns
    w = sum(p_["weight"] for p_ in patterns)
    comps["dark_patterns"] = {"label": "Manipulative language", "raw": len(patterns), "norm": _clamp(w / 4.0)}

    total = 0.0
    for k, c in comps.items():
        c["weight"] = WEIGHTS[k]
        c["points"] = round(c["norm"] * WEIGHTS[k] * 100, 1)
        total += c["points"]
    score = int(round(_clamp(total / 100) * 100))
    for limit, band, advice in BANDS:
        if score < limit:
            break
    return {"score": score, "band": band, "advice": advice, "components": comps, "dgi": dgi}
