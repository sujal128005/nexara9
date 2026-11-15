# Security

ArthaNetra handles financial documents, which often include names, phone numbers, PAN, Aadhaar and bank details. This
page explains what we protect against and how.

## What we protect

| Risk | What ArthaNetra does | Where in the code |
|---|---|---|
| Personal data reaching third parties | Phone, PAN, Aadhaar, bank account, card (Luhn-checked), IFSC, UPI ID and email are masked before any text is sent to an AI provider. The report shows how many were masked. | `backend/app/security.py` (`redact`) |
| Data stored and later leaked | Nothing is written to disk or a database. Documents live in memory for the length of one request. API responses carry `Cache-Control: no-store`. | `security.py`, `main.py` |
| Malicious uploads | File type is decided from the file's first bytes, not its name. Executables and archives are rejected. Size is capped at 8 MB, PDFs at 30 pages, password-protected PDFs are refused. | `security.py` (`sniff`), `ingest.py` |
| Abuse and cost attacks | Per-client rate limits on analyse, ask, voice and simulate. Requests over the size limit are refused before they are read. Simulator inputs are range-checked so absurd values cannot cause long loops. | `SecurityMiddleware`, `check_model` |
| Prompt injection | Document text is wrapped and labelled as data, the AI reader is told to ignore instructions inside it, and the result is computed by code from verified values only. A test feeds a document containing "IGNORE ALL RULES" and checks the result is unchanged. | `extractor.py`, `tests/test_pipeline.py` |
| Made-up numbers | Every extracted value must quote the document; unproven values never reach the calculation. Every number in AI-written text is matched against the calculation and flagged if it does not match. | `extractor.py`, `explain.py` |
| Browser attacks | Content Security Policy (scripts only from our own origin), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, a strict Permissions-Policy, HSTS when served over HTTPS. All dynamic text is escaped before it is shown. | `SecurityMiddleware`, `frontend/app.js` |
| Cross-site use of the API | No wildcard CORS. Other sites can call the API only if listed in `ALLOWED_ORIGINS`. | `main.py` |
| Leaked keys | API keys are read from the environment or a git-ignored `.env` file, used only on the server, and never sent to the browser. | `llm.py`, `.gitignore` |
| Edited reports | Each report has an ID built from SHA-256 hashes of the document and the key results, so anyone can re-run the same document and compare. | `security.py` (`fingerprint`) |

All of the above is covered by `backend/tests/test_security.py`.

## Settings

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | empty (same origin only) | Comma-separated list of sites allowed to call the API |
| `RATE_ANALYZE_PER_MIN` | 12 | Analyses per client per minute |
| `RATE_ASK_PER_MIN` | 20 | Questions and voice requests per client per minute |
| `RATE_SIM_PER_MIN` | 240 | Simulator requests per client per minute |
| `TRUST_PROXY` | 0 | Set to 1 behind a trusted reverse proxy so limits use the real client address |

## In production

- Serve over HTTPS only (Render, Railway and similar hosts do this for you)
- Keep AI provider keys in the host's secret settings, never in the repository
- Put the app behind a proxy with request logging that excludes bodies

## Reporting a problem

If you find a security issue, please do not open a public issue. Email the team (address in the hackathon
submission) with steps to reproduce, and we will respond within 72 hours.
