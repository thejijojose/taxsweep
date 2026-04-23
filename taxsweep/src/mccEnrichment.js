// Offline MCC enrichment engine using `mccing.csv`.
//
// Goals:
// - No network calls (beyond fetching the local bundled CSV asset).
// - Not just exact string matches: use token + char-trigram similarity.
// - Fast enough in-browser: build a small inverted index to avoid scoring all rows.

const DEFAULTS = {
  // Candidate limit after token-index expansion (before scoring)
  maxCandidates: 2500,
  // How many top scored candidates to consider for final pick
  topK: 8,
  // Minimum score required to accept a match
  minScore: 0.46,
};

const STOPWORDS = new Set([
  "ltd","limited","plc","inc","llc","company","co","corp","corporation",
  "the","and","for","of","in","on","at","to","from",
  "ireland","irl","ie","uk","gb","eu","nl","mt",
  "www","http","https","com","net","org","app",
  "card","payment","pos","contactless","visa","mastercard","debit","credit",
  "transaction","transfer","fee","fees","charge","charges","markup","mark","up",
  "online","internet",
]);

function normalizeText(s) {
  return String(s ?? "")
    .toLowerCase()
    // normalize separators and punctuation to spaces
    .replace(/[_/\\|·•–—]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    // keep digits but collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(s) {
  const norm = normalizeText(s);
  if (!norm) return [];
  const parts = norm.split(" ");
  const out = [];
  for (let p of parts) {
    if (!p) continue;
    // Drop tiny tokens and pure country/postcode-ish noise
    if (p.length <= 2) continue;
    // Strip leading/trailing digits (but keep embedded digits like "m50", "3ireland")
    p = p.replace(/^\d+|\d+$/g, "");
    if (!p || p.length <= 2) continue;
    if (STOPWORDS.has(p)) continue;
    out.push(p);
  }
  return out;
}

function toSet(arr) {
  return new Set(arr);
}

function jaccard(aSet, bSet) {
  if (!aSet.size || !bSet.size) return 0;
  let inter = 0;
  for (const t of aSet) if (bSet.has(t)) inter++;
  const union = aSet.size + bSet.size - inter;
  return union ? inter / union : 0;
}

function charTrigrams(s) {
  const norm = normalizeText(s).replace(/\s+/g, " ");
  const padded = `  ${norm}  `;
  const grams = new Map();
  for (let i = 0; i < padded.length - 2; i++) {
    const g = padded.slice(i, i + 3);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }
  return grams;
}

function diceFromGrams(a, b) {
  // 2 * |A∩B| / (|A| + |B|) with multiset counts
  let aCount = 0, bCount = 0, inter = 0;
  for (const [, v] of a) aCount += v;
  for (const [, v] of b) bCount += v;
  if (!aCount || !bCount) return 0;
  // Iterate smaller map
  const [sm, lg] = a.size <= b.size ? [a, b] : [b, a];
  for (const [g, v] of sm) {
    const w = lg.get(g);
    if (w) inter += Math.min(v, w);
  }
  return (2 * inter) / (aCount + bCount);
}

function containsBonus(aNorm, bNorm) {
  // Soft bonus if one normalized string contains the other meaningfully.
  if (!aNorm || !bNorm) return 0;
  const [short, long] = aNorm.length <= bNorm.length ? [aNorm, bNorm] : [bNorm, aNorm];
  if (short.length < 5) return 0;
  if (long.includes(short)) return Math.min(0.14, 0.03 + short.length / 120);
  return 0;
}

function weightedScore(tx, row) {
  const txNorm = normalizeText(tx);
  const rowNorm = row.norm;
  const txTok = toSet(tokenize(txNorm));
  const rowTok = row.tokSet;

  const tokSim = jaccard(txTok, rowTok);
  const triSim = diceFromGrams(charTrigrams(txNorm), row.tri);
  const cont = containsBonus(txNorm, rowNorm);

  // Weighting: tokens are high precision; trigrams help with spacing/typos/abbrev.
  // Clamp to [0,1].
  const s = Math.max(0, Math.min(1, tokSim * 0.62 + triSim * 0.38 + cont));
  return { score: s, tokSim, triSim, cont };
}

function mccGuardrailMultiplier(txNorm, mcc, mccDescription) {
  const code = Number(String(mcc ?? "").trim());
  const d = String(mccDescription ?? "").toLowerCase();
  if (!Number.isFinite(code)) return 1.0;

  // Signals that strongly indicate an ATM/cash transaction
  const atmSignals = [
    "atm", "cash withdrawal", "cash withdraw", "cashwd", "cash wd",
    "cash disbursement", "cash", "withdrawal", "withdr", "cashline",
    "note machine", "notemachine", "lodgement", "lodgment",
  ];
  const hasAtmSignal = atmSignals.some((s) => txNorm.includes(s));

  // Signals that strongly indicate a grocery/retail purchase
  const grocerySignals = [
    "spar", "centra", "supervalu", "aldi", "lidl", "tesco", "dunnes",
    "grocery", "supermarket", "convenience", "store",
  ];
  const hasGrocerySignal = grocerySignals.some((s) => txNorm.includes(s));

  // Penalize ATM/financial-institution MCCs unless we see ATM/cash signals.
  // This is the root cause for SPAR/ALDI sometimes ending up as 6011.
  if ((code === 6010 || code === 6011) || d.includes("cash")) {
    if (hasAtmSignal) return 1.0;
    if (hasGrocerySignal) return 0.55;
    return 0.72;
  }

  // Penalize gambling MCCs unless explicitly signaled (helps grocery merchants that share tokens).
  if (code === 7995) {
    const betSignals = ["bet", "bookmaker", "sportsbook", "lotto", "lottery", "casino", "paddy power", "boylesports", "ladbrokes", "bet365"];
    const hasBet = betSignals.some((s) => txNorm.includes(s));
    return hasBet ? 1.0 : 0.78;
  }

  // Slightly boost grocery MCCs when grocery signals present.
  if (hasGrocerySignal && (code === 5411 || code === 5499)) return 1.06;

  return 1.0;
}

function parseCSVLine(line) {
  // Minimal CSV parser (handles quotes).
  const cols = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // escaped quote
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
      inQ = !inQ; continue;
    }
    if (ch === "," && !inQ) { cols.push(cur); cur = ""; continue; }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function buildIndex(rows) {
  // Token -> Uint32Array-ish list (use normal arrays for simplicity)
  const tokenToIds = new Map();
  rows.forEach((r, id) => {
    // Index a handful of "best" tokens for each row to reduce noise
    const toks = Array.from(r.tokSet);
    toks.sort((a, b) => b.length - a.length);
    const picked = toks.slice(0, 7);
    for (const t of picked) {
      let arr = tokenToIds.get(t);
      if (!arr) { arr = []; tokenToIds.set(t, arr); }
      arr.push(id);
    }
  });
  return { tokenToIds };
}

function pickCandidates(txDesc, index, rows, maxCandidates) {
  const toks = tokenize(txDesc);
  if (!toks.length) return [];

  // Prioritize longer tokens and those likely to be distinctive
  toks.sort((a, b) => b.length - a.length);
  const seen = new Set();
  const out = [];

  for (const t of toks.slice(0, 10)) {
    const ids = index.tokenToIds.get(t);
    if (!ids) continue;
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= maxCandidates) return out;
    }
  }

  // If still too small, expand with shorter tokens
  if (out.length < Math.min(220, maxCandidates)) {
    for (const t of toks.slice(10, 20)) {
      const ids = index.tokenToIds.get(t);
      if (!ids) continue;
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        if (out.length >= maxCandidates) return out;
      }
    }
  }

  // Absolute fallback: sample a thin slice so we always produce something
  if (!out.length) {
    const step = Math.max(1, Math.floor(rows.length / Math.min(600, rows.length)));
    for (let i = 0; i < rows.length && out.length < Math.min(600, maxCandidates); i += step) out.push(i);
  }

  return out;
}

export async function createMccEnricher(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  
  function enrichOne(tx) {
    return { ...tx, mcc: null, mcc_description: null, mcc_match: null };
  }

  function enrichAll(transactions) {
    return (transactions ?? []).map((t) => enrichOne(t));
  }

  return {
    rows: 0,
    enrichOne,
    enrichAll,
    config: cfg,
  };
}

// ── MCC → TaxSweep category inference ──────────────────────────────────────────
// This is intentionally heuristic. The gazetteer + rules can override it via weighting.
export function inferTaxCategoryFromMcc(mcc, mccDescription = "") {
  const code = Number(String(mcc ?? "").trim());
  const d = String(mccDescription ?? "").toLowerCase();
  if (!Number.isFinite(code)) return null;

  const mk = (category, score, reason) => ({ category, score, reason, mcc: String(code) });

  // Restaurants / bars / fast food
  if ([5812, 5813, 5814, 5811].includes(code)) return mk("Meals & Entertainment", 0.92, "MCC food & drink");
  // Grocery / convenience / markets
  if ([5411, 5422, 5441, 5451, 5499].includes(code)) return mk("Groceries", 0.92, "MCC grocery/supermarket");
  // Betting / lottery / gaming
  if ([7995, 7800, 7801, 7802].includes(code)) return mk("Personal / Non-deductible", 0.94, "MCC betting/gaming");
  // Service stations / fuel
  if ([5541, 5542].includes(code)) return mk("Travel & Transport", 0.84, "MCC fuel/service station");
  // Toll/bridge/transport services
  if ([4784, 4789, 4121, 7523].includes(code)) return mk("Travel & Transport", 0.82, "MCC transport/parking/tolls");
  // Telecom
  if ([4812, 4814, 4815, 4899].includes(code)) return mk("Phone & Internet", 0.80, "MCC telecom");
  // Utilities
  if ([4900].includes(code)) return mk("Utilities", 0.78, "MCC utilities");
  // Postal/courier
  if ([9402, 4215, 4214].includes(code)) return mk("Office & Stationery", 0.72, "MCC post/courier");
  // Software / digital goods
  if ([5734, 5815, 5816, 5817, 5818].includes(code)) return mk("Software & Subscriptions", 0.80, "MCC digital goods/software");
  // Office supplies / stationery
  if ([5111, 5943, 5978].includes(code)) return mk("Office & Stationery", 0.76, "MCC office supplies");
  // Advertising services / business services
  if ([7311, 7399, 8999].includes(code)) {
    // split by description hints
    if (d.includes("advert") || d.includes("marketing")) return mk("Marketing & Advertising", 0.72, "MCC advertising");
    return mk("Professional Services", 0.62, "MCC business services");
  }
  // Insurance
  if ([6300, 5960].includes(code) || d.includes("insurance")) return mk("Insurance", 0.70, "MCC insurance");

  return null;
}

