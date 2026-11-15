# ArthaNetra: Intellectual Property Notes

> **Status:** prepared by the team for Arthaton 2026. This is a technical disclosure and IP plan, **not legal advice**.
> Before relying on it, have a registered Indian patent agent (or your college's IPR cell) review it.

---

## 1. Title of the invention

**System and method for evidence-anchored, neuro-symbolic verification of the true cost of consumer financial
products from unstructured documents, with regulatory compliance scoring and grounded multilingual explanation.**

Short name: *ArthaNetra: see the real price.*

## 2. Field

Financial technology; machine reading of unstructured documents; reliability of large-language-model (LLM) output;
consumer protection and regulatory technology (RegTech).

## 3. Background: the technical problem

1. Consumer credit and insurance documents present price information in inconsistent, often misleading forms
   (per-day rates, flat rates, "no-cost EMI", upfront fee deductions, GST excluded from headline rates, bundled
   insurance, maturity values without return rates).
2. Generic LLMs can read such documents but **(a)** hallucinate numbers, **(b)** perform arithmetic unreliably, and
   **(c)** are vulnerable to instructions embedded in the document (prompt injection). Their output cannot be trusted
   for financial decisions.
3. Existing APR / EMI calculators require the user to already know and type the correct inputs; they cannot read a
   document, detect what is missing, or check regulatory conformity.
4. Regulatory disclosures (e.g. the RBI Key Facts Statement) are produced *by the lender*; there is no independent,
   automated, consumer-side verification that the disclosed APR matches the document's own cash-flows.

## 4. Summary of the invention

A pipeline in which language models are restricted to *reading* and *explaining*, while every number a user sees is
produced by deterministic computation over **evidence-verified** inputs:

| Component | Novel technical contribution |
|---|---|
| **A. Evidence-Anchored Extraction (EAE)** | The reader must emit, for every field, a value *and a verbatim span* of the source. A verifier normalises text (currency symbols, Indian digit grouping, lakh/crore units), locates the span by exact or fuzzy (at least 85 % longest-match) search, and checks that the reported number occurs *within* that span. Each field gets a status: verified / partial / unverified / inferred. **Unverified numeric fields are excluded from computation** (hallucination firewall). |
| **B. Dual-Reader Consensus** | An independent, deterministic rule-based reader produces the same evidence-anchored schema. Field-level agreement is recorded; verified values missing from the LLM reading are recovered; disagreements are surfaced to the user. |
| **C. Plausibility Guard** | The computed cash-flow is tested against domain bounds (e.g. investment IRR within ±50 %/yr, finite APR, positive principal). On failure the system automatically substitutes the verified reading of the second reader. |
| **D. Universal cash-flow normalisation** | Heterogeneous products (bullet app loans, reducing/flat-rate EMIs, no-cost EMI with forgone cash discount, revolving credit with minimum-due rules and GST on interest, and regular-premium insurance with maturity benefit) are mapped onto a single dated ledger of signed cash-flows, so one solver yields a comparable annualised rate for all. |
| **E. Log-space XIRR solver** | Root-finding on x = ln(1 + EAR) by bisection, giving numerical stability from −99.99 % to astronomically high rates (> 10⁶ % EAR seen in instant-loan apps) without overflow; APR reported per the RBI KFS convention (periodic IRR × periods). |
| **F. Disclosure Gap Index (DGI)** | A metric = *true annualised cost − the most prominent rate shown to the consumer* (advertised to disclosed APR to stated rate, in that priority), plus the ratio; for investments, *claimed return − true IRR*. |
| **G. Flat-rate disguise detection** | Solves the reducing-balance rate implied by a stated instalment and compares it to the quoted rate and method. |
| **H. Regulation-as-Code** | Versioned rules, each bound to a citation and product scope, evaluated only on verified facts + engine output, each finding carrying the triggering quote. |
| **I. Financial dark-pattern lexicon** | Category-weighted pattern detection (false urgency, guarantee claims, "free" framing, minimised per-day framing, reassurance smoke-screens, approval bait, coercion/shaming, tax-deadline pressure) in English and Hinglish, with character offsets for in-document highlighting. |
| **J. Transparent composite Trap Score** | 0-100 score = Σ wᵢ·nᵢ over five normalised components (true cost, DGI, fee burden, weighted rule severity, dark-pattern weight), every component returned with raw value, weight and points. |
| **K. Numeric Grounding Guard** | All numbers in LLM-generated explanations/answers (after Indic-digit transliteration and lakh/crore/million/thousand re-scaling) are matched against the computed fact sheet and the source; ungrounded numbers are flagged to the user and, above a threshold, the LLM narrative is replaced by a deterministic template. |
| **L. Counterfactual simulator** | The normalised model is exposed so a user can alter fees, rates, prepayment month, foreclosure charge, card payment or benchmark and receive a recomputed cost, findings and score. |
| **M. Privacy-preserving pre-processing** | Before any text leaves the server for an AI provider, Indian personal identifiers (mobile numbers, PAN, Aadhaar, bank account numbers near account keywords, Luhn-validated card numbers, IFSC, UPI IDs, email) are masked by pattern rules tuned so that monetary amounts in Indian digit grouping are left untouched, preserving the document's financial meaning. |
| **N. Tamper-evident report fingerprint** | A report ID derived from SHA-256 hashes of the (masked) document, the key computed results, the engine version and the rule-set version, so that a shared report can be independently reproduced and checked. |

## 5. Draft claims (for a provisional / complete specification)

**Claim 1 (method).** A computer-implemented method for determining the true cost of a consumer financial product,
comprising: (a) receiving an unstructured document; (b) obtaining, from at least one machine reader, a set of field
values each associated with a text span asserted to originate from the document; (c) for each field, verifying that
the span occurs in the document by exact or approximate matching and that the field value is numerically present in
the span, and assigning a verification status; (d) excluding from subsequent computation any numeric field whose
status is unverified; (e) constructing from the remaining fields a dated ledger of signed cash-flows according to a
product-type-specific rule; (f) solving the ledger for an annualised internal rate of return; and (g) outputting the
rate together with the verified spans from which it was derived.

**Claim 2.** The method of claim 1, wherein step (b) uses a language model and an independent deterministic reader,
and further comprising recording agreement between them per field and substituting a verified value from the
deterministic reader where the language-model reader omitted it.

**Claim 3.** The method of claim 1 or 2, further comprising testing the result of step (f) against product-specific
plausibility bounds and, on failure, repeating steps (e)-(f) using the deterministic reader's verified fields.

**Claim 4.** The method of claim 1, wherein step (f) performs bisection on the logarithm of one plus the effective
annual rate.

**Claim 5.** The method of claim 1, further comprising computing a disclosure-gap metric as the difference between
the annualised rate of step (f) and a displayed rate selected, in priority order, from an advertised rate, a
disclosed APR and a stated interest rate.

**Claim 6.** The method of claim 1, further comprising evaluating a versioned set of regulatory rules on the verified
fields and the computed ledger, each triggered rule being reported with its citation and the verified span.

**Claim 7.** The method of claim 1, further comprising generating a natural-language explanation with a language
model from a fact sheet derived from steps (e)-(f), extracting all numerals from the explanation, normalising
script and magnitude units, and flagging or replacing the explanation when numerals are not traceable to the fact
sheet or the document.

**Claim 7A.** The method of claim 1, wherein before step (b) personal identifiers are masked by pattern rules that
exclude numerals formatted as currency amounts, so that the machine reader receives no personal data while all
pricing information is preserved.

**Claim 7B.** The method of claim 1, further comprising issuing a report identifier computed as a cryptographic hash
over the document, the computed rate and score, the engine version and the rule-set version.

**Claim 8 (system).** A system comprising one or more processors and memory storing instructions that cause the
processors to perform the method of any of claims 1 to 7B.

**Claim 9 (medium).** A non-transitory computer-readable medium storing such instructions.

## 6. Technical effect (relevant to Indian Patents Act, Section 3(k))

Section 3(k) excludes "a computer programme *per se*". The claimed subject-matter is framed around **technical
effects** beyond the program itself:

- **Improved reliability of machine-extracted data**: measurable reduction of hallucinated numeric values reaching
  downstream computation (EAE firewall + consensus + plausibility guard).
- **Numerical stability** of the rate solver across ~10 orders of magnitude.
- **Resistance to adversarial input**: document instructions cannot alter computed results (see
  `tests/test_pipeline.py::test_prompt_injection_text_is_just_data`).
- **Verifiable output**: every displayed number is linked to source spans and recomputable.

Whether these suffice is a matter for the patent agent and examiner; the CRI Guidelines (2017, revised later) should
be consulted.

## 7. Prior-art landscape and differentiation (to be confirmed by a formal search)

| Category | Typical capability | What ArthaNetra adds |
|---|---|---|
| Online EMI/APR calculators | Manual input to EMI/APR | Reads the document itself; finds missing/contradictory terms; verifies inputs |
| Generic LLM document Q&A / chat-with-PDF | Summaries & answers | Evidence-anchored values, numeric firewall, deterministic maths, grounding guard |
| Lender-side KFS generators | Produce disclosures | *Independent, consumer-side* verification that disclosure = cash-flows |
| Fraud / scam message detectors | Flag suspicious text | Quantifies *price* deception (DGI, true APR/IRR) + regulatory rule mapping |
| Credit-score / PFM apps | Track spending | Pre-contract decision support on a specific offer |

**Action:** run searches on Indian Patent Advanced Search System (InPASS), Google Patents and Espacenet with keywords
such as *"annual percentage rate" AND "document" AND "language model"*, *"verbatim" "evidence" "extraction" "financial"*,
*"hallucination" "numeric" "verification"*, and record results in an annex before filing.

## 8. IP protection strategy

| Asset | Instrument | Action & timing |
|---|---|---|
| Methods A to N | **Patent** (provisional first, complete application within 12 months) | Important: public disclosure (public GitHub, demo video, judging) can destroy novelty. India has only narrow grace-period exceptions. **File a provisional application with the Indian Patent Office *before* making the repository/video public**, or keep the repo private and share access with judges if the rules allow. Students/start-ups qualify for reduced official fees; your college IPR cell may file for you. |
| Source code, UI, docs, rule pack, lexicon | **Copyright** (automatic; optional registration with the Copyright Office, India, as a literary work) | Keep the copyright notice in `LICENSE`; register after the hackathon if commercialising. |
| Name "ArthaNetra", logo, "Trap Score", "Disclosure Gap Index" | **Trademark** (Classes 9, 36, 42) | Run a public search on the IP India trademark portal first; file if clear. Until registration use , never ®. |
| Future tuned rule weights, curated real-world dark-pattern corpus, evaluation dataset | **Trade secret** | Keep out of the public repo; NDAs for contributors. |
| Licence | Source-available, all rights reserved (`LICENSE`) | Lets judges read and run the code while reserving commercial rights. Switch to an open-source licence later only as a deliberate decision. |

**Ownership:** agree in writing (a one-page team IP agreement) who owns the IP and how it is shared among team
members, and check the hackathon's terms for any IP clauses.

## 9. Inventors & dates

| Field | Value |
|---|---|
| Inventors | *(team member names)* |
| Institution | *(college)* |
| Date of conception / first working prototype | *(date)*, commit history in the repository serves as evidence |
| First public disclosure | *(date of public repo / submission, record it)* |

## 10. Reference implementation map

| Component | File |
|---|---|
| A: EAE & verification | `backend/app/extractor.py` (`verify_quote`, `verify_evidence`, `_num` firewall) |
| B: Dual-reader consensus | `backend/app/pipeline.py` (`_consensus`), `backend/app/heuristic.py` |
| C: Plausibility guard | `backend/app/pipeline.py` (`_plausible`) |
| D, E: Ledger & log-space XIRR | `backend/app/engine/cashflow.py` |
| F, J: DGI & Trap Score | `backend/app/engine/score.py` |
| G: Flat-rate disguise | `cashflow.implied_reducing_rate`, `rules.r_flat_rate` |
| H: Regulation-as-Code | `backend/app/engine/rules.py` |
| I: Dark-pattern lexicon | `backend/app/engine/patterns.py` |
| K: Numeric Grounding Guard | `backend/app/explain.py` (`grounding_guard`) |
| M, N: Masking and report fingerprint | `backend/app/security.py` (`redact`, `fingerprint`) |
| L · Simulator | `backend/app/pipeline.py` (`simulate`), `frontend/app.js` |
