#!/usr/bin/env python3
"""Zero-dependency .xlsx exporter that accumulates Predge daily delivery counts."""
import csv
import glob
import json
import os
import sys
import zipfile
from datetime import datetime, timezone
from xml.sax.saxutils import escape
import xml.etree.ElementTree as ET

SUMMARY_HEADERS = [
    "day_utc",
    "recorded_at_utc",
    "record_type",
    "tier",
    "created",
    "sent_to_predge",
    "delivered",
    "failed",
    "expected_geomacro_net_usd",
]

CELL_HEADERS = [
    "day_utc",
    "recorded_at_utc",
    "country_iso3",
    "category",
    "tier",
    "created",
    "sent_to_predge",
    "delivered",
    "failed",
    "expected_geomacro_net_usd",
]


def col_letter(idx: int) -> str:
    res = ""
    n = idx + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        res = chr(65 + rem) + res
    return res


def read_existing_xlsx(path: str):
    summary_rows = {}
    cell_rows = {}
    if not os.path.exists(path):
        return summary_rows, cell_rows
    try:
        with zipfile.ZipFile(path, "r") as zf:
            shared = []
            if "xl/sharedStrings.xml" in zf.namelist():
                root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
                for si in root:
                    texts = [t.text or "" for t in si.iter() if t.tag.endswith("}t") or t.tag == "t"]
                    shared.append("".join(texts))

            def parse_sheet(sheet_name: str):
                if sheet_name not in zf.namelist():
                    return []
                sroot = ET.fromstring(zf.read(sheet_name))
                rows = []
                for row in sroot.iter():
                    if not (row.tag.endswith("}row") or row.tag == "row"):
                        continue
                    vals = []
                    for c in row:
                        t = c.attrib.get("t", "")
                        v_el = next((ch for ch in c if ch.tag.endswith("}v") or ch.tag == "v"), None)
                        is_el = next((ch for ch in c if ch.tag.endswith("}is") or ch.tag == "is"), None)
                        if t == "s" and v_el is not None and v_el.text is not None:
                            vals.append(shared[int(v_el.text)])
                        elif t == "inlineStr" and is_el is not None:
                            vals.append("".join(x.text or "" for x in is_el.iter() if x.tag.endswith("}t") or x.tag == "t"))
                        elif v_el is not None and v_el.text is not None:
                            vals.append(v_el.text)
                        else:
                            vals.append("")
                    rows.append(vals)
                return rows

            for idx, r in enumerate(parse_sheet("xl/worksheets/sheet1.xml")):
                if idx == 0 or len(r) < len(SUMMARY_HEADERS):
                    continue
                rec = dict(zip(SUMMARY_HEADERS, r))
                summary_rows[(rec["day_utc"], rec["record_type"], rec["tier"])] = rec
            for idx, r in enumerate(parse_sheet("xl/worksheets/sheet2.xml")):
                if idx == 0 or len(r) < len(CELL_HEADERS):
                    continue
                rec = dict(zip(CELL_HEADERS, r))
                cell_rows[(rec["day_utc"], rec["country_iso3"], rec["category"], rec["tier"])] = rec
    except Exception:
        pass
    return summary_rows, cell_rows


def build_sheet_xml(headers, rows, numeric_cols):
    lines = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
    ]
    all_rows = [headers] + [[str(r.get(h, "")) for h in headers] for r in rows]
    for r_idx, row in enumerate(all_rows, start=1):
        lines.append(f'<row r="{r_idx}">')
        for c_idx, val in enumerate(row):
            ref = f"{col_letter(c_idx)}{r_idx}"
            h = headers[c_idx]
            if r_idx > 1 and h in numeric_cols and val != "":
                try:
                    float(val)
                    lines.append(f'<c r="{ref}"><v>{escape(val)}</v></c>')
                    continue
                except ValueError:
                    pass
            lines.append(f'<c r="{ref}" t="inlineStr"><is><t>{escape(val)}</t></is></c>')
        lines.append("</row>")
    lines.append("</sheetData></worksheet>")
    return "\n".join(lines)


def export_excel(in_dir: str, out_path: str, recorded_at_utc: str):
    summary_rows, cell_rows = read_existing_xlsx(out_path)
    for csv_path in sorted(glob.glob(os.path.join(in_dir, "*-summary.csv"))):
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                rtype = (row.get("record_type") or "").strip()
                day = (row.get("day_utc") or "").strip()
                if not day:
                    continue
                if rtype in ("TOTAL", "TIER"):
                    tier = (row.get("tier") or ("ALL" if rtype == "TOTAL" else "")).strip()
                    summary_rows[(day, rtype, tier)] = {
                        "day_utc": day,
                        "recorded_at_utc": recorded_at_utc,
                        "record_type": rtype,
                        "tier": tier,
                        "created": row.get("created", "0"),
                        "sent_to_predge": row.get("sent_to_predge", "0"),
                        "delivered": row.get("delivered", "0"),
                        "failed": row.get("failed", "0"),
                        "expected_geomacro_net_usd": row.get("expected_geomacro_net_usd", "0"),
                    }
                elif rtype == "CELL":
                    country = (row.get("country_iso3") or "").strip()
                    cat = (row.get("category") or "").strip()
                    tier = (row.get("tier") or "").strip()
                    cell_rows[(day, country, cat, tier)] = {
                        "day_utc": day,
                        "recorded_at_utc": recorded_at_utc,
                        "country_iso3": country,
                        "category": cat,
                        "tier": tier,
                        "created": row.get("created", "0"),
                        "sent_to_predge": row.get("sent_to_predge", "0"),
                        "delivered": row.get("delivered", "0"),
                        "failed": row.get("failed", "0"),
                        "expected_geomacro_net_usd": row.get("expected_geomacro_net_usd", "0"),
                    }

    sorted_summary = [summary_rows[k] for k in sorted(summary_rows.keys())]
    sorted_cells = [cell_rows[k] for k in sorted(cell_rows.keys())]
    num_cols = {"created", "sent_to_predge", "delivered", "failed", "expected_geomacro_net_usd"}

    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
            "</Relationships>",
        )
        zf.writestr(
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            "<sheets>"
            '<sheet name="Daily_Summary" sheetId="1" r:id="rId1"/>'
            '<sheet name="Cell_Breakdown" sheetId="2" r:id="rId2"/>'
            "</sheets></workbook>",
        )
        zf.writestr("xl/worksheets/sheet1.xml", build_sheet_xml(SUMMARY_HEADERS, sorted_summary, num_cols))
        zf.writestr("xl/worksheets/sheet2.xml", build_sheet_xml(CELL_HEADERS, sorted_cells, num_cols))

    return {"summary_rows": len(sorted_summary), "cell_rows": len(sorted_cells), "out_path": out_path}


if __name__ == "__main__":
    in_dir = sys.argv[1] if len(sys.argv) > 1 else "artifacts/predge-daily-delivery"
    out_path = sys.argv[2] if len(sys.argv) > 2 else os.path.join(in_dir, "predge-daily-internal-log.xlsx")
    recorded_at = sys.argv[3] if len(sys.argv) > 3 else datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    print(json.dumps(export_excel(in_dir, out_path, recorded_at)))
