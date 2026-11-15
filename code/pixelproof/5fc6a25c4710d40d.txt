"""Command line interface: `pixelproof <command>` (or `python -m pixelproof <command>`)."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .core import REGISTRY


def _ints(s):
    return [int(x) for x in s.split(",")] if s else None


def _strs(s):
    return [x.strip() for x in s.split(",")] if s else None


def main(argv=None):
    ap = argparse.ArgumentParser(prog="pixelproof", description="Verifiable Visual Task Factory")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("families", help="list task families")

    g = sub.add_parser("generate", help="generate a verified dataset of counterfactual task pairs")
    g.add_argument("--out", default="data/demo")
    g.add_argument("--pairs", type=int, default=4, help="pairs per family per level")
    g.add_argument("--seed", type=int, default=7)
    g.add_argument("--families")
    g.add_argument("--levels")

    a = sub.add_parser("audit", help="re-derive every answer from pixels + verify image hashes")
    a.add_argument("ds")

    e = sub.add_parser("eval", help="evaluate a model on a dataset (cached, budgeted)")
    e.add_argument("ds")
    e.add_argument("--model", required=True, action="append")
    e.add_argument("--limit-pairs", type=int, help="max pairs per family x level")
    e.add_argument("--budget", type=int, help="max API calls")
    e.add_argument("--workers", type=int, default=4)
    e.add_argument("--families")

    r = sub.add_parser("report", help="build the HTML findings report")
    r.add_argument("ds")
    r.add_argument("--out")

    f = sub.add_parser("frontier", help="adaptive search for each family's breaking point + hard-set harvest")
    f.add_argument("--model", required=True)
    f.add_argument("--out", default="data/frontier")
    f.add_argument("--families")
    f.add_argument("--rounds", type=int, default=6)
    f.add_argument("--pairs", type=int, default=3)
    f.add_argument("--start", type=int, default=2)

    run = sub.add_parser("run", help="generate -> audit -> evaluate (baselines + models) -> report")
    run.add_argument("--out", default="data/demo")
    run.add_argument("--pairs", type=int, default=4)
    run.add_argument("--seed", type=int, default=7)
    run.add_argument("--model", action="append", default=[])
    run.add_argument("--limit-pairs", type=int)
    run.add_argument("--workers", type=int, default=4)

    s = sub.add_parser("studio", help="local web UI to generate and inspect pairs live")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--model")
    s.add_argument("--report", default="data/demo/report.html", help="findings report to serve at /report")
    s.add_argument("--open", action="store_true", help="open the browser")

    args = ap.parse_args(argv)

    if args.cmd == "families":
        for k, fam in REGISTRY.items():
            print(f"{k:8s} {fam.title:26s} {fam.application}")
        return 0
    if args.cmd in ("generate", "run"):
        from .pipeline import generate, revalidate
        print(f"Generating into {args.out} ...")
        m = generate(args.out, families=_strs(getattr(args, "families", None)), levels=_ints(getattr(args, "levels", None)),
                     pairs_per_level=args.pairs, seed=args.seed)
        print(f"{m['tasks']} tasks · funnel {json.dumps(m['funnel_total'])} · {m['seconds']}s")
        if args.cmd == "generate":
            return 0
        aud = revalidate(args.out)
        print(f"Audit: {aud['ok']} ok, {aud['bad']} bad")
        from .report import build_report
        from .scoring import evaluate
        for spec in ["baseline:blind-prior"] + args.model:
            evaluate(args.out, spec, limit_pairs=args.limit_pairs, workers=args.workers)
        print("Report:", build_report(args.out))
        return 0
    if args.cmd == "audit":
        from .pipeline import revalidate
        res = revalidate(args.ds)
        print(json.dumps(res, indent=2))
        return 0 if res["bad"] == 0 else 1
    if args.cmd == "eval":
        from .scoring import evaluate
        for spec in args.model:
            evaluate(args.ds, spec, limit_pairs=args.limit_pairs, budget_calls=args.budget, workers=args.workers,
                     families=_strs(args.families))
        return 0
    if args.cmd == "report":
        from .report import build_report
        print(build_report(args.ds, args.out))
        return 0
    if args.cmd == "frontier":
        from .frontier import frontier
        rep = frontier(args.model, args.out, _strs(args.families) or sorted(REGISTRY), rounds=args.rounds,
                       pairs=args.pairs, start=args.start)
        for fam, d in rep["families"].items():
            print(f"{fam:8s} breaking level ~ L{d['threshold_level']}")
        print(f"API calls: {rep['api_calls']} · hard set: {Path(args.out) / 'hardset'}")
        return 0
    if args.cmd == "studio":
        from .studio import serve
        serve(args.port, args.model, args.host, report=args.report, open_browser=args.open)
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
