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


def extract_pdf_html(pdf_path: Path) -> str:
    """
    Layout-aware PDF->HTML paragraphs.
    Tries pdfminer.six with LAParams, then PyPDF2 as fallback.
    """
    if not pdf_path or not pdf_path.exists():
        print("[pdf] No local PDF found to extract", file=sys.stderr)
        return ""

    # ---- try pdfminer with layout params ----
    text = ""
    try:
        from pdfminer.high_level import extract_text
        from pdfminer.layout import LAParams
        # tune as needed: smaller margins -> keep lines together, detect paragraphs better
        laparams = LAParams(char_margin=2.0, line_margin=0.4, word_margin=0.1, boxes_flow=None)
        text = extract_text(str(pdf_path), laparams=laparams) or ""
        if text.strip():
            print(f"[pdf] pdfminer (LAParams) extracted {len(text)} chars", file=sys.stderr)
    except Exception as e:
        print(f"[pdf] pdfminer failed/not available: {e}", file=sys.stderr)

    # ---- fallback to PyPDF2 ----
    if not text.strip():
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
        except Exception as e:
            print(f"[pdf] PyPDF2 failed/not available: {e}", file=sys.stderr)

    if not text.strip():
        print("[pdf] Extraction produced empty text (likely a scanned PDF; use OCR)", file=sys.stderr)
        return ""

    # --- normalize: dehyphenate line breaks like "word-\nnext" -> "wordnext"
    text = text.replace("-\n", "")
    # collapse very long runs of spaces
    text = "\n".join(" ".join(line.split()) for line in text.splitlines())

    # paragraphize by blank lines
    paras, buf = [], []
    for ln in text.splitlines():
        if ln.strip() == "":
            if buf:
                paras.append(" ".join(buf).strip())
                buf = []
        else:
            buf.append(ln.strip())
    if buf:
        paras.append(" ".join(buf).strip())

    if not paras:
        return ""

    out = ['<div class="pdf-transcript">', '<h3 class="h4">Full text (from PDF)</h3>']
    for p in paras:
        out.append(f"<p>{html.escape(p)}</p>")
    out.append("</div>")
    return "\n".join(out)
  
def build_pdf_embed(pdf_url: str, local_pdf: Path | None) -> str:
    """
    Returns an <embed>/<object> block that works for local files and remote URLs.
    Google Viewer only works for remote http(s) URLs; for local use <object>.
    """
    # Prefer local file for local testing
    if local_pdf and local_pdf.exists():
        src = html.escape(local_pdf.name)  # relative path next to the HTML
        return f"""
<div class="PDFviewer text-center" style="width:100%; margin-top:1rem;">
  <object data="{src}" type="application/pdf" width="100%" height="800">
    <a href="{src}">Open the PDF</a>
  </object>
</div>"""

    # Else, use remote URL if present
    if pdf_url and (pdf_url.startswith("http://") or pdf_url.startswith("https://")):
        quoted = pdf_url.replace("&", "&amp;")
        viewer = f"https://drive.google.com/viewerng/viewer?embedded=true&amp;url={quoted}"
        return f"""
<div class="PDFviewer text-center" style="width:100%; margin-top:1rem;">
  <embed src="{viewer}" width="100%" height="800" />
</div>"""

    return ""  # nothing to embed
  
def build_toc_links(root: ET.Element) -> str:
    """
    Create left-panel TOC from TEI structure:
    - Any element with a <head> becomes an anchor.
    - Bibliography div gets a link (if present).
    - If nothing else, add 'PDF' when a pdf_url exists.
    """
    items = []

    # 1) heads inside the text body
    for head in root.findall(".//tei:text//tei:head", TEI_NS):
        label = "".join(head.itertext()).strip()
        if not label:
            continue
        # anchor id: use parent @xml:id if present, else slugify label
        parent = head.getparent() if hasattr(head, "getparent") else None  # ElementTree lacks getparent; ignore
        # fallback: derive an id from the text
        slug = "-".join(label.lower().split())
        items.append(f'<a href="#{html.escape(slug)}" class="toc-item">{html.escape(label)}</a>')

    # 2) bibliography
    bibl_div = root.find(".//tei:text/tei:body/tei:div[@type='bibliography']", TEI_NS)
    if bibl_div is not None:
        items.append('<a href="#Head-id.bibliography" class="toc-item">Bibliography</a>')

    # 3) fallback
    if not items:
        items.append('<span class="toc-item text-muted">No sections</span>')

    return "".join(items)
  

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
    <link href="/resources/jquery-ui/jquery-ui.min.css" rel="stylesheet" /><script type="text/javascript" src="/resources/js/jquery.min.js"></script><script type="text/javascript" src="/resources/jquery-ui/jquery-ui.min.js"></script><script type="text/javascript" src="/resources/js/jquery.smartmenus.min.js"></script><script type="text/javascript" src="/resources/js/clipboard.min.js"></script><script type="text/javascript" src="/resources/js/bootstrap.min.js"></script><script src="https://www.google.com/recaptcha/api.js"></script><link href="/resources/keyboard/css/keyboard.min.css" rel="stylesheet" />
    <link href="/resources/keyboard/css/keyboard-previewkeyset.min.css" rel="stylesheet" />
    <link href="/resources/keyboard/syr/syr.css" rel="stylesheet" /><script type="text/javascript" src="/resources/keyboard/syr/jquery.keyboard.js"></script><script type="text/javascript" src="/resources/keyboard/js/jquery.keyboard.extension-mobile.min.js"></script><script type="text/javascript" src="/resources/keyboard/js/jquery.keyboard.extension-navigation.min.js"></script><script type="text/javascript" src="/resources/keyboard/syr/jquery.keyboard.extension-autocomplete.js"></script><script type="text/javascript" src="/resources/keyboard/syr/keyboardSupport.js"></script><script type="text/javascript" src="/resources/keyboard/syr/syr.js"></script><script type="text/javascript" src="/resources/js/keyboard.js"></script>
  </head>
  <body id="body">
    <div class="navbar navbar-default navbar-fixed-top" role="navigation" data-template="app:fix-links">
      <div class="container">
        <div class="navbar-header">
          <button type="button" class="navbar-toggle collapsed" data-toggle="collapse" data-target=".navbar-collapse">
            <span class="sr-only">Toggle navigation</span>
            <span class="icon-bar"></span>
            <span class="icon-bar"></span>
            <span class="icon-bar"></span>
          </button>
          <a class="navbar-brand banner-container" href="/index.html">
            <!--<img property="logo" class="img-responsive" alt="Syriac.org" src="/resources/img/syriaca-logo.png"/> Draft-->
            <span class="banner-icon"></span>
            <span class="banner-text">Hugoye: Journal of Syriac Studies</span>
          </a>
        </div>

        <div class="navbar-collapse collapse pull-right">
          <ul class="nav navbar-nav sm sm-vertical" id="main-menu">
            <li class="dropdown">
              <a href="#" class="dropdown-toggle" data-toggle="dropdown">
                About Hugoye  <b class="caret"></b>
              </a>
              <ul class="dropdown-menu">
                <li><a href="/editorial-board.html">Editorial Board</a></li>
                <li><a href="/submissions.html">Submissions</a></li>
                <li><a href="/open-access.html">Open Access</a></li>
                <li><a href="https://www.gorgiaspress.com/hugoye-journal-of-syriac-studies" target="_blank">Printed Edition Subscription</a></li>
              </ul>
            </li>

            <li class="dropdown">
              <a href="#" class="dropdown-toggle" data-toggle="dropdown">
                Indexes  <b class="caret"></b>
              </a>
              <ul class="dropdown-menu">
                <li><a href="/current-issue.html">Current Issue</a></li>
                <li><a href="/volumes.html">Volume Index</a></li>
                <li><a href="/authors.html">Author Index</a></li>
              </ul>
            </li>
          </ul>

          <ul class="nav navbar-nav navbar-right keboard-btn">
            <li>
              <div class="btn-nav">
                <a class="btn btn-default navbar-btn dropdown-toggle" href="#" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Select Keyboard">
                  <span class="syriaca-icon syriaca-keyboard"></span>
                  <span class="caret"></span>
                </a>
                <ul data-template="app:keyboard-select-menu" data-template-input-id="q"></ul>
              </div>
            </li>

            <li>
              <div class="btn-nav">
                <a href="#" class="btn btn-default navbar-btn dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Search Tools">
                  <span class="glyphicon glyphicon-search"></span> <span class="caret"></span>
                </a>
                <ul class="dropdown-menu">
                  <li><a href="/search.html">Advanced Search</a></li>
                </ul>
              </div>
            </li>

            <li>
              <div class="btn-nav">
                <a href="#" class="btn btn-default navbar-btn dropdown-toggle" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false" title="Select Font">
                  Font <span class="caret"></span>
                </a>
                <ul class="dropdown-menu" id="swap-font">
                  <li><a href="#" class="swap-font" id="DefaultSelect" data-font-id="EstrangeloEdessa">Default</a></li>
                  <li><a href="#" class="swap-font" id="EstrangeloEdessaSelect" data-font-id="EstrangeloEdessa">Estrangelo Edessa</a></li>
                  <li><a href="#" class="swap-font" id="EastSyriacAdiabeneSelect" data-font-id="EastSyriacAdiabene">East Syriac Adiabene</a></li>
                  <li><a href="#" class="swap-font" id="SertoJerusalemSelect" data-font-id="SertoJerusalem">Serto Jerusalem</a></li>
                </ul>
              </div>
            </li>
          </ul>

          <form class="navbar-form navbar-right navbar-input-group" role="search" action="/search.html" method="get">
            <div class="input-group">
              <input type="text" class="form-control keyboard" placeholder="search" name="q" id="q" />
            </div>
          </form>
        </div>
      </div>
    </div>

    <div class="main-content-block">
      <div class="interior-content">
        <div class="container otherFormats">
          ${download_links}
        </div>

        <div class="row">
          <!-- MAIN CONTENT (use 9/3 split like your example) -->
          <div class="col-sm-9 col-md-9 col-lg-9 mssBody">
            <div class="article-header text-center">
              <h1>${doc_title}</h1>
              <h2></h2>
              <span class="tei-author">
                <span class="tei-name">${author_forename} <span class="tei-surname">${author_surname}</span></span>
                <span class="tei-affiliation"><span class="tei-orgName">${author_affiliation}</span></span>
              </span>
            </div>

            <div class="section tei-text">
              <div class="body">
                <div class="section" style="display:block;">
                  <div class="tei-div tei-title" ${lang_attr}>
                    <span class="tei-ab tei-review-title">${review_title}</span>
                  </div>

                  <div class="tei-div tei-body" ${lang_attr}>
                    ${body_paragraphs}
                  </div>
                </div>
              </div>
            </div>

            ${pdf_embed_html}
          </div>

          <!-- RIGHT MENU (as in your example) -->
          <div class="col-md-3 col-lg-3 right-menu">
            <div id="rightCol" class="noprint">
              <div id="sedraDisplay" class="sedra panel panel-default">
                <div class="panel-body">
                  <span style="display:block;text-align:center;margin:.5em;"><a href=" http://sedra.bethmardutho.org" title="SEDRA IV">SEDRA IV</a></span>
                  <img src="/resources/img/sedra-logo.png" title="Sedra logo" width="100%" />
                  <h3>Syriac Lexeme</h3>
                  <div id="sedraContent"><div class="content"></div></div>
                </div>
              </div>
            </div>

            <div class="panel panel-default">
              <div class="panel-heading"><a href="#" data-toggle="collapse" data-target="#aboutDigitalText">About This Digital Text</a></div>
              <div class="panel-body collapse in" id="aboutDigitalText">
                <div><h5>Record ID:</h5><span>${record_uri}</span></div>
                <div style="margin-top:1em;"><span class="h5-inline">Status: </span><span>${status}</span>
                  &nbsp;<a href="https://github.com/Beth-Mardutho/hugoye-data/wiki/Status-of-Contents-in-Hugoye"><span class="glyphicon glyphicon-question-sign text-info moreInfo"></span></a>
                </div>
                <div style="margin-top:1em;"><span class="h5-inline">Publication Date: </span>${pub_date_display}</div>
              </div>
            </div>

            <div class="panel panel-default">
              <div class="panel-heading"><a href="#" data-toggle="collapse" data-target="#citationText">How to Cite this Article</a></div>
              <div class="panel-body collapse in" id="citationText">
                <div>
                  <span class="tei-sourceDesc">
                    <span class="section indent">
                      ${author_full},  "<span class="title-analytic">${doc_title}</span>."
                      <span class="title-journal">${journal_title}</span> (<span class="publisher">${publisher}</span>,  <span class="date">${pub_year}</span>).
                    </span>
                  </span>
                </div>
              </div>
            </div>

            <span class="badge access-pills"><a href="/open-access.html" style="color:#555">open access <i class="fas fa-unlock-alt"></i></a></span>
            <span class="badge access-pills"><a href="https://github.com/Beth-Mardutho/hugoye-data/wiki/Peer-Review-Policy" style="color:#555">peer reviewed <i class="fas fa-check"></i></a></span>
          </div>
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
    pdf_embed_html = build_pdf_embed(pdf_url, pdf_path)

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
        "toc_links": build_toc_links(root),
        "review_title": review_title,
        "body_paragraphs": "\n".join(body_list),
        "bibliography_html": bibliography_html,
        "pub_date_display": t(pub_year),
        "author_full": author_full,
        "lang_attr": lang_attr or "",
        "pdf_embed_html": pdf_embed_html,
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
