from __future__ import annotations

import csv
import html
from collections import defaultdict
from pathlib import Path


def safe_float(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def titleize(value: str) -> str:
    return value.replace("-", " ").strip().title()


def dataset_from_rel_path(rel_path: Path) -> str:
    parts = rel_path.parts
    if len(parts) >= 2 and parts[0] == "datasets":
        return titleize(parts[1])
    if len(parts) >= 2 and parts[0] == "regressions":
        return f"Regression: {titleize(parts[1])}"
    if len(parts) >= 2 and parts[0] == "debug":
        return f"Debug: {titleize(parts[1])}"
    return "Root"


def parse_name_run_seed(file_name: str) -> tuple[str, str]:
    prefix = "snapquote-test-results--"
    if not (file_name.startswith(prefix) and file_name.endswith(".csv")):
        return "(mixed)", "(mixed)"
    core = file_name[len(prefix) : -4]
    if "--seed-" not in core:
        return core.replace("--", " "), "(mixed)"
    run_part, seed = core.rsplit("--seed-", 1)
    return run_part.replace("--", " "), seed


def fmt_money(value: float | None) -> str:
    if value is None:
        return ""
    return f"${value:,.2f}"


def fmt_delta(value: float | None) -> str:
    if value is None:
        return ""
    sign = "+" if value > 0 else ""
    return f"{sign}${value:,.2f}"


def delta_class(value: float | None) -> str:
    if value is None:
        return ""
    if value > 0:
        return "delta-pos"
    if value < 0:
        return "delta-neg"
    return "delta-zero"


def render_table(table_id: str, headers: list[tuple[str, str]], rows: list[list[str]]) -> str:
    thead_cells = []
    for idx, (label, sort_type) in enumerate(headers):
        thead_cells.append(
            f'<th onclick="sortTable(\'{table_id}\',{idx},\'{sort_type}\')">{html.escape(label)}</th>'
        )
    thead = "<tr>" + "".join(thead_cells) + "</tr>"
    tbody = "".join("<tr>" + "".join(cells) + "</tr>" for cells in rows)
    return f'<div class="table-wrap"><table id="{table_id}"><thead>{thead}</thead><tbody>{tbody}</tbody></table></div>'


def main() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    test_results = repo_root / "test-results"
    output_path = test_results / "estimator-test-dashboard.html"

    csv_files = sorted(test_results.rglob("*.csv"))

    inventory_rows: list[dict[str, str]] = []
    grouped = defaultdict(lambda: defaultdict(lambda: {"baseline": [], "ai": []}))
    property_context = defaultdict(dict)

    for csv_path in csv_files:
        rel = csv_path.relative_to(test_results)
        dataset = dataset_from_rel_path(rel)
        run_name, seed_name = parse_name_run_seed(csv_path.name)

        with csv_path.open("r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        if run_name == "(mixed)":
            run_values = sorted({(r.get("run_label") or "").strip() for r in rows if r.get("run_label")})
            run_name = ", ".join(run_values) if run_values else "(unknown)"
        if seed_name == "(mixed)":
            seed_values = sorted({(r.get("seed") or "").strip() for r in rows if r.get("seed")})
            seed_name = ", ".join(seed_values) if seed_values else "(unknown)"

        inventory_rows.append(
            {
                "dataset": dataset,
                "run": run_name,
                "seed": seed_name,
                "file": rel.as_posix(),
            }
        )

        for row in rows:
            address = (row.get("address") or "").strip()
            service = (row.get("service") or "").strip()
            seed = (row.get("seed") or "").strip()
            estimate = safe_float((row.get("estimate") or "").strip())
            if not address or not service or estimate is None:
                continue

            mode_raw = (row.get("ai_mode") or "").strip().lower()
            mode = "baseline" if mode_raw in {"off", "baseline"} else "ai"
            key = (address, service, seed)
            grouped[dataset][key][mode].append(estimate)

            if address not in property_context[dataset]:
                property_context[dataset][address] = {
                    "google_building_sqft": (row.get("google_building_sqft") or "").strip(),
                    "google_lot_sqft": (row.get("google_lot_sqft") or "").strip(),
                    "travel_distance_miles": (row.get("travel_distance_miles") or "").strip(),
                }

    comparisons_by_dataset = defaultdict(list)
    service_summary = defaultdict(lambda: defaultdict(lambda: {"changed": 0, "total": 0, "delta_sum": 0.0}))

    for dataset, key_map in grouped.items():
        for (address, service, seed), bucket in key_map.items():
            if not bucket["baseline"] or not bucket["ai"]:
                continue
            baseline = sum(bucket["baseline"]) / len(bucket["baseline"])
            ai = sum(bucket["ai"]) / len(bucket["ai"])
            delta = ai - baseline
            comparisons_by_dataset[dataset].append(
                {
                    "address": address,
                    "service": service,
                    "seed": seed,
                    "baseline": baseline,
                    "ai": ai,
                    "delta": delta,
                }
            )
            svc = service_summary[dataset][service]
            svc["total"] += 1
            if abs(delta) > 1e-9:
                svc["changed"] += 1
            svc["delta_sum"] += delta

    inventory_rows.sort(key=lambda r: (r["dataset"], r["run"], r["file"]))

    html_parts: list[str] = []
    html_parts.append(
        """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Estimator Test Dashboard</title>
  <style>
    :root { --bg:#f6f8fb; --panel:#ffffff; --text:#1c2530; --muted:#5a6b7d; --line:#d7e0ea; --pos:#0a7f37; --neg:#b42318; --zero:#68717d; }
    body { margin:0; font-family:Segoe UI, Tahoma, Arial, sans-serif; background:var(--bg); color:var(--text); }
    .container { max-width: 1380px; margin: 0 auto; padding: 20px; }
    h1 { margin: 0 0 8px; font-size: 28px; }
    .meta { color: var(--muted); margin-bottom: 16px; }
    section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; margin-bottom:14px; }
    h2 { margin: 0 0 10px; font-size: 20px; }
    h3 { margin: 14px 0 8px; font-size: 16px; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:8px; }
    table { border-collapse:collapse; width:100%; background:#fff; font-size:13px; }
    th, td { border-bottom:1px solid #e8edf3; padding:8px 10px; text-align:left; white-space:nowrap; }
    thead th { position:sticky; top:0; background:#eef3f8; cursor:pointer; z-index:2; }
    tr:hover td { background:#f8fbff; }
    .delta-pos { color:var(--pos); font-weight:600; }
    .delta-neg { color:var(--neg); font-weight:600; }
    .delta-zero { color:var(--zero); }
    .hint { color: var(--muted); font-size: 12px; margin: 6px 0 0; }
  </style>
  <script>
    function parseSortValue(text, type) {
      if (type === "num") {
        const n = Number(String(text).replace(/[^0-9.-]/g, ""));
        return Number.isNaN(n) ? 0 : n;
      }
      return String(text).toLowerCase();
    }
    function sortTable(tableId, colIndex, type) {
      const table = document.getElementById(tableId);
      if (!table) return;
      const tbody = table.tBodies[0];
      const rows = Array.from(tbody.rows);
      const key = "sort_" + colIndex;
      const asc = table.dataset[key] !== "asc";
      rows.sort((a, b) => {
        const av = parseSortValue(a.cells[colIndex].innerText, type);
        const bv = parseSortValue(b.cells[colIndex].innerText, type);
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
      rows.forEach(r => tbody.appendChild(r));
      table.dataset[key] = asc ? "asc" : "desc";
    }
  </script>
</head>
<body>
  <div class="container">
"""
    )
    html_parts.append("<h1>Estimator Test Data Dashboard</h1>")
    html_parts.append(
        f'<div class="meta">Source: {html.escape(str(test_results))} | CSV files scanned: {len(csv_files)}</div>'
    )

    html_parts.append("<section><h2>Section 1 - Dataset Inventory</h2>")
    inv_headers = [("Dataset", "text"), ("Run Label", "text"), ("Seed", "text"), ("CSV File Name", "text")]
    inv_rows = [
        [
            f"<td>{html.escape(row['dataset'])}</td>",
            f"<td>{html.escape(row['run'])}</td>",
            f"<td>{html.escape(row['seed'])}</td>",
            f"<td>{html.escape(row['file'])}</td>",
        ]
        for row in inventory_rows
    ]
    html_parts.append(render_table("inventory", inv_headers, inv_rows))
    html_parts.append('<p class="hint">Tip: click any column header to sort.</p></section>')

    html_parts.append("<section><h2>Section 2 - Baseline vs AI Comparison (By Dataset)</h2>")
    cmp_headers = [
        ("Address", "text"),
        ("Service", "text"),
        ("Baseline Estimate", "num"),
        ("AI Estimate", "num"),
        ("Delta", "num"),
    ]
    for dataset in sorted(comparisons_by_dataset):
        html_parts.append(f"<h3>{html.escape(dataset)}</h3>")
        rows = []
        for rec in sorted(comparisons_by_dataset[dataset], key=lambda r: (r["address"], r["service"])):
            rows.append(
                [
                    f"<td>{html.escape(rec['address'])}</td>",
                    f"<td>{html.escape(rec['service'])}</td>",
                    f"<td>{html.escape(fmt_money(rec['baseline']))}</td>",
                    f"<td>{html.escape(fmt_money(rec['ai']))}</td>",
                    f'<td class="{delta_class(rec["delta"])}">{html.escape(fmt_delta(rec["delta"]))}</td>',
                ]
            )
        table_id = f"cmp_{dataset.lower().replace(' ', '_').replace(':', '')}"
        html_parts.append(render_table(table_id, cmp_headers, rows))
    html_parts.append("</section>")

    html_parts.append("<section><h2>Section 3 - Biggest Price Movements</h2>")
    move_headers = [("Address", "text"), ("Service", "text"), ("Baseline", "num"), ("AI", "num"), ("Delta", "num")]
    for dataset in sorted(comparisons_by_dataset):
        rows_src = comparisons_by_dataset[dataset]
        top_inc = sorted([r for r in rows_src if r["delta"] > 0], key=lambda r: r["delta"], reverse=True)[:10]
        top_dec = sorted([r for r in rows_src if r["delta"] < 0], key=lambda r: r["delta"])[:10]
        html_parts.append(f"<h3>{html.escape(dataset)} - Top 10 Increases</h3>")
        inc_rows = [
            [
                f"<td>{html.escape(r['address'])}</td>",
                f"<td>{html.escape(r['service'])}</td>",
                f"<td>{html.escape(fmt_money(r['baseline']))}</td>",
                f"<td>{html.escape(fmt_money(r['ai']))}</td>",
                f'<td class="{delta_class(r["delta"])}">{html.escape(fmt_delta(r["delta"]))}</td>',
            ]
            for r in top_inc
        ]
        html_parts.append(render_table(f"inc_{dataset.lower().replace(' ', '_')}", move_headers, inc_rows))
        html_parts.append(f"<h3>{html.escape(dataset)} - Top 10 Decreases</h3>")
        dec_rows = [
            [
                f"<td>{html.escape(r['address'])}</td>",
                f"<td>{html.escape(r['service'])}</td>",
                f"<td>{html.escape(fmt_money(r['baseline']))}</td>",
                f"<td>{html.escape(fmt_money(r['ai']))}</td>",
                f'<td class="{delta_class(r["delta"])}">{html.escape(fmt_delta(r["delta"]))}</td>',
            ]
            for r in top_dec
        ]
        html_parts.append(render_table(f"dec_{dataset.lower().replace(' ', '_')}", move_headers, dec_rows))
    html_parts.append("</section>")

    html_parts.append("<section><h2>Section 4 - Service Movement Summary</h2>")
    svc_headers = [("Service", "text"), ("Rows Changed", "num"), ("Total Rows", "num"), ("Total Delta", "num")]
    for dataset in sorted(service_summary):
        html_parts.append(f"<h3>{html.escape(dataset)}</h3>")
        svc_rows = []
        for service, stats in sorted(service_summary[dataset].items()):
            svc_rows.append(
                [
                    f"<td>{html.escape(service)}</td>",
                    f"<td>{stats['changed']}</td>",
                    f"<td>{stats['total']}</td>",
                    f'<td class="{delta_class(stats["delta_sum"])}">{html.escape(fmt_delta(stats["delta_sum"]))}</td>',
                ]
            )
        html_parts.append(render_table(f"svc_{dataset.lower().replace(' ', '_')}", svc_headers, svc_rows))
    html_parts.append("</section>")

    html_parts.append("<section><h2>Section 5 - Property Size Context</h2>")
    prop_headers = [
        ("Address", "text"),
        ("google_building_sqft", "num"),
        ("google_lot_sqft", "num"),
        ("travel_distance_miles", "num"),
    ]
    for dataset in sorted(property_context):
        html_parts.append(f"<h3>{html.escape(dataset)}</h3>")
        prop_rows = []
        for address, metrics in sorted(property_context[dataset].items()):
            prop_rows.append(
                [
                    f"<td>{html.escape(address)}</td>",
                    f"<td>{html.escape(metrics['google_building_sqft'])}</td>",
                    f"<td>{html.escape(metrics['google_lot_sqft'])}</td>",
                    f"<td>{html.escape(metrics['travel_distance_miles'])}</td>",
                ]
            )
        html_parts.append(render_table(f"prop_{dataset.lower().replace(' ', '_')}", prop_headers, prop_rows))
    html_parts.append("</section>")

    html_parts.append("</div></body></html>")
    output_path.write_text("".join(html_parts), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
