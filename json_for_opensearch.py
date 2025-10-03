#!/usr/bin/env python3
# make_bulk_for_opensearch.py
#
# Create an NDJSON bulk file from many small JSON documents
# for import into OpenSearch via the _bulk API.
#
# Usage:
#   python make_bulk_for_opensearch.py \
#       --input-dir ./articles_json \
#       --index hugoye-articles \
#       --out bulk.ndjson
#
# Optional:
#   --gzip  (write bulk.ndjson.gz)
#   --limit 100  (only process first N files for testing)

import argparse, gzip, hashlib, io, json, sys
from pathlib import Path
from urllib.parse import urlparse
import re

def sha1_id(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()

def coerce_list(val):
    if val is None:
        return []
    if isinstance(val, list):
        return val
    return [val]

def normalize_record(raw: dict) -> dict:
    """
    Normalize your source JSON into a consistent document.
    Keeps original fields but also adds helpful normalized ones.
    """
    titles = coerce_list(raw.get("title"))
    # title_main = titles[0] if titles else None
    # title_secondary = titles[1] if len(titles) > 1 else None

    doc = {
        # Keep the originals
        "fullText": raw.get("fullText"),
        "title": titles,                       # array as provided
        "author": coerce_list(raw.get("author")),
        "idno": raw.get("idno"),
        "type": raw.get("type"),
        "displayTitleEnglish": raw.get("displayTitleEnglish"),

        # Helpful normalized fields (good for mapping/queries/sorting)
        # "title_main": title_main,
        # "title_secondary": title_secondary,
        # "author_str": "; ".join(coerce_list(raw.get("author"))),  # useful for aggregations/sorts
    }

    # Strip empty values to keep the index clean
    return {k: v for k, v in doc.items() if v not in (None, [], "")}

def make_action(index_name: str, doc_id: str) -> dict:
    return {"index": {"_index": index_name, "_id": doc_id}}

def discover_files(input_dir: Path):
    # Adjust the glob if your files have different extensions
    return sorted(list(input_dir.rglob("*.json")))

def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)



SAFE_ID_RE = re.compile(r"[^A-Za-z0-9._-]")

def last_segment_from_idno(idno: str) -> str | None:
    """
    Return the last non-empty path segment from an idno URL/string.
    Examples:
      https://.../article/hv10n2prkitchen1 -> hv10n2prkitchen1
      https://.../article/hv10n2prkitchen1/ -> hv10n2prkitchen1
      hv10n2prkitchen1 -> hv10n2prkitchen1
    """
    if not idno or not isinstance(idno, str):
        return None

    # Try URL parse first
    parsed = urlparse(idno)
    path = parsed.path or ""

    seg = ""
    if path:
        parts = [p for p in path.split("/") if p]  # remove empties
        if parts:
            seg = parts[-1]

    # If parsing as URL didn't yield a segment, treat idno as a plain string
    if not seg:
        seg = idno.strip()

    # Normalize to OpenSearch-safe id characters (letters, digits, . _ -)
    # (If you want to allow everything, remove this step.)
    seg = SAFE_ID_RE.sub("-", seg)

    return seg or None


def pick_doc_id(raw: dict, fallback: str) -> str:
    """
    Prefer using the last segment of 'idno' as the document _id.
    If unavailable/empty, fall back to a stable SHA-1 of the fallback string.
    """
    idno = raw.get("idno")
    seg = last_segment_from_idno(idno) if isinstance(idno, str) else None
    if seg:
        return seg
    return sha1_id(fallback)


def write_lines(out_handle, lines):
    for line in lines:
        out_handle.write((line + "\n").encode("utf-8") if isinstance(out_handle, gzip.GzipFile) else line + "\n")

def main():
    ap = argparse.ArgumentParser(description="Create an OpenSearch bulk NDJSON from many JSON docs.")
    ap.add_argument("--input-dir", required=True, help="Directory containing per-item JSON files")
    ap.add_argument("--index", required=True, help="Target OpenSearch index name (e.g., hugoye-articles)")
    ap.add_argument("--out", default="bulk.ndjson", help="Output NDJSON file path")
    ap.add_argument("--gzip", action="store_true", help="Write gzip-compressed output (.gz)")
    ap.add_argument("--limit", type=int, default=0, help="Process only the first N files (for testing)")
    args = ap.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"ERROR: input dir not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    files = discover_files(input_dir)
    if args.limit and args.limit > 0:
        files = files[: args.limit]

    if not files:
        print("No JSON files found.", file=sys.stderr)
        sys.exit(1)

    out_path = Path(args.out)
    if args.gzip and not str(out_path).endswith(".gz"):
        out_path = out_path.with_suffix(out_path.suffix + ".gz")

    opened = gzip.open(out_path, "wb") if args.gzip else out_path.open("w", encoding="utf-8")
    count = 0
    errors = 0

    try:
        for fp in files:
            try:
                raw = load_json(fp)
                doc = normalize_record(raw)
                doc_id = pick_doc_id(raw, str(fp.relative_to(input_dir)))
                action = make_action(args.index, doc_id)

                # Two NDJSON lines per document
                action_line = json.dumps(action, ensure_ascii=False)
                source_line = json.dumps(doc, ensure_ascii=False)

                if args.gzip:
                    opened.write((action_line + "\n").encode("utf-8"))
                    opened.write((source_line + "\n").encode("utf-8"))
                else:
                    opened.write(action_line + "\n")
                    opened.write(source_line + "\n")

                count += 1
                if count % 1000 == 0:
                    print(f"Wrote {count} docs…", file=sys.stderr)
            except Exception as e:
                errors += 1
                print(f"[SKIP] {fp}: {e}", file=sys.stderr)
    finally:
        opened.close()

    print(f"Done. Wrote {count} docs to {out_path} ({'gzipped' if args.gzip else 'plain'}).", file=sys.stderr)
    if errors:
        print(f"Encountered {errors} errors (files skipped).", file=sys.stderr)

if __name__ == "__main__":
    main()
