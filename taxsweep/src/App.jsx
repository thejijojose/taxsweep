import { useState, useEffect, useRef } from "react";
import {
  Check, X, SkipForward, Upload, FileText,
  RefreshCw, AlertTriangle, Info, Printer, Zap,
  Smartphone, Monitor, Camera, List, CreditCard, Trash2, Sparkles, LayoutDashboard,
  Plus, Car, TrendingUp
} from "lucide-react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { createMccEnricher, inferTaxCategoryFromMcc } from "./mccEnrichment";
import { matchIrishMerchantCategory } from "./merchantIreland";

// ── Font & global style injection ─────────────────────────────────────────────
(() => {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap";
  document.head.appendChild(link);

  const style = document.createElement("style");
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #f1f5f9; }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 2px; }
    .ts-card { cursor: grab; touch-action: none; }
    .ts-card:active { cursor: grabbing; }
    .ts-card-animate { transition: transform 0.38s cubic-bezier(.25,.46,.45,.94), opacity 0.38s ease; }
    @keyframes ts-fade-up { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:none; } }
    @keyframes ts-spin { to { transform: rotate(360deg); } }
    @keyframes ts-pulse { 0%,100%{opacity:1} 50%{opacity:.45} }
    .ts-fade-up { animation: ts-fade-up 0.45s ease both; }
    .ts-drop { border: 2px dashed #cbd5e1; transition: border-color .2s, background .2s; }
    .ts-drop.over { border-color: #2563eb; background: rgba(37,99,235,.04); }
    .ts-btn-action { transition: background .15s, border-color .15s, transform .1s; }
    .ts-btn-action:hover { transform: scale(1.06); }
    .ts-export-btn { transition: background .15s, opacity .15s; }
    .ts-export-btn:hover { opacity: .86; }
    @media print {
      body * { visibility: hidden !important; }
      #ts-print-area, #ts-print-area * { visibility: visible !important; }
      #ts-print-area {
        display: block !important;
        position: fixed !important; inset: 0 !important;
        background: #fff !important; padding: 14mm 18mm !important;
        font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif !important;
        font-size: 10pt !important; color: #111 !important;
      }
    }
  `;
  document.head.appendChild(style);
})();

// ── Load PDF.js from CDN (lazy — only when user uploads a PDF) ────────────────
const loadPDFJS = () =>
  new Promise((resolve, reject) => {
    if (window.pdfjsLib) { resolve(window.pdfjsLib); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
    s.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error(
      "PDF.js could not load — PDF parsing needs a one-time internet connection. " +
      "You appear to be offline. Please export a CSV from your banking app instead."
    ));
    document.head.appendChild(s);
  });

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:         "#f1f5f9",
  surface:    "#ffffff",
  surfaceAlt: "#f8fafc",
  border:     "#e2e8f0",
  green:      "#2563eb",
  greenDim:   "rgba(37,99,235,0.07)",
  red:        "#dc2626",
  amber:      "#d97706",
  blue:       "#2563eb",
  text:       "#0f172a",
  sub:        "#334155",
  muted:      "#64748b",
  mono:       "'JetBrains Mono', 'Courier New', monospace",
  display:    "'Inter', system-ui, sans-serif",
  body:       "'Inter', system-ui, sans-serif",
};

const CATS = {
  "Office & Stationery":       "#3b82f6",
  "Travel & Transport":        "#8b5cf6",
  "Professional Services":     "#ec4899",
  "Phone & Internet":          "#06b6d4",
  "Software & Subscriptions":  "#f59e0b",
  "Equipment & Tools":         "#10b981",
  "Marketing & Advertising":   "#f97316",
  "Training & Education":      "#6366f1",
  "Meals & Entertainment":     "#84cc16",
  "Bank Charges":              "#64748b",
  "Insurance":                 "#14b8a6",
  "Utilities":                 "#a855f7",
  "Personal / Non-deductible": "#ef4444",
  "Uncategorized":             "#6b7280",
};
const catColor = (cat) => CATS[cat] ?? "#6b7280";
const confBadge = (p) =>
  p >= 0.80 ? ["High",   C.green]
: p >= 0.50 ? ["Medium", C.amber]
:             ["Low",    C.red];

const STORAGE_KEY = "taxsweep_v2";

// ══════════════════════════════════════════════════════════════════════════════
// ── OFFLINE RULE-BASED IRISH TAX CLASSIFIER ───────────────────────────────────
// Each rule has: category, base probability, Revenue basis, advisor note,
// and two match lists — merchants (high confidence) and keywords (medium).
// ══════════════════════════════════════════════════════════════════════════════

const TAX_RULES = [
  {
    category: "Software & Subscriptions",
    probability: 0.93,
    basis: "s81 TCA 1997 – wholly & exclusively for trade",
    note: "100% deductible as business software. Retain invoices for Revenue audit.",
    merchants: [
      "aws","amazon web services","azure","microsoft azure","google cloud","gcp",
      "digitalocean","linode","vultr","hetzner","cloudflare","netlify","vercel",
      "heroku","render","fly.io","railway",
      "github","gitlab","bitbucket","jira","confluence","linear","notion","clickup",
      "asana","monday.com","basecamp","trello","shortcut","height.app",
      "slack","zoom","google meet","webex","whereby","loom","miro","whimsical",
      "adobe","figma","sketch","invision","canva","framer","zeplin","abstract",
      "microsoft 365","office 365","google workspace","gsuite","g suite",
      "dropbox","box","onedrive","backblaze","wasabi",
      "xero","quickbooks","freeagent","surf accounts","freshbooks","sage","kashflow",
      "shopify","squarespace","wix","webflow","bigcommerce","volusion",
      "hubspot","mailchimp","klaviyo","sendgrid","mailerlite","activecampaign",
      "stripe","paddle","fastspring","chargebee","recurly",
      "chatgpt","openai","anthropic","midjourney","jasper",
      "buffer","hootsuite","sprout social","later","publer","socialbee",
      "1password","lastpass","bitwarden","dashlane","nordpass",
      "calendly","typeform","jotform","surveymonkey","tally.so",
      "intercom","zendesk","freshdesk","crisp","helpscout","gorgias",
      "sentry","datadog","new relic","pagerduty","loggly","papertrail",
      "twilio","vonage","sinch","messagebird","bandwidth",
      "docusign","hellosign","pandadoc","signrequest","adobe sign",
      "airtable","coda","smartsheet","roam research",
      "grammarly","hemingway","semrush","ahrefs","moz","clearscope","surfer",
      "hotjar","fullstory","mixpanel","amplitude","segment","heap",
      "zapier","make.com","integromat","n8n","automate.io","pipedream",
      "egghead","frontend masters","pluralsight","linkedin learning",
      "buzzsprout","transistor","captivate","anchor","podbean",
      "google drive","google one","google workspace","google cloud","google ads",
    ],
    keywords: [
      "subscription","licence","license","saas","software licence","software license",
      "hosting","domain name","ssl certificate","cdn ","api access","cloud storage",
      "annual plan","monthly plan","renewal fee","auto-renew","recurring charge",
      "app store","google play","apple developer","annual subscription",
    ],
  },
  {
    category: "Travel & Transport",
    probability: 0.72,
    basis: "s81 TCA 1997 – business travel; subsistence at Revenue civil service rates",
    note: "Business journeys only. Keep a mileage log. Subsistence claimable at civil service rates for overnight business travel.",
    merchants: [
      "dublin bus","luas","dart","irish rail","iarnród éireann","iarnrod eireann",
      "bus éireann","bus eireann","translink","go-ahead ireland","matthews coach","citylink",
      "ryanair","aer lingus","british airways","easyjet","jet2","wizz air","vueling",
      "uber","bolt","free now","freenow","mytaxi","lynk","phoenix cab","taxi",
      "q-park","qpark","ncp parking","indigo park","dublin airport car","cork airport",
      "eflow","m50 eflow","east link toll","m1 motorway","eurolink",
      "hertz","avis","budget car hire","enterprise rent","europcar","sixt","dollar thrifty",
      "circle k","applegreen","maxol","texaco","shell","bp","esso","topaz","certa","tesco fuel",
      "eurostar","trainline","thetrainline","avanti","cross country","great western",
      "booking.com","hotels.com","airbnb","expedia","trivago","hostelworld",
      "irish ferries","stena line","brittany ferries","celtic link",
      "transport for ireland","tfi leap","aircoach","air coach",
      "klm","klm royal dutch","sunexpress","indigo airlines","qatar air","qatar airways","etihad","air india","turkish airlines",
    ],
    keywords: [
      "taxi fare","cab fare","train ticket","bus ticket","flight ticket","airport",
      "parking fee","toll charge","road toll","fuel purchase","petrol","diesel",
      "car hire","car rental","van hire","mileage claim","subsistence","travel expense",
      "hotel stay","accommodation","b&b","guesthouse","overnight","business trip",
      "rail","coach hire","ferry crossing","shuttle bus",
    ],
  },
  {
    category: "Professional Services",
    probability: 0.93,
    basis: "s81 TCA 1997 – professional fees wholly & exclusively for trade",
    note: "100% deductible. Retain invoice and engagement letter. Accountant and legal fees fully deductible.",
    merchants: [
      "revenue commissioners","companies registration office","cro","patents office","ipoi",
      "law society","chartered accountants ireland","cpa ireland","icai","acca ireland",
      "kpmg","deloitte","pwc","ey ","ernst young","bdo","grant thornton","mazars","rsm",
      "a&l goodbody","arthur cox","matheson","mccann fitzgerald","william fry","maples",
      "eversheds","mason hayes","beauchamps","hayes solicitors","philip lee",
      "company bureau","formations direct","company formations ireland",
      "department of enterprise","department of justice","department of social","revenue commissioners ireland",
    ],
    keywords: [
      "accountant fee","accounting fee","solicitor fee","legal fee","legal advice",
      "barrister fee","consulting fee","consultancy fee","advisory fee","professional fee",
      "retainer fee","notary fee","commissioner for oaths","legal costs","audit fee",
      "tax advice","tax return preparation","cro filing","company secretarial",
      "payroll service","bookkeeping","vat return","payroll bureau",
      "hr consulting","recruitment fee","agency fee","subcontractor invoice",
    ],
  },
  {
    category: "Phone & Internet",
    probability: 0.79,
    basis: "s81 TCA 1997 – 75% if dual personal/business use; 100% for dedicated business line",
    note: "Claim 75% for a combined personal/business phone. Keep bills. 100% if line is exclusively for business.",
    merchants: [
      "vodafone ireland","vodafone","three ireland","three mobile","eir ","eir business",
      "virgin media","sky broadband","pure telecom","digiweb","imagine","magnet networks",
      "viatel","enet","colt technology","bt ireland","verizon ireland",
      "ringcentral","dialpad","8x8","vonage business","google voice",
      "tesco mobile","48","rebtel","lebara","lycamobile","gomo","clear mobile",
    ],
    keywords: [
      "mobile bill","phone bill","broadband bill","internet bill","data plan","sim only",
      "telecom bill","landline rental","line rental","monthly minutes","business mobile",
      "broadband rental","wifi bill","4g plan","5g plan","phone contract","data roaming",
    ],
  },
  {
    category: "Equipment & Tools",
    probability: 0.82,
    basis: "s81 TCA 1997 or capital allowances s284 TCA 1997 – 12.5% p.a. over 8 years for items over €500",
    note: "Under €500: expense directly. Over €500: capital allowances at 12.5% per year. Keep invoice showing business purpose.",
    merchants: [
      "apple store","apple.com","apple online store","dell","lenovo","hp ","asus","acer",
      "samsung","lg electronics","sony","panasonic","brother","epson","canon",
      "currys","harvey norman","komplett","mymemory","scan computers","box.co.uk",
      "screwfix","woodies diy","b&q","toolstation","machine mart","speedy hire","mts hire",
      "ikea business","argos","staples ireland","lyreco","viking direct",
      "logitech","corsair","razer","jabra","sennheiser","bose","rode","elgato","blue yeti",
      "western digital","seagate","sandisk","kingston","crucial","samsung ssd",
    ],
    keywords: [
      "laptop","notebook computer","desktop pc","workstation","monitor","display screen",
      "keyboard","computer mouse","printer","scanner","camera","microphone","headset",
      "webcam","tablet","ipad purchase","equipment purchase","machinery purchase",
      "power tools","hand tools","trade tools","standing desk","office chair",
      "server","nas drive","hard drive","ssd","usb hub","docking station",
      "oscilloscope","multimeter","test equipment",
    ],
  },
  {
    category: "Marketing & Advertising",
    probability: 0.92,
    basis: "s81 TCA 1997 – advertising expenditure wholly & exclusively for trade",
    note: "100% deductible. Retain receipts and campaign reports. Includes digital, print and sponsorship.",
    merchants: [
      "google ads","google adwords","google advertising","facebook ads","meta ads",
      "meta platforms","instagram ads","linkedin ads","linkedin marketing solutions",
      "twitter ads","x advertising","tiktok ads","snapchat ads","pinterest ads",
      "bing ads","microsoft advertising","youtube advertising",
      "daft.ie advertising","myhome.ie","donedeal.ie","adverts.ie",
      "vistaprint","moo.com","canva print","printworks","snap printing",
    ],
    keywords: [
      "advertising spend","advertisement","ad spend","ppc campaign","pay per click",
      "cpc","cpm","marketing campaign","promotional spend","pr agency fee",
      "press release","seo service","sem","social media ads","google ad spend",
      "sponsored post","flyers print","leaflet printing","banner ads","billboard",
      "radio advertising","print advertising","brand design","logo design","branding agency",
      "product photography","videography","video production",
    ],
  },
  {
    category: "Training & Education",
    probability: 0.78,
    basis: "s81 TCA 1997 – training wholly & exclusively to maintain or develop existing trade skills",
    note: "Deductible only if course relates to your current trade. Career-change or purely general education is not deductible.",
    merchants: [
      "eventbrite","ticketmaster business","skillnet ireland","enterprise ireland",
      "udemy","coursera","linkedin learning","pluralsight","skillshare","egghead",
      "frontend masters","kodeco","raywenderlich","treehouse","codecademy","scrimba",
      "idc","chartered institute","ibec","isme","sfa ireland",
    ],
    keywords: [
      "training course","online course","workshop fee","seminar fee","conference ticket",
      "webinar fee","bootcamp fee","hackathon","certification exam","exam fee",
      "professional exam","cpd","continuing professional development",
      "membership fee","industry association","professional body","trade association",
      "coaching session","mentoring","masterclass","e-learning","professional development",
    ],
  },
  {
    category: "Office & Stationery",
    probability: 0.86,
    basis: "s81 TCA 1997 – office consumables wholly & exclusively for trade",
    note: "100% deductible. Keep receipts. Includes postage, packaging and courier costs.",
    merchants: [
      "staples ireland","office depot","lyreco","viking direct","rymans",
      "an post","dhl","fedex","ups","parcel motel","parcel connect","evri","dpd ireland",
      "amazon business","eason","easons","easons.com",
    ],
    keywords: [
      "stationery","office supplies","printer paper","printer ink","toner cartridge",
      "postage stamps","courier charge","delivery fee","packaging materials",
      "envelopes","ring binders","folders","pens","notebooks","whiteboard markers",
      "desk supplies","document shredding","binding","laminating","franking",
    ],
  },
  {
    category: "Bank Charges",
    probability: 0.94,
    basis: "s81 TCA 1997 – bank charges on business account wholly & exclusively for trade",
    note: "100% deductible for charges on a business account. Ensure personal account charges are excluded.",
    keywords: [
      "bank charge","bank fee","monthly maintenance fee","account fee","transaction charge",
      "wire transfer fee","swift charge","sepa fee","international payment fee",
      "overdraft fee","overdraft interest","annual card fee","card fee",
      "atm fee","cash handling fee","foreign exchange fee","fx charge",
      "currency conversion fee","chaps fee","bacs fee","iban fee","service charge",
      "stripe fee","paypal fee","payment processing fee","merchant service charge",
      "square fee","zettle fee","sumup fee","worldpay fee","realex fee","opayo fee",
    ],
  },
  {
    category: "Insurance",
    probability: 0.89,
    basis: "s81 TCA 1997 – business insurance premiums wholly & exclusively for trade",
    note: "100% deductible for business policies. Keep policy schedule. Personal life insurance is not deductible.",
    merchants: [
      "aon ireland","marsh ireland","allianz ireland","axa insurance","aviva ireland",
      "zurich insurance","fbd insurance","rsa insurance","hiscox","chubb",
      "tokio marine","liberty insurance","fia insurance",
    ],
    keywords: [
      "professional indemnity","public liability insurance","employers liability",
      "business insurance","product liability","cyber insurance","cyber liability",
      "fleet insurance","van insurance","commercial vehicle insurance",
      "office contents insurance","equipment insurance","key person insurance",
      "trade credit insurance","insurance premium","policy renewal","annual premium",
    ],
  },
  {
    category: "Utilities",
    probability: 0.34,
    basis: "s81 TCA 1997 – separate business premises 100%; home office use business proportion only",
    note: "Fully deductible only for dedicated business premises. Home office workers: calculate proportion (rooms used ÷ total rooms × annual bill).",
    merchants: [
      "esb networks","electric ireland","bord gáis energy","bord gais","gas networks ireland",
      "sse airtricity","airtricity","energia","panda power","flogas","calor gas",
      "irish water","uisce éireann",
      "city bin","greyhound recycling","greyhound household","panda waste","thorntons recycling","shred it","bring recycling",
    ],
    keywords: [
      "electricity bill","gas bill","water charges","utility bill","energy bill",
      "esb bill","standing charge","unit rate","meter reading","dual fuel bill",
      "business electricity","commercial gas supply",
    ],
  },
  {
    category: "Meals & Entertainment",
    probability: 0.14,
    basis: "s840 TCA 1997 – client entertainment NOT deductible; subsistence at civil service rates only when travelling for trade",
    note: "Client meals and entertainment are not deductible. Only Revenue civil service subsistence rates apply when away from your base overnight on business.",
    merchants: [
      "starbucks","costa coffee","insomnia coffee","cafe sol","avoca","butlers chocolates",
      "mcdonalds","mcdonald's","burger king","kfc","subway","supermacs","abrakebabra",
      "dominos pizza","pizza hut","papa johns","just eat","deliveroo","uber eats",
      "nando's","wagamama","thunders","simon's place","the ivy","Chapter One",
      "zomato","swiggy","too good to go","blinkit","foodpanda","talabat",
    ],
    keywords: [
      "restaurant","bistro","brasserie","cafe","coffee shop","lunch meeting",
      "client dinner","client lunch","food delivery","client entertainment",
      "team lunch","team dinner","team outing","hospitality","drinks reception",
      "christmas party","staff party","office party",
    ],
  },
  {
    category: "Personal / Non-deductible",
    probability: 0.03,
    basis: "s81 TCA 1997 – not wholly & exclusively for trade; personal expenditure not allowable",
    note: "Personal expenses are not deductible. Do not include in your tax return. Keep separate from business transactions.",
    merchants: [
      "tesco","dunnes stores","dunnes","lidl","aldi","supervalu","centra","spar",
      "marks & spencer food","marks spencer","m&s food","freshii","leon restaurants",
      "penneys","primark","zara","h&m","asos","next","river island","tk maxx",
      "netflix","spotify","disney+","amazon prime","apple tv+","now tv","sky entertainment",
      "flyefit","energy fitness","pure gym","total fitness","westwood club",
      "boots pharmacy","lloyds pharmacy","hickeys pharmacy","life pharmacy",
      "rte licence","tv licence","national lottery","lotto terminal",
      "smyths toys","gamestop","playstation store","xbox store","nintendo eshop",
      "trading 212","trade republic","etoro","degiro","revolut invest","revolut stocks","freetrade","t212",
    ],
    keywords: [
      "grocery shopping","supermarket","personal shopping","clothing store",
      "gym membership","personal use","netflix","spotify","streaming",
      "household items","home furnishing","personal care","beauty salon","hairdresser",
      "vet bill","pet supplies","childcare","creche fee","school fees","crèche",
    ],
  },
];

// ── Amount-aware scoring — Irish tax thresholds ───────────────────────────────
// Each entry adjusts confidence (mult) and surfaces a targeted advisory note
// when the transaction amount crosses a Revenue-relevant threshold.
const AMOUNT_RULES = [
  {
    category: "Equipment & Tools",
    ranges: [
      { min: 500, mult: 0.84, note: "Over €500 — capital allowances (s284 TCA 1997) apply at 12.5%/year over 8 years. Cannot be expensed directly in full. Keep invoice with business-purpose note." },
    ],
  },
  {
    category: "Travel & Transport",
    ranges: [
      { min: 1500, mult: 0.85, note: "High-value travel expense. Document the business purpose, destination, and dates. Subsistence is capped at Revenue civil service scales regardless of actual cost." },
      { min: 400,  mult: 0.93, note: "Keep receipt and record the business purpose and destination for this journey." },
    ],
  },
  {
    category: "Phone & Internet",
    ranges: [
      { min: 200, mult: 0.65, note: "Unusually high for a phone/internet service. If this includes hardware, the device cost over €500 requires capital allowances rather than a direct expense." },
      { min: 80,  mult: 0.86, note: "Higher than a typical monthly bill — confirm this is a recurring service charge, not a device purchase (capital allowance if >€500)." },
    ],
  },
  {
    category: "Software & Subscriptions",
    ranges: [
      { min: 1000, mult: 0.88, note: "Large software spend. If this is a perpetual licence (not SaaS), items over €500 may need capital allowances (s284) rather than a direct revenue deduction." },
    ],
  },
  {
    category: "Professional Services",
    ranges: [
      { min: 5000, mult: 0.90, note: "Significant professional fee. Retain the engagement letter and VAT invoice — Revenue may request these in a compliance check." },
    ],
  },
  {
    category: "Training & Education",
    ranges: [
      { min: 2000, mult: 0.78, note: "Large training cost. Only deductible if the course directly maintains or develops skills for your existing trade. Career-change or general education is not allowable under s81 TCA 1997." },
    ],
  },
  {
    category: "Marketing & Advertising",
    ranges: [
      { min: 1000, mult: 0.95, note: "Keep invoices and campaign performance reports. Revenue may request evidence of commercial purpose for large advertising expenditure." },
    ],
  },
  {
    category: "Insurance",
    ranges: [
      { min: 2000, mult: 0.90, note: "Large premium. Keep the policy schedule and confirm the policy covers only business risk — personal life insurance and income protection are not deductible." },
    ],
  },
  {
    category: "Utilities",
    ranges: [
      { min: 300, mult: 0.78, note: "Significant utility bill. Home office: only the business proportion (number of rooms used exclusively for trade ÷ total rooms × annual bill) is allowable." },
    ],
  },
  {
    category: "Bank Charges",
    ranges: [
      { min: 50, mult: 0.70, note: "Unusually high bank charge. Confirm this is a legitimate fee on a dedicated business account. Personal account charges are not deductible." },
    ],
  },
  {
    category: "Office & Stationery",
    ranges: [
      { min: 500, mult: 0.88, note: "Large office/stationery spend — confirm this is consumables and not furniture or equipment, which would require capital allowances if over €500." },
    ],
  },
];

function applyAmountRules(category, amount) {
  const rule = AMOUNT_RULES.find(r => r.category === category);
  if (!rule) return { mult: 1.0, amountNote: null };
  for (const r of rule.ranges) {
    if (amount >= r.min) return { mult: r.mult, amountNote: r.note };
  }
  return { mult: 1.0, amountNote: null };
}

// ── Offline learning engine ───────────────────────────────────────────────────
const LEARN_KEY = "taxsweep_learn_v1";
function loadLearning() {
  try { return JSON.parse(localStorage.getItem(LEARN_KEY)) ?? { m: {} }; }
  catch { return { m: {} }; }
}
const mkKey = (d) => d.toLowerCase().trim();
function getLearnedSuggestion(desc, db) {
  const r = db.m[mkKey(desc)];
  if (!r) return null;
  const inc = r.i ?? 0, exc = r.e ?? 0, tot = inc + exc;
  if (tot < 2) return null;
  if (inc >= exc * 2 && inc >= 2) return "include";
  if (exc >= inc * 2 && exc >= 2) return "exclude";
  return null;
}
function recordLearnDecision(desc, action, db) {
  const key = mkKey(desc);
  const r = db.m[key] ?? { i: 0, e: 0 };
  if (action === "include") r.i = (r.i ?? 0) + 1;
  if (action === "exclude") r.e = (r.e ?? 0) + 1;
  return { ...db, m: { ...db.m, [key]: r } };
}

// ── IndexedDB receipt storage ─────────────────────────────────────────────────
const RDB_NAME = "ts_receipts_v1", RDB_STORE = "receipts";
let _rdb = null;
function openRDB() {
  if (_rdb) return Promise.resolve(_rdb);
  return new Promise((res, rej) => {
    const q = indexedDB.open(RDB_NAME, 1);
    q.onupgradeneeded = (e) => e.target.result.createObjectStore(RDB_STORE, { keyPath: "id" });
    q.onsuccess = (e) => { _rdb = e.target.result; res(_rdb); };
    q.onerror = () => rej(q.error);
  });
}
async function dbSaveReceipt(txId, blob) {
  const db = await openRDB();
  return new Promise((res, rej) => {
    const t = db.transaction(RDB_STORE, "readwrite");
    t.objectStore(RDB_STORE).put({ id: txId, blob, ts: Date.now() });
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
}
async function dbLoadReceipt(txId) {
  const db = await openRDB();
  return new Promise((res) => {
    const t = db.transaction(RDB_STORE, "readonly");
    const q = t.objectStore(RDB_STORE).get(txId);
    q.onsuccess = () => res(q.result?.blob ?? null);
    q.onerror = () => res(null);
  });
}
async function dbDeleteReceipt(txId) {
  const db = await openRDB();
  return new Promise((res) => {
    const t = db.transaction(RDB_STORE, "readwrite");
    t.objectStore(RDB_STORE).delete(txId);
    t.oncomplete = res;
  });
}
async function dbGetAllReceiptKeys() {
  try {
    const db = await openRDB();
    return new Promise((res) => {
      const t = db.transaction(RDB_STORE, "readonly");
      const q = t.objectStore(RDB_STORE).getAllKeys();
      q.onsuccess = () => res(new Set(q.result));
      q.onerror = () => res(new Set());
    });
  } catch { return new Set(); }
}
async function compressToBlob(file, maxDim = 1400, quality = 0.78) {
  return new Promise((res) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxDim / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(res, "image/jpeg", quality);
    };
    img.src = url;
  });
}

// ── Classifier engine ─────────────────────────────────────────────────────────
function classifyTransaction(tx) {
  const desc = (tx.description || "").toLowerCase().trim();
  if (!desc) return { id: tx.id, category: "Uncategorized", probability: 0.38, basis: "No description available", note: "Add a description and review manually.", amountNote: null };

  // Signal A: Ireland merchant gazetteer (high weight)
  const gaz = matchIrishMerchantCategory(desc);

  // Signal B: MCC-based inference from `mccing.csv`
  const mccInf = inferTaxCategoryFromMcc(tx.mcc, tx.mcc_description);

  // Signal C: existing rules/keywords
  let best = null;
  let bestScore = 0;

  for (const rule of TAX_RULES) {
    let score = 0;
    if (rule.merchants) {
      for (const m of rule.merchants) {
        if (desc.includes(m.toLowerCase())) { score = Math.max(score, 0.92); break; }
      }
    }
    if (rule.keywords && score < 0.92) {
      let hits = 0;
      for (const kw of rule.keywords) { if (desc.includes(kw.toLowerCase())) hits++; }
      if (hits > 0) score = Math.max(score, Math.min(0.55 + hits * 0.12, 0.82));
    }
    if (score > bestScore) { bestScore = score; best = rule; }
  }

  // Combine signals into a final category. Merchant gazetteer is highest priority.
  const candidates = new Map(); // category -> { score, sources: [] }
  const add = (category, score, source) => {
    if (!category || !score) return;
    const prev = candidates.get(category);
    if (!prev || score > prev.score) candidates.set(category, { score, sources: [source] });
    else prev.sources.push(source);
  };

  // Weighting: emphasize first-level merchant matching.
  if (gaz) add(gaz.category, Math.min(0.99, gaz.score * 0.92 + 0.08), `merchant:${gaz.merchant}`);
  if (mccInf) add(mccInf.category, Math.min(0.99, mccInf.score), `mcc:${mccInf.mcc}`);
  if (best && bestScore) add(best.category, Math.min(0.99, best.probability * (bestScore >= 0.9 ? 1.0 : 0.88)), "rules");

  const sorted = [...candidates.entries()].sort((a, b) => b[1].score - a[1].score);
  const chosen = sorted[0];

  if (!chosen || chosen[1].score < 0.45) {
    return {
      id: tx.id,
      category: "Uncategorized",
      probability: 0.38,
      basis: "Could not auto-classify — manual review required",
      note: "Check Revenue.ie for applicable rules for this type of expense.",
      amountNote: null,
      classifier_debug: { gaz, mccInf, rules: best ? { category: best.category, score: bestScore } : null },
    };
  }

  const category = chosen[0];
  const rawScore = chosen[1].score;
  const secondScore = sorted[1]?.[1]?.score ?? 0;
  const margin = Math.max(0, Math.min(0.22, rawScore - secondScore));
  const combined = Math.max(0, Math.min(0.97, rawScore + margin * 0.55));

  // Map selected rule data (basis/note) when available for that category
  const ruleForCat = TAX_RULES.find((r) => r.category === category) ?? null;

  const { mult, amountNote } = applyAmountRules(category, tx.amount ?? 0);
  const scaled = parseFloat(Math.min(combined * mult, 0.97).toFixed(2));

  return {
    id: tx.id,
    category,
    probability: scaled,
    basis: ruleForCat?.basis ?? (mccInf?.reason ? `MCC inference: ${mccInf.reason}` : "Offline inference"),
    note: ruleForCat?.note ?? (gaz ? `Matched Irish merchant list: ${gaz.merchant}` : ""),
    amountNote,
    classifier_debug: {
      chosen: { category, rawScore: Number(rawScore.toFixed(3)), combined: Number(combined.toFixed(3)) },
      gaz,
      mccInf,
      rules: best ? { category: best.category, score: Number(bestScore.toFixed(3)) } : null,
    },
  };
}

function classifyAll(transactions) {
  return transactions.map(classifyTransaction);
}

// ── Subscription detector — groups by normalised description, flags repeats ───
function detectSubscriptions(txs) {
  const norm = (d) => d.toLowerCase().replace(/\b\d{4,}\b/g, "").replace(/\s+/g, " ").trim();
  const counts = {};
  txs.forEach((t) => { const k = norm(t.description); counts[k] = (counts[k] ?? 0) + 1; });
  return new Set(txs.filter((t) => counts[norm(t.description)] >= 2).map((t) => t.id));
}

// ── Manual test harness (narrative → classification) ──────────────────────────
function CategorizerLab({ viewMode, onBack }) {
  const [narrative, setNarrative] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const enricherRef = useRef(null);

  const run = async () => {
    const desc = narrative.trim();
    if (!desc) return;
    setErr(null);
    setBusy(true);
    try {
      if (!enricherRef.current) enricherRef.current = await createMccEnricher();
      const tx = {
        id: "lab_tx",
        description: desc,
        amount: Number.isFinite(parseFloat(amount)) ? Math.abs(parseFloat(amount)) : 0,
        date: new Date().toISOString().slice(0, 10),
      };
      const enriched = enricherRef.current.enrichOne(tx);
      const classified = classifyTransaction(enriched);
      setResult({ tx: enriched, cls: classified });
    } catch (e) {
      setErr(e?.message ?? "Failed to run categorizer.");
    } finally {
      setBusy(false);
    }
  };

  const badge = (label, color, bg) => (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 999, background: bg, color, border: `1px solid ${color}35`, whiteSpace: "nowrap" }}>{label}</span>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.body, display: "flex", flexDirection: "column", alignItems: "center", padding: "34px 22px 60px" }}>
      <ViewToggle mode={viewMode} onChange={() => { /* no-op here; parent owns it */ }} />
      <div style={{ width: "100%", maxWidth: viewMode === "desktop" ? 940 : 560 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: C.display, fontSize: 26, fontWeight: 750, color: C.text, letterSpacing: "-.02em" }}>Categorizer Lab</div>
            <div style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Paste a narrative to test MCC enrichment + category classification.</div>
          </div>
          <button onClick={onBack} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: "9px 14px", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: C.body, fontWeight: 600 }}>
            ← Back
          </button>
        </div>

        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, boxShadow: "0 3px 18px rgba(0,0,0,.06)", marginBottom: 16 }}>
          <div style={{ display: viewMode === "desktop" ? "grid" : "block", gridTemplateColumns: "1fr 160px", gap: 12, alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 700, marginBottom: 8 }}>Transaction narrative</div>
              <textarea
                value={narrative}
                onChange={(e) => setNarrative(e.target.value)}
                placeholder="e.g. APPLE.COM/BILL ITUNES.COM IE or VESTA *VODAFONE TOPUP or A&L GOODBODY FEES"
                rows={3}
                style={{ width: "100%", resize: "vertical", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.text, fontSize: 14, fontFamily: C.body, padding: "10px 12px", outline: "none", lineHeight: 1.5, boxSizing: "border-box" }}
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
              />
              <div style={{ marginTop: 8, fontSize: 12, color: C.muted }}>Tip: press <strong>⌘/Ctrl + Enter</strong> to run.</div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 700, marginBottom: 8 }}>Amount (optional)</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 22.86"
                inputMode="decimal"
                style={{ width: "100%", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.text, fontSize: 14, fontFamily: C.mono, padding: "10px 12px", outline: "none", boxSizing: "border-box" }}
              />
              <button
                onClick={run}
                disabled={busy || !narrative.trim()}
                style={{ marginTop: 12, width: "100%", background: busy ? `${C.green}90` : C.green, color: "#fff", border: "none", borderRadius: 12, padding: "11px 14px", fontSize: 14, fontWeight: 700, cursor: busy ? "default" : "pointer", fontFamily: C.body, opacity: !narrative.trim() ? 0.55 : 1 }}
              >
                {busy ? "Running…" : "Run categorizer"}
              </button>
            </div>
          </div>
        </div>

        {err && (
          <div style={{ background: "rgba(220,38,38,.07)", border: `1px solid rgba(220,38,38,.2)`, borderRadius: 12, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={15} color={C.red} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.red, lineHeight: 1.55 }}>{err}</span>
          </div>
        )}

        {result && (
          <div style={{ display: viewMode === "desktop" ? "grid" : "block", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
                <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 700 }}>Category result</div>
                {badge(`${Math.round((result.cls.probability ?? 0) * 100)}%`, confBadge(result.cls.probability ?? 0)[1], `${confBadge(result.cls.probability ?? 0)[1]}12`)}
              </div>
              <div style={{ fontFamily: C.display, fontSize: 20, fontWeight: 750, color: catColor(result.cls.category), marginBottom: 6 }}>
                {result.cls.category}
              </div>
              <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55, marginBottom: 10 }}>
                <strong>Revenue basis:</strong> {result.cls.basis || "—"}
              </div>
              {result.cls.note && (
                <div style={{ fontSize: 12, color: C.sub, background: C.surfaceAlt, padding: "10px 12px", borderRadius: 12, lineHeight: 1.55, borderLeft: `3px solid ${C.green}50`, marginBottom: 10 }}>
                  {result.cls.note}
                </div>
              )}
              {result.tx.mcc && (
                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>
                  <strong>MCC:</strong> {result.tx.mcc} — {result.tx.mcc_description}
                </div>
              )}
            </div>

            <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18 }}>
              <div style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 700, marginBottom: 12 }}>Match details</div>
              <div style={{ fontFamily: C.mono, fontSize: 12.5, color: C.text, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", lineHeight: 1.55, marginBottom: 12, whiteSpace: "pre-wrap" }}>
                {result.tx.description}
              </div>
              {result.tx.mcc_match?.status === "matched" ? (
                <>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                    {badge(`score ${result.tx.mcc_match.score}`, C.blue, `${C.blue}12`)}
                    {badge(`conf ${result.tx.mcc_match.confidence}`, C.green, `${C.green}12`)}
                    {badge(`token ${result.tx.mcc_match.components?.token ?? "-"}`, C.muted, `${C.muted}12`)}
                    {badge(`trigram ${result.tx.mcc_match.components?.trigram ?? "-"}`, C.muted, `${C.muted}12`)}
                  </div>
                  <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>
                    <strong>Matched training narrative:</strong>
                    <div style={{ marginTop: 6, fontFamily: C.mono, fontSize: 12, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 12px", whiteSpace: "pre-wrap" }}>
                      {result.tx.mcc_match.matched_description}
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.55 }}>
                  No MCC match found (best score: {Math.round((result.tx.mcc_match?.score ?? 0) * 100)}%).
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── CSV parser ────────────────────────────────────────────────────────────────
function parseCSV(raw) {
  const splitLine = (line) => {
    const cols = []; let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase();
  const txs = [];

  // ── Revolut all-account export (both column layouts)
  // Old: Type, Product, Started Date, Description, Amount, ...
  // New: Type, Product, Started Date, Completed Date, Description, Amount, Fee, Currency, State, Balance
  if (header.includes("started date") && header.includes("product") && header.includes("description")) {
    const headerCols = splitLine(lines[0]).map((h) => h.toLowerCase().trim());
    const iType    = 0;
    const iProduct = 1;
    const iDate    = 2;
    const iDesc    = headerCols.indexOf("description");
    const iAmt     = headerCols.findIndex((h) => h === "amount" || h.startsWith("amount "));
    if (iDesc === -1 || iAmt === -1) return txs; // unrecognised layout
    const SKIP_TYPES = new Set(["topup","reward","interest","card refund","refund","exchange","atm","transfer"]);
    lines.slice(1).forEach((line, i) => {
      const cols = splitLine(line);
      if (cols.length <= Math.max(iDesc, iAmt)) return;
      const type    = cols[iType].toLowerCase().trim();
      const product = cols[iProduct].toLowerCase().trim();
      const dateRaw = cols[iDate].trim();
      const desc    = cols[iDesc].trim();
      const amt     = parseFloat(cols[iAmt]?.replace(/,/g, ""));
      if (product !== "current") return;
      if (isNaN(amt) || amt >= 0) return;
      if (SKIP_TYPES.has(type)) return;
      const amount = Math.abs(amt);
      if (desc && amount > 0)
        txs.push({ id: `tx_${i}`, date: dateRaw.split(" ")[0], description: desc, amount });
    });
    // Only short-circuit if we actually parsed transactions. Otherwise, fall through
    // to the generic parsers below (some exports vary by locale/column naming).
    if (txs.length) return txs;
  }

  // ── All other formats (AIB/BOI, Revolut Business, generic) ──────────────────
  lines.slice(1).forEach((line, i) => {
    const cols = splitLine(line);
    if (cols.length < 2) return;
    let date = "", desc = "", amount = 0;
    if (header.includes("debit") && header.includes("credit")) {
      // AIB / Bank of Ireland: Date, Description, Debit, Credit, Balance
      date = cols[0]; desc = cols[1];
      const deb = parseFloat(cols[2]?.replace(/,/g, ""));
      if (!isNaN(deb) && deb > 0) amount = deb;
    } else if (header.includes("amount") && (header.includes("currency") || header.includes("type"))) {
      // Revolut Business CSV: Date, Description, Amount, Currency …
      date = cols[0]; desc = cols[1];
      const amt = parseFloat(cols[2]?.replace(/,/g, ""));
      if (!isNaN(amt) && amt < 0) amount = Math.abs(amt);
    } else {
      // Generic: first col = date, second = description, last numeric col = amount
      date = cols[0]; desc = cols[1];
      for (let c = cols.length - 1; c >= 2; c--) {
        const n = parseFloat(cols[c]?.replace(/,/g, ""));
        if (!isNaN(n)) { amount = Math.abs(n); break; }
      }
    }
    if (desc && amount > 0) txs.push({ id: `tx_${i}`, date, description: desc, amount });
  });
  return txs;
}

// ── PDF text extraction — cluster items into rows by proximity ────────────────
// Rather than rounding to a fixed grid (which splits rows when items are offset
// by even 1–2pt), we sort all items by Y and cluster them greedily: a new row
// starts only when the vertical gap exceeds TOLERANCE points.
async function extractPDFLines(file, tolerance = 6) {
  const PDFJS = await loadPDFJS();
  const buffer = await file.arrayBuffer();
  const pdf = await PDFJS.getDocument({ data: buffer }).promise;
  const allItems = []; // { x, y, text, page }

  for (let p = 1; p <= pdf.numPages; p++) {
    const page  = await pdf.getPage(p);
    const { items } = await page.getTextContent();
    // PDF Y-axis is bottom-up; convert to top-down by using negative Y for sort
    items.forEach((item) => {
      const x = item.transform[4];
      const y = item.transform[5]; // raw bottom-up coordinate
      if (item.str.trim()) allItems.push({ x, y, text: item.str, page: p });
    });
  }

  if (!allItems.length) return [];

  // Sort page-first, then top-to-bottom (descending Y within a page)
  allItems.sort((a, b) => a.page !== b.page ? a.page - b.page : b.y - a.y);

  // Cluster into rows
  const rows = [];
  let currentRow = [allItems[0]];
  let currentY   = allItems[0].y;

  for (let i = 1; i < allItems.length; i++) {
    const item = allItems[i];
    const samePage = item.page === currentRow[0].page;
    if (samePage && Math.abs(item.y - currentY) <= tolerance) {
      currentRow.push(item);
    } else {
      rows.push(currentRow);
      currentRow = [item];
      currentY   = item.y;
    }
  }
  rows.push(currentRow);

  // Sort items within each row left-to-right, join into a string
  return rows
    .map((row) => row.sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").trim())
    .filter(Boolean);
}

// ── Parse transactions from extracted PDF lines ───────────────────────────────
function parseTextTransactions(lines) {
  const txs = [];

  // Date formats:
  //   DD/MM/YYYY  DD/MM/YY  DD-MM-YYYY  DD.MM.YYYY
  //   DD Mon YYYY  DD Mon YY
  //   Mon DD, YYYY  (e.g. "Jan 1, 2026" — N26 / Revolut style)
  const dateRe = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{2,4})\b/i;

  // Signed amount: captures optional leading minus, optional €, digits, 2dp, optional DR/CR
  // e.g.  -€10.00   €501.49   1,234.56 DR   €1,000.00
  const amtRe = /(-)?€?\s*(\d{1,3}(?:,\d{3})*\.\d{2})\s*(DR|CR)?/gi;

  // Skip purely structural header/footer lines
  const skipRe = /^\s*(sort\s*code|iban|bic\s|account\s*no|account\s*number|page\s+\d|statement\s+date|balance\s+brought|balance\s+carried|opening\s+balance|closing\s+balance|date\s+details|date\s+description|date\s+particulars|money\s+in|generated\s+on|custom\s+statement|transaction\s+statement|current\s+account)/i;

  const getAmounts = (str) => {
    const found = [];
    let m;
    amtRe.lastIndex = 0;
    while ((m = amtRe.exec(str)) !== null) {
      const negative = m[1] === "-";
      const val = parseFloat(m[2].replace(/,/g, ""));
      const tag = (m[3] || "").toUpperCase();
      if (val > 0 && val < 1_000_000)
        found.push({ val, negative, isDR: tag === "DR" || negative, isCR: tag === "CR" || (!negative && !tag), idx: m.index });
    }
    return found;
  };

  // Pick the debit (money out) amount from a list of amounts on the line
  const pickDebit = (amounts) => {
    if (!amounts.length) return null;
    // Prefer an explicitly negative or DR-tagged amount
    const explicit = amounts.find((a) => a.isDR || a.negative);
    if (explicit) return explicit;
    // 3-column layout (debit | credit | balance): first column = debit if non-zero
    if (amounts.length >= 3) return amounts[0].val > 0 ? amounts[0] : null;
    // 2-column (debit | balance): first column
    if (amounts.length === 2) return amounts[0];
    return amounts[0];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length < 5 || skipRe.test(line)) continue;

    const dateMatch = line.match(dateRe);
    if (!dateMatch) continue;

    const dateStr = dateMatch[0];
    const dateEnd = dateMatch.index + dateStr.length;
    let amounts = getAmounts(line);

    // Lookahead: amount may be on the next line
    let combinedLine = line;
    if (!amounts.length && i + 1 < lines.length && !lines[i + 1].match(dateRe)) {
      combinedLine = line + " " + lines[i + 1];
      amounts = getAmounts(combinedLine);
    }
    if (!amounts.length) continue;

    // Description: text between date end and first amount
    const firstAmtIdx = amounts[0].idx;
    let desc = combinedLine
      .slice(dateEnd, firstAmtIdx > dateEnd ? firstAmtIdx : combinedLine.length)
      .replace(/[|:]/g, " ").replace(/\s+/g, " ").trim();

    // Strip trailing category words that N26/Revolut append before the amount
    // e.g. "Oriental Express Merchant" → "Oriental Express"
    desc = desc.replace(/\s+(Merchant|Refund|Top\s*up|Others?|Transfers?|ATM|Fees?|Subscription)\s*$/i, "").trim();

    // Fallback: use text after all amounts if desc is empty
    if (!desc) {
      desc = combinedLine.replace(dateRe, "").replace(/(-)?€?\s*\d{1,3}(?:,\d{3})*\.\d{2}\s*(DR|CR)?/gi, "").replace(/\s+/g, " ").trim();
    }

    const chosen = pickDebit(amounts);
    if (!chosen || !desc || desc.length < 2) continue;

    txs.push({ id: `tx_pdf_${i}`, date: dateStr, description: desc.substring(0, 80), amount: chosen.val });
  }
  return txs;
}

// ── Unified file ingestion ────────────────────────────────────────────────────
async function ingestFile(file) {
  const isPDF = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  if (isPDF) {
    const lines = await extractPDFLines(file);
    const txs   = parseTextTransactions(lines);
    return { txs, source: "pdf", rawLines: lines }; // expose rawLines for diagnostics
  }
  return { txs: parseCSV(await file.text()), source: "csv", rawLines: [] };
}

// ── Tax estimate ──────────────────────────────────────────────────────────────
const taxSaving = (total) => ({ at20: (total * 0.2).toFixed(2), at40: (total * 0.4).toFixed(2) });

// ── Print-based PDF export (100% offline) ─────────────────────────────────────
function printReport(included, totalDeductible, notes = {}) {
  const { at20, at40 } = taxSaving(totalDeductible);
  const date = new Date().toLocaleDateString("en-IE", { day: "numeric", month: "long", year: "numeric" });
  const rows = included.map((t, i) => `
    <tr style="background:${i % 2 === 0 ? "#f9fafb" : "#fff"}">
      <td style="padding:5px 7px;border-bottom:1px solid #e5e7eb;font-size:8.5pt;color:#374151">${t.date ?? ""}</td>
      <td style="padding:5px 7px;border-bottom:1px solid #e5e7eb;font-size:8.5pt;color:#111">
        ${(t.description ?? "").substring(0,44)}
        ${t.amountNote ? `<div style="font-size:7pt;color:#b45309;margin-top:2px">${t.amountNote}</div>` : ""}
        ${notes[t.id] ? `<div style="font-size:7pt;color:#4b5563;font-style:italic;margin-top:2px">${notes[t.id]}</div>` : ""}
      </td>
      <td style="padding:5px 7px;border-bottom:1px solid #e5e7eb;font-size:8.5pt;color:#374151">${t.category}</td>
      <td style="padding:5px 7px;border-bottom:1px solid #e5e7eb;font-size:8.5pt;text-align:center;font-weight:600;color:${t.probability>=0.8?"#059669":t.probability>=0.5?"#d97706":"#dc2626"}">${Math.round(t.probability*100)}%</td>
      <td style="padding:5px 7px;border-bottom:1px solid #e5e7eb;font-size:8.5pt;text-align:right;font-weight:600">€${t.amount.toFixed(2)}</td>
    </tr>`).join("");

  document.getElementById("ts-print-area").innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px">
      <div>
        <div style="font-size:20pt;font-weight:800;letter-spacing:-0.02em">Tax<span style="color:#059669">Sweep</span></div>
        <div style="font-size:8.5pt;color:#6b7280;margin-top:2px">Irish Sole Trader · Deductible Expenses Report · ${date}</div>
      </div>
      <div style="font-size:7.5pt;color:#9ca3af;text-align:right;max-width:180px;line-height:1.5">Rule-based classifier<br>Irish Revenue Commissioners</div>
    </div>
    <div style="background:#f0fdf4;border:1.5px solid #6ee7b7;border-radius:7px;padding:12px 16px;margin-bottom:12px">
      <div style="font-size:12pt;font-weight:700;color:#065f46;margin-bottom:3px">Total deductible: €${totalDeductible.toFixed(2)}</div>
      <div style="font-size:8.5pt;color:#374151">Estimated saving · Standard rate 20%: <strong>€${at20}</strong> &nbsp;&nbsp; Higher rate 40%: <strong>€${at40}</strong></div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:5px;padding:7px 12px;margin-bottom:16px;font-size:7.5pt;color:#92400e">
      ⚠ Estimates are income tax only — USC and PRSI excluded. Consult a qualified Irish accountant before filing.
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:18px">
      <thead><tr style="background:#111827">
        <th style="padding:6px 7px;text-align:left;font-size:7.5pt;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Date</th>
        <th style="padding:6px 7px;text-align:left;font-size:7.5pt;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Description</th>
        <th style="padding:6px 7px;text-align:left;font-size:7.5pt;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Category</th>
        <th style="padding:6px 7px;text-align:center;font-size:7.5pt;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Conf.</th>
        <th style="padding:6px 7px;text-align:right;font-size:7.5pt;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.06em">Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr style="background:#059669">
        <td colspan="4" style="padding:7px;font-weight:700;font-size:9.5pt;color:#fff">TOTAL DEDUCTIBLE</td>
        <td style="padding:7px;font-weight:700;font-size:9.5pt;color:#fff;text-align:right">€${totalDeductible.toFixed(2)}</td>
      </tr></tfoot>
    </table>
    <div style="font-size:7pt;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:8px">
      Generated by TaxSweep · ${included.length} transactions · Revenue rules: s81 TCA 1997, s840 TCA 1997, s284 TCA 1997 · This report is not tax advice.
    </div>`;
  window.print();
}

// ── Sub-components ────────────────────────────────────────────────────────────
function Pill({ children, color }) {
  return <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 100, background: `${color}18`, color, border: `1px solid ${color}38`, fontFamily: C.body, letterSpacing: ".03em", whiteSpace: "nowrap" }}>{children}</span>;
}
function StatCard({ label, value, accent }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: ".09em", fontWeight: 600, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: C.mono, fontSize: 19, fontWeight: 600, color: accent }}>{value}</div>
    </div>
  );
}
function ActionBtn({ color, onClick, title, children }) {
  return (
    <button className="ts-btn-action" onClick={onClick} title={title}
      style={{ width: 62, height: 62, borderRadius: "50%", background: `${color}12`, border: `2px solid ${color}35`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color, outline: "none" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.borderColor = color; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}35`; }}>
      {children}
    </button>
  );
}
function ExportBtn({ onClick, icon, label, primary }) {
  return (
    <button className="ts-export-btn" onClick={onClick}
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "13px 20px", borderRadius: 12, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: C.body, background: primary ? C.green : C.surfaceAlt, color: primary ? "#fff" : C.sub, border: primary ? "none" : `1px solid ${C.border}` }}>
      {icon} {label}
    </button>
  );
}
function ViewToggle({ mode, onChange }) {
  return (
    <div style={{ position: "fixed", top: 14, right: 14, zIndex: 100, display: "flex", background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3, gap: 2, boxShadow: "0 2px 8px rgba(0,0,0,.08)" }}>
      {[{ key: "mobile", Icon: Smartphone, label: "Mobile" }, { key: "desktop", Icon: Monitor, label: "Desktop" }].map(({ key, Icon, label }) => (
        <button key={key} onClick={() => onChange(key)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 11px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none", fontFamily: C.body, background: key === mode ? C.green : "transparent", color: key === mode ? "#fff" : C.muted, transition: "background .15s, color .15s" }}>
          <Icon size={13} />{label}
        </button>
      ))}
    </div>
  );
}
function ReviewStyleToggle({ style, onChange }) {
  return (
    <div style={{ display: "flex", background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3, gap: 2 }}>
      {[{ key: "swipe", Icon: CreditCard, label: "Cards" }, { key: "list", Icon: List, label: "List" }].map(({ key, Icon, label }) => (
        <button key={key} onClick={() => onChange(key)}
          style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer", border: "none", fontFamily: C.body, background: key === style ? C.green : "transparent", color: key === style ? "#fff" : C.muted, transition: "background .15s, color .15s" }}>
          <Icon size={13} />{label}
        </button>
      ))}
    </div>
  );
}
function ReceiptButton({ txId, hasReceipt, receiptUrl, onLoad, onUpload, onDelete, compact = false }) {
  const fileRef = useRef(null);
  useEffect(() => {
    if (hasReceipt && !receiptUrl) {
      dbLoadReceipt(txId).then((blob) => { if (blob) onLoad(txId, URL.createObjectURL(blob)); });
    }
  }, [hasReceipt, txId]);
  const handleChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const blob = await compressToBlob(file);
    await dbSaveReceipt(txId, blob);
    onUpload(txId, URL.createObjectURL(blob));
    e.target.value = "";
  };
  if (hasReceipt && receiptUrl) return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <img src={receiptUrl} alt="receipt" onClick={() => window.open(receiptUrl)}
        style={{ width: compact ? 28 : 40, height: compact ? 28 : 40, objectFit: "cover", borderRadius: 6, cursor: "pointer", border: `2px solid ${C.green}50` }} />
      <button onClick={() => onDelete(txId)}
        style={{ position: "absolute", top: -5, right: -5, width: 16, height: 16, borderRadius: "50%", background: C.red, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
        <Trash2 size={8} color="#fff" />
      </button>
    </div>
  );
  if (hasReceipt && !receiptUrl) return (
    <div style={{ width: compact ? 28 : 40, height: compact ? 28 : 40, borderRadius: 6, background: C.surfaceAlt, border: `1px solid ${C.border}`, animation: "ts-pulse 1.5s ease infinite", flexShrink: 0 }} />
  );
  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={handleChange} />
      <button onClick={() => fileRef.current?.click()} title="Attach receipt"
        style={{ display: "flex", alignItems: "center", gap: 4, padding: compact ? "3px 7px" : "5px 10px", borderRadius: 6, background: C.surfaceAlt, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: C.body, fontWeight: 500, flexShrink: 0 }}>
        <Camera size={compact ? 11 : 13} />{!compact && "Receipt"}
      </button>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MAIN APP ──────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════
export default function TaxSweep() {
  const [stage, setStage] = useState("upload");
  const [transactions, setTransactions] = useState([]);
  const [analyzed, setAnalyzed] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [decisions, setDecisions] = useState({});
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragX, setDragX] = useState(0);
  const [animDir, setAnimDir] = useState(null);
  const [viewMode, setViewMode] = useState("mobile");
  const [learnDB, setLearnDB]           = useState(() => loadLearning());
  const [receiptKeys, setReceiptKeys]   = useState(new Set());
  const [receiptUrls, setReceiptUrls]   = useState({});
  const [reviewStyle, setReviewStyle]   = useState("swipe");
  const [listFilter, setListFilter]     = useState("all");
  const [resultsTab, setResultsTab]     = useState("list");
  const [notes, setNotes]               = useState({});  // txId → string
  const [incomeEntries, setIncomeEntries] = useState([]);
  const [mileageLog, setMileageLog]       = useState([]);
  const [mileageRate, setMileageRate]     = useState(0.45);
  const [subscriptionIds, setSubscriptionIds] = useState(new Set());
  const [showAddCash, setShowAddCash]     = useState(false);
  const [cashForm, setCashForm]           = useState({ date: new Date().toISOString().split("T")[0], description: "", amount: "" });
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [incomeForm, setIncomeForm]       = useState({ date: new Date().toISOString().split("T")[0], description: "", amount: "", client: "" });
  const [showAddMileage, setShowAddMileage] = useState(false);
  const [mileageForm, setMileageForm]     = useState({ date: new Date().toISOString().split("T")[0], from: "", to: "", km: "", purpose: "" });
  const dragStartX = useRef(null);
  const mccEnricherRef = useRef(null);

  // ── Session persistence ─────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved?.analyzed?.length) {
        setTransactions(saved.transactions ?? []);
        setAnalyzed(saved.analyzed);
        setCurrentIdx(saved.currentIdx ?? 0);
        setDecisions(saved.decisions ?? {});
        setNotes(saved.notes ?? {});
        setIncomeEntries(saved.incomeEntries ?? []);
        setMileageLog(saved.mileageLog ?? []);
        if (saved.mileageRate) setMileageRate(saved.mileageRate);
        setSubscriptionIds(detectSubscriptions(saved.analyzed ?? []));
        setStage(saved.stage === "processing" ? "upload" : saved.stage);
      }
    } catch { /* ignore corrupt data */ }
  }, []);

  useEffect(() => {
    if (!analyzed.length) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ stage, transactions, analyzed, currentIdx, decisions, notes, incomeEntries, mileageLog, mileageRate }));
  }, [stage, transactions, analyzed, currentIdx, decisions, notes, incomeEntries, mileageLog, mileageRate]);

  useEffect(() => {
    if (stage === "swipe" && analyzed.length && currentIdx >= analyzed.length) setStage("results");
  }, [currentIdx, analyzed.length, stage]);

  // ── Drag physics ────────────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!dragging || dragStartX.current === null) return;
      setDragX((e.touches ? e.touches[0].clientX : e.clientX) - dragStartX.current);
    };
    const onUp = () => {
      if (!dragging) return;
      const c = analyzed[currentIdx];
      if (c) {
        if (dragX > 80) triggerDecide(c.id, "include");
        else if (dragX < -80) triggerDecide(c.id, "exclude");
        else setDragX(0);
      } else setDragX(0);
      setDragging(false); dragStartX.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove); window.removeEventListener("touchend", onUp);
    };
  }, [dragging, dragX, currentIdx, analyzed]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e) => {
      if (stage !== "swipe") return;
      const c = analyzed[currentIdx];
      if (!c) return;
      if (e.key === "ArrowRight") triggerDecide(c.id, "include");
      else if (e.key === "ArrowLeft") triggerDecide(c.id, "exclude");
      else if (e.key === " " || e.key === "ArrowDown") { e.preventDefault(); triggerDecide(c.id, "skip"); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stage, currentIdx, analyzed]);

  // ── Learning persistence + receipt key loading ───────────────────────────────
  useEffect(() => {
    localStorage.setItem(LEARN_KEY, JSON.stringify(learnDB));
  }, [learnDB]);

  useEffect(() => {
    if (!analyzed.length) return;
    dbGetAllReceiptKeys().then(setReceiptKeys);
  }, [analyzed]);

  const triggerDecide = (id, action) => {
    const tx = analyzed.find((t) => t.id === id);
    if (tx && (action === "include" || action === "exclude"))
      setLearnDB((prev) => recordLearnDecision(tx.description, action, prev));
    setAnimDir(action === "include" ? "right" : "left");
    setDragX(0); setDragging(false);
    setTimeout(() => { setDecisions((p) => ({ ...p, [id]: action })); setAnimDir(null); setCurrentIdx((p) => p + 1); }, 340);
  };

  const listDecide = (id, action) => {
    const tx = analyzed.find((t) => t.id === id);
    if (tx && (action === "include" || action === "exclude"))
      setLearnDB((prev) => recordLearnDecision(tx.description, action, prev));
    setDecisions((p) => ({ ...p, [id]: action }));
  };

  const handleReceiptUpload = (txId, url) => {
    setReceiptKeys((prev) => new Set([...prev, txId]));
    setReceiptUrls((prev) => ({ ...prev, [txId]: url }));
  };
  const handleReceiptDelete = async (txId) => {
    await dbDeleteReceipt(txId);
    if (receiptUrls[txId]) URL.revokeObjectURL(receiptUrls[txId]);
    setReceiptKeys((prev) => { const n = new Set(prev); n.delete(txId); return n; });
    setReceiptUrls((prev) => { const n = { ...prev }; delete n[txId]; return n; });
  };
  const handleReceiptLoad = (txId, url) => setReceiptUrls((prev) => ({ ...prev, [txId]: url }));

  const handleAddCashTransaction = () => {
    const amt = parseFloat(cashForm.amount);
    if (!cashForm.description.trim() || isNaN(amt) || amt <= 0) return;
    const id = `cash_${Date.now()}`;
    const tx = { id, date: cashForm.date, description: cashForm.description.trim(), amount: amt };
    const classified = classifyTransaction(tx);
    const merged = { ...tx, ...classified };
    setTransactions((p) => [...p, tx]);
    setAnalyzed((p) => {
      const updated = [...p, merged];
      setSubscriptionIds(detectSubscriptions(updated));
      return updated;
    });
    setCashForm({ date: new Date().toISOString().split("T")[0], description: "", amount: "" });
    setShowAddCash(false);
    if (stage === "upload") setStage("swipe");
  };

  const syncToFirstPending = () => {
    const first = analyzed.findIndex((t) => !decisions[t.id]);
    setCurrentIdx(first === -1 ? analyzed.length : first);
  };

  const resetSession = () => {
    localStorage.removeItem(STORAGE_KEY);
    setStage("upload"); setTransactions([]); setAnalyzed([]);
    setCurrentIdx(0); setDecisions({}); setNotes({}); setError(null);
    setReviewStyle("swipe"); setListFilter("all"); setResultsTab("list");
    setIncomeEntries([]); setMileageLog([]); setMileageRate(0.45);
    setSubscriptionIds(new Set()); setShowAddCash(false);
    Object.values(receiptUrls).forEach((url) => URL.revokeObjectURL(url));
    setReceiptUrls({});
  };

  const [debugLines, setDebugLines] = useState([]);

  const handleFile = async (file) => {
    if (!file) return;
    setError(null); setDebugLines([]);
    try {
      const { txs, source, rawLines } = await ingestFile(file);
      if (!txs.length) {
        if (source === "pdf" && rawLines.length) {
          // Show the first 40 extracted lines so the user/dev can diagnose layout
          setDebugLines(rawLines.slice(0, 40));
          throw new Error(
            `PDF was read successfully (${rawLines.length} text rows extracted) but no transactions could be parsed from it. ` +
            `This usually means the layout uses an unusual column order or date format. ` +
            `The raw extracted text is shown below — try exporting a CSV from your banking app as a reliable alternative.`
          );
        }
        throw new Error(
          source === "pdf"
            ? "No text could be extracted. The PDF may be a scanned image rather than a machine-readable document. Please export a CSV from your banking app instead."
            : "No transactions found. Check your CSV has date, description, and debit/amount columns."
        );
      }
      setTransactions(txs);
      setStage("processing");

      // MCC enrichment (offline, based on mccing.csv + fuzzy matching)
      if (!mccEnricherRef.current) {
        // Create once per session. This fetches a local asset URL (bundled by Vite).
        mccEnricherRef.current = await createMccEnricher();
      }
      const enrichedTxs = mccEnricherRef.current.enrichAll(txs);

      const results = classifyAll(enrichedTxs);
      const rmap = Object.fromEntries(results.map((r) => [r.id, r]));
      const merged = enrichedTxs.map((t) => ({ ...t, ...(rmap[t.id] ?? { category: "Uncategorized", probability: 0.38, basis: "", note: "" }) }));
      setAnalyzed(merged); setSubscriptionIds(detectSubscriptions(merged));
      setCurrentIdx(0); setDecisions({}); setStage("swipe");
    } catch (e) {
      setError(e.message ?? "Something went wrong. Please try again.");
      setStage("upload");
    }
  };

  // ── Derived ─────────────────────────────────────────────────────────────────
  const included = Object.entries(decisions).filter(([, v]) => v === "include")
    .map(([id]) => analyzed.find((t) => t.id === id)).filter(Boolean);
  const totalDeductible = included.reduce((s, t) => s + t.amount, 0);
  const { at20, at40 } = taxSaving(totalDeductible);
  const currentCard = analyzed[currentIdx];
  const progress = analyzed.length ? (currentIdx / analyzed.length) * 100 : 0;
  const showGreen = (dragging && dragX > 30) || animDir === "right";
  const showRed   = (dragging && dragX < -30) || animDir === "left";
  const effectX   = animDir === "right" ? 420 : animDir === "left" ? -420 : dragging ? dragX : 0;
  const cardStyle = { transform: effectX !== 0 ? `translateX(${effectX}px) rotate(${effectX * 0.045}deg)` : "none", opacity: animDir ? 0 : 1 };

  const exportCSV = () => {
    const rows = [["Date","Description","Amount (€)","Category","Confidence (%)","Revenue Basis","Note"]];
    included.forEach((t) => rows.push([t.date, t.description, t.amount.toFixed(2), t.category, Math.round(t.probability * 100), t.basis, notes[t.id] ?? ""]));
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "taxsweep_deductibles.csv"; a.click();
  };

  // ── Shared print area (must be in DOM for all stages) ──────────────────────
  const PrintArea = () => <div id="ts-print-area" style={{ display: "none" }} />;

  // ══════════════════════════════════════════════════════════════════════════
  if (stage === "lab") return (
    <CategorizerLab
      viewMode={viewMode}
      onBack={() => setStage("upload")}
    />
  );

  // ══════════════════════════════════════════════════════════════════════════
  if (stage === "upload") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.body, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px 24px" }}>
      <PrintArea />
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      <div className="ts-fade-up" style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontFamily: C.display, fontSize: 40, fontWeight: 700, color: C.text, letterSpacing: "-.02em", lineHeight: 1 }}>
          Tax<span style={{ color: C.green }}>Sweep</span>
        </div>
        <div style={{ marginTop: 8, color: C.muted, fontSize: 14 }}>Sole trader expense analyser &nbsp;·&nbsp; Ireland 🇮🇪</div>
        <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: `${C.green}12`, border: `1px solid ${C.green}28`, borderRadius: 100, padding: "5px 14px" }}>
          <Zap size={12} color={C.green} />
          <span style={{ fontSize: 11, color: C.green, fontWeight: 600, letterSpacing: ".05em" }}>WORKS FULLY OFFLINE</span>
        </div>
      </div>

      <div className="ts-fade-up" style={{ width: "100%", maxWidth: viewMode === "desktop" ? 860 : 480 }}>
        {error && (
          <div style={{ background: "rgba(220,38,38,.07)", border: `1px solid rgba(220,38,38,.2)`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={15} color={C.red} style={{ marginTop: 2, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: C.red, lineHeight: 1.55 }}>{error}</span>
          </div>
        )}

        {debugLines.length > 0 && (
          <div style={{ background: C.surface, border: `1px solid ${C.amber}40`, borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: C.amber, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
              🔍 Raw text extracted from PDF (first {debugLines.length} rows)
            </p>
            <div style={{ fontFamily: C.mono, fontSize: 10.5, color: C.sub, lineHeight: 1.7, maxHeight: 220, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {debugLines.map((l, i) => (
                <div key={i} style={{ borderBottom: `1px solid ${C.border}`, padding: "2px 0" }}>
                  <span style={{ color: C.muted, marginRight: 8, userSelect: "none" }}>{String(i+1).padStart(2,"0")}</span>{l}
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ display: viewMode === "desktop" ? "grid" : "block", gridTemplateColumns: "1fr 280px", gap: 20, alignItems: "flex-start" }}>
          <div className={`ts-drop ${dragOver ? "over" : ""}`}
            style={{ borderRadius: 20, padding: "52px 32px", textAlign: "center", cursor: "pointer", background: C.surface, position: "relative" }}
            onClick={() => document.getElementById("ts-file-input").click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: C.greenDim, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
              <Upload size={26} color={C.green} />
            </div>
            <p style={{ fontFamily: C.display, fontSize: 22, fontWeight: 600, marginBottom: 8, color: C.text }}>Drop your bank statement</p>
            <p style={{ color: C.muted, fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>PDF or CSV &nbsp;·&nbsp; AIB, Bank of Ireland, Revolut Business, N26</p>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.green, color: "#fff", fontWeight: 600, fontSize: 14, padding: "11px 26px", borderRadius: 100 }}>
              <FileText size={15} /> Browse file
            </div>
            <input id="ts-file-input" type="file" accept=".csv,.txt,.pdf" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) handleFile(e.target.files[0]); }} />
          </div>

          <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
            <button
              onClick={() => setStage("lab")}
              style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 14px", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: C.body, fontWeight: 650, display: "inline-flex", gap: 8, alignItems: "center" }}
              title="Test categorisation without uploading a file"
            >
              <Sparkles size={14} /> Test categorizer
            </button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: viewMode === "desktop" ? 0 : 14 }}>
            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 18px" }}>
              <p style={{ fontSize: 12, color: C.muted, marginBottom: 7, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em" }}>Supported formats</p>
              <p style={{ fontSize: 12, color: C.sub, lineHeight: 1.75 }}>
                <strong style={{ color: C.text }}>PDF statements</strong> — AIB, BOI, Revolut, N26 (text-based, not scanned)<br />
                <strong style={{ color: C.text }}>CSV — Revolut Personal:</strong> Type, Product, Started Date, Description, Amount<br />
                <strong style={{ color: C.text }}>CSV — AIB / BOI:</strong> Date, Description, Debit, Credit, Balance<br />
                <strong style={{ color: C.text }}>CSV — Revolut Business:</strong> Date, Description, Amount, Currency<br />
                <strong style={{ color: C.text }}>CSV — Generic:</strong> Any CSV with date, description and amount columns
              </p>
            </div>

            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 18px" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 5, display: "flex", alignItems: "center", gap: 7 }}>
                <Zap size={13} color={C.green} /> Rule-based offline classifier
              </p>
              <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>
                Classification runs entirely in your browser using Irish Revenue rules (s81, s840, s284 TCA 1997). No AI API, no data leaves your device, and it works without internet. PDF parsing needs a one-time connection to load PDF.js.
              </p>
            </div>

            <div style={{ background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>🏦 Connect via Open Banking (PSD2)</p>
                <p style={{ fontSize: 12, color: C.muted }}>Direct connection to AIB, BOI, Revolut — requires CBI authorisation</p>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 100, background: `${C.amber}18`, color: C.amber, border: `1px solid ${C.amber}30`, whiteSpace: "nowrap" }}>Coming soon</span>
            </div>
          </div>
        </div>

        {/* Cash / manual transaction entry */}
        <div style={{ marginTop: 14, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 2 }}>💰 Have cash receipts?</p>
            <p style={{ fontSize: 12, color: C.muted }}>Paid in cash or outside your bank account? Add those expenses manually — no file needed.</p>
          </div>
          <button onClick={() => setShowAddCash((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, background: C.green, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: C.body, whiteSpace: "nowrap" }}>
            <Plus size={13} /> Add manually
          </button>
        </div>
        {showAddCash && (
          <div style={{ background: C.surface, border: `1px solid ${C.green}40`, borderRadius: 12, padding: "18px 20px", marginTop: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 14 }}>New cash / manual expense</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Date</label>
                <input type="date" value={cashForm.date} onChange={(e) => setCashForm((p) => ({ ...p, date: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, fontFamily: C.body, color: C.text, background: C.surfaceAlt, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Description</label>
                <input type="text" placeholder="e.g. Printer paper from Staples" value={cashForm.description}
                  onChange={(e) => setCashForm((p) => ({ ...p, description: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, fontFamily: C.body, color: C.text, background: C.surfaceAlt, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.muted, display: "block", marginBottom: 4 }}>Amount (€)</label>
                <input type="number" placeholder="0.00" min="0" step="0.01" value={cashForm.amount}
                  onChange={(e) => setCashForm((p) => ({ ...p, amount: e.target.value }))}
                  style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 13, fontFamily: C.mono, color: C.text, background: C.surfaceAlt, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowAddCash(false)}
                style={{ padding: "7px 14px", borderRadius: 7, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: C.body }}>
                Cancel
              </button>
              <button onClick={handleAddCashTransaction}
                style={{ padding: "7px 16px", borderRadius: 7, background: C.green, color: "#fff", border: "none", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: C.body }}>
                Add & Classify →
              </button>
            </div>
          </div>
        )}

        <p style={{ textAlign: "center", marginTop: 18, fontSize: 11, color: C.muted }}>
          🔒 Everything runs in your browser · No data stored on any server
        </p>
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  if (stage === "processing") return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.body, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28 }}>
      <PrintArea />
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      <div style={{ width: 64, height: 64, border: `3px solid ${C.border}`, borderTopColor: C.green, borderRadius: "50%", animation: "ts-spin 0.8s linear infinite" }} />
      <div style={{ textAlign: "center" }}>
        <p style={{ fontFamily: C.display, fontSize: 26, fontWeight: 600, color: C.text, marginBottom: 8 }}>Classifying {transactions.length} transactions</p>
        <p style={{ color: C.muted, fontSize: 14 }}>Applying Irish Revenue rules · No API calls · Fully offline</p>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {["s81 TCA 1997","Schedule D Case I","s840 Entertainment"].map((t, i) => (
          <span key={t} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 100, background: C.surface, color: C.muted, border: `1px solid ${C.border}`, animation: `ts-pulse 1.6s ease ${i*0.28}s infinite` }}>{t}</span>
        ))}
      </div>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════
  if (stage === "swipe") {
    const nextCard  = analyzed[currentIdx + 1];
    const afterCard = analyzed[currentIdx + 2];
    const includedCount = Object.values(decisions).filter(v => v === "include").length;
    const excludedCount = Object.values(decisions).filter(v => v === "exclude").length;
    const skippedCount  = Object.values(decisions).filter(v => v === "skip").length;
    const learnedSuggestion = currentCard ? getLearnedSuggestion(currentCard.description, learnDB) : null;
    const filteredTxs = analyzed.filter((tx) => {
      if (listFilter === "pending")  return !decisions[tx.id];
      if (listFilter === "included") return decisions[tx.id] === "include";
      if (listFilter === "excluded") return decisions[tx.id] === "exclude";
      return true;
    });
    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.body, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <PrintArea />
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <div style={{ width: "100%", maxWidth: viewMode === "desktop" ? 980 : 460, padding: "28px 20px 40px",
                      display: viewMode === "desktop" ? "grid" : "flex",
                      gridTemplateColumns: viewMode === "desktop" ? "460px 1fr" : undefined,
                      gap: viewMode === "desktop" ? 32 : undefined,
                      flexDirection: "column", alignItems: viewMode === "desktop" ? "flex-start" : "center" }}>

          {/* Card / List column */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
            <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 8, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontFamily: C.display, fontSize: 21, fontWeight: 700, color: C.text }}>Tax<span style={{ color: C.green }}>Sweep</span></div>
                <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                  {reviewStyle === "swipe" ? `${currentIdx}/${analyzed.length} reviewed` : `${Object.keys(decisions).length}/${analyzed.length} decided`}
                </div>
              </div>
              <ReviewStyleToggle style={reviewStyle} onChange={(s) => { if (s === "swipe") syncToFirstPending(); setReviewStyle(s); }} />
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: C.mono, fontSize: 18, color: "#059669", fontWeight: 600 }}>€{totalDeductible.toFixed(0)}</div>
                  <div style={{ fontSize: 11, color: C.muted }}>captured</div>
                </div>
                <button onClick={resetSession} style={{ background: "none", border: `1px solid ${C.border}`, borderRadius: 8, padding: 7, color: C.muted, cursor: "pointer", display: "flex" }}><RefreshCw size={14} /></button>
              </div>
            </div>

            <div style={{ width: "100%", marginBottom: 20 }}>
              <div style={{ height: 3, background: C.surfaceAlt, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${progress}%`, height: "100%", background: C.green, borderRadius: 2, transition: "width .4s ease" }} />
              </div>
            </div>

            {reviewStyle === "swipe" ? (<>
              {/* ── Card stack ── */}
              <div style={{ position: "relative", width: "100%", height: 460, marginBottom: 24 }}>
                {afterCard && <div style={{ position: "absolute", inset: 0, background: C.surface, borderRadius: 22, border: `1px solid ${C.border}`, transform: "scale(.93) translateY(20px)", opacity: .4, zIndex: 1 }} />}
                {nextCard  && <div style={{ position: "absolute", inset: 0, background: C.surface, borderRadius: 22, border: `1px solid ${C.border}`, transform: "scale(.96) translateY(10px)", opacity: .7, zIndex: 2 }} />}
                {currentCard && (
                  <div className={`ts-card ${animDir ? "ts-card-animate" : ""}`}
                    style={{ position: "absolute", inset: 0, zIndex: 10, background: C.surface, borderRadius: 22, border: `1px solid ${C.border}`, padding: "20px 20px", boxShadow: dragging ? "0 16px 48px rgba(0,0,0,.14)" : "0 4px 20px rgba(0,0,0,.08)", ...cardStyle, overflowY: "auto" }}
                    onMouseDown={(e) => { dragStartX.current = e.clientX; setDragging(true); setDragX(0); }}
                    onTouchStart={(e) => { dragStartX.current = e.touches[0].clientX; setDragging(true); setDragX(0); }}>
                    {showGreen && (
                      <div style={{ position: "absolute", inset: 0, borderRadius: 22, background: "rgba(37,99,235,.07)", border: `2px solid ${C.green}`, zIndex: 20, pointerEvents: "none", display: "flex", alignItems: "center", padding: 24 }}>
                        <span style={{ fontFamily: C.display, fontSize: 28, color: C.green, fontWeight: 700, opacity: Math.min(Math.abs(dragX)/80,1), transform: "rotate(-10deg)", display: "block" }}>✓ INCLUDE</span>
                      </div>
                    )}
                    {showRed && (
                      <div style={{ position: "absolute", inset: 0, borderRadius: 22, background: "rgba(255,71,87,.07)", border: `2px solid ${C.red}`, zIndex: 20, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "flex-end", padding: 24 }}>
                        <span style={{ fontFamily: C.display, fontSize: 28, color: C.red, fontWeight: 700, opacity: Math.min(Math.abs(dragX)/80,1), transform: "rotate(10deg)", display: "block" }}>✗ EXCLUDE</span>
                      </div>
                    )}
                    {/* Category + confidence + learned badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 6, flexWrap: "wrap" }}>
                      <Pill color={catColor(currentCard.category)}>{currentCard.category}</Pill>
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        {learnedSuggestion && (
                          <span style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, background: `${C.green}12`, color: C.green, border: `1px solid ${C.green}35` }}>
                            <Sparkles size={9} />{learnedSuggestion === "include" ? "Usually included" : "Usually excluded"}
                          </span>
                        )}
                        {subscriptionIds.has(currentCard.id) && (
                          <span style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 100, background: `${C.amber}12`, color: C.amber, border: `1px solid ${C.amber}35` }}>
                            ↻ Recurring
                          </span>
                        )}
                        {(() => { const [label, col] = confBadge(currentCard.probability); return <Pill color={col}>{Math.round(currentCard.probability*100)}% {label}</Pill>; })()}
                      </div>
                    </div>
                    <div style={{ fontFamily: C.mono, fontSize: 40, fontWeight: 600, color: C.text, lineHeight: 1, marginBottom: 8 }}>€{currentCard.amount.toFixed(2)}</div>
                    <div style={{ fontSize: 16, fontWeight: 500, color: C.text, marginBottom: 3, lineHeight: 1.3 }}>{currentCard.description}</div>
                    <div style={{ fontSize: 12, color: C.muted, marginBottom: 16 }}>{currentCard.date}</div>
                    <div style={{ height: 1, background: C.border, marginBottom: 12 }} />
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted, fontWeight: 600, marginBottom: 4 }}>Revenue Basis</div>
                      <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>{currentCard.basis || "—"}</div>
                    </div>
                    {currentCard.note && (
                      <div style={{ fontSize: 12, color: C.sub, background: C.surfaceAlt, padding: "8px 12px", borderRadius: 9, lineHeight: 1.55, borderLeft: `3px solid ${C.green}50`, marginBottom: 8 }}>
                        💡 {currentCard.note}
                      </div>
                    )}
                    {currentCard.amountNote && (
                      <div style={{ fontSize: 12, color: C.amber, background: `${C.amber}0d`, padding: "8px 12px", borderRadius: 9, lineHeight: 1.55, borderLeft: `3px solid ${C.amber}`, marginBottom: 8 }}>
                        {currentCard.amountNote}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Receipt + note row — always visible, outside the card */}
              {currentCard && (
                <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "stretch", gap: 8, marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                    <ReceiptButton txId={currentCard.id}
                      hasReceipt={receiptKeys.has(currentCard.id)} receiptUrl={receiptUrls[currentCard.id]}
                      onLoad={handleReceiptLoad} onUpload={handleReceiptUpload} onDelete={handleReceiptDelete} />
                    {receiptKeys.has(currentCard.id) && (
                      <span style={{ fontSize: 11, color: "#059669" }}>Receipt attached</span>
                    )}
                  </div>
                  <textarea
                    value={notes[currentCard.id] ?? ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [currentCard.id]: e.target.value }))}
                    placeholder="Add a note for your records or accountant…"
                    rows={2}
                    style={{ width: "100%", resize: "none", borderRadius: 10, border: `1px solid ${C.border}`, background: C.surface, color: C.text, fontSize: 13, fontFamily: C.body, padding: "8px 12px", outline: "none", lineHeight: 1.5, boxSizing: "border-box" }}
                  />
                </div>
              )}

              <div style={{ fontSize: 12, color: C.muted, textAlign: "center", marginBottom: 16, lineHeight: 1.7 }}>
                ← exclude &nbsp;·&nbsp; include →&nbsp;&nbsp;·&nbsp;&nbsp;keyboard: ← → · space to skip
              </div>
              {currentCard && (
                <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 20 }}>
                  <ActionBtn color={C.red} onClick={() => triggerDecide(currentCard.id, "exclude")} title="Exclude"><X size={22} /></ActionBtn>
                  <button onClick={() => triggerDecide(currentCard.id, "skip")} title="Skip"
                    style={{ width: 44, height: 44, borderRadius: "50%", background: C.surfaceAlt, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: C.muted }}>
                    <SkipForward size={15} />
                  </button>
                  <ActionBtn color={C.green} onClick={() => triggerDecide(currentCard.id, "include")} title="Include"><Check size={22} /></ActionBtn>
                </div>
              )}
              <button onClick={() => setStage("results")} style={{ background: "none", border: "none", color: C.muted, fontSize: 13, cursor: "pointer", textDecoration: "underline", fontFamily: C.body }}>
                Finish & see results →
              </button>
            </>) : (<>
              {/* ── List view ── */}
              <div style={{ width: "100%", display: "flex", gap: 6, marginBottom: 14, flexWrap: "wrap" }}>
                {[
                  { key: "all",      label: "All",      count: analyzed.length },
                  { key: "pending",  label: "Pending",  count: analyzed.filter(t => !decisions[t.id]).length },
                  { key: "included", label: "Included", count: includedCount },
                  { key: "excluded", label: "Excluded", count: excludedCount },
                ].map(({ key, label, count }) => (
                  <button key={key} onClick={() => setListFilter(key)}
                    style={{ padding: "5px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: C.body,
                      border: `1px solid ${listFilter === key ? C.green : C.border}`,
                      background: listFilter === key ? C.green : C.surface,
                      color: listFilter === key ? "#fff" : C.muted }}>
                    {label} <span style={{ opacity: 0.65, fontWeight: 400 }}>{count}</span>
                  </button>
                ))}
              </div>
              <div style={{ width: "100%", background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 16 }}>
                {filteredTxs.length === 0 ? (
                  <p style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "32px 0" }}>No transactions in this filter.</p>
                ) : filteredTxs.map((tx, i) => {
                  const dec = decisions[tx.id];
                  const [, confCol] = confBadge(tx.probability);
                  const learned = getLearnedSuggestion(tx.description, learnDB);
                  return (
                    <div key={tx.id} style={{ padding: "12px 16px", borderBottom: i < filteredTxs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6, gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{tx.description}</span>
                            {learned && (
                              <span style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 100, background: `${C.green}12`, color: C.green, border: `1px solid ${C.green}30` }}>
                                <Sparkles size={8} /> Remembered
                              </span>
                            )}
                            {subscriptionIds.has(tx.id) && (
                              <span style={{ fontSize: 10, display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 6px", borderRadius: 100, background: `${C.amber}12`, color: C.amber, border: `1px solid ${C.amber}30` }}>
                                ↻ Recurring
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: C.muted, marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                            <span>{tx.date}</span>
                            <Pill color={catColor(tx.category)}>{tx.category}</Pill>
                            <Pill color={confCol}>{Math.round(tx.probability * 100)}%</Pill>
                          </div>
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 14, fontWeight: 600, color: C.text, flexShrink: 0 }}>€{tx.amount.toFixed(2)}</div>
                      </div>
                      {/* Inline note */}
                      <input
                        value={notes[tx.id] ?? ""}
                        onChange={(e) => setNotes((p) => ({ ...p, [tx.id]: e.target.value }))}
                        placeholder="Note…"
                        style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, background: C.surfaceAlt, color: C.text, fontSize: 12, fontFamily: C.body, padding: "5px 10px", outline: "none", marginBottom: 6, boxSizing: "border-box" }}
                      />
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <ReceiptButton compact txId={tx.id}
                          hasReceipt={receiptKeys.has(tx.id)} receiptUrl={receiptUrls[tx.id]}
                          onLoad={handleReceiptLoad} onUpload={handleReceiptUpload} onDelete={handleReceiptDelete} />
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          {dec ? (<>
                            <span style={{ fontSize: 12, fontWeight: 600, color: dec === "include" ? "#059669" : dec === "exclude" ? C.red : C.muted }}>
                              {dec === "include" ? "✓ Included" : dec === "exclude" ? "✗ Excluded" : "→ Skipped"}
                            </span>
                            <button onClick={() => setDecisions(p => { const n = {...p}; delete n[tx.id]; return n; })}
                              style={{ fontSize: 11, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontFamily: C.body }}>
                              Undo
                            </button>
                          </>) : (<>
                            <button onClick={() => listDecide(tx.id, "include")}
                              style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.green}40`, background: `${C.green}0a`, color: C.green, cursor: "pointer", fontFamily: C.body }}>
                              ✓ Include
                            </button>
                            <button onClick={() => listDecide(tx.id, "exclude")}
                              style={{ fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 8, border: `1px solid ${C.red}40`, background: `${C.red}0a`, color: C.red, cursor: "pointer", fontFamily: C.body }}>
                              ✗ Exclude
                            </button>
                            <button onClick={() => listDecide(tx.id, "skip")}
                              style={{ fontSize: 12, padding: "5px 8px", borderRadius: 8, border: `1px solid ${C.border}`, background: C.surfaceAlt, color: C.muted, cursor: "pointer", fontFamily: C.body }}>
                              →
                            </button>
                          </>)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setStage("results")}
                style={{ background: C.green, color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: C.body }}>
                View Results →
              </button>
            </>)}
          </div>

          {/* Side panel — desktop only */}
          {viewMode === "desktop" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8 }}>
              <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 22px" }}>
                <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted, marginBottom: 14 }}>Session summary</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Included", count: includedCount, color: "#059669" },
                    { label: "Excluded", count: excludedCount, color: C.red },
                    { label: "Skipped",  count: skippedCount,  color: C.muted },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{ background: C.surfaceAlt, borderRadius: 10, padding: "10px 0", textAlign: "center" }}>
                      <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 700, color }}>{count}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: "20px 22px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted }}>Accepted so far</h3>
                  <span style={{ fontFamily: C.mono, fontSize: 16, fontWeight: 700, color: "#059669" }}>€{totalDeductible.toFixed(2)}</span>
                </div>
                {included.length === 0 ? (
                  <p style={{ fontSize: 13, color: C.muted, textAlign: "center", padding: "20px 0" }}>No transactions included yet.</p>
                ) : (
                  <div style={{ maxHeight: 320, overflowY: "auto" }}>
                    {[...included].reverse().map((t, i, arr) => (
                      <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.border}` : "none", gap: 10 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div>
                          <div style={{ fontSize: 11, color: catColor(t.category), marginTop: 1 }}>{t.category}</div>
                        </div>
                        <div style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 600, color: "#059669", flexShrink: 0 }}>€{t.amount.toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  if (stage === "results") {
    const byCategory = {};
    included.forEach((t) => { byCategory[t.category] = (byCategory[t.category] ?? 0) + t.amount; });
    const sortedCats = Object.entries(byCategory).sort(([, a], [, b]) => b - a);

    return (
      <div style={{ minHeight: "100vh", background: C.bg, fontFamily: C.body, color: C.text }}>
        <PrintArea />
        <ViewToggle mode={viewMode} onChange={setViewMode} />
        <div style={{ maxWidth: viewMode === "desktop" ? 1000 : 660, margin: "0 auto", padding: "32px 24px 60px" }}>
          <div className="ts-fade-up" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
            <div>
              <div style={{ fontFamily: C.display, fontSize: 30, fontWeight: 700, marginBottom: 4 }}>Your Results</div>
              <div style={{ color: C.muted, fontSize: 14 }}>{included.length} deductible · {Object.keys(decisions).length} reviewed</div>
            </div>
            <button onClick={resetSession} style={{ display: "flex", alignItems: "center", gap: 6, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 10, padding: "8px 14px", color: C.muted, cursor: "pointer", fontSize: 13, fontFamily: C.body }}>
              <RefreshCw size={13} /> New session
            </button>
          </div>

          <div className="ts-fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 24 }}>
            <StatCard label="Total Deductible" value={`€${totalDeductible.toFixed(2)}`} accent="#059669" />
            <StatCard label="Tax Saving @ 20%" value={`€${at20}`} accent={C.blue} />
            <StatCard label="Tax Saving @ 40%" value={`€${at40}`} accent="#8b5cf6" />
          </div>

          <div className="ts-fade-up" style={{ display: "flex", gap: 10, background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 24, alignItems: "flex-start" }}>
            <Info size={14} color={C.muted} style={{ marginTop: 1, flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Estimates are income tax only — USC and PRSI not included. Higher rate (40%) applies above €42,000.{" "}
              <strong style={{ color: C.sub }}>Always consult a qualified Irish accountant before filing.</strong>
            </p>
          </div>

          <div className="ts-fade-up" style={{ display: "flex", gap: 4, marginBottom: 20, flexWrap: "wrap" }}>
            {[
              { key: "list", icon: <List size={13} />, label: "Details" },
              { key: "dashboard", icon: <LayoutDashboard size={13} />, label: "Dashboard" },
              { key: "subscriptions", icon: <span style={{ fontSize: 13 }}>↻</span>, label: `Subscriptions${subscriptionIds.size > 0 ? ` (${subscriptionIds.size})` : ""}` },
              { key: "income", icon: <TrendingUp size={13} />, label: "Income & Tax" },
              { key: "mileage", icon: <Car size={13} />, label: "Mileage" },
            ].map(({ key, icon, label }) => (
              <button key={key} onClick={() => setResultsTab(key)}
                style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: resultsTab === key ? C.green : C.surfaceAlt, color: resultsTab === key ? "#fff" : C.muted, fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontFamily: C.body, whiteSpace: "nowrap" }}>
                {icon} {label}
              </button>
            ))}
          </div>

          {resultsTab === "list" && (
          <div style={{ display: viewMode === "desktop" ? "grid" : "block", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "flex-start" }}>
            {/* Left: category breakdown */}
            <div className="ts-fade-up" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: viewMode === "desktop" ? 0 : 20 }}>
              <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted, marginBottom: 18 }}>By Category</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
                {sortedCats.map(([cat, amt]) => {
                  const pct = totalDeductible ? (amt / totalDeductible) * 100 : 0;
                  const col = catColor(cat);
                  return (
                    <div key={cat}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: C.text }}>{cat}</span>
                        <span style={{ fontFamily: C.mono, fontSize: 13, color: col }}>€{amt.toFixed(2)}</span>
                      </div>
                      <div style={{ height: 4, background: C.surfaceAlt, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 2, transition: "width .6s ease" }} />
                      </div>
                    </div>
                  );
                })}
                {sortedCats.length === 0 && <p style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "20px 0" }}>No categories yet.</p>}
              </div>
            </div>

            {/* Right: transactions + export */}
            <div>
              <div className="ts-fade-up" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, marginBottom: 16 }}>
                <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted, marginBottom: 16 }}>Transactions</h2>
                {included.map((t, i) => {
                  const [, confCol] = confBadge(t.probability);
                  return (
                    <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < included.length - 1 ? `1px solid ${C.border}` : "none", gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 3, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{t.date} &nbsp;·&nbsp; <span style={{ color: catColor(t.category) }}>{t.category}</span></div>
                        {notes[t.id] && <div style={{ fontSize: 11, color: C.sub, marginTop: 3, fontStyle: "italic" }}>{notes[t.id]}</div>}
                      </div>
                      <ReceiptButton compact txId={t.id}
                        hasReceipt={receiptKeys.has(t.id)} receiptUrl={receiptUrls[t.id]}
                        onLoad={handleReceiptLoad} onUpload={handleReceiptUpload} onDelete={handleReceiptDelete} />
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontFamily: C.mono, fontSize: 14, color: "#059669", fontWeight: 600 }}>€{t.amount.toFixed(2)}</div>
                        <div style={{ fontSize: 11, color: confCol }}>{Math.round(t.probability * 100)}%</div>
                      </div>
                    </div>
                  );
                })}
                {!included.length && <p style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "20px 0" }}>No transactions included yet.</p>}
              </div>

              <div className="ts-fade-up" style={{ display: "flex", gap: 12, marginBottom: 12 }}>
                <ExportBtn onClick={exportCSV} icon={<FileText size={15} />} label="Export CSV" />
                <ExportBtn primary onClick={() => printReport(included, totalDeductible, notes)} icon={<Printer size={15} />} label="Print / Save PDF" />
              </div>
              <p style={{ textAlign: "center", fontSize: 11, color: C.muted }}>
                "Print / Save PDF" opens your browser's print dialog — choose <strong>Save as PDF</strong>.
              </p>
            </div>
          </div>
          )}

          {resultsTab === "dashboard" && (
            <div className="ts-fade-up" style={{ display: "grid", gridTemplateColumns: viewMode === "desktop" ? "1fr 1fr" : "1fr", gap: 24 }}>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, height: 350 }}>
                <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted, marginBottom: 18 }}>Expenses by Category</h2>
                {sortedCats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={sortedCats.map(([n, v]) => ({ name: n, value: v }))} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={2}>
                        {sortedCats.map(([n]) => <Cell key={n} fill={catColor(n)} />)}
                      </Pie>
                      <Tooltip formatter={(val) => `€${val.toFixed(2)}`} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "40px 0" }}>No data to display.</p>
                )}
              </div>
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 16, padding: 22, height: 350 }}>
                <h2 style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".09em", color: C.muted, marginBottom: 18 }}>Top Categories</h2>
                {sortedCats.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sortedCats.slice(0, 5).map(([n, v]) => ({ name: n, value: v }))} layout="vertical" margin={{ left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" tickFormatter={(v) => `€${v}`} />
                      <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: C.sub }} />
                      <Tooltip formatter={(val) => `€${val.toFixed(2)}`} cursor={{ fill: C.surfaceAlt }} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {sortedCats.slice(0, 5).map(([n]) => <Cell key={n} fill={catColor(n)} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p style={{ color: C.muted, fontSize: 14, textAlign: "center", padding: "40px 0" }}>No data to display.</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
