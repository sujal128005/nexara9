# PixelProof

**A verifiable Visual Task Factory for evaluating vision-language models.**
Every answer is re-derived from pixels. Every question is proven to need the image.

**🌐 Live demo:**
- **PixelProof Studio** (interactive): [https://pixelproof-gk2j.onrender.com](https://pixelproof-gk2j.onrender.com) *(free Render instance: the first visit after a quiet spell can take up to a minute to wake up)*
- **Findings report**: [https://sujal128005.github.io/Qwen/](https://sujal128005.github.io/Qwen/)

PixelProof generates, validates and scores visual-reasoning tasks drawn from real operational settings —
reading industrial gauges, business charts and technical diagrams — where a single misread value leads to a wrong
decision. It is a reusable pipeline, not a fixed dataset: any number of tasks, at any difficulty, reproducible from a seed.

---

## Highlights

- **Six task families, ten question types, five difficulty levels** controlled by named knobs.
- **Independent pixel verifiers** recompute every answer from the rendered image without access to the generator's answer.
- **Counterfactual twins**: each task ships with a twin that differs in one decisive detail — same question text,
  different correct answer — so text-only guessing scores **0% pair accuracy by construction**.
- **Strict scoring**: no multiple choice, explicit numeric tolerances, a mandatory `ANSWER:` line, pair accuracy,
  visual sensitivity and an error taxonomy.
- **Model-agnostic evaluation** over plain HTTPS with caching, call budgets and rate-limit handling.
- **PixelProof Studio**, a local web UI to generate twins live, highlight what changed and query a model.
- **Self-contained HTML findings report** with a scorecard, breaking-point heatmap, difficulty curves and failure gallery.

## How it works

```
sample scene ─► render ─► G1 evidence ─► G2 pixel verifier ─► G3 counterfactual twin ─► G4 dedup ─► dataset
                                                                                                       │
             findings report ◄── strict scorer ◄── model under test (cached, budgeted) ◄───────────────┘
```

| Gate | Purpose |
|---|---|
| **G1 Evidence** | The image carries enough evidence: minimum tick spacing, bar-gap margins, crossing angles ≥ 32°, no occlusion of countable objects, clearance from relation boundaries. |
| **G2 Verifier** | An independent algorithm recomputes the answer from pixels; disagreement rejects the task. |
| **G3 Twin** | A minimal edit (one needle position, one bar, two swapped wire endpoints, one part, one object, one wall) must change the answer while the question stays identical. |
| **G4 Dedup** | Perceptual-hash check against all accepted images. |

## Task families

| Family | Application | Visual skill | Verifier |
|---|---|---|---|
| `gauge` | Plant instruments from site photos | Angle estimation and interpolation | Needle-pixel angle through the printed scale |
| `chart` | Figures in reports and dashboards | Axis reading, ranking, differences | Column scan of bar heights |
| `wires` | Wiring and piping diagrams | Contour following through crossings | Pixel contour tracer with good-continuation |
| `count` | Inventory and quality control | Colour × shape conjunction counting | Connected components + shape classifier |
| `spatial` | Planograms and site layouts | Nearest neighbour, relations, ordering | Object detection from pixels, re-solved |
| `maze` | Floor-plan and warehouse routes | Multi-step route planning | Wall probing + breadth-first search |

## Quick start

Requires Python 3.10 or newer. Dependencies: NumPy and Pillow.

**Windows**

```powershell
.\run_local.bat
```

**macOS / Linux**

```bash
./run_local.sh
```

The script creates a virtual environment, installs the package, runs the test suite, audits the bundled dataset and
opens PixelProof Studio at `http://127.0.0.1:8765` (the next free port is used if it is taken). The findings report
is served at `/report`.

To enable live model queries in Studio, set a Groq API key before running:

```powershell
$env:GROQ_API_KEY = "gsk_..."
```

## Command line

```bash
pip install -e .
pixelproof families                                            # list task families
pixelproof generate --out data/demo --pairs 4 --seed 7         # verified twin pairs
pixelproof audit data/demo                                     # re-derive every answer from pixels
pixelproof eval data/demo --model groq:qwen/qwen3.8-27b        # evaluate a model (cached)
pixelproof eval data/demo --model blind:groq:openai/gpt-oss-120b  # text-only control
pixelproof report data/demo                                    # data/demo/report.html
pixelproof frontier --model groq:qwen/qwen3.8-27b              # adaptive breaking-point search
pixelproof studio --model groq:qwen/qwen3.8-27b                # web UI
```

Supported model specifications: `groq:<model>`, `openai:<model>` (any OpenAI-compatible endpoint via
`OPENAI_BASE_URL`), `gemini:<model>`, `google:<model>`, `openrouter:<model>`, `ollama:<model>`,
`anthropic:<model>`, `blind:<spec>` (same model with the image withheld) and `baseline:blind-prior`.

## Results

Evaluation of **Qwen 3.8 27B** (served on Groq) on the bundled dataset, two twin pairs per family and level:

| Family | Tasks correct | Pair accuracy | Observation |
|---|---|---|---|
| Report chart reading | 20/20 | 100% | Perfect at every level |
| Wire tracing | 14/15 | 86% | Strong; first miss at L3 |
| Spatial relations | 14/20 | 60% | Good at nearest-neighbour and ordering |
| Analog gauge reading | 9/20 | 40% | Perfect at L0–L2, fails once only every other tick is labelled |
| Route planning | 1/20 | 0% | Most responses never commit an answer within 2,048 tokens |
| Conjunction counting | 0/20 | 0% | Over-counts even one to three shapes on a white background |
| **Overall** | **58/115** | **46%** | Visual sensitivity 90%; 26 unparsed responses |

Text-only controls — a prior that has seen every answer, and GPT-OSS-120B with the image withheld — both score
**0% pair accuracy**, confirming that every question requires the image.

## Scoring

- **Task accuracy** — exact integer or label match, or `|prediction − truth| ≤ tolerance`, where the tolerance is
  0.45 × the task's value resolution, so a reading on the neighbouring tick is always wrong.
- **Pair accuracy** (headline) — both twins answered correctly.
- **Visual sensitivity** — share of pairs in which the model's answer changed between twins.
- **Error taxonomy** — `off_by_one`, `near_miss` (≤ 3 × tolerance), `wrong`, `unparsed`.
- **Breaking level** — the first difficulty level at which pair accuracy falls below 50%.

## Dataset format

`tasks.jsonl` holds one task per line: question, answer format, answer with tolerance, difficulty knobs, the full
scene description, gate results, the verifier's reading and the image's SHA-256. `manifest.json` records the seed,
version, per-family rejection funnel and knob documentation. Generation is deterministic.

## Project structure

```
pixelproof/
  core.py          data model, anti-aliased canvas, shape classifier, family registry
  families/        gauge, chart, wires, count, spatial, maze
  pipeline.py      validity gauntlet, dataset writer, audit
  models.py        HTTP model adapters and text-only controls
  scoring.py       strict parser, cached evaluation, metrics
  frontier.py      adaptive breaking-point search and hard-set harvest
  report.py        HTML findings report
  studio.py        PixelProof Studio web UI
  cli.py           command line interface
tests/             verifier agreement, twin discrimination, determinism, scoring
data/demo/         verified demo dataset, evaluation results and report
deck/              presentation builder
demo/              scripted demo recorder
```

## Extending

Subclass `Family`, implement `sample`, `render`, `question`, `answer`, `evidence`, `twin` and `verify`, and register it
with `@register`. The test suite requires that, at every level, the verifier recovers both twins' answers from pixels
and that twin A's image does not support twin B's answer.

## Limitations

- Clean synthetic renders give a lower bound on real-photo difficulty (no perspective, blur or glare).
- Verifiers know the rendering conventions (palette, dial geometry, terminal positions).
- One fixed prompt per task; results can shift slightly with other prompts.
- Two twin pairs per cell in the bundled run; results are indicative and scale with the generator.

## License

MIT
