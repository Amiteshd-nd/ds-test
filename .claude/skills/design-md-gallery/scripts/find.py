#!/usr/bin/env python3
"""Search the DESIGN.md gallery by aesthetic, product type, or name.

    python3 scripts/find.py "dark terminal developer"
    python3 scripts/find.py --category "Fintech & Crypto"
    python3 scripts/find.py --list-categories

Scores on whole-word matches across name, category, product blurb and the
aesthetic description, weighting the aesthetic highest — that is the field
people actually pick on. Standard library only.
"""

import argparse
import csv
import re
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "systems.csv"

# Aesthetic is what a request like "dark and technical" is really about;
# a name match is decisive when someone asks for a specific product.
WEIGHTS = {"name": 5.0, "aesthetic": 3.0, "what": 1.5, "category": 1.0}


def load():
    if not DATA.exists():
        sys.exit(f"missing data file: {DATA}")
    with DATA.open(newline="") as f:
        return list(csv.DictReader(f))


def terms(query):
    return [t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 1]


def score(row, wanted):
    total = 0.0
    for field, weight in WEIGHTS.items():
        words = set(re.findall(r"[a-z0-9]+", row[field].lower()))
        for t in wanted:
            if t in words:
                total += weight
            elif any(w.startswith(t) for w in words):
                total += weight * 0.5
    return total


def main():
    p = argparse.ArgumentParser(add_help=True)
    p.add_argument("query", nargs="?", default="")
    p.add_argument("--category", help="filter to one category (exact, case-insensitive)")
    p.add_argument("-n", type=int, default=8, help="max results (default 8)")
    p.add_argument("--list-categories", action="store_true")
    args = p.parse_args()

    rows = load()

    if args.list_categories:
        seen = {}
        for r in rows:
            seen[r["category"]] = seen.get(r["category"], 0) + 1
        for cat, count in seen.items():
            print(f"{count:>3}  {cat}")
        return

    if args.category:
        rows = [r for r in rows if r["category"].lower() == args.category.lower()]
        if not rows:
            print(f"No category matching {args.category!r}. Try --list-categories.")
            return

    if args.query:
        wanted = terms(args.query)
        scored = [(score(r, wanted), r) for r in rows]
        scored = [(s, r) for s, r in scored if s > 0]
        scored.sort(key=lambda pair: (-pair[0], pair[1]["name"]))
        if not scored:
            print(
                f"No match for {args.query!r}. This gallery is 68 fixed entries — "
                "retry with an aesthetic word (dark, minimal, editorial, neon, "
                "playful) or a product category, or use --list-categories."
            )
            return
        rows = [r for _, r in scored]

    for r in rows[: args.n]:
        print(f"{r['name']}  ({r['category']})")
        print(f"  {r['what']}")
        if r["aesthetic"]:
            print(f"  Look: {r['aesthetic']}")
        print(f"  {r['url']}")
        print()


if __name__ == "__main__":
    main()
