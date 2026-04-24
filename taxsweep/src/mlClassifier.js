/**
 * Lightweight, offline Naive Bayes text classifier for categorization.
 * Predicts the most likely category based on words in a transaction description.
 */

export const CATEGORIES = [
  "Personal / Non-deductible",
  "Groceries",
  "Meals & Entertainment",
  "Travel & Transport",
  "Office & Stationery",
  "Equipment & Tools",
  "Phone & Internet",
  "Marketing & Advertising",
  "Software & Subscriptions",
  "Professional Services",
  "Utilities",
  "Insurance",
  "Training & Education",
  "Financial"
];

// Training data: synthetic seed terms + real examples derived from bookkeeping_classified_v2.csv
const TRAINING_DATA = [
  // ── Personal / Non-deductible ─────────────────────────────────────────────
  { c: "Personal / Non-deductible", text: "supermarket groceries clothing retail apparel gym leisure stream game bet lottery casino shopping mall boutique outlet hair salon barber beauty chemist pharmacy kids toys pet veterinary" },
  { c: "Personal / Non-deductible", text: "mortgage rent loan savings salary wages childcare charity gambling pension credit union cheque bingo joint payroll weekly household personal" },

  // ── Groceries ─────────────────────────────────────────────────────────────
  { c: "Groceries", text: "tesco dunnes supervalu centra lidl aldi spar eurospar londis mace costcutter daybreak iceland fresh joyce fallon byrne donnybrook" },
  { c: "Groceries", text: "sainsburys asda morrisons waitrose coop cooperative farmfoods budgens nisa booths marks spencer grocery supermarket convenience store food shop" },

  // ── Meals & Entertainment ─────────────────────────────────────────────────
  { c: "Meals & Entertainment", text: "restaurant pub bar cafe coffee tea bistro deli takeaway delivery eat drink burger pizza chicken brewery hotel lounge dining caterer" },
  { c: "Meals & Entertainment", text: "catering sysco conaty buckley patisserie liffey mills ranch starbucks costa insomnia mcdonalds subway deliveroo justeat ubereats nandos wagamama" },

  // ── Travel & Transport ────────────────────────────────────────────────────
  { c: "Travel & Transport", text: "airline flight train bus coach taxi cab hackney toll parking car rental hire petrol diesel fuel station transit ferry airport mechanic garage" },
  { c: "Travel & Transport", text: "maxol topaz ryanair airbnb easytrip eflow expedia aer lingus bus eireann booking fuel oils circle payzone parking repair parts service driver radius" },

  // ── Office & Stationery ───────────────────────────────────────────────────
  { c: "Office & Stationery", text: "post postoffice mail courier shipping parcel delivery stationery paper ink toner print desk office supplies" },

  // ── Equipment & Tools ─────────────────────────────────────────────────────
  { c: "Equipment & Tools", text: "hardware tools diy builders electrical electronics computer laptop screen accessory furniture fix repair" },
  { c: "Equipment & Tools", text: "construction concrete windows roofing scaffolding plumbing carpet glazing pumping pest control painter plumber tiling window" },

  // ── Phone & Internet ──────────────────────────────────────────────────────
  { c: "Phone & Internet", text: "telecom mobile broadband internet wifi phone call plan network fiber data" },
  { c: "Phone & Internet", text: "vodafone eir eircom virgin sky three talktalk comreg digiweb imagine fibrus airwire rural broadband licence" },

  // ── Marketing & Advertising ───────────────────────────────────────────────
  { c: "Marketing & Advertising", text: "ads advertising marketing promo flyer leaflet print seo agency media billboard sponsorship click social" },

  // ── Software & Subscriptions ──────────────────────────────────────────────
  { c: "Software & Subscriptions", text: "software saas cloud hosting domain app subscription license web service api database platform digital" },
  { c: "Software & Subscriptions", text: "google microsoft meta zoom sage amazon dropbox salesforce infosys datasure forge lighthouse platform release bright digital" },

  // ── Professional Services ─────────────────────────────────────────────────
  { c: "Professional Services", text: "accountant solicitor lawyer consulting advisory design freelance agency tax audit registration notary" },
  { c: "Professional Services", text: "solicitors llp accounting fieldfisher siptu union trade membership imro taxassist auditors rcn rebates" },

  // ── Utilities ─────────────────────────────────────────────────────────────
  { c: "Utilities", text: "electric electricity power energy gas water waste recycling bin refuse utility" },
  { c: "Utilities", text: "airtricity flogas bord gais energia sse esb electric uisce eireann irish water rentokil panda greenstar calor gases teagasc boc natural" },

  // ── Insurance ─────────────────────────────────────────────────────────────
  { c: "Insurance", text: "insurance life health auto liability indemnity broker protection cover" },
  { c: "Insurance", text: "zurich aviva axa allianz fbd chubb aig rsa assurance phonewatch home security pet carraig arachas campion howden liberty" },

  // ── Training & Education ──────────────────────────────────────────────────
  { c: "Training & Education", text: "training course workshop seminar conference education skill certification exam cpd" },
  { c: "Training & Education", text: "college school dcu ucd university cao fees fund tuition griffith dominican loreto belvedere parentpay" },

  // ── Financial ─────────────────────────────────────────────────────────────
  { c: "Financial", text: "bank charge fee interest transaction commission maintenance account overdraft monthly yearly" },
  { c: "Financial", text: "council property lpt lps county tax adjustment unpaid revenue fingal donegal roscommon kilkenny tipperary kildare wicklow meath monaghan" },
];

const model = {
  vocab: new Set(),
  docCount: 0,
  catCounts: {},
  wordCounts: {},
};

// Initialize the model at load time
function train() {
  CATEGORIES.forEach(c => {
    model.catCounts[c] = 0;
    model.wordCounts[c] = {};
  });

  TRAINING_DATA.forEach(doc => {
    const tokens = tokenize(doc.text);
    model.docCount++;
    model.catCounts[doc.c]++;
    
    tokens.forEach(token => {
      model.vocab.add(token);
      model.wordCounts[doc.c][token] = (model.wordCounts[doc.c][token] || 0) + 1;
    });
  });
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 2); // Ignore very short words like 'at', 'to'
}

train();

/**
 * Predicts the category for a given transaction description.
 * @param {string} description 
 * @returns {{ category: string, score: number }} or null if unconfident
 */
export function predictCategory(description) {
  const tokens = tokenize(description);
  if (tokens.length === 0) return null;

  let bestCat = null;
  let bestLogProb = -Infinity;
  let maxPossibleProb = 0; // for normalization

  const scores = {};

  CATEGORIES.forEach(c => {
    // Prior probability P(Category)
    // Using Laplace smoothing for priors: (docCount + 1)
    let logProb = Math.log((model.catCounts[c] + 1) / (model.docCount + CATEGORIES.length));

    // Calculate sum of all word counts in this category for the denominator
    const totalWordsInCat = Object.values(model.wordCounts[c]).reduce((a, b) => a + b, 0);

    tokens.forEach(token => {
      // P(Word | Category) with Laplace smoothing
      const count = model.wordCounts[c][token] || 0;
      // Add a small weight. If a word isn't in vocab, it barely penalizes.
      const wordProb = (count + 1) / (totalWordsInCat + model.vocab.size);
      logProb += Math.log(wordProb);
    });

    scores[c] = logProb;
    if (logProb > bestLogProb) {
      bestLogProb = logProb;
      bestCat = c;
    }
  });

  // Calculate a mock "confidence" score (0.0 to 1.0)
  // Since log probabilities are negative and very small, we use softmax-like approach
  const sumExp = Object.values(scores).reduce((sum, val) => sum + Math.exp(val - bestLogProb), 0);
  const confidence = 1 / sumExp;

  // We enforce a strict floor to avoid aggressive bad guesses
  if (confidence < 0.35) {
    return null; 
  }

  // To match the expected shape of the gazetteer
  return { category: bestCat, score: confidence };
}
