# ArthaNetra: Architecture and Algorithms

## Design principle

> **Language models read and explain. Deterministic code computes and decides.**

Every number that reaches the user is (1) traced to a verbatim quote in the document, and (2) produced by plain,
tested Python, so it can be reproduced and audited.

## Request flow (`POST /api/analyze`)

```
SecurityMiddleware          rate limit, size limit, security headers
ingest.to_text()            file type from its bytes; text | PDF text layer (pypdf) | screenshot or scanned PDF (Gemini)
security.redact()           mask phone, PAN, Aadhaar, account, card, IFSC, UPI, email
      |
pipeline.read_document()
      |- heuristic.extract()               rule-based reader, values with quotes
      |- LLM reader (llm.Gateway)          same schema, temperature 0, JSON mode
      |- extractor.verify_evidence()       is the quote in the document? is the number in the quote?
      '- _consensus()                      agree / disagree / recover
      |
extractor.normalise()       verified fields -> LoanModel | CardModel | InvestmentModel (+ facts for the rules)
      |                     unverified numbers are dropped here
cashflow.compute()          dated payments -> XIRR -> APR (RBI KFS convention), EAR, IRR, breakdown
_plausible()                switch to the rule-based reading if the result is impossible
rules.evaluate()            21 rule checks, rule set IN-2026.11
patterns.detect()           pressure-tactic wording, with character positions
score.trap_score()          Trap Score (5 parts) + disclosure gap
explain.narrate()           AI writes from the fact sheet only -> house-style cleanup -> number check
security.fingerprint()      report ID from document and result hashes
```

## Key algorithms

### Log-space XIRR
For cash-flows *aᵢ* at day *tᵢ*, find EAR *r* such that Σ aᵢ·(1+r)^(−tᵢ/365) = 0.
Substitute *x = ln(1+r)*: NPV(x) = Σ aᵢ·exp(−x·tᵢ/365). Bisection on x ∈ [−9, 30] (EAR −99.99 % ... e³⁰),
300 iterations, exponent clamped to avoid overflow. APR (nominal) = (e^{x/12} − 1)·12.

### Product normalisation
| Product | Ledger |
|---|---|
| Bullet app loan | + net credited at day 0; − repayment at tenure |
| EMI loan (reducing / flat / stated EMI) | + net credited; − EMI every period; fees by timing (deducted, paid upfront, with 1st EMI, at end, per instalment); optional foreclosure |
| No-cost EMI / BNPL | principal = **cash price** (price after pay-in-full discount), so the forgone discount becomes visible cost |
| Credit card | + outstanding; monthly: interest + 18 % GST added, pay max(min-due % × balance, floor) or a fixed amount; up to 100 years |
| Insurance / investment | − premium each period for paying term; + maturity at policy term; benchmark future value for comparison |

### Evidence verification
`_norm()` lower-cases, unifies ₹/Rs/INR, strips quotes, collapses whitespace. A quote is *found* if it is a
substring of the normalised source, or its longest common block covers at least 85 % of it. The value is *verified* if a
number in the quote (with lakh/crore/k scaling) is within 0.2 % of it; otherwise *partial*.

### Trap Score
| Component | Normalisation | Weight |
|---|---|---|
| True cost | loans: (APR − 14 %)/46 % clamped; investments: (benchmark − IRR)/5 % | 0.30 |
| Disclosure Gap | DGI pp / 15 | 0.20 |
| Fee burden | fees / principal / 10 % | 0.10 |
| Rule violations | Σ severity points (high .40, medium .20, low .08) | 0.25 |
| Dark patterns | Σ pattern weights / 4 | 0.15 |

Bands: < 25 Fair · < 50 Caution · < 75 Risky · at least 75 Predatory.

## Security and privacy

See [SECURITY.md](../SECURITY.md) for the full threat table. In short: personal details are masked before any AI
call, nothing is stored, uploads are checked by their real file type, every client is rate limited, the browser is
locked down with a strict Content Security Policy, and document text can never change the maths.

## Scalability
- The engine is pure Python and takes single-digit milliseconds; the LLM call dominates latency (~3-8 s).
- Horizontal scaling behind any load balancer (stateless); Docker image provided.
- Provider-agnostic gateway with 429 back-off and automatic fallback to a smaller model with a separate quota.

## Extending
- **New rule:** add a function + `Rule(...)` entry in `engine/rules.py` with citation and product scope.
- **New product:** add a model/builder in `engine/cashflow.py` and a branch in `extractor.normalise`.
- **New language:** add to `explain.LANGUAGES` and the `<select>` in `frontend/index.html`.
- **New country:** a new rule pack (e.g. `IN-...`, `KE-...`); the engine itself is jurisdiction-neutral.
