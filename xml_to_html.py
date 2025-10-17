#!/usr/bin/env python3
import argparse, html, sys, xml.etree.ElementTree as ET, tempfile
from pathlib import Path

TEI_NS = {"tei": "http://www.tei-c.org/ns/1.0"}

# ---------- PDF extraction helpers ----------
def _extract_with_pdfminer(pdf_path: Path) -> str:
    try:
        from pdfminer.high_level import extract_text
        text = extract_text(str(pdf_path)) or ""
        if text.strip():
            print(f"[pdf] pdfminer extracted {len(text)} chars", file=sys.stderr)
        return text
    except Exception as e:
        print(f"[pdf] pdfminer failed/not available: {e}", file=sys.stderr)
        return ""

def _extract_with_pypdf2(pdf_path: Path) -> str:
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
            print(f"[pdf] PyPDF2 extracted {len(text)} chars", file=sys.stderr)
        return text
    except Exception as e:
        print(f"[pdf] PyPDF2 failed/not available: {e}", file=sys.stderr)
        return ""

def extract_pdf_html(pdf_path: Path) -> str:
    """
    Convert a PDF into a simple <div class="pdf-transcript"><p>...</p></div>.
    Try pdfminer first, then PyPDF2.
    """
    if not pdf_path or not pdf_path.exists():
        print("[pdf] No local PDF found to extract", file=sys.stderr)
        return ""

    text = _extract_with_pdfminer(pdf_path)
    if not text.strip():
        text = _extract_with_pypdf2(pdf_path)
    if not text.strip():
        print("[pdf] Extraction produced empty text (scanned PDF?)", file=sys.stderr)
        return ""

    # paragraphize by blank lines
    lines = [ln.strip() for ln in text.splitlines()]
    paras, buf = [], []
    for ln in lines:
        if ln == "":
            if buf:
                paras.append(" ".join(buf).strip())
                buf = []
        else:
            buf.append(ln)
    if buf:
        paras.append(" ".join(buf).strip())

    if not paras:
        return ""

    parts = ['<div class="pdf-transcript">', '<h3 class="h4">Full text (from PDF)</h3>']
    for p in paras:
        parts.append(f"<p>{html.escape(p)}</p>")
    parts.append("</div>")
    return "\n".join(parts)

def try_get_pdf_locally_or_download(infile: Path, pdf_url: str, pdf_override: str | None) -> Path | None:
    """
    Priority:
      1) --pdf path if provided
      2) same-stem sibling (infile with .pdf)
      3) basename of URL in current folder
      4) download URL to a temp file (requires 'requests')
    """
    if pdf_override:
        p = Path(pdf_override)
        print(f"[pdf] Using override path: {p}", file=sys.stderr)
        return p if p.exists() else None

    guess = infile.with_suffix(".pdf")
    if guess.exists():
        print(f"[pdf] Found same-stem PDF: {guess}", file=sys.stderr)
        return guess

    if pdf_url:
        basename = Path(pdf_url.rsplit("/", 1)[-1])
        if basename.exists():
            print(f"[pdf] Found URL basename locally: {basename}", file=sys.stderr)
            return basename

        # try to download
        try:
            import requests
            print(f"[pdf] Downloading {pdf_url}", file=sys.stderr)
            resp = requests.get(pdf_url, timeout=60)
            resp.raise_for_status()
            tmp = Path(tempfile.gettempdir()) / basename.name
            tmp.write_bytes(resp.content)
            print(f"[pdf] Saved downloaded PDF to {tmp}", file=sys.stderr)
            return tmp
        except Exception as e:
            print(f"[pdf] Download failed: {e}", file=sys.stderr)

    return None

# ---------- HTML template ----------
HTML_TEMPLATE = """<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:srophe="https://srophe.app">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${doc_title}</title>
    <link rel="schema.DC" href="http://purl.org/dc/elements/1.1/" />
    <link rel="schema.DCTERMS" href="http://purl.org/dc/terms/" />
    <meta name="DC.type" property="dc.type" content="Text" />
    <meta name="DC.isPartOf" property="dc.ispartof" content="Syriaca.org" />
    <link data-template="app:metadata" />
    <link rel="shortcut icon" href="/resources/img/favicon.ico" />
    <link rel="stylesheet" type="text/css" href="/resources/css/bootstrap.min.css" />
    <link rel="stylesheet" type="text/css" href="/resources/css/sm-core-css.css" />
    <link rel="stylesheet" href="/resources/css/syr-icon-fonts.css" />
    <link rel="stylesheet" type="text/css" href="/resources/css/main.css" />
    <link rel="stylesheet" type="text/css" media="print" href="/resources/css/print.css" />
    <link href="/resources/jquery-ui/jquery-ui.min.css" rel="stylesheet" />
    <script type="text/javascript" src="/resources/js/jquery.min.js"></script>
    <script type="text/javascript" src="/resources/jquery-ui/jquery-ui.min.js"></script>
    <script type="text/javascript" src="/resources/js/jquery.smartmenus.min.js"></script>
    <script type="text/javascript" src="/resources/js/clipboard.min.js"></script>
    <script type="text/javascript" src="/resources/js/bootstrap.min.js"></script>
    <script src="https://www.google.com/recaptcha/api.js"></script>
    <link href="/resources/keyboard/css/keyboard.min.css" rel="stylesheet" />
    <link href="/resources/keyboard/css/keyboard-previewkeyset.min.css" rel="stylesheet" />
    <link href="/resources/keyboard/syr/syr.css" rel="stylesheet" />
    <script type="text/javascript" src="/resources/keyboard/syr/jquery.keyboard.js"></script>
    <script type="text/javascript" src="/resources/keyboard/js/jquery.keyboard.extension-mobile.min.js"></script>
    <script type="text/javascript" src="/resources/keyboard/js/jquery.keyboard.extension-navigation.min.js"></script>
    <script type="text/javascript" src="/resources/keyboard/syr/jquery.keyboard.extension-autocomplete.js"></script>
    <script type="text/javascript" src="/resources/keyboard/syr/keyboardSupport.js"></script>
    <script type="text/javascript" src="/resources/keyboard/syr/syr.js"></script>
    <script type="text/javascript" src="/resources/js/keyboard.js"></script>
  </head>
  <body id="body">
    <div class="navbar navbar-default navbar-fixed-top" role="navigation" data-template="app:fix-links">...</div>
    <div class="main-content-block">
      <div class="interior-content">
        <div class="container otherFormats">
          ${download_links}
        </div>
        <div class="row">
          <div class="col-md-2 col-lg-2 noprint">...</div>
          <div class="col-sm-7 col-md-7 col-lg-7 mssBody">
            <div class="article-header text-center">
              <h1>${doc_title}</h1>
              <span class="tei-author">
                <span class="tei-name">${author_forename} <span class="tei-surname">${author_surname}</span></span>
                <span class="tei-affiliation"><span class="tei-orgName">${author_affiliation}</span></span>
              </span>
            </div>
            <div class="section tei-text">
              <div class="body">
                <div class="section" style="display:block;">
                  <div class="tei-div  tei-title" ${lang_attr}>
                    <span class="tei-ab tei-review-title">${review_title}</span>
                  </div>
                  <div class="tei-div  tei-body" ${lang_attr}>
                    ${body_paragraphs}
                  </div>
                  ${pdf_text_block}
                  ${bibliography_html}
                </div>
              </div>
            </div>
          </div>
          <div class="col-md-3 col-lg-3 right-menu">...</div>
        </div>
      </div>
    </div>
  </body>
</html>
"""

# ---------- helpers ----------
def t(x): return html.escape(x.strip()) if x else ""

def find_text(root, path):
    el = root.find(path, TEI_NS)
    return el.text.strip() if (el is not None and el.text) else ""

def find_attr(root, path, attr):
    el = root.find(path, TEI_NS)
    return el.get(attr) if (el is not None and el.get(attr)) else ""

def render_html(data: dict) -> str:
    out = HTML_TEMPLATE
    for k, v in data.items():
        out = out.replace("${" + k + "}", v)
    return out

def looks_like_placeholder(s: str) -> bool:
    """Case/space-insensitive match for your placeholders."""
    norm = " ".join((s or "").lower().split())
    return (
        "pdf coming soon" in norm
        or "html version of this article coming soon" in norm
    )

def parse_bibliography(root) -> str:
    bibl_div = root.find(".//tei:text/tei:body/tei:div[@type='bibliography']", TEI_NS)
    if bibl_div is None:
        return ""
    items = []
    for bibl in bibl_div.findall(".//tei:listBibl/tei:bibl", TEI_NS):
        author = "".join(bibl.findtext("tei:author", default="", namespaces=TEI_NS)).strip()
        title  = "".join(bibl.findtext("tei:title", default="", namespaces=TEI_NS)).strip()
        items.append(f"<li><span>{html.escape(author)}</span> <span class='title'>{html.escape(title)}</span>.</li>")
    if not items:
        return ""
    return f"""<div class="tei-div  tei-bibliography" id="Head-id.bibliography">
  <h3 class="tei-head  tei-bibliography">Bibliography</h3>
  <ul class="listBibl">{''.join(items)}</ul>
</div>"""

# ---------- main ----------
def main(infile: str, outfile: str | None, pdf_override: str | None):
    root = ET.parse(infile).getroot()

    # metadata
    title_main = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:title[@type='main']")
    forename   = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:author/tei:name/tei:forename")
    surname    = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:author/tei:name/tei:surname")
    affiliation= find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:author/tei:affiliation/tei:orgName")
    sponsor    = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:titleStmt/tei:sponsor")
    publisher  = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:publicationStmt/tei:publisher") or sponsor
    pub_year   = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:publicationStmt/tei:date")
    record_uri = find_text(root, ".//tei:teiHeader/tei:fileDesc/tei:publicationStmt/tei:idno[@type='URI']")
    status     = find_attr(root, ".//tei:teiHeader/tei:revisionDesc", "status")
    pdf_url    = find_text(root, ".//tei:teiHeader/tei:sourceDesc//tei:idno[@type='PDF']")
    journal    = find_text(root, ".//tei:teiHeader/tei:sourceDesc//tei:monogr/tei:title[@level='j']")
    vol_num    = find_text(root, ".//tei:teiHeader/tei:sourceDesc//tei:biblScope[@type='vol']")
    lang       = find_attr(root, ".//tei:text", "{http://www.w3.org/XML/1998/namespace}lang") or \
                 find_attr(root, ".//tei:profileDesc/tei:langUsage/tei:language", "ident")
    lang_attr  = f'lang="{html.escape(lang)}"' if lang else ""

    # title/paragraphs
    ab = root.find(".//tei:text/tei:body/tei:div[@type='title']/tei:ab[@type='review-title']", TEI_NS)
    review_title = html.escape("".join(ab.itertext()).strip()) if ab is not None else ""

    body_ps = root.findall(".//tei:text/tei:body//tei:p", TEI_NS)
    body_list, placeholder_hit = [], False
    for p in body_ps:
        text = "".join(p.itertext()).strip()
        if looks_like_placeholder(text):
            placeholder_hit = True
            continue
        if text:
            body_list.append(f'<p class="tei-p text-display" dir="ltr">{html.escape(text)}</p>')
        else:
            body_list.append('<p class="tei-p text-display" dir="ltr"></p>')

    bibliography_html = parse_bibliography(root)

    # find or fetch PDF
    pdf_path = try_get_pdf_locally_or_download(Path(infile), pdf_url, pdf_override)
    print(f"[pdf] placeholder_hit={placeholder_hit}, pdf_url={'yes' if pdf_url else 'no'}, pdf_path={pdf_path}", file=sys.stderr)

    pdf_text_block = extract_pdf_html(pdf_path) if pdf_path else ""

    # injection policy: replace placeholder if found; otherwise append
    if pdf_text_block:
        body_list.append(pdf_text_block)

    # buttons/sidebar bits
    tei_filename = Path(infile).name
    pdf_btn = f'<a href="{html.escape(pdf_url)}" class="btn btn-default btn-xs" id="pdfBtn" data-toggle="tooltip" title="Click to download the PDF version of this article."><i class="fas fa-file-pdf"></i> PDF</a>' if pdf_url else ""
    tei_btn = f'<a href="{html.escape(tei_filename)}" class="btn btn-default btn-xs" id="teiBtn" data-toggle="tooltip" title="Click to view the TEI XML data for this record."><span class="glyphicon glyphicon-download-alt" aria-hidden="true"></span> TEI/XML</a>'
    download_links = " ".join(x for x in [pdf_btn, tei_btn] if x)

    vol_link = html.escape(vol_num) if vol_num else ""
    vol_display = html.escape(vol_num) if vol_num else ""
    year_paren = f"({html.escape(pub_year)})" if pub_year else ""
    author_full = html.escape(f"{forename} {surname}".strip())

    data = {
        "doc_title": t(title_main),
        "author_forename": t(forename),
        "author_surname": t(surname),
        "author_affiliation": t(affiliation),
        "publisher": t(publisher),
        "pub_year": t(pub_year),
        "record_uri": t(record_uri),
        "status": t(status or "unknown"),
        "journal_title": t(journal or "Hugoye: Journal of Syriac Studies"),
        "vol_link": vol_link,
        "vol_display": vol_display,
        "year_paren": year_paren,
        "download_links": download_links,
        "toc_links": "",  # keep simple
        "review_title": review_title,
        "body_paragraphs": "\n".join(body_list),
        "bibliography_html": bibliography_html,
        "pub_date_display": t(pub_year),
        "author_full": author_full,
        "lang_attr": lang_attr or "",
        "pdf_text_block": "",  # already appended inside body_paragraphs
    }

    html_out = render_html(data)
    if outfile:
        Path(outfile).write_text(html_out, encoding="utf-8")
    else:
        sys.stdout.write(html_out)

if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Convert TEI XML to HTML and append/replace with PDF text when available.")
    ap.add_argument("input", help="Input TEI XML file")
    ap.add_argument("output", nargs="?", help="Output HTML file (default: stdout)")
    ap.add_argument("--pdf", help="Path to a local PDF (overrides autodetect/download)", default=None)
    args = ap.parse_args()
    main(args.input, args.output, args.pdf)
