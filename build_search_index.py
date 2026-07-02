#!/usr/bin/env python3
"""
build_search_index.py — Generate a compact search-index.json from per-article JSON files.

This file is used as a client-side fallback when OpenSearch is unavailable.
It includes only the fields needed for search (no fullText to keep size small).
This should be modified when search fields are changed.
Usage:
  python3 build_search_index.py --input-dir ./json --out search-index.json
"""

import argparse
import json
import sys
from pathlib import Path


def main():
    ap = argparse.ArgumentParser(description="Build a compact search index JSON from per-article JSON files.")
    ap.add_argument("--input-dir", default="./json", help="Directory containing per-article JSON files")
    ap.add_argument("--out", default="search-index.json", help="Output file path")
    args = ap.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"ERROR: input dir not found: {input_dir}", file=sys.stderr)
        sys.exit(1)

    files = sorted(input_dir.rglob("*.json"))
    if not files:
        print("No JSON files found.", file=sys.stderr)
        sys.exit(1)

    records = []
    for fp in files:
        try:
            with fp.open("r", encoding="utf-8") as f:
                raw = json.load(f)

            # Extract only searchable metadata (skip fullText to keep index small)
            record = {
                "title": raw.get("title", []),
                "author": raw.get("author", []),
                "idno": raw.get("idno", ""),
                "type": raw.get("type", ""),
                "displayTitleEnglish": raw.get("displayTitleEnglish", ""),
            }
            records.append(record)
        except Exception as e:
            print(f"[SKIP] {fp}: {e}", file=sys.stderr)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(records, ensure_ascii=False), encoding="utf-8")
    print(f"Built search index: {len(records)} records → {out_path} ({out_path.stat().st_size // 1024}KB)", file=sys.stderr)


if __name__ == "__main__":
    main()
