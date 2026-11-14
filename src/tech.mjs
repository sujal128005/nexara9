// Technical detail for each project page: languages, architecture and a walk through the repository.
// Languages are measured from each repository's source files (generated data and vendored libraries excluded).
// Repository entries: [path, what it does, children?]

export const tech = {
  udaan: {
    languages: [['HTML', 100]],
    arch: {
      title: 'How the aircraft is wired',
      tiers: [
        { name: 'On the ground', nodes: [['Pilot', 'Flies by eye and moves the sticks.'], ['Transmitter', 'Encodes stick positions and sends them over 2.4 GHz radio.']] },
        { name: 'Electronics on board', nodes: [['Receiver', 'Splits the radio signal into throttle, roll, pitch and yaw channels.'], ['ESC', 'Meters battery power to the motor.'], ['Servos', 'Turn each channel into movement.'], ['LiPo battery', 'Powers everything; its position sets the balance.']] },
        { name: 'Moving parts', nodes: [['Motor + propeller', 'Thrust.'], ['Ailerons, elevator, rudder', 'Roll, pitch and yaw.']] },
      ],
      flow: [
        'The pilot moves a stick; the transmitter sends the new position about fifty times a second.',
        'The receiver decodes it and passes each channel to its servo, or the throttle to the ESC.',
        'Servos push the control surfaces through rods; the ESC changes motor speed.',
        'The plane responds, and the pilot corrects by eye. The pilot is the feedback loop.',
      ],
    },
    repo: [
      ['index.html', 'The Udaan project page: an animated intro where a plane flies across the screen and the “Udaan · G-Cruise Alliance” logo fades in.'],
      ['index2.html', 'A second page the intro hands over to.'],
      ['README.md', 'Project title.'],
    ],
  },

  'moodie-foodie': {
    languages: [['JavaScript', 63.5], ['HTML', 36.5]],
    arch: {
      title: 'Everything runs in the browser',
      tiers: [
        { name: 'Page', sub: 'code/index.html', nodes: [['Input panel', 'Mood, Veg / Non-veg / Both, price range, dish name.'], ['Result cards', 'Best picks, canteen call buttons, today’s mess menu.']] },
        { name: 'Logic', sub: 'logic.js', nodes: [['suggestFood()', 'Validates input, filters, ranks and picks.'], ['Price inference', 'Default budget per mood when none is given.'], ['Mess menu', 'Finds the current meal from the day and time.']] },
        { name: 'Data', sub: 'code/data.js', nodes: [['Canteen items', 'Name, price, veg or non-veg, canteen.'], ['Mess menu', 'Breakfast, lunch, snacks, dinner for each day.'], ['Canteen phones', 'Tap-to-call links.']] },
      ],
      flow: [
        'The page loads the menu data and the logic as plain script files. There is no server.',
        'You press “Get smart suggestions”. The inputs are read and checked.',
        'If you typed a dish, price limits are switched off; otherwise a sensible budget is filled in.',
        'Items are filtered, substantial meals are preferred, and the cheapest match for your mood is shown.',
      ],
    },
    repo: [
      ['code/', 'The app itself.', [
        ['index.html', 'Layout and styling (Tailwind CSS), the input form and the result area.'],
        ['data.js', 'Every canteen item with its price and type, the full weekly mess menu and canteen phone numbers.'],
      ]],
      ['logic.js', 'The recommendation engine: price ranges, substantial-meal detection, food cards, `suggestFood()`, current-meal detection and the mess menu view.'],
      ['work-flow logic', 'The decision flow written as a diagram: inputs → validation → dish override or price check → filter → rank → show.'],
      ['assets/', 'The IIITDM Kurnool logo.'],
    ],
  },

  nexgen: {
    languages: [['HTML', 62.0], ['CSS', 22.2], ['JavaScript', 15.8]],
    arch: {
      title: 'A front-end prototype, with the back end planned',
      tiers: [
        { name: 'Modules (pages)', nodes: [['Dashboard', 'Progress, heatmaps, streaks.'], ['AI paper generator', 'Topic, difficulty, type → A4 preview → PDF.'], ['Syllabus, PYQs, notes', 'Tracking and resources.'], ['Channels, code editor', 'Chat and coding.']] },
        { name: 'Shared in the browser', nodes: [['Theme', 'Dark or light, remembered with localStorage.'], ['AI widget', 'A helper panel on every page.'], ['Libraries', 'Prism.js, CodeJar, html2pdf.js, Font Awesome.']] },
        { name: 'Planned back end', dashed: true, nodes: [['Node.js + Express', 'Accounts, data and uploads.'], ['Gemini API', 'Real AI answers and papers.'], ['Firebase Auth, Socket.io', 'Sign-in and live collaboration.']] },
      ],
      flow: [
        'Each module is a self-contained page with its own HTML, CSS and JavaScript.',
        'Pages share a visual language and the theme setting through the browser’s storage.',
        'Interactions such as paper generation, uploads and chat are simulated in the browser today.',
        'The roadmap connects them to a Node.js API, the Gemini API and live chat.',
      ],
    },
    repo: [
      ['1_Dashboard/', 'Home: stats, heatmap, streaks and the 3D “knowledge core”. Each module folder has an `.html`, `.css` and `.js` file and the logo.'],
      ['2_AIPaperGenerator/', 'Paper builder with A4 preview and PDF download.'],
      ['3_PYQ_Archive/', 'Searchable past-year question archive.'],
      ['4_Branch_Channels/', 'Discord-style chat with branch-locked channels.'],
      ['5_Code_Editor/', 'In-browser editor with highlighting, console and team chat.'],
      ['6_Notes_Repository/', 'Upload, filter and download notes.'],
      ['7_Syllabus_List/', 'List of courses and syllabus search.'],
      ['8_Syllabus/', 'Topic checklists and module progress bars.'],
      ['NexGen_html_code/', 'Single-file versions of every page, for quick viewing.'],
    ],
  },

  'binance-futures-bot': {
    languages: [['Python', 100]],
    arch: {
      title: 'From your terminal to the testnet',
      tiers: [
        { name: 'Your computer', nodes: [['Terminal', 'You type one command.'], ['cli.py', 'Parses and validates options with Click.'], ['.env', 'API key and secret, never in code.']] },
        { name: 'bot package', nodes: [['client.py', 'Creates a testnet futures client.'], ['orders.py', 'Builds parameters and places the order.'], ['logger.py', 'Logs to console and bot.log.']] },
        { name: 'Exchange', nodes: [['Binance Futures testnet', 'USDT-M futures REST API with test funds.']] },
      ],
      flow: [
        '`cli.py` checks the symbol, side, type, quantity and price.',
        '`client.py` loads keys from the environment and connects to the testnet.',
        '`orders.py` adds price and “good till cancelled” for limit orders, then calls the API.',
        'The request and response are logged; the result or a clear error is printed.',
      ],
    },
    repo: [
      ['cli.py', 'Entry point. Defines the command and its options, validates them and prints the result.'],
      ['bot/', 'The reusable core.', [
        ['client.py', 'Reads keys from the environment and creates a client pointed at the futures testnet.'],
        ['orders.py', '`place_futures_order()`: builds the order parameters and sends them, logging both sides.'],
        ['logger.py', 'Logging set-up: one format for the console and the `bot.log` file.'],
      ]],
      ['.env.example', 'Template for the API key and secret.'],
      ['requirements.txt', 'Python packages needed.'],
      ['bot.log', 'Example log from real testnet runs.'],
    ],
  },

  'finance-api': {
    languages: [['Python', 100]],
    arch: {
      title: 'A classic three-layer API',
      tiers: [
        { name: 'Client', nodes: [['Any HTTP client', 'curl, a front end, or the automatic docs page.'], ['X-User-Role', 'viewer, analyst or admin.']] },
        { name: 'FastAPI app', sub: 'main.py', nodes: [['Routes', '/transactions/, /summary/'], ['Role checks', 'Dependencies run before each route.'], ['Validation', 'Pydantic schemas in schemas.py.']] },
        { name: 'Data', nodes: [['SQLAlchemy', 'Sessions and queries (database.py).'], ['SQLite', 'A single database file.']] },
      ],
      flow: [
        'A request arrives with a role header and, for writes, a JSON body.',
        'FastAPI runs the role dependency: unknown role → 400, wrong role → 403.',
        'Pydantic validates the body (amount above zero, known type, real date) → 422 if not.',
        'SQLAlchemy reads or writes SQLite; the response is shaped by the output schema.',
      ],
    },
    repo: [
      ['main.py', 'The app: role dependencies and the four endpoints (create, list with filters, delete, summary).'],
      ['schemas.py', 'Pydantic models for input, output and the summary.'],
      ['database.py', 'Database engine, session factory and the `get_db` dependency.'],
      ['test_main.py', 'pytest tests for the endpoints.'],
      ['requirements.txt', 'Python packages needed.'],
    ],
  },

  khata: {
    languages: [['TypeScript', 99.0], ['SQL', 0.5], ['CSS', 0.3], ['JavaScript', 0.2]],
    arch: {
      title: 'Next.js app: browser, server and a source of truth',
      tiers: [
        { name: 'Browser', nodes: [['Console', 'The live call screen (sales reps only).'], ['Speech + redaction', 'Web Speech API, then personal details removed before sending.'], ['Dashboards', 'Analytics, call reviews, rep records.']] },
        { name: 'Next.js server', nodes: [['API routes', '/api/triage → /api/extract → /api/correct, /api/classify, /api/close.'], ['Adjudicator', 'Deterministic verdicts and EMI maths.'], ['Access control', 'Signed sessions; role-scoped queries.']] },
        { name: 'Data and models', nodes: [['SQLite', 'Calls and encrypted, hash-chained khatas.'], ['product_truth.json', 'The versioned product spec.'], ['Language model', 'Optional. Parses sentences only; offline stub if absent.']] },
      ],
      flow: [
        'The rep speaks; the browser turns it into text and redacts it before any request.',
        '/api/triage asks: is there a claim here? /api/extract turns it into a structured claim.',
        'The adjudicator compares the claim with the spec and returns a verdict in milliseconds.',
        'For a wrong claim, /api/correct drafts a fix that is re-checked before it is shown.',
        'At the end, /api/close writes the khata and proposes CRM updates for the rep to approve.',
      ],
    },
    repo: [
      ['app/', 'Pages and API routes (Next.js App Router).', [
        ['console/', 'The live call screen.'],
        ['api/', 'triage, extract, correct, classify, close, bootstrap and sign-in routes.'],
        ['dashboard/, analytics/', 'Team and personal records, one row per closed call.'],
        ['calls/[callId]/, reps/[userId]/', 'Read-only review of one call or one rep.'],
        ['product/, script/', 'The product spec page and the live-demo rehearsal sheet.'],
      ]],
      ['lib/', 'The logic.', [
        ['adjudicate.ts', 'Turns a claim into a verdict. Imports nothing from the model code.'],
        ['emi.ts', 'All EMI, APR and total-payable maths.'],
        ['correction.ts, selfcheck.ts', 'The three-tier correction loop and its zero-config tests.'],
        ['redact.ts', 'Removes phone, Aadhaar, PAN, email and names, keeps amounts.'],
        ['closer.ts', 'Writes the khata (hash chain, encryption) and the CRM proposal.'],
        ['access.ts, auth.ts, session.ts', 'Who can see what, sign-in and signed sessions.'],
        ['llm.ts, stub.ts', 'Model provider, and the deterministic offline parser.'],
        ['callflow.ts, metrics.ts', 'Inbound call states and dashboard numbers.'],
      ]],
      ['data/', '`product_truth.json` (spec with archive), customers, CRM and rates.'],
      ['db/schema.sql', 'SQLite tables.'],
      ['middleware.ts', 'Protects pages that need a signed-in user.'],
      ['scripts/', 'Database set-up and demo reset.'],
    ],
  },

  stealth: {
    languages: [['TypeScript', 96.7], ['CSS', 1.7], ['SQL', 1.6]],
    arch: {
      title: 'A gateway between an agent and checkout',
      tiers: [
        { name: 'Agent side', nodes: [['Shopping agent', 'A demo agent with tools, browsing a simulated catalogue.'], ['Mandate', 'Signed spending authorisation from the human.']] },
        { name: 'STEALTH (Next.js)', nodes: [['Mandate verifier', 'Ed25519 signature, expiry, single-use nonce.'], ['Extraction', 'Injection scan and category mapping.'], ['Intent-Cart engine', 'Model compares intent and cart into a schema.'], ['Policy', 'Thresholds → ALLOW, STEP_UP or DECLINE.']] },
        { name: 'Data and services', nodes: [['Prisma + SQLite', 'Requests, decisions, approvals.'], ['Audit chain', 'Tamper-evident event log.'], ['Razorpay (test mode)', 'Reached only from ALLOW.'], ['Model provider', 'Anthropic or any OpenAI-compatible API.']] },
      ],
      flow: [
        'The agent submits its mandate and cart to the evaluation pipeline.',
        'Cheap, certain checks run first; a bad mandate is declined before any model runs.',
        'The cart is scanned and the model produces an Authorization Diff, validated with Zod.',
        'Policy turns the evidence into a decision; every step is persisted and audited.',
        'ALLOW opens a Razorpay test order; STEP_UP waits for the human on the approvals page.',
      ],
    },
    repo: [
      ['app/', 'Pages and API: requests, one request’s pipeline view, approvals, evidence, privacy.'],
      ['lib/', 'The pipeline, one folder per stage.', [
        ['mandate/', 'Signing and verifying mandates; expiry and nonce replay protection.'],
        ['extraction/', 'Deterministic prompt-injection scan and the closed category list.'],
        ['ai/', 'The Intent-Cart Consistency Engine, prompts and model providers.'],
        ['policy/', 'Thresholds that turn a diff into ALLOW, STEP_UP or DECLINE.'],
        ['pipeline/', '`evaluatePurchaseRequest`: runs every stage and saves the result.'],
        ['agent/', 'The live demo shopping agent and its tools.'],
        ['audit/', 'Canonical hashing and chain verification for the audit log.'],
        ['privacy/', 'Encryption at rest, redaction and what may leave for the model.'],
        ['razorpay/', 'Test-mode orders and webhook handling.'],
      ]],
      ['schemas/', 'Zod types for mandates, purchases, diffs and decisions.'],
      ['prisma/', 'Database schema, migrations and seed scenarios.'],
      ['eval/', 'A labelled dataset replayed through the real pipeline.'],
      ['scripts/', 'Database reset, engine check, privacy audit, key generation.'],
    ],
  },

  'paypal-attribute': {
    languages: [['TypeScript', 86.4], ['CSS', 12.5], ['JavaScript', 1.1]],
    arch: {
      title: 'One Next.js service for UI, API and the money engine',
      tiers: [
        { name: 'Who uses it', nodes: [['Shopper', 'Chats with the agent at /shop and pays with PayPal.'], ['Merchants and creators', 'Ledgers, rules, earnings.'], ['Other AI agents', 'REST API at /api/v1 or the MCP server.']] },
        { name: 'Next.js 15 service', nodes: [['Agent + scoring', 'Grounded answers; AI influence scores.'], ['Engine', 'Risk checks, split, hold window, ledger.'], ['API routes', 'checkout, webhook, payouts, refunds, v1.']] },
        { name: 'Data and services', nodes: [['Document store', 'Atomic JSON store, swappable for Postgres.'], ['PayPal sandbox', 'Orders, Payouts, Webhooks, Log in with PayPal.'], ['AI chain', 'Groq → Gemini → built-in rules.']] },
      ],
      flow: [
        'The agent answers with citations; an attribution token is created for them.',
        'Checkout creates a PayPal order carrying the token in `custom_id`.',
        'On capture (and the verified webhook), influence is scored and risk checks run.',
        'The pool is split to the cent and held; `releaseDuePayouts()` pays via PayPal Payouts.',
      ],
    },
    repo: [
      ['src/app/', 'Pages (shop, attribution trace, merchants, creators, developers, risk) and all API routes.'],
      ['src/lib/', 'The core.', [
        ['engine.ts', 'Capture → score → risk → split → hold → payout, and refunds.'],
        ['split.ts', 'Commission, fee, min/max shares, largest-remainder rounding.'],
        ['scoring.ts, risk.ts', 'Deterministic baseline scores and the six risk checks.'],
        ['agent.ts, ai.ts', 'The shopping agent and the model fallback chain.'],
        ['paypal.ts', 'Orders, capture, payouts, refunds and webhook verification.'],
        ['store.ts, seed.ts', 'Persistence and 30 days of history made by the real engine.'],
        ['openapi.ts, channel3.ts', 'The public API spec and the optional live catalogue.'],
      ]],
      ['src/components/', 'Shared UI: answer with footnotes, PayPal buttons, data grid.'],
      ['mcp/server.mjs', 'MCP server so any agent can make recommendations attributable.'],
      ['tests/', 'Engine, payout and split tests.'],
      ['render.yaml', 'One-click deployment on Render.'],
    ],
  },

  flexdrop: {
    languages: [['Python', 62.5], ['JavaScript', 33.2], ['CSS', 2.6], ['HTML', 1.2], ['Shell', 0.5]],
    arch: {
      title: 'A decision service that sits next to dispatch',
      tiers: [
        { name: 'Callers', nodes: [['Checkout', 'Asks for a quote; records consent.'], ['Dispatch engine', 'Asks for a plan every epoch.'], ['FlexDrop Studio', 'Browser UI: 3D campus (three.js), map (Leaflet).']] },
        { name: 'FastAPI service', nodes: [['API + services', 'Orders, preferences, optimise, plan events.'], ['Engines', 'Incentive, compatibility, optimiser, routing, re-optimiser.'], ['ML registry', 'Prep, travel, acceptance, coordination models.']] },
        { name: 'Data', nodes: [['SQLAlchemy', 'SQLite in development, PostgreSQL in production.'], ['Alembic', 'Database migrations.'], ['Prometheus', 'Metrics and an audit log.']] },
      ],
      flow: [
        'Checkout sends an order; FlexDrop predicts prep and travel time and quotes wait-for-reward offers.',
        'The customer accepts or declines; consent and the approved window are stored.',
        'Each dispatch epoch, the optimiser batches compatible orders and sequences routes.',
        'Dispatch executes the plan and reports events; the re-optimiser adapts to delays.',
        'If FlexDrop is off or slow, dispatch simply continues on its normal path.',
      ],
    },
    repo: [
      ['src/flexdrop/', 'The Python package.', [
        ['api/', 'FastAPI app, routers, API-key roles, rate limits, idempotency, errors.'],
        ['services/', 'Use-cases between the API and the engines: orders, dispatch, metrics, privacy.'],
        ['engines/', 'incentive, compatibility, optimizer, routing, flexibility, reoptimizer, promise, cost, travel.'],
        ['ml/', 'Features, models, training and the model registry.'],
        ['simulation/', 'Scenarios, the five dispatch policies, the event simulator and metrics.'],
        ['db/, domain/', 'Database layer and core domain types.'],
        ['web/', 'FlexDrop Studio: checkout, operations dashboard, 3D campus and results.'],
      ]],
      ['models/', 'Trained model files and their metadata.'],
      ['data/sample/', 'Sample campus and city data.'],
      ['reports/', 'Simulation results, comparisons and robustness runs.'],
      ['tests/', 'Unit, optimisation and integration tests.'],
      ['docs/', 'Architecture, maths model, algorithms, API, security, deployment.'],
      ['deploy/, migrations/', 'Production config (nginx, systemd) and database migrations.'],
    ],
  },

  pixelproof: {
    languages: [['Python', 100]],
    arch: {
      title: 'A generator, a gauntlet and an evaluator',
      tiers: [
        { name: 'Generate', nodes: [['Families', 'gauge, chart, wires, count, spatial, maze.'], ['Renderer', 'Anti-aliased canvas from a seed.']] },
        { name: 'Validate (G1–G4)', nodes: [['Evidence', 'Is the answer visible?'], ['Pixel verifier', 'Recompute the answer from pixels.'], ['Twin', 'One edit must change the answer.'], ['Dedup', 'Perceptual hash.']] },
        { name: 'Evaluate', nodes: [['Model adapters', 'Groq, OpenAI-compatible, Gemini, Anthropic, Ollama.'], ['Strict scorer', 'Tolerances, pair accuracy, error types.'], ['Report + Studio', 'HTML findings and a local web UI.']] },
      ],
      flow: [
        '`pixelproof generate` samples scenes, renders them and runs each through four gates.',
        'Accepted tasks go to `tasks.jsonl` with images and a manifest of the seed and rejections.',
        '`pixelproof eval` queries a model over HTTPS, with caching and a call budget.',
        '`pixelproof report` writes a self-contained HTML report; `frontier` finds breaking levels.',
      ],
    },
    repo: [
      ['pixelproof/', 'The Python package.', [
        ['core.py', 'Data model, canvas, shape classifier and the family registry.'],
        ['families/', 'One file per task family, each with sample, render, question, answer, twin and verify.'],
        ['pipeline.py', 'The validity gates, dataset writer and audit.'],
        ['models.py', 'HTTP adapters for model providers and text-only controls.'],
        ['scoring.py, frontier.py', 'Strict parsing, cached evaluation, metrics and breaking-point search.'],
        ['report.py, studio.py, cli.py', 'HTML report, local web UI and the command line.'],
      ]],
      ['tests/', 'Verifier agreement, twin discrimination, determinism and scoring.'],
      ['data/demo/', 'A verified demo dataset, evaluation results and the report.'],
    ],
  },

  arthanetra: {
    languages: [['Python', 66.3], ['JavaScript', 15.0], ['CSS', 11.0], ['HTML', 7.3], ['Shell', 0.2], ['Batchfile', 0.2]],
    arch: {
      title: 'AI reads, code computes',
      tiers: [
        { name: 'Browser', sub: 'frontend/', nodes: [['Web app', 'Paste text, upload a PDF or screenshot, or pick an example.'], ['12 languages', 'Every heading and result switches instantly.'], ['Simulator, Ask', 'Change terms; ask by typing or voice.']] },
        { name: 'FastAPI back end', nodes: [['Security + ingest', 'Rate limits, file checks, masking of personal details.'], ['Two readers', 'AI reader with quotes + rule-based reader, cross-checked.'], ['Engine', 'Dated payments → true yearly rate; 21 RBI / IRDAI rules; Trap Score.'], ['Explain', 'Plain language; every number checked.']] },
        { name: 'External, optional', nodes: [['Groq / Gemini', 'Reading, explanations, screenshots.'], ['Whisper (via Groq)', 'Voice questions.'], ['No database', 'Nothing is stored.']] },
      ],
      flow: [
        'A document arrives; its real file type is checked and personal details are masked.',
        'An AI reader and a rule-based reader extract the terms; every value must quote the document.',
        'Verified terms become a list of dated payments; the true yearly rate is solved from it.',
        'Rule checks and pressure-tactic detection feed the Trap Score.',
        'The explanation is written from the fact sheet only, and its numbers are checked.',
      ],
    },
    repo: [
      ['backend/app/', 'The API.', [
        ['main.py', 'FastAPI app: analyse, simulate, ask, transcribe, rules and samples endpoints.'],
        ['engine/cashflow.py', 'The calculation engine: loans, EMI, cards and insurance as dated payments; XIRR and APR.'],
        ['engine/rules.py', 'RBI and IRDAI rule checks, each with its citation.'],
        ['engine/patterns.py, engine/score.py', 'Pressure-tactic detection; Trap Score and disclosure gap.'],
        ['extractor.py, heuristic.py', 'Reading with proof and quote checks; the rule-based second reader.'],
        ['pipeline.py', 'Runs both readers, compares them and sanity-checks the result.'],
        ['explain.py', 'Explanations, offline answers and number checks.'],
        ['security.py, ingest.py', 'Masking, rate limits, headers, file checks, report IDs; PDF and image text.'],
        ['llm.py', 'Groq, Gemini or offline.'],
        ['i18n/', 'All text in 12 languages.'],
      ]],
      ['backend/samples/', 'Seven fictional example documents and two PDFs.'],
      ['backend/tests/', 'Maths, pipeline, API, security and language tests.'],
      ['frontend/', 'The web app: plain HTML, CSS and JavaScript.'],
      ['docs/', 'Architecture, pitch deck, IP notes, demo script, screenshots.'],
      ['Dockerfile, render.yaml, run.sh', 'Run with Docker, deploy on Render, or start locally.'],
    ],
  },
};
