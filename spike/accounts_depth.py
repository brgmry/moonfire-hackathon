# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""No-key substitute for step 2: scan free bulk iXBRL accounts zips, keep staffing companies, count fields present."""
import sys, csv, zipfile, re, json, collections, statistics, html

staffing_csv, out = sys.argv[1], sys.argv[2]
zips = sys.argv[3:]
meta = {r["CompanyNumber"]: r for r in csv.DictReader(open(staffing_csv))}
print(f"staffing numbers loaded: {len(meta)}")

TAGS = {
    "turnover": r"TurnoverRevenue",
    "employees": r"AverageNumberEmployeesDuringPeriod",
    "net_assets": r"NetAssetsLiabilities$",
    "cash": r"CashBankOnHand|CashBankInHand",
    "profit": r"ProfitLoss$|ProfitLossOnOrdinaryActivitiesBeforeTax",
    "creditors": r"Creditors$",
    "debtors": r"Debtors$",
}
NF = re.compile(r'<ix:nonFraction([^>]*)>(.*?)</ix:nonFraction>', re.I | re.S)
NN = re.compile(r'<ix:nonNumeric([^>]*)>(.*?)</ix:nonNumeric>', re.I | re.S)

def parse(txt):
    fields = {}
    for m in NF.finditer(txt):
        attrs, val = m.group(1), re.sub(r"<[^>]+>", "", m.group(2)).strip()
        nm = re.search(r'name="([^"]+)"', attrs)
        if not nm: continue
        name = nm.group(1).split(":")[-1]
        for label, pat in TAGS.items():
            if label in fields: continue
            if re.search(pat, name):
                scale = re.search(r'scale="(-?\d+)"', attrs)
                sign = re.search(r'sign="-"', attrs)
                try:
                    v = float(html.unescape(val).replace(",", "").replace("(", "").replace(")", "") or "nan")
                    v *= 10 ** int(scale.group(1)) if scale else 1
                    if sign: v = -v
                    fields[label] = v
                except ValueError:
                    pass
    nn = {}
    for m in NN.finditer(txt):
        nm = re.search(r'name="([^"]+)"', m.group(1))
        if not nm: continue
        name = nm.group(1).split(":")[-1]
        if name in ("AccountsTypeFullOrAbbreviated", "AccountsType", "EntityDormantTruefalse", "DescriptionPrincipalActivities",
                    "AccountsStatusAuditedOrUnaudited", "StatementThatCompanyEntitledToExemptionFromAuditUnderSection477CompaniesAct2006RelatingToSmallCompanies",
                    "StatementThatMembersHaveNotRequiredCompanyToObtainAnAudit", "BalanceSheetDate", "EndDateForPeriodCoveredByReport"):
            nn[name] = re.sub(r"<[^>]+>", "", m.group(2)).strip()[:120]
    return fields, nn

seen, results = 0, []
for zp in zips:
    with zipfile.ZipFile(zp) as z:
        for n in z.namelist():
            seen += 1
            m = re.search(r"Prod\d+_\d+_([A-Z0-9]{8})_", n)
            if not m or m.group(1) not in meta: continue
            txt = z.read(n).decode("utf-8", errors="replace")
            f, nn = parse(txt)
            # detect P&L presence: a profit-and-loss section tag or turnover
            has_pl = bool(re.search(r"ProfitLossAccount|IncomeStatement|StatementOfComprehensiveIncome", txt, re.I)) and "turnover" in f
            r = meta[m.group(1)]
            results.append({"number": m.group(1), "name": r["CompanyName"], "bulk_category": r["Accounts.AccountCategory"],
                            "inc": r["IncorporationDate"], "file": n, "fields": f, "nonnumeric": nn, "has_pl": has_pl})
print(f"files scanned: {seen}, staffing accounts found: {len(results)}")
json.dump(results, open(out, "w"), indent=1)

n = len(results)
have = lambda k: sum(1 for r in results if k in r["fields"])
print("\n=== field presence (staffing cos, latest filed accounts) ===")
for k in TAGS: print(f"  {k}: {have(k)}/{n} ({100*have(k)/n:.0f}%)")
print("\n=== by bulk AccountCategory: n / turnover present ===")
bycat = collections.defaultdict(lambda: [0, 0, 0])
for r in results:
    c = bycat[r["bulk_category"]]; c[0] += 1; c[1] += "turnover" in r["fields"]; c[2] += "employees" in r["fields"]
for k, (a, b, e) in sorted(bycat.items(), key=lambda x: -x[1][0]): print(f"  {k}: n={a} turnover={b} employees={e}")
tv = sorted(r["fields"]["turnover"] for r in results if "turnover" in r["fields"])
if tv:
    print(f"\nturnover dist n={len(tv)}: min={tv[0]:,.0f} p25={tv[len(tv)//4]:,.0f} med={statistics.median(tv):,.0f} p75={tv[3*len(tv)//4]:,.0f} max={tv[-1]:,.0f}")
    print(f"  £1-3M: {sum(1 for t in tv if 1e6<=t<=3e6)}  >£3M: {sum(1 for t in tv if t>3e6)}  <£1M: {sum(1 for t in tv if t<1e6)}")
ev = sorted(r["fields"]["employees"] for r in results if "employees" in r["fields"])
if ev:
    print(f"employees dist n={len(ev)}: med={statistics.median(ev):.0f} p75={ev[3*len(ev)//4]:.0f} max={ev[-1]:.0f}; 10+ employees: {sum(1 for e in ev if e>=10)}")
na = sorted(r["fields"]["net_assets"] for r in results if "net_assets" in r["fields"])
if na:
    print(f"net assets n={len(na)}: med={statistics.median(na):,.0f}; negative: {sum(1 for x in na if x<0)}; >£250k: {sum(1 for x in na if x>250e3)}")
