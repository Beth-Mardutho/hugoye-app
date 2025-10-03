# Hugoye — Create NDJSON input for OpenSearch

This guide documents how to turn your per-item JSON files into a single **NDJSON bulk file** ready for OpenSearch, using `json_for_opensearch.py`.

---

## 1 Prerequisites

* macOS/Linux with **Python 3.8+**
* Basic shell access (zsh/bash)
* A folder of **per-record JSON files** (your source data)

> If `python3` isn’t found: `brew install python` (macOS).

---

## 2 Project setup (recommended venv)

```bash
cd /path/to/hugoye-app

# Create and activate a virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Upgrade pip (good hygiene)
python -m pip install --upgrade pip
```

> After activation, `python` inside the shell points to the venv’s interpreter.

---

## 3 Input data expectations

Each file in `./json/` should contain one record like:

```json
{
  "fullText": "HTML Version of this article coming soon! You can download a PDF from the PDF icon.",
  "title": [
    "Baptismal Anointings According to the Anonymous Expositio Officiorum",
    "Hugoye: Journal of Syriac Studies"
  ],
  "author": ["Brock, Sebastian P."],
  "idno": "https://hugoye.bethmardutho.org/article/hv1n1brock",
  "type": "article",
  "displayTitleEnglish": "The Baptismal Anointings According to the Anonymous Expositio Officiorum"
}
```

**IDs**: the script uses the **last segment of `idno`** as the document `_id`
(e.g., `.../hv10n2prkitchen1` → `_id: hv10n2prkitchen1`). If `idno` is missing, it falls back to a stable hash.

---

## 4 Generate the NDJSON bulk file

Run the script (edit paths as needed). This is *the* command you asked to include:

```bash
python3 json_for_opensearch.py \
  --input-dir ./json \
  --index hugoye-index \
  --out load/index.ndjson
```

**Flags**

* `--input-dir` : directory containing your per-record JSON files (recurses by default if your script uses `rglob`).
* `--index` : target OpenSearch index **name** to embed in the bulk action lines.
* `--out` : path for the generated **NDJSON** file (create parent dirs if needed).

Optional flags your script may support (if implemented):

* `--gzip` → writes `*.ndjson.gz`
* `--limit N` → process first N files (dry-run/testing)

---

## 5 What the output looks like

The file is **NDJSON** (two lines per doc: action + source):

```
{ "index": { "_index": "hugoye-index-2", "_id": "hv1n1brock" } }
{"fullText":"HTML Version...","title":["...","..."],"author":["Brock, Sebastian P."],"idno":"https://.../hv1n1brock","type":"article","displayTitleEnglish":"...",}
```

Quick sanity checks:

```bash
# Show first 4 lines
head -n 4 load/index.ndjson

# Count docs (each doc is 2 lines)
expr $(wc -l < load/index.ndjson) / 2
```

---

## 6 Create the OpenSearch index (settings + mappings)

# In Console

    Copy and paste index.json file into the dev tools of domain. Run.

# Or locally

Create your index **before** loading data. Use the mapping you finalized (see addendum for console instructions):

```bash
curl -X PUT "https://YOUR_OS_DOMAIN/hugoye-index" \
  -H "Content-Type: application/json" \
  --data-binary @hugoye-index-mapping.json
```

> If you don’t have the JSON file yet, save your mapping payload into `hugoye-index.json` and run the command above.

---

## 7 Load the NDJSON into OpenSearch from bash if you have access or use console (see addendum)

# Upload to S3 
```bash
aws s3 sync ./ s3://bucket-name-x \       
  --metadata-directive REPLACE \
  --cache-control "xxxxx"  \  --content-type "text/html; charset=utf-8" || true \ --region xxxxx \ --profile xxxxx
```
# Or Locally:

```bash
# Plain NDJSON
curl -X POST "https://YOUR_OS_DOMAIN/hugoye-index-2/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  --data-binary @load/index2.ndjson

# If gzipped
curl -X POST "https://YOUR_OS_DOMAIN/hugoye-index-2/_bulk" \
  -H "Content-Type: application/x-ndjson" \
  -H "Content-Encoding: gzip" \
  --data-binary @load/index2.ndjson.gz
```

**Tip:** The `_bulk` response includes an `errors` flag—scan it for failures and re-run if needed.

---

## 8 Troubleshooting

* **`zsh: command not found: python`**
  Use `python3 …` or activate your venv (`source .venv/bin/activate`).

* **Case-insensitive sorting not working**
  Ensure your keyword sort fields use a **lowercase normalizer** (as requested).

---

## 9 Housekeeping

When finished:

```bash
deactivate   # exit the virtual environment
```


---

**That’s it.** You now have a reproducible path to create `index.ndjson` and load it into `hugoye-index`.

*Addendum*
**Domain commands to set up index in OpenSearch dashboard dev tools: **
```
GET /hugoye-index-1/_mapping
```

```
PUT /hugoye-index-1
{
  "settings": {
    "number_of_shards": 1,
    "number_of_replicas": 0,
    "analysis": {
      "analyzer": {
        "custom_case_diacritic_insensitive": {
          "tokenizer": "standard",
          "filter": [
            "lowercase",
            "asciifolding"
          ]
        }
      }
    }
  },
  "mappings": {
        "properties": {
          "author": {
            "type": "text",
            "fields": {
              "keyword": {
                "type": "keyword",
                "ignore_above": 256
              }
            },
            "analyzer": "custom_case_diacritic_insensitive"
          },

          "idno": {
            "type": "keyword"
          },
          "displayTitleEnglish": {
            "type": "keyword"
 
          },
          "title": {
            "type": "text",
            "fields": {
              "sort": {
                "type": "keyword"
              }
            },
            "analyzer": "custom_case_diacritic_insensitive"
          },
          "type": {
            "type": "keyword"
          }
        }
      }
}
```
```
PUT _plugins/_security/api/roles/lambda_hugoye_reader
{
  "cluster_permissions": [ "cluster_composite_ops_ro" ],
  "index_permissions": [
    {
      "index_patterns": [ "hugoye-index-1" ],
      "allowed_actions": [ "read", "search","data" ]
    }
  ]
}
```
```
PUT _plugins/_security/api/rolesmapping/lambda_hugoye_reader
{
  "backend_roles": [
    "arn:aws:iam::ACCOUNT_NUMBER:role/LAMBDA_IAM_ROLE_NAME"
  ]
}
```