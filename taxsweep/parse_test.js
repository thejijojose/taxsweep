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

  if (header.includes("started date") && header.includes("product") && header.includes("description")) {
    const headerCols = splitLine(lines[0]).map((h) => h.toLowerCase().trim());
    const iType    = 0;
    const iProduct = 1;
    const iDate    = 2;
    const iDesc    = headerCols.indexOf("description");
    const iAmt     = headerCols.findIndex((h) => h === "amount" || h.startsWith("amount "));
    console.log("[TaxSweep CSV] headerCols:", headerCols, "iDesc:", iDesc, "iAmt:", iAmt);
    if (iDesc === -1 || iAmt === -1) return txs; 
    const SKIP_TYPES = new Set(["topup","reward","interest","card refund","refund","exchange","atm","transfer"]);
    lines.slice(1).forEach((line, i) => {
      const cols = splitLine(line);
      if (cols.length <= Math.max(iDesc, iAmt)) return;
      const type    = cols[iType].toLowerCase().trim();
      const product = cols[iProduct].toLowerCase().trim();
      const dateRaw = cols[iDate].trim();
      const desc    = cols[iDesc].trim();
      const amt     = parseFloat(cols[iAmt]?.replace(/,/g, ""));
      console.log(`[TaxSweep CSV] row ${i}: type="${type}" product="${product}" desc="${desc}" amt=${amt}`);
      if (product !== "current") { console.log("  → skip: product"); return; }
      if (isNaN(amt) || amt >= 0) { console.log("  → skip: amt"); return; }
      if (SKIP_TYPES.has(type)) { console.log("  → skip: type"); return; }
      const amount = Math.abs(amt);
      if (desc && amount > 0)
        txs.push({ id: `tx_${i}`, date: dateRaw.split(" ")[0], description: desc, amount });
    });
    return txs;
  }
  return [];
}

const csv = `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance
Card Payment,Current,2025-05-05 13:58:19,2025-05-06 5:33:44,Swiggy,-17.98,0,EUR,COMPLETED,435.5
Transfer,Current,2025-06-02 12:02:49,2025-06-02 12:04:55,International Transfer,-411.98,0.9,EUR,COMPLETED,22.62`;
console.log(parseCSV(csv));
