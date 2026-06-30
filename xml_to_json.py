#!/usr/bin/env python3
"""
xml_to_json.py — Convert TEI XML article files to per-article JSON
records for OpenSearch indexing.

Usage:
  # Single file
  python3 xml_to_json.py HV29N1Butts.xml

  # Multiple files
  python3 xml_to_json.py HV29N1*.xml

  # Custom output directory
  python3 xml_to_json.py --output-dir ./json HV29N1*.xml

  # Extract full text from PDFs (requires pdfminer.six or PyPDF2)
  python3 xml_to_json.py --extract-pdf HV29N1*.xml
"""

import argparse
import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

TEI_NS = {"tei": "http://www.tei-c.org/ns/1.0"}


def iter_text(el):
    """Recursively extract all text from an element, stripping inline markup like <hi>."""
    parts = []
    if el.text:
        parts.append(el.text)
    for child in el:
        parts.extend(iter_text(child))
        if child.tail:
            parts.append(child.tail)
    return parts


def get_text(el):
    """Get plain text content from an element (flattening inline elements, normalizing whitespace)."""
    if el is None:
        return ""
    raw = "".join(iter_text(el))
    # Normalize internal whitespace (collapse newlines/spaces from XML indentation)
    return " ".join(raw.split()).strip()


def find_text(root, path):
    """Find element by path and return its text."""
    el = root.find(path, TEI_NS)
    return get_text(el)


def extract_pdf_text(pdf_path):
    """Extract text from a PDF file. Returns empty string on failure."""
    if not pdf_path or not pdf_path.exists():
        return ""

    # Try pdfminer.six first
    try:
        from pdfminer.high_level import extract_text
        from pdfminer.layout import LAParams
        laparams = LAParams(char_margin=2.0, line_margin=0.4, word_margin=0.1, boxes_flow=None)
        text = extract_text(str(pdf_path), laparams=laparams) or ""
        if text.strip():
            print(f"  [pdf] pdfminer extracted {len(text)} chars from {pdf_path.name}", file=sys.stderr)
            return text.strip()
    except Exception:
        pass

    # Fallback to PyPDF2
    try:
        from PyPDF2 import PdfReader
        reader = PdfReader(str(pdf_path))
        parts = []
        for page in reader.pages:
            t = (page.extract_text() or "").strip()
            if t:
                parts.append(t)
        text = "\n\n".join(parts)
        if text.strip():
            print(f"  [pdf] PyPDF2 extracted {len(text)} chars from {pdf_path.name}", file=sys.stderr)
            return text.strip()
    except Exception:
        pass

    return ""


def find_pdf(xml_path, extract_pdf):
    """Find a PDF file next to the XML (same stem)."""
    if not extract_pdf:
        return None
    pdf_path = xml_path.with_suffix(".pdf")
    if pdf_path.exists():
        return pdf_path
    return None


def convert_xml_to_json(xml_path, extract_pdf=False):
    """
    Parse a TEI XML file and return a dict matching the existing JSON format:
    {
      "fullText": "...",
      "title": ["Article Title", "Hugoye: Journal of Syriac Studies"],
      "author": ["Surname, Forename", ...],
      "idno": "https://hugoye.bethmardutho.org/article/...",
      "type": "article",
      "displayTitleEnglish": "Article Title"
    }
    """
    tree = ET.parse(str(xml_path))
    root = tree.getroot()

    # --- Title ---
    # Combine main + sub title if both present
    title_main_el = root.find(".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:title[@type='main']", TEI_NS)
    title_sub_el = root.find(".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:title[@type='sub']", TEI_NS)

    title_main = get_text(title_main_el)
    title_sub = get_text(title_sub_el)

    if title_main and title_sub:
        display_title = f"{title_main} {title_sub}"
    elif title_main:
        display_title = title_main
    else:
        display_title = ""

    # --- Authors (Surname, Forename format) ---
    authors = []
    for author_el in root.findall(".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:author", TEI_NS):
        forename_el = author_el.find("tei:name/tei:forename", TEI_NS)
        surname_el = author_el.find("tei:name/tei:surname", TEI_NS)
        forename = get_text(forename_el)
        surname = get_text(surname_el)
        if surname and forename:
            authors.append(f"{surname}, {forename}")
        elif surname:
            authors.append(surname)
        elif forename:
            authors.append(forename)

    # --- idno (URI) ---
    idno = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:publicationStmt/tei:idno[@type='URI']")

    # --- Type ---
    # From <text type="article"> or derive from filename pattern
    text_el = root.find(".//tei:text", TEI_NS)
    article_type = text_el.get("type", "article") if text_el is not None else "article"

    # Normalize type based on common patterns (PR = peer review, CR = conference report, etc.)
    stem = xml_path.stem.lower()
    if article_type == "article":
        if "pr" in stem.split("n1")[-1][:2] or "pr" in stem.split("n2")[-1][:2]:
            article_type = "review"
        elif "bib" in stem:
            article_type = "bibliography"

    # --- Full text ---
    # First check body paragraphs
    body_ps = root.findall(".//tei:text/tei:body//tei:p", TEI_NS)
    body_texts = []
    for p in body_ps:
        text = get_text(p)
        if text:
            body_texts.append(text)

    full_text = "\n\n".join(body_texts)

    # Check if it's just a placeholder
    placeholder_phrases = [
        "html version of this article coming soon",
        "pdf coming soon",
    ]
    is_placeholder = any(ph in full_text.lower() for ph in placeholder_phrases)

    # If placeholder and PDF extraction requested, try to get text from PDF
    if is_placeholder and extract_pdf:
        pdf_path = find_pdf(xml_path, extract_pdf)
        pdf_text = extract_pdf_text(pdf_path)
        if pdf_text:
            full_text = pdf_text

    # If still placeholder text, keep it as-is (matches existing JSON convention)

    # --- Build output ---
    record = {
        "fullText": full_text,
        "title": [display_title, "Hugoye: Journal of Syriac Studies"],
        "author": authors,
        "idno": idno,
        "type": article_type,
        "displayTitleEnglish": display_title,
    }

    return record


def main():
    ap = argparse.ArgumentParser(
        description="Convert TEI XML files to per-article JSON for OpenSearch."
    )
    ap.add_argument("input", nargs="+", help="One or more TEI XML files to convert")
    ap.add_argument(
        "--output-dir", "-o",
        default="./json",
        help="Output directory for JSON files (default: ./json)",
    )
    ap.add_argument(
        "--extract-pdf",
        action="store_true",
        help="Extract full text from PDFs when body text is a placeholder",
    )
    ap.add_argument(
        "--dry-run",
        action="store_true",
        help="Print JSON to stdout instead of writing files",
    )
    args = ap.parse_args()

    output_dir = Path(args.output_dir)
    if not args.dry_run:
        output_dir.mkdir(parents=True, exist_ok=True)

    success = 0
    errors = 0

    for input_file in args.input:
        xml_path = Path(input_file)
        if not xml_path.exists():
            print(f"[SKIP] File not found: {xml_path}", file=sys.stderr)
            errors += 1
            continue

        try:
            record = convert_xml_to_json(xml_path, extract_pdf=args.extract_pdf)
            json_str = json.dumps(record, ensure_ascii=False, indent=2)

            if args.dry_run:
                print(f"--- {xml_path.stem}.json ---")
                print(json_str)
                print()
            else:
                out_path = output_dir / f"{xml_path.stem}.json"
                out_path.write_text(json_str + "\n", encoding="utf-8")
                print(f"[OK] {xml_path.name} → {out_path}", file=sys.stderr)

            success += 1
        except Exception as e:
            print(f"[ERROR] {xml_path.name}: {e}", file=sys.stderr)
            errors += 1

    print(f"\nDone. {success} converted, {errors} errors.", file=sys.stderr)


if __name__ == "__main__":
    main()
