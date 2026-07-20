#!/usr/bin/env python3
"""
Lookalike-seed quality screen for outdoor-service contractors.

Designed 2026-07-20 as part of the "clean solo-operator seed" plan. NOT yet run
at scale -- it is the reference implementation of the agreed filter sequence so
the execution step is mechanical and auditable.

Ordering principle: every FREE filter runs BEFORE any paid enrichment, so we
never spend a skip-trace lookup on a record we were going to discard anyway.
The one paid step (ScraperCity) sits between the pre-spend gates and the single
post-spend gate.

    scope gate -> dedupe -> franchise/roll-up exclusion -> owner-name present
        -> [PAID: ScraperCity skip-trace] -> state cross-check -> upload

Contains no credentials and no lead data. Reads/writes plain JSON.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from typing import Iterable

# --- target trades -----------------------------------------------------------
# Junk removal is deliberately absent: the 2026-07-20 probe measured the worst
# owner-name accuracy of any trade there (4/8 correct, 3/8 wrong person) and the
# trade is the most franchise-saturated of the candidates. Revisit only with a
# franchise-aware source.
TARGET_TRADES = {
    "lawn_landscaping",
    "pressure_washing",
    "tree_service",
    "pool_service",
}

TRADE_PATTERNS: list[tuple[str, str]] = [
    # order matters: first match wins, so specific trades precede generic ones
    ("pool_service", r"pool|spa\b"),
    ("tree_service", r"tree|arbor|stump"),
    ("pressure_washing", r"pressure\s*-?\s*wash|power\s*-?\s*wash|soft\s*wash|washing\b|exterior\s*clean"),
    ("lawn_landscaping", r"lawn|landscap|turf|mow|irrigation|sprinkler|lawncare|scapes|grounds|hardscape|sod\b"),
]

# Substrings that create false positives when matched loosely (e.g. "s-tree-t").
# Stripped from the haystack before trade matching. Learned the hard way on
# 2026-07-20: a naive substring match inflated Tree Service by ~3x.
FALSE_POSITIVE_CONTAINERS = r"street|washington|greensboro|greenville|liverpool|carpool|treasur|streamline"

# --- franchise / roll-up exclusion -------------------------------------------
# Anchored whole-phrase matches only. A franchisee may well be a one-truck
# owner-operator, but we cannot tell them apart from a multi-territory operator
# with any free signal, so we exclude the brand rather than guess.
FRANCHISE_BRANDS = [
    # lawn / landscaping
    "trugreen", "lawn doctor", "weed man", "spring-green", "naturalawn",
    "u.s. lawns", "us lawns", "lawn squad", "lawn pride", "grounds guys",
    "scotts lawn", "clintar", "nutri-lawn",
    # pool
    "aqua tots", "poolwerx", "asp - america's swimming pool", "america's swimming pool",
    "pool scouts", "leslie's",
    # tree
    "davey tree", "bartlett tree", "savatree", "asplundh", "wright tree",
    "monster tree", "arborworks",
    # pressure washing / exterior
    "window genie", "fish window", "shack shine", "men in kilts",
    "squeegee squad", "dr. decks",
    # junk / hauling (kept for defensive filtering even though the trade is out)
    "1-800-got-junk", "college hunks", "junk king", "junkluggers", "jdog",
    # multi-trade roll-ups / consolidators
    "brightview", "yellowstone landscape", "aptive", "neighborly",
    "authority brands", "empire home services",
]

LEGAL_SUFFIXES = r"\b(llc|l\.l\.c|inc|incorporated|corp|corporation|co|company|ltd|pllc|lp|llp)\b"


def _norm_text(value: str) -> str:
    """Lowercase, strip accents/punctuation, collapse whitespace."""
    value = unicodedata.normalize("NFKD", value or "")
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.lower().replace("&", " and ")
    value = re.sub(r"[^a-z0-9 ]", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def norm_company(name: str) -> str:
    """Dedupe key for a business name: normalized, legal suffixes removed."""
    value = _norm_text(name)
    value = re.sub(LEGAL_SUFFIXES, " ", value)
    return re.sub(r"\s+", " ", value).strip()


def norm_person(first: str, last: str) -> str:
    return _norm_text(f"{first} {last}")


def registrable_domain(value: str) -> str:
    """Last two labels of a host taken from a URL or an email address."""
    if not value:
        return ""
    host = value.strip().lower()
    host = host.split("@")[-1]
    host = re.sub(r"^https?://", "", host).split("/")[0]
    host = re.sub(r"^www\.", "", host)
    parts = [p for p in host.split(".") if p]
    return ".".join(parts[-2:]) if len(parts) >= 2 else ""


def classify_trade(*fields: str) -> str | None:
    """Best-effort trade from company name / website / description."""
    haystack = _norm_text(" ".join(f for f in fields if f))
    haystack = re.sub(FALSE_POSITIVE_CONTAINERS, " ", haystack)
    for trade, pattern in TRADE_PATTERNS:
        if re.search(pattern, haystack):
            return trade
    return None


def is_franchise(company: str, website: str = "") -> bool:
    hay = f" {norm_company(company)} {registrable_domain(website)} "
    return any(f" {_norm_text(b)} " in hay for b in FRANCHISE_BRANDS)


def has_owner_name(first: str, last: str) -> bool:
    """Require two real tokens -- a bare first name cannot be skip-traced."""
    first, last = (first or "").strip(), (last or "").strip()
    return len(first) >= 2 and len(last) >= 2 and last.lower() not in {"llc", "inc"}


def build_existing_index(existing: Iterable[dict]) -> dict[str, set]:
    """Dedupe index over the already-owned corpus (the recovered 1,123)."""
    idx: dict[str, set] = {"company": set(), "person": set(), "domain": set()}
    for row in existing:
        company = row.get("company") or row.get("company_name") or ""
        if company:
            idx["company"].add(norm_company(company))
        person = norm_person(row.get("first_name", ""), row.get("last_name", ""))
        if person:
            idx["person"].add(person)
        for field in (row.get("email", ""), row.get("website", "")):
            dom = registrable_domain(field)
            if dom:
                idx["domain"].add(dom)
    return idx


def screen(candidates: Iterable[dict], existing_index: dict[str, set]) -> dict:
    """Run every FREE pre-spend gate. Survivors are what we pay to skip-trace."""
    kept, dropped = [], []

    def drop(row, reason):
        dropped.append({"reason": reason, "company": row.get("company_name", "")})

    for row in candidates:
        company = row.get("company_name", "")
        website = row.get("website", "")
        first, last = row.get("owner_first", ""), row.get("owner_last", "")

        trade = row.get("trade_slug") or classify_trade(company, website)
        if trade not in TARGET_TRADES:
            drop(row, "scope:trade")
            continue
        if is_franchise(company, website):
            drop(row, "franchise_or_rollup")
            continue
        if not has_owner_name(first, last):
            drop(row, "no_owner_name")
            continue
        dom = registrable_domain(website)
        if norm_company(company) in existing_index["company"]:
            drop(row, "dupe:company")
            continue
        if norm_person(first, last) in existing_index["person"]:
            drop(row, "dupe:person")
            continue
        if dom and dom in existing_index["domain"]:
            drop(row, "dupe:domain")
            continue

        row = dict(row)
        row["trade_slug"] = trade
        # ScraperCity input format proven best on 2026-07-13 (Path A beat
        # address-based lookup ~4x). ZIP is appended when known to tighten
        # the match; the city/state hint alone does not constrain it.
        loc = ", ".join(p for p in [row.get("city", ""), row.get("state", "")] if p)
        if row.get("zip"):
            loc = f"{loc} {row['zip']}".strip()
        row["skiptrace_query"] = f"{first} {last}; {loc}".strip("; ")
        kept.append(row)

    reasons: dict[str, int] = {}
    for d in dropped:
        reasons[d["reason"]] = reasons.get(d["reason"], 0) + 1
    return {"kept": kept, "dropped_counts": reasons, "kept_n": len(kept), "dropped_n": len(dropped)}


def state_cross_check(rows: Iterable[dict]) -> dict:
    """
    The single POST-spend gate. ScraperCity returns the traced person's home
    state; if it disagrees with the business state we matched a same-named
    stranger. Measured 2026-07-13: keeps ~64%, and ~7 of every 8 dropped rows
    were a right-name/wrong-person match, lifting precision ~55% -> ~80%.
    """
    kept, dropped = [], 0
    for row in rows:
        biz = (row.get("state") or "").strip().upper()
        person = (row.get("traced_state") or "").strip().upper()
        if biz and person and biz != person:
            dropped += 1
            continue
        kept.append(row)
    return {"kept": kept, "kept_n": len(kept), "dropped_n": dropped}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--candidates", required=True, help="JSON array of newly sourced rows")
    ap.add_argument("--existing", required=True, help="JSON array of the already-owned corpus")
    ap.add_argument("--out", required=True, help="where to write survivors")
    ap.add_argument("--post-trace", action="store_true",
                    help="input already carries traced_state; run the post-spend state gate instead")
    args = ap.parse_args()

    candidates = json.load(open(args.candidates, encoding="utf-8"))
    if args.post_trace:
        result = state_cross_check(candidates)
    else:
        existing = json.load(open(args.existing, encoding="utf-8"))
        result = screen(candidates, build_existing_index(existing))

    json.dump(result["kept"], open(args.out, "w", encoding="utf-8"), indent=1)
    summary = {k: v for k, v in result.items() if k != "kept"}
    print(json.dumps(summary, indent=2))
    print(f"wrote {result['kept_n']} rows -> {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
