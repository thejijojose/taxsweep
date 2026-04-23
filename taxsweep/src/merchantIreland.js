// Ireland-focused merchant gazetteer for first-level categorisation.
// Heavily weighted vs MCC/rules when present.

const normalize = (s) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[_/\\|·•–—]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

// A "huge" (practical) list of common Irish merchants & chains.
// Format: { category, merchants: [strings...] }
// Categories align with the existing `CATS` keys in `App.jsx`.
const GROUPS = [
  {
    category: "Personal / Non-deductible",
    merchants: [
      // Groceries / general retail
      "tesco", "tesco ireland", "tesco mobile", "dunnes", "dunnes stores", "dunnes stores ireland",
      "supervalu", "super value", "lidl", "aldi", "marks and spencer", "marks & spencer", "m&s", "m&s food",
      "centra", "spar", "londis", "mace", "supermacs (retail)", "fresh", "eurospar",
      "costcutter", "daybreak", "applegreen store", "circle k store", "topaz store",
      // Pharmacies / health & beauty
      "boots", "boots ireland", "lloyds pharmacy", "mccabes pharmacy", "hickeys", "hickey's", "life pharmacy",
      "chemists", "pharmacy",
      // Clothing / department / variety
      "penneys", "primark", "zara", "h&m", "hm", "next", "asos", "tk maxx", "river island", "mango",
      "brown thomas", "arnotts", "smyths", "smyths toys", "dealz", "pepco", "mr price", "eurogiant",
      // Entertainment / subscriptions often personal
      "netflix", "spotify", "disney plus", "disney+", "amazon prime", "prime video", "now tv", "sky",
      "rte", "tv licence", "tv license",
      // Alcohol retail
      "off licence", "off-license", "offlicence", "o'brien's", "obrien", "obrien wines", "supervalu off licence",
      // Betting / lottery
      "premier lotteries", "lotto", "national lottery", "boylesports", "paddy power", "bet365", "ladbrokes",
    ],
  },
  {
    category: "Meals & Entertainment",
    merchants: [
      // Coffee / quick service / delivery
      "starbucks", "costa", "costa coffee", "insomnia", "insomnia coffee", "nero", "caffe nero",
      "mcdonalds", "mcdonald's", "burger king", "kfc", "subway", "dominos", "domino's", "pizza hut",
      "supermacs", "abrakebabra", "burrito", "boojum", "zambrero", "taco bell",
      "nandos", "nando's", "wagamama", "bunsen", "camile", "camile thai", "wowburger",
      "just eat", "deliveroo", "uber eats", "doordash",
      // Restaurant groups / common Irish venues (limited but useful)
      "beshoff", "beshoffs", "leo burdock", "beddys", "gourmet burger", "gourmet burger kitchen",
      "bobby's", "the woolshed", "the porterhouse", "porterhouse", "diceys", "dicey's",
      "wetherspoons", "jd wetherspoon",
      // Pubs (chain-ish / common descriptors)
      "public house", "gastro pub", "bar and restaurant", "irish pub", "hotel bar",
    ],
  },
  {
    category: "Travel & Transport",
    merchants: [
      // Fuel / service stations
      "circle k", "applegreen", "maxol", "texaco", "shell", "esso", "bp", "certa", "topaz",
      "service station", "petrol", "diesel",
      // Parking / tolls / transit
      "q-park", "qpark", "apcoa", "ncp", "indigo park", "park rite", "parkrite",
      "eflow", "m50", "toll", "eurolink", "east link", "tunnel toll",
      "dublin bus", "luas", "dart", "irish rail", "iarnrod eireann", "iarnród éireann", "bus eireann", "bus éireann",
      "tfi", "leap card", "leapcard", "transport for ireland",
      // Taxi / ridehail
      "free now", "freenow", "uber", "bolt", "lynk", "taxi",
      // Airlines / travel
      "ryanair", "aer lingus", "easyjet", "british airways", "booking.com", "airbnb", "expedia", "hotels.com",
    ],
  },
  {
    category: "Office & Stationery",
    merchants: [
      "eason", "easons", "viking", "viking direct", "lyreco", "office supplies", "office depot",
      "an post", "dhl", "fedex", "ups", "dpd", "dpd ireland", "fastway", "gls", "post office",
      "print", "printing", "stationery",
    ],
  },
  {
    category: "Equipment & Tools",
    merchants: [
      "woodies", "woodies diy", "screwfix", "toolstation", "b and q", "b&q", "homebase",
      "harvey norman", "currys", "currys pc world", "pc world", "did electrical", "expert electrical",
      "ikea", "argos", "komplett", "elara", "elara.ie",
      "apple", "apple store", "apple.com", "dell", "lenovo", "hp", "asus", "acer", "logitech",
    ],
  },
  {
    category: "Phone & Internet",
    merchants: [
      "vodafone", "three", "eir", "gomo", "48", "tesco mobile", "virgin media", "sky broadband",
      "digiweb", "pure telecom", "imagine", "magnet networks",
      "topup", "top up", "phone bill", "broadband", "internet",
    ],
  },
  {
    category: "Marketing & Advertising",
    merchants: [
      "google ads", "adwords", "meta", "facebook ads", "instagram ads", "linkedin ads",
      "tiktok ads", "snapchat ads", "pinterest ads",
      "vistaprint", "moo", "printing flyers", "leaflet",
    ],
  },
];

function tokenScore(descNorm, merchantNorm) {
  // Score based on containment + boundary-ish match.
  if (!descNorm || !merchantNorm) return 0;
  if (descNorm === merchantNorm) return 1.0;
  if (descNorm.includes(merchantNorm)) {
    // Reward longer matches
    return Math.min(0.98, 0.62 + merchantNorm.length / 80);
  }
  // token overlap fallback
  const dT = new Set(descNorm.split(" ").filter((t) => t.length > 2));
  const mT = merchantNorm.split(" ").filter((t) => t.length > 2);
  if (!mT.length) return 0;
  let hit = 0;
  for (const t of mT) if (dT.has(t)) hit++;
  const frac = hit / mT.length;
  if (frac <= 0) return 0;
  return Math.min(0.85, 0.35 + frac * 0.55);
}

export function matchIrishMerchantCategory(description) {
  const descNorm = normalize(description);
  if (!descNorm) return null;

  let best = null;
  for (const g of GROUPS) {
    for (const m of g.merchants) {
      const mNorm = normalize(m);
      const s = tokenScore(descNorm, mNorm);
      if (s <= 0) continue;
      if (!best || s > best.score) best = { category: g.category, merchant: m, score: s };
    }
  }

  if (!best) return null;

  // Guardrail: if a very generic term caused a weak match, ignore.
  if (best.score < 0.56) return null;
  return best;
}

