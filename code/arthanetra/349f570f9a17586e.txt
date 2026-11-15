"""
Offline heuristic reader. ArthaNetra works with no API keys at all.

A rules-based reader that produces exactly the same evidence-anchored JSON as
the LLM reader (every value carries the verbatim line it came from). Used when
no LLM is configured, when the LLM fails, and as an independent second opinion.
"""
from __future__ import annotations

import re
from typing import Optional

MONEY = re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr\b|k\b)?", re.I)
PCT = re.compile(r"(\d+(?:\.\d+)?)\s*%")
PERIOD = re.compile(r"(per\s*day|a\s*day|/\s*day|daily|per\s*week|weekly|per\s*month|a\s*month|/\s*month|p\.?\s*m\.?(?!\w)|monthly|"
                    r"per\s*annum|p\.?\s*a\.?(?!\w)|per\s*year|a\s*year|annual(?:ly)?|yearly)", re.I)


def _money(s: str) -> Optional[float]:
    m = MONEY.search(s)
    if not m:
        return None
    v = float(m.group(1).replace(",", ""))
    u = (m.group(2) or "").lower()
    if u.startswith("lakh") or u.startswith("lac"):
        v *= 1e5
    elif u.startswith("cr"):
        v *= 1e7
    elif u == "k":
        v *= 1e3
    return v


def _all_money(s: str) -> list[float]:
    out = []
    for m in MONEY.finditer(s):
        out.append(_money(m.group(0)))
    return out


def _period(s: str) -> Optional[str]:
    m = PERIOD.search(s)
    if not m:
        return None
    t = m.group(0).lower()
    if "day" in t or "daily" in t:
        return "day"
    if "week" in t:
        return "week"
    if "month" in t or re.match(r"p\.?\s*m", t):
        return "month"
    return "year"


def _lines(text: str) -> list[str]:
    return [ln.strip() for ln in text.splitlines() if ln.strip()]


def _find(lines, pattern, exclude=None) -> Optional[str]:
    for ln in lines:
        if re.search(pattern, ln, re.I) and not (exclude and re.search(exclude, ln, re.I)):
            return ln
    return None


def _cell(value, quote):
    return {"value": value, "quote": quote[:200] if quote else None}


def classify(text: str) -> str:
    t = text.lower()
    scores = {
        "credit_card": len(re.findall(r"credit card|minimum amount due|card statement|monthly statement|finance charges|total amount due", t)),
        "insurance_investment": len(re.findall(r"premium|maturity|policy|insur|ulip|life cover|sum assured", t)) - (2 if "loan" in t else 0),
        "no_cost_emi": len(re.findall(r"no[\s-]?cost emi|0% interest|checkout|mrp|instant discount", t)),
        "home_loan": len(re.findall(r"home loan|housing loan|residential|flat\b(?! rate)|property", t)),
        "vehicle_loan": len(re.findall(r"two[\s-]?wheeler|vehicle|car loan|bike|ride home", t)),
        "instant_app_loan": len(re.findall(r"instant|per day|app permissions|in \d+ minutes|cibil", t)),
        "gold_loan": len(re.findall(r"gold loan|gold ornaments|ltv", t)),
        "education_loan": len(re.findall(r"education loan|tuition|moratorium", t)),
        "personal_loan": len(re.findall(r"personal loan", t)),
    }
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else "other_loan"


def extract(text: str) -> dict:
    L = _lines(text)
    ptype = classify(text)
    F: dict[str, dict] = {}

    # provider: first line containing a title-ish name before an em dash
    first = L[0] if L else ""
    name = re.split(r"\s+[—–-]\s+|\(|:|=", first)[0].strip()
    if 2 < len(name) < 60:
        F["provider_name"] = _cell(name, name)

    # ------------------------------------------------------------- principal & amounts
    pl = (_find(L, r"total amount due|total outstanding|outstanding balance") if ptype == "credit_card" else
          _find(L, r"loan amount|sanctioned|amount financed|^mrp|price\b|amount of loan", r"credited|disburs|net"))
    if pl and _money(pl):
        F["principal"] = _cell(_money(pl), pl)
    cp = _find(L, r"pay in full|full payment|pay only|cash price")
    if cp:
        vals = _all_money(cp)
        if vals:
            F["cash_price"] = _cell(vals[-1], cp)
    dl = _find(L, r"credited|disburs(ed|al) amount|net disburs|amount you (will )?receive|in hand")
    if dl and _money(dl):
        F["disbursed_amount"] = _cell(_money(dl), dl)
    tr = _find(L, r"repayment amount|total (amount )?payable|amount to be repaid|repay ₹|total repayment")
    if tr and _money(tr):
        F["total_repayment"] = _cell(_money(tr), tr)

    # ------------------------------------------------------------- interest
    il = None
    for ln in L:
        if re.search(r"(rate of interest|interest rate|finance charges?|interest:|interest of)", ln, re.I) and \
                PCT.search(ln) and not re.search(r"penal|late|overdue|discount|free", ln, re.I):
            il = ln
            break
    if not il:
        il = _find(L, r"\d\s*%.*(per|p\.?a|p\.?m|flat)", r"penal|late|gst|fee|charge|discount|apr|returns?|foreclos")
    if il and PCT.search(il):
        v = float(PCT.search(il).group(1))
        per = _period(il) or "year"
        if ptype == "credit_card" and per == "month":
            F["card_monthly_rate_percent"] = _cell(v, il)
        F["interest_rate_percent"] = _cell(v, il)
        F["interest_rate_period"] = _cell(per, il)
        F["interest_method"] = _cell("flat" if re.search(r"\bflat\b", il, re.I) else
                                     ("reducing" if re.search(r"reducing", il, re.I) else "unknown"), il)

    # advertised headline (first ~6 lines)
    head = L[:6]
    for ln in head:
        if re.search(r"no[\s-]?cost|0\s*%\s*interest|zero interest", ln, re.I):
            claim = re.search(r"no[\s-]?cost emi|0\s*%\s*interest|zero interest", ln, re.I).group(0)
            F["advertised_rate_percent"] = _cell(0, ln)
            F["advertised_rate_period"] = _cell("year", ln)
            F["advertised_claim"] = _cell(claim, ln)
            break
        if re.search(r"only|just|lowest|starting|@", ln, re.I) and PCT.search(ln):
            F["advertised_rate_percent"] = _cell(float(PCT.search(ln).group(1)), ln)
            F["advertised_rate_period"] = _cell(_period(ln) or "year", ln)
            F["advertised_claim"] = _cell(ln[:80], ln)
            break

    al = _find(L, r"\bAPR\b|annual percentage rate")
    if al and PCT.search(al) and ptype != "credit_card":
        F["disclosed_apr_percent"] = _cell(float(PCT.search(al).group(1)), al)

    # ------------------------------------------------------------- tenure & instalments
    tl = _find(L, r"tenure|loan term|term:|repayment period|duration|for \d+ (months|days)")
    if tl:
        m = re.search(r"(\d+)\s*(days?|weeks?|months?|years?)", tl, re.I)
        if m:
            unit = m.group(2).lower().rstrip("s") + "s"
            F["tenure_value"] = _cell(float(m.group(1)), tl)
            F["tenure_unit"] = _cell(unit, tl)
    el = None
    for ln in L:  # the instalment line must carry an amount
        if re.search(r"\bEMI\b|instal?ments? of|per month for|/month", ln, re.I) and _money(ln) and \
                not re.search(r"^pay with|discount|processing|fee", ln, re.I):
            el = ln
            break
    if el:
        mny = _money(el)
        if mny:
            F["installment_amount"] = _cell(mny, el)
        m = re.search(r"(?:x|×|for)\s*(\d+)\s*(months?|instal)|(\d+)\s*(monthly )?instal", el, re.I)
        if m:
            F["installment_count"] = _cell(float(m.group(1) or m.group(3)), el)
        if not tl:
            m = re.search(r"(\d+)\s*months?", el, re.I)
            if m:
                F["tenure_value"] = _cell(float(m.group(1)), el)
                F["tenure_unit"] = _cell("months", el)
        F["installment_frequency"] = _cell("weekly" if re.search(r"week", el, re.I) else "monthly", el)

    # ------------------------------------------------------------- fees
    fees = []
    for ln in L:
        if not re.search(r"\bfees?\b|\bcharges?\b|insurance|stamp|gst on", ln, re.I):
            continue
        if re.search(r"no hidden|hidden charges|late|penal|bounce|foreclos|pre-?clos|prepay|overdue|finance charges|missed|"
                     r"discount|interest-free|applicable on finance", ln, re.I):
            continue
        amt = _money(ln)
        pct_m = PCT.search(ln)
        if amt is None and not pct_m:
            continue
        if amt is None and re.search(r"gst", ln, re.I) and not re.search(r"fee|charge|insurance", ln, re.I):
            continue
        nm = re.split(r":|—|-\s|\(", ln.lstrip("-•* "))[0].strip()[:40] or "Charge"
        gst_extra = bool(re.search(r"\+\s*(18\s*%\s*)?gst|plus gst|\+ ?gst", ln, re.I))
        if re.search(r"deduct", ln, re.I):
            timing = "upfront_deducted"
        elif re.search(r"first instal|with the first|1st emi", ln, re.I):
            timing = "with_first_installment"
        elif re.search(r"upfront|checkout|paid upfront|advance", ln, re.I):
            timing = "upfront_paid"
        else:
            timing = "upfront_deducted"
        fee = {"name": nm, "amount": amt, "percent": None if amt is not None else float(pct_m.group(1)),
               "gst_extra": gst_extra, "timing": timing,
               "is_insurance": bool(re.search(r"insurance", ln, re.I)), "quote": ln[:200]}
        if nm.lower().startswith("gst on"):
            fee["gst_extra"] = False
        fees.append(fee)

    # ------------------------------------------------------------- terms & conditions
    rl = _find(L, r"floating|repo|ebl?r|mclr|variable rate")
    if rl:
        F["rate_type"] = _cell("floating", rl)
    elif _find(L, r"\bfixed\b"):
        F["rate_type"] = _cell("fixed", _find(L, r"\bfixed\b"))
    bl = _find(L, r"borrower type|individual|business|msme|proprietor")
    F["borrower_type"] = _cell("business" if bl and re.search(r"business|msme|proprietor", bl, re.I) else "individual", bl)
    fl = _find(L, r"foreclos|pre-?clos|prepayment")
    if fl and PCT.search(fl):
        F["foreclosure_charge_percent"] = _cell(float(PCT.search(fl).group(1)), fl)
    pnl = next((ln for ln in L if re.search(r"penal(?!ty)|late payment|late fee|overdue", ln, re.I)
                and re.search(r"\d|compound", ln, re.I)), None)
    if pnl:
        comp = bool(re.search(r"compound", pnl, re.I)) and not re.search(r"not compound", pnl, re.I)
        as_int = bool(re.search(r"penal interest|%\s*(per|a)\s*(day|month)", pnl, re.I))
        F["penal_compounding"] = _cell(comp, pnl)
        F["penal_as_interest"] = _cell(as_int, pnl)
    col = _find(L, r"cooling|look[\s-]?up period")
    if col:
        if re.search(r"not applicable|nil|none|no cooling", col, re.I):
            F["cooling_off_days"] = _cell(0, col)
        else:
            m = re.search(r"(\d+)\s*days?", col, re.I)
            if m:
                F["cooling_off_days"] = _cell(float(m.group(1)), col)
    perm = _find(L, r"permission")
    if perm:
        found = []
        for key, rx in [("contacts", r"contact"), ("gallery", r"gallery|photos|media"), ("sms", r"\bsms\b"),
                        ("call_logs", r"call log"), ("files", r"files|storage"), ("location", r"location"),
                        ("camera", r"camera"), ("microphone", r"micro")]:
            if re.search(rx, perm, re.I):
                found.append(key)
        F["app_permissions"] = _cell(found, perm)

    # ------------------------------------------------------------- credit card
    if ptype == "credit_card":
        md = _find(L, r"minimum (amount )?due")
        if md:
            m = PCT.search(md)
            if m:
                F["card_min_due_percent"] = _cell(float(m.group(1)), md)
            vals = _all_money(md)
            if len(vals) >= 2:
                F["card_min_due_floor"] = _cell(min(vals), md)

    # ------------------------------------------------------------- insurance / investment
    if ptype == "insurance_investment":
        pr = _find(L, r"premium|invest", r"paying term|policy term|free")
        if pr and _money(pr):
            F["premium"] = _cell(_money(pr), pr)
            F["premium_frequency"] = _cell("monthly" if re.search(r"month", pr, re.I) else
                                           ("single" if re.search(r"single|one[\s-]?time", pr, re.I) else "yearly"), pr)
        ppt = _find(L, r"premium paying term|pay(ing)? for|for \d+ years")
        if ppt:
            m = re.search(r"(?:premium paying term[:\s]*|for\s*)(\d+)\s*years?", ppt, re.I)
            if m:
                F["premium_paying_term_years"] = _cell(float(m.group(1)), ppt)
        pt = _find(L, r"policy term|after \d+ years|maturity")
        if pt:
            m = re.search(r"(?:policy term[:\s]*|after\s*)(\d+)\s*years?", pt, re.I)
            if m:
                F["policy_term_years"] = _cell(float(m.group(1)), pt)
        mb = _find(L, r"maturity|get ₹")
        if mb and _money(mb):
            F["maturity_benefit"] = _cell(_money(mb), mb)
        sa = _find(L, r"life cover|sum assured")
        if sa and _money(sa):
            F["sum_assured"] = _cell(_money(sa), sa)
        ml = _find(L, r"market[\s-]?linked|ulip|nav|equity")
        F["market_linked"] = _cell(bool(ml), ml)
        fl2 = _find(L, r"free[\s-]?look")
        if fl2:
            m = re.search(r"(\d+)\s*days?", fl2, re.I)
            if m:
                F["free_look_days"] = _cell(float(m.group(1)), fl2)
        cr = _find(L, r"returns?.*\d+\s*%|\d+\s*%.*returns?")
        if cr and PCT.search(cr):
            F["claimed_return_percent"] = _cell(float(PCT.search(cr).group(1)), cr)

    return {"product_type": ptype, "fields": F, "fees": fees, "language": "en", "reader": "heuristic-v1"}
