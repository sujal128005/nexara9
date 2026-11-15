# Pitch notes

The full deck is `docs/ArthaNetra_Pitch_Deck.pdf`. These are the speaker notes that go with it.

## 30-second version

"When a loan app says 0.1% a day, most people hear cheap. It is 807% a year. ArthaNetra reads any loan, EMI offer,
card bill or insurance pitch and shows the real price, the rules it breaks and what to say back, in your language. The
AI never invents a number: it has to quote the document for every value, and code does all the maths. Personal details
are masked before the AI sees anything, and nothing is stored."

## Slide by slide

1. **Title.** One line: see the real price.
2. **The problem.** Read the loan app's claim out loud, then reveal 807%. Pause.
3. **The scale.** RBI working group, 2021: about 600 of 1,100 lending apps studied were illegal. Mention no-cost EMI,
   minimum-due traps and "guaranteed" insurance as the same problem in different clothes.
4. **The product.** Upload, check, understand. Three steps.
5. **Real results.** Walk through the five examples in the table.
6. **How it works.** AI reads, code calculates. Quotes are checked. A second reader cross-checks.
7. **Security.** Masking before AI, nothing stored, file checks, rate limits, injection-proof maths, report IDs.
8. **Business model.** Free for people. Paid API for lenders, fintechs and partners.
9. **Market and go-to-market.** WhatsApp first, colleges and NGOs, then B2B.
10. **Competition.** Calculators need you to know the inputs. Chat-with-PDF tools invent numbers. We do neither.
11. **IP.** Fourteen components, provisional patent plan, trademark.
12. **Roadmap.** WhatsApp bot, browser extension, lender verification badge.
13. **Close.** "No one should sign a price they cannot see."

## Questions judges may ask

- **How do you know the rules are right?** Each rule cites its RBI or IRDAI circular and is a small, tested function.
  We present findings as information, not legal advice, and the rule set is versioned so it can be updated.
- **What if the AI misreads?** Values without a matching quote never reach the maths, a second reader cross-checks,
  and impossible results fall back to the verified reading.
- **Is user data safe?** Personal identifiers are masked before any AI call, nothing is stored, and there is no
  database to breach.
- **How do you make money?** Consumers use it free. Lenders and fintechs pay for API access to audit their own Key
  Facts Statements and to show a verified badge; partners pay for white-label versions.
