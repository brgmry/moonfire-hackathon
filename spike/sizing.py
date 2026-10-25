# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Stream the Companies House bulk CSV (zip), filter active staffing SICs, report sizing."""
import csv, sys, zipfile, io, collections, datetime as dt

zpath, out = sys.argv[1], sys.argv[2]
SICS = {"78101", "78109", "78200", "78300"}
TODAY = dt.date(2026, 10, 22)
CUT18 = TODAY - dt.timedelta(days=548)

per_sic = collections.Counter()
cat = collections.Counter()
yr = collections.Counter()
filed18 = 0
total = 0
rows_out = []

def bucket(y):
    if y < 2000: return "<2000"
    if y < 2010: return "2000-2009"
    if y < 2016: return "2010-2015"
    if y < 2021: return "2016-2020"
    return "2021+"

with zipfile.ZipFile(zpath) as z:
    name = [n for n in z.namelist() if n.endswith(".csv")][0]
    with z.open(name) as f:
        r = csv.DictReader(io.TextIOWrapper(f, encoding="utf-8", errors="replace"))
        r.fieldnames = [h.strip() for h in r.fieldnames]
        keep = ["CompanyName","CompanyNumber","CompanyStatus","CompanyCategory","IncorporationDate",
                "Accounts.AccountRefDay","Accounts.AccountRefMonth","Accounts.NextDueDate",
                "Accounts.LastMadeUpDate","Accounts.AccountCategory",
                "SICCode.SicText_1","SICCode.SicText_2","SICCode.SicText_3","SICCode.SicText_4",
                "RegAddress.PostTown","RegAddress.PostCode"]
        w = None
        fo = open(out, "w", newline="")
        w = csv.DictWriter(fo, fieldnames=keep)
        w.writeheader()
        for row in r:
            if row["CompanyStatus"].strip() != "Active":
                continue
            codes = set()
            for k in ("SICCode.SicText_1","SICCode.SicText_2","SICCode.SicText_3","SICCode.SicText_4"):
                v = row.get(k, "").strip()
                if v[:5] in SICS:
                    codes.add(v[:5])
            if not codes:
                continue
            total += 1
            for c in codes: per_sic[c] += 1
            cat[row["Accounts.AccountCategory"].strip() or "(blank)"] += 1
            inc = row["IncorporationDate"].strip()
            try:
                y = int(inc.split("/")[-1])
                yr[bucket(y)] += 1
            except Exception:
                yr["unknown"] += 1
            lm = row["Accounts.LastMadeUpDate"].strip()
            if lm:
                try:
                    d, m, y = lm.split("/")
                    if dt.date(int(y), int(m), int(d)) >= CUT18:
                        filed18 += 1
                except Exception:
                    pass
            w.writerow({k: row.get(k, "") for k in keep})
        fo.close()

print(f"TOTAL active staffing companies: {total}")
print("Per SIC (a company can carry more than one):")
for c in sorted(per_sic): print(f"  {c}: {per_sic[c]}")
print("Accounts.AccountCategory:")
for k, v in cat.most_common(): print(f"  {k}: {v} ({100*v/total:.1f}%)")
print("Incorporation year bucket:")
for k in ["<2000","2000-2009","2010-2015","2016-2020","2021+","unknown"]:
    if yr[k]: print(f"  {k}: {yr[k]} ({100*yr[k]/total:.1f}%)")
print(f"Filed accounts in last 18 months (LastMadeUpDate >= {CUT18}): {filed18} ({100*filed18/total:.1f}%)")
