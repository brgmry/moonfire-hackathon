# /// script
# requires-python = ">=3.11"
# dependencies = ["anthropic"]
# ///
"""Scout -> skeptic on 5 companies. Input: accounts_depth json (preferred) or staffing csv."""
import sys, json, csv, random, re, anthropic

src = sys.argv[1]
client = anthropic.Anthropic()
MODEL = "claude-sonnet-5-5"
random.seed(3)

if src.endswith(".json"):
    data = json.load(open(src))
    # prefer ones with some numbers, mix in one without
    old = lambda d: int(d["inc"].split("/")[-1]) <= 2018
    turn = [d for d in data if "turnover" in d["fields"] and d["fields"]["turnover"] > 1e5]
    emp = [d for d in data if old(d) and "turnover" not in d["fields"] and d["fields"].get("employees", 0) >= 5]
    nonum = [d for d in data if "employees" not in d["fields"] and "net_assets" not in d["fields"]] or [d for d in data if old(d) and d["fields"].get("employees", 0) <= 1]
    picks = random.sample(turn, min(2, len(turn))) + random.sample(emp, min(2, len(emp))) + random.sample(nonum, 1)
    def raw(d):
        return {k: v for k, v in d.items() if k not in ("file",)}
else:
    rows = list(csv.DictReader(open(src)))
    picks = random.sample(rows, 5)
    raw = lambda d: dict(d)

def ask(system, user, max_tokens=1500):
    m = client.messages.create(model=MODEL, max_tokens=max_tokens, system=system,
                               messages=[{"role": "user", "content": user}])
    return next(b.text for b in m.content if getattr(b, 'type', '') == 'text')

SCOUT = ("You are a scout for a UK staffing-agency roll-up targeting agencies with £1-3M revenue. "
         "Given raw Companies House data for one company, write a 3-line target card: line 1 name + number + years trading, "
         "line 2 fit (strong/weak/unknown) for a £1-3M roll-up, line 3 one-line reason. Use only the data given. If revenue is absent say so.")
SKEPTIC = ("You are the skeptic. Given a scout card AND the raw Companies House data, decide keep or kill. "
           "Return ONLY JSON: {\"verdict\": \"keep\"|\"kill\", \"reason\": \"...\", \"claims_used\": [\"field=value\", ...]}. "
           "claims_used must list only fields that literally exist in the raw data with their actual values. "
           "If the data lacks revenue, you may still keep on other filed numbers but must say revenue is unverified. Never invent numbers.")

for d in picks:
    r = raw(d)
    rj = json.dumps(r, default=str)
    card = ask(SCOUT, f"RAW DATA:\n{rj}")
    verdict = ask(SKEPTIC, f"CARD:\n{card}\n\nRAW DATA:\n{rj}")
    print("=" * 80)
    print(card.strip())
    print("--- skeptic:")
    print(verdict.strip())
    # grounding check: do the claims_used values appear in the raw json?
    try:
        vj = json.loads(re.search(r"\{.*\}", verdict, re.S).group(0))
        ok = []
        for c in vj.get("claims_used", []):
            val = c.split("=", 1)[-1].strip().strip("£").replace(",", "")
            ok.append(val in rj.replace(",", "") or val.rstrip("0").rstrip(".") in rj)
        print(f"--- grounding: {sum(ok)}/{len(ok)} claims found verbatim in raw data")
    except Exception as e:
        print("--- grounding: could not parse", e)
