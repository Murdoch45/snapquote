#!/usr/bin/env python3
"""
Source solo-operator contractors from the free CSLB (California Contractors
State License Board) public data files.

Validated 2026-07-20. The CSLB Public Data Portal publishes three CSVs at no
charge -- License Master, Personnel, and Workers' Compensation -- reachable by
two ASP.NET postbacks from:

    https://www.cslb.ca.gov/onlineservices/dataportal/ContractorList

Why this source: for a `BusinessType = Sole Owner` licence the named licensee is
the LEGAL owner by construction, so the ~20% wrong-person rate of AI-guessed
owner names does not apply. `WorkersCompCoverageType = Exempt` is additionally a
penalty-of-perjury declaration of "no employees at this time" -- the only free,
authoritative, bulk solo-operator signal found in the 2026-07-20 research sweep.

Measured on a 100-record sample (2026-07-20): 96% of names resolved to a real
person on skip-trace, 85% carried a wireless mobile -- but 25% of the returned
people were a DIFFERENT human that ScraperCity fuzzy-matched on first name
alone. Those impostors are mostly IN-STATE, so the state gate does NOT catch
them. `surname_compatible()` below is what catches them, and it is only usable
because the licence gives us an authoritative surname to compare against.

Contains no credentials and no lead data.
"""
from __future__ import annotations

import argparse
import csv
import html
import http.cookiejar
import json
import re
import ssl
import sys
import urllib.parse
import urllib.request
from collections import Counter

PORTAL = "https://www.cslb.ca.gov/onlineservices/dataportal/ContractorList"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# ICP classifications. Deliberately NOT roofing (C-39) or tree (D-49): CA bars
# the workers'-comp exemption for both, so the solo signal is unavailable there.
TARGET_CLASSES = {"C27": "Landscaping", "C53": "Swimming Pool"}

NAME_SUFFIXES = {"JR", "SR", "II", "III", "IV", "V", "ESQ", "MR", "MRS", "MS", "DR"}
# Surname prefixes that must stay glued to the following token.
GLUED_PREFIXES = {"MC", "MAC", "DE", "DEL", "DELA", "DA", "DI", "VAN", "VON", "LA", "LE", "ST"}
# Tokens that betray a business name masquerading as a person.
NOT_A_NAME = {
    "CONTRACTOR", "CONTRACTORS", "LANDSCAPE", "LANDSCAPES", "LANDSCAPING", "POOL", "POOLS",
    "SERVICE", "SERVICES", "CONSTRUCTION", "COMPANY", "INC", "LLC", "CORP", "MAINTENANCE",
    "DESIGN", "DESIGNS", "ENTERPRISE", "ENTERPRISES", "GARDEN", "GARDENS", "LAWN", "CARE",
}


def _ctx() -> ssl.SSLContext:
    c = ssl.create_default_context()
    c.check_hostname = False
    c.verify_mode = ssl.CERT_NONE
    return c


def _hidden(page: str) -> dict[str, str]:
    out = {}
    for m in re.finditer(r'<input[^>]*type="hidden"[^>]*>', page, re.I):
        tag = m.group(0)
        name = re.search(r'name="([^"]+)"', tag)
        val = re.search(r'value="([^"]*)"', tag)
        if name:
            out[name.group(1)] = html.unescape(val.group(1)) if val else ""
    return out


def download(select_code: str, button: str, dest: str) -> str:
    """Drive the two postbacks (choose file -> click download) and stream to disk."""
    jar = http.cookiejar.CookieJar()
    op = urllib.request.build_opener(
        urllib.request.HTTPCookieProcessor(jar), urllib.request.HTTPSHandler(context=_ctx()))
    op.addheaders = [("User-Agent", UA), ("Referer", PORTAL)]
    page = op.open(PORTAL, timeout=90).read().decode("utf-8", "replace")

    form = _hidden(page)
    form.update({"__EVENTTARGET": "ctl00$MainContent$ddlStatus", "__EVENTARGUMENT": "",
                 "ctl00$MainContent$ddlStatus": select_code})
    page = op.open(urllib.request.Request(PORTAL, data=urllib.parse.urlencode(form).encode()),
                   timeout=180).read().decode("utf-8", "replace")

    form = _hidden(page)
    form.update({"__EVENTTARGET": button, "__EVENTARGUMENT": "",
                 "ctl00$MainContent$ddlStatus": select_code})
    resp = op.open(urllib.request.Request(PORTAL, data=urllib.parse.urlencode(form).encode()),
                   timeout=900)
    if "text/csv" not in resp.headers.get("Content-Type", "").lower():
        raise RuntimeError(f"expected CSV, got {resp.headers.get('Content-Type')}")
    total = 0
    with open(dest, "wb") as fh:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            fh.write(chunk)
            total += len(chunk)
    print(f"  {dest}: {total:,} bytes", file=sys.stderr)
    return dest


def clean_tokens(raw: str) -> list[str]:
    toks = [t for t in re.split(r"[\s,]+", (raw or "").strip()) if t]
    toks = [t for t in toks if t.replace(".", "").upper() not in NAME_SUFFIXES]
    toks = [t for t in toks if not re.search(r"\d|&", t)]
    # re-glue "MC GEE" -> "MCGEE", "DE LA CRUZ" -> "DELACRUZ"
    out: list[str] = []
    for t in toks:
        if out and out[-1].upper() in GLUED_PREFIXES:
            out[-1] = out[-1] + t
        else:
            out.append(t)
    return out


def parse_personnel_name(raw: str) -> tuple[str | None, str | None]:
    """Personnel `Name` is space-padded:  LAST<pad>FIRST<pad>MIDDLE."""
    parts = [p.strip() for p in re.split(r"\s{2,}", (raw or "").strip()) if p.strip()]
    if len(parts) < 2:
        parts = [p for p in (raw or "").split() if p]
        if len(parts) < 2:
            return None, None
        parts = [parts[0], " ".join(parts[1:])]
    last_toks, first_toks = clean_tokens(parts[0]), clean_tokens(parts[1])
    if not last_toks or not first_toks:
        return None, None
    return first_toks[0].title(), last_toks[0].title()


def parse_owner_name(full: str) -> tuple[str | None, str | None]:
    """Master `FullBusinessName` is FIRST [MIDDLE] LAST when the licence is in the person's name."""
    toks = clean_tokens(full)
    if len(toks) < 2:
        return None, None
    return toks[0].title(), toks[-1].title()


def looks_like_person(first: str, last: str) -> bool:
    if not first or not last or len(first) < 2 or len(last) < 2:
        return False
    return first.upper() not in NOT_A_NAME and last.upper() not in NOT_A_NAME


def surname_compatible(expected: str, returned: str) -> bool:
    """
    Post-skip-trace impostor gate.

    ScraperCity fuzzy-matches on first name and will happily return a different
    person in the same city. Because the licence gives an authoritative surname,
    we can reject those. Compound/hyphenated/middle-absorbed surnames still
    count as a match (Zuniga vs Zuniga-Cruz; Felix vs Delatrenidad Felix).
    """
    a = re.sub(r"[^a-z]", "", (expected or "").lower())
    b = re.sub(r"[^a-z]", "", (returned or "").lower())
    if not a or not b:
        return False
    return a == b or a in b or b in a


def classifications(value: str) -> set[str]:
    return set(re.findall(r"[A-D]?\d{1,2}", (value or "").upper().replace("|", " ")))


def build(master_csv: str, personnel_csv: str) -> list[dict]:
    csv.field_size_limit(10 ** 7)
    licences: dict[str, dict] = {}
    with open(master_csv, encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh):
            hit = classifications(row.get("Classifications(s)")) & set(TARGET_CLASSES)
            if not hit:
                continue
            if (row.get("PrimaryStatus") or "").strip().upper() != "CLEAR":
                continue
            if (row.get("BusinessType") or "").strip() != "Sole Owner":
                continue
            if (row.get("WorkersCompCoverageType") or "").strip().upper() != "EXEMPT":
                continue
            zipc = re.sub(r"\D", "", row.get("ZIPCode") or "")[:5]
            city = (row.get("City") or "").strip().title()
            if (row.get("State") or "").strip().upper() != "CA" or not city or len(zipc) != 5:
                continue
            licences[(row.get("LicenseNo") or "").strip()] = {
                "license_no": (row.get("LicenseNo") or "").strip(),
                "trade": TARGET_CLASSES[sorted(hit)[0]],
                "classification": sorted(hit)[0],
                "business_name": (row.get("BusinessName") or "").strip(),
                "full_business_name": (row.get("FullBusinessName") or "").strip(),
                "city": city, "state": "CA", "zip": zipc,
            }

    named: dict[str, tuple[str, str]] = {}
    with open(personnel_csv, encoding="utf-8", errors="replace", newline="") as fh:
        for row in csv.DictReader(fh):
            lic = (row.get("LIC-NO") or "").strip()
            if lic not in licences or lic in named:
                continue
            if (row.get("DIS-ASSN-DT") or "").strip():      # disassociated personnel
                continue
            first, last = parse_personnel_name(row.get("Name"))
            if first and looks_like_person(first, last):
                named[lic] = (first, last)

    out, stats = [], Counter()
    for lic, rec in licences.items():
        first = last = None
        if lic in named:
            first, last = named[lic]
            stats["from_personnel"] += 1
        elif rec["full_business_name"]:
            first, last = parse_owner_name(rec["full_business_name"])
            if first and looks_like_person(first, last):
                stats["from_master"] += 1
            else:
                first = None
        if not first:
            stats["no_usable_name"] += 1
            continue
        rec = dict(rec, owner_first=first, owner_last=last)
        rec["skiptrace_query"] = f"{first} {last}; {rec['city']}, CA {rec['zip']}"
        out.append(rec)
    print(f"  licences: {len(licences):,} | named: {len(out):,} | {dict(stats)}", file=sys.stderr)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--download", action="store_true", help="fetch fresh CSVs from CSLB (free)")
    ap.add_argument("--master", default="cslb_master.csv")
    ap.add_argument("--personnel", default="cslb_personnel.csv")
    ap.add_argument("--out", default="cslb_candidates.json")
    args = ap.parse_args()

    if args.download:
        print("downloading CSLB public data (free)...", file=sys.stderr)
        download("M", "ctl00$MainContent$lbMasterCSV", args.master)
        download("P", "ctl00$MainContent$lbtnPersonnelcsv", args.personnel)

    rows = build(args.master, args.personnel)
    json.dump(rows, open(args.out, "w", encoding="utf-8"), indent=1)
    print(json.dumps({"candidates": len(rows),
                      "by_trade": dict(Counter(r["trade"] for r in rows))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
