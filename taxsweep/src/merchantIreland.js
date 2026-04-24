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
    category: "Groceries",
    merchants: [
      // Ireland
      "tesco", "tesco ireland", "dunnes", "dunnes stores", "dunnes stores ireland",
      "supervalu", "super valu", "lidl", "aldi", "centra", "spar", "eurospar", "londis", "mace",
      "costcutter", "daybreak", "iceland", "polonez", "joyces", "joyce supermarket",
      "donnybrook fair", "fallon & byrne", "fallon and byrne", "fresh the good food market", "fresh food market",
      "marks and spencer food", "marks & spencer food", "m&s food", "m&s simply food",
      "martin's food market", "martins food market",
      // UK
      "sainsburys", "sainsbury's", "asda", "morrisons", "waitrose", "co-op food", "coop food",
      "cooperative food", "farmfoods", "budgens", "nisa", "nisa local", "booths",
    ],
  },
  {
    category: "Personal / Non-deductible",
    merchants: [
      // Marks & Spencer general (non-food)
      "marks and spencer", "marks & spencer", "m&s",
      // Pharmacies / Health & Beauty
      "boots", "boots ireland", "lloyds pharmacy", "mccabes pharmacy", "hickeys", "hickey's", "life pharmacy",
      "chemists", "pharmacy", "careplus", "allcare", "bradleys", "sam mccauley", "mccauley",
      // Clothing / Department / Variety
      "penneys", "primark", "zara", "h&m", "hm", "next", "asos", "tk maxx", "river island", "mango",
      "brown thomas", "arnotts", "bloomingdale", "bloomingdales", "smyths", "smyths toys", "dealz", "pepco", "mr price", "eurogiant",
      "guineys", "homestore and more", "homestore & more", "petersons", "shaws",
      // Entertainment / Subscriptions often personal
      "netflix", "spotify", "disney plus", "disney+", "amazon prime", "prime video", "now tv", "sky",
      "rte", "tv licence", "tv license", "youtube premium", "apple music", "itunes", "audible", "patreon", "twitch",
      "playstation", "xbox", "nintendo", "steam games", "epic games",
      // Gyms / Fitness
      "flyefit", "ben dunne", "anytime fitness", "energie fitness", "david lloyd", "gym", "leisure centre",
      // Alcohol retail
      "off licence", "off-license", "offlicence", "o'brien's", "obrien", "obrien wines", "supervalu off licence", "molloys",
      // Betting / Lottery
      "premier lotteries", "lotto", "national lottery", "boylesports", "paddy power", "bet365", "ladbrokes", "coral", "william hill",
      // Mortgages / Loans (typically personal)
      "haven mortgages", "avant money", "ics mortgages", "finance ireland", "dilosk", "pepper asset", "start mortgages", "mars capital", "permanent tsb mortgage", "aib mortgage", "boi mortgage",
    ],
  },
  {
    category: "Meals & Entertainment",
    merchants: [
      // Coffee / Quick Service
      "starbucks", "costa", "costa coffee", "insomnia", "insomnia coffee", "nero", "caffe nero",
      "mcdonalds", "mcdonald's", "burger king", "kfc", "subway", "dominos", "domino's", "pizza hut",
      "supermacs", "abrakebabra", "burrito", "boojum", "zambrero", "taco bell", "apache pizza", "four star pizza",
      "nandos", "nando's", "wagamama", "bunsen", "camile", "camile thai", "wowburger", "chopped", "sprout", "milano",
      "leon", "pret a manger", "gourmet burger", "gourmet burger kitchen", "gbk",
      // Delivery Services
      "just eat", "deliveroo", "uber eats", "doordash", "buymie",
      // Restaurant groups / common Irish venues
      "beshoff", "beshoffs", "leo burdock", "beddys", "bobby's", "the woolshed", "the porterhouse", "porterhouse", "diceys", "dicey's",
      "wetherspoons", "jd wetherspoon", "press up", "elephant and castle", "captain americas", "thunderroad cafe",
      // Generic hospitality descriptors
      "public house", "gastro pub", "bar and restaurant", "irish pub", "hotel bar", "restaurant", "cafe", "bistro", "deli",
    ],
  },
  {
    category: "Travel & Transport",
    merchants: [
      // Fuel / service stations
      "circle k", "applegreen", "maxol", "texaco", "shell", "esso", "bp", "certa", "topaz",
      "service station", "petrol", "diesel", "go station", "inver", "jones oil", "campus oil",
      // Parking / Tolls
      "q-park", "qpark", "apcoa", "ncp", "indigo park", "park rite", "parkrite", "euro car parks",
      "eflow", "m50", "toll", "eurolink", "east link", "tunnel toll", "parkingtag", "payzone",
      // Transit
      "dublin bus", "luas", "dart", "irish rail", "iarnrod eireann", "iarnród éireann", "bus eireann", "bus éireann",
      "tfi", "leap card", "leapcard", "transport for ireland", "buseireann", "aircoach", "citylink", "gobus", "matthews coach",
      // Taxi / Ridehail
      "free now", "freenow", "uber", "bolt", "lynk", "taxi", "cab", "hackney", "mytaxi",
      // Airlines / Travel / Accommodation
      "ryanair", "aer lingus", "easyjet", "british airways", "booking.com", "airbnb", "expedia", "hotels.com", 
      "skyscanner", "agoda", "stena line", "irish ferries", "hotel", "guesthouse", "b&b", "bed and breakfast",
      // Car rental
      "hertz", "avis", "europcar", "enterprise rent-a-car", "budget car rental", "sixt", "dan dooley", "goCar", "yuko",
    ],
  },
  {
    category: "Office & Stationery",
    merchants: [
      "eason", "easons", "viking", "viking direct", "lyreco", "office supplies", "office depot", "huntoffice", "bizquip",
      "an post", "dhl", "fedex", "ups", "dpd", "dpd ireland", "fastway", "gls", "post office", "royal mail",
      "print", "printing", "stationery", "paper", "reads", "reads.ie", "cartridge green", "ink", "toner",
    ],
  },
  {
    category: "Equipment & Tools",
    merchants: [
      "woodies", "woodies diy", "screwfix", "toolstation", "b and q", "b&q", "homebase", "chadwicks", "tj o'mahony", "grafton",
      "harvey norman", "currys", "currys pc world", "pc world", "did electrical", "expert electrical", "euronics", "power city",
      "ikea", "argos", "komplett", "elara", "elara.ie", "memoryc",
      "apple store", "apple online store", "dell", "lenovo", "hp", "asus", "acer", "logitech", "samsung", "bose", "sony",
      "hardware", "electrical", "tools", "builders providers",
    ],
  },
  {
    category: "Phone & Internet",
    merchants: [
      "vodafone", "three", "eir", "gomo", "48", "tesco mobile", "virgin media", "sky broadband",
      "digiweb", "pure telecom", "imagine", "magnet networks", "siren", "lycamobile", "clear mobile",
      "phone bill", "broadband", "internet", "telecom", "mobile",
    ],
  },
  {
    category: "Marketing & Advertising",
    merchants: [
      "google ads", "adwords", "google ireland", "meta", "facebook ads", "instagram ads", "linkedin ads",
      "tiktok ads", "snapchat ads", "pinterest ads", "twitter ads", "x ads", "microsoft advertising", "bing ads",
      "vistaprint", "moo", "printing flyers", "leaflet", "mailchimp", "hubspot", "klaviyo", "activecampaign", "canva",
    ],
  },
  {
    category: "Software & Subscriptions",
    merchants: [
      "adobe", "adobe systems", "microsoft", "office 365", "microsoft 365", "google workspace", "gsuite", "aws", "amazon web services",
      "dropbox", "zoom", "slack", "notion", "airtable", "github", "gitlab", "bitbucket", "atlassian", "jira", "trello",
      "asana", "monday.com", "clickup", "figma", "sketch", "invision", "squarespace", "wix", "wordpress", "shopify", "apple.com/bill", "icloud",
      "stripe", "paypal", "godaddy", "namecheap", "blacknight", "hosting", "domain", "digitalocean", "heroku", "vercel", "netlify",
      "xero", "quickbooks", "surf accounts", "sage", "dext", "receipt bank", "chatgpt", "openai", "anthropic", "midjourney",
    ],
  },
  {
    category: "Professional Services",
    merchants: [
      "accountant", "solicitor", "legal", "consulting", "consultancy", "advisory", "notary", "bookkeeping", "tax agent",
      "fiverr", "upwork", "freelancer.com", "toptal", "bark.com", "local enterprise office", "cro", "companies registration office",
    ],
  },
  {
    category: "Utilities",
    merchants: [
      "electric ireland", "bord gais", "bord gáis", "sse airtricity", "energia", "prepaypower", "prepay power", "panda power", "pinery",
      "yuno energy", "flogas", "irish water", "uisce eireann", "uisce éireann", "panda waste", "greyhound recycling",
      "thorntons recycling", "city bin", "aes", "bord na mona", "barna recycling", "waste", "bin collection",
    ],
  },
  {
    category: "Insurance",
    merchants: [
      "vhi", "laya", "laya healthcare", "irish life", "aviva", "axa", "zurich", "allianz", "fbd", "liberty insurance",
      "123.ie", "chill insurance", "aig", "rsa", "hiscox", "business insurance", "public liability", "professional indemnity",
    ],
  },
  {
    category: "Financial",
    merchants: [
      "aib", "allied irish bank", "bank of ireland", "boi", "permanent tsb", "ptsb", "ulster bank", "kbc", "danske bank",
      "revolut", "n26", "bunq", "an post money", "credit union", "ebs", "barclays", "hsbc",
      "bank fee", "interest charge", "maintenance fee", "overdraft fee", "card fee", "commission charge",
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

