# /// script
# requires-python = ">=3.11"
# dependencies = ["requests"]
# ///
"""Sample N active, 8+yr-old, non-micro/dormant staffing cos; pull profile, officers, latest accounts iXBRL."""
import csv, sys, os, random, time, json, re, datetime as dt, requests

key = os.environ["COMPANIES_HOUSE_API_KEY"]
src, out, n = sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else 40
BASE = "https://api.company-information.service.gov.uk"
DOC = "https://document-api.company-information.service.gov.uk"
S = requests.Session(); S.auth = (key, "")
random.seed(7)

def get(url, **kw):
    for _ in range(4):
        r = S.get(url, timeout=30, **kw)
        if r.status_code == 429:
            time.sleep(20); continue
        return r
    return r

rows = list(csv.DictReader(open(src)))
cut = dt.date(2018, 10, 22)
pool = []
for r in rows:
    try:
        d, m, y = r["IncorporationDate"].split("/")
        inc = dt.date(int(y), int(m), int(d))
    except Exception:
        continue
    c = r["Accounts.AccountCategory"].upper()
    if inc <= cut and "MICRO" not in c and "DORMANT" not in c and c not in ("NO ACCOUNTS FILED", ""):
        pool.append(r)
print(f"eligible pool: {len(pool)}")
sample = random.sample(pool, n)

results = []
for i, r in enumerate(sample):
    num = r["CompanyNumber"]
    rec = {"number": num, "name": r["CompanyName"], "bulk_category": r["Accounts.AccountCategory"], "inc": r["IncorporationDate"]}
    p = get(f"{BASE}/company/{num}").json()
    acc = p.get("accounts", {})
    rec["accounts_type"] = acc.get("last_accounts", {}).get("type")
    rec["last_accounts_date"] = acc.get("last_accounts", {}).get("made_up_to")
    o = get(f"{BASE}/company/{num}/officers", params={"items_per_page": 50}).json()
    dirs = [x for x in o.get("items", []) if x.get("officer_role") in ("director", "llp-member") and not x.get("resigned_on")]
    rec["active_directors"] = len(dirs)
    dobs = [x.get("date_of_birth") for x in dirs if x.get("date_of_birth")]
    rec["director_dobs"] = [f"{d['year']}-{d.get('month',0):02d}" for d in dobs]
    rec["directors_60plus"] = sum(1 for d in dobs if d["year"] < 1966)
    rec["director_appointed"] = [x.get("appointed_on") for x in dirs]
    fh = get(f"{BASE}/company/{num}/filing-history", params={"category": "accounts", "items_per_page": 1}).json()
    items = fh.get("items", [])
    rec["ixbrl"] = False
    rec["fields"] = {}
    if items:
        rec["filing_desc"] = items[0].get("description")
        meta = items[0].get("links", {}).get("document_metadata")
        if meta:
            did = meta.rsplit("/", 1)[-1]
            d = get(f"{DOC}/document/{did}/content", headers={"Accept": "application/xhtml+xml"}, allow_redirects=True)
            rec["doc_status"] = d.status_code
            rec["doc_ctype"] = d.headers.get("Content-Type")
            txt = d.text if d.status_code == 200 else ""
            if "ix:nonfraction" in txt.lower():
                rec["ixbrl"] = True
                def grab(pat):
                    # find ix:nonFraction with name matching pat, return (name, value, contextRef) list
                    outl = []
                    for m in re.finditer(r'<ix:nonFraction([^>]*)>(.*?)</ix:nonFraction>', txt, re.I | re.S):
                        attrs, val = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
                        nm = re.search(r'name="([^"]+)"', attrs)
                        if nm and re.search(pat, nm.group(1), re.I):
                            ctx = re.search(r'contextRef="([^"]+)"', attrs)
                            scale = re.search(r'scale="(-?\d+)"', attrs)
                            sign = re.search(r'sign="(-)"', attrs)
                            try:
                                v = float(val.replace(",", "")) * (10 ** int(scale.group(1)) if scale else 1)
                                if sign: v = -v
                            except Exception:
                                v = val
                            outl.append((nm.group(1), v, ctx.group(1) if ctx else None))
                    return outl
                for label, pat in [("turnover", r"TurnoverRevenue"), ("employees", r"AverageNumberEmployeesDuringPeriod"),
                                   ("net_assets", r"NetAssetsLiabilities$"), ("cash", r"CashBankOnHand|CashBankInHand")]:
                    hits = grab(pat)
                    if hits:
                        rec["fields"][label] = hits[0][1]
                        rec["fields"][label + "_all"] = hits[:4]
    results.append(rec)
    print(f"[{i+1}/{n}] {num} {r['CompanyName'][:40]:40} type={rec['accounts_type']} ixbrl={rec['ixbrl']} fields={ {k:v for k,v in rec['fields'].items() if not k.endswith('_all')} } 60+={rec['directors_60plus']}")
    time.sleep(0.6)  # ~4 req/company -> stay under 600/5min

json.dump(results, open(out, "w"), indent=1, default=str)
have = lambda k: sum(1 for r in results if k in r["fields"])
print("\n=== SUMMARY ===")
print(f"n={len(results)}  ixbrl_docs={sum(r['ixbrl'] for r in results)}")
print(f"(a) turnover: {have('turnover')}")
print(f"(b) employees: {have('employees')}")
print(f"(c) net_assets: {have('net_assets')}")
print(f"(d) director 60+: {sum(1 for r in results if r['directors_60plus']>0)}")
print(f"(e) all four: {sum(1 for r in results if all(k in r['fields'] for k in ('turnover','employees','net_assets')) and r['directors_60plus']>0)}")
tv = sorted(r["fields"]["turnover"] for r in results if isinstance(r["fields"].get("turnover"), float))
if tv:
    import statistics
    print(f"turnover dist (n={len(tv)}): min={tv[0]:,.0f} p25={tv[len(tv)//4]:,.0f} med={statistics.median(tv):,.0f} p75={tv[3*len(tv)//4]:,.0f} max={tv[-1]:,.0f}")
    print(f"  in £1-3M: {sum(1 for t in tv if 1e6<=t<=3e6)}")
print("accounts_type breakdown:", json.dumps(__import__('collections').Counter(r['accounts_type'] for r in results)))
adv = get(f"{BASE}/advanced-search/companies", params={"sic_codes": "78200", "company_status": "active", "size": 100})
print(f"\nadvanced-search: status={adv.status_code} hits={adv.json().get('hits') if adv.status_code==200 else adv.text[:200]}")
