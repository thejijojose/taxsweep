import { useState, useMemo } from "react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  ArrowLeft, TrendingUp, Users, ShoppingBag, Star,
  BarChart2, Clock, Award,
} from "lucide-react";

// ── Design tokens ─────────────────────────────────────────────────────────────
const B = {
  bg: "#f0f4ff",
  surface: "#ffffff",
  surfaceAlt: "#f8fafc",
  border: "#e2e8f0",
  text: "#0f172a",
  sub: "#475569",
  muted: "#94a3b8",
  blue:  "#1d4ed8",
  blue2: "#3b82f6",
  blue3: "#93c5fd",
  blue4: "#dbeafe",
  amber: "#f59e0b",
  green: "#10b981",
  purple: "#8b5cf6",
  body: "'Inter', system-ui, sans-serif",
  mono: "ui-monospace, monospace",
};

const SEG_COLORS = ["#1d4ed8", "#3b82f6", "#93c5fd"];
const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun"];
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ── Deterministic PRNG (XorShift32) ──────────────────────────────────────────
function xsr(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967295; };
}

// ── Mock transaction data for "Murphy's Deli, Dublin 2" ───────────────────────
function buildTxs() {
  const rand = xsr(0xC0FFEE42);

  // 200 BOI cardholders: 25 regulars (high weight), 65 occasional, 110 new/one-time
  const customers = [
    ...Array.from({ length: 25  }, (_, i) => ({ id: `BOI${String(i +  1).padStart(3,"0")}`, seg: "Regular",    w: 12 })),
    ...Array.from({ length: 65  }, (_, i) => ({ id: `BOI${String(i + 26).padStart(3,"0")}`, seg: "Occasional", w:  4 })),
    ...Array.from({ length: 110 }, (_, i) => ({ id: `BOI${String(i + 91).padStart(3,"0")}`, seg: "New",        w:  1 })),
  ];
  const totalW = customers.reduce((s, c) => s + c.w, 0);
  const pickCust = () => {
    let r = rand() * totalW;
    for (const c of customers) { r -= c.w; if (r <= 0) return c; }
    return customers[0];
  };

  // Weighted hour-of-day (peaks: 8am breakfast, 1pm lunch, 6pm evening)
  const hWt = [0,0,0,0,0, 0.2,0.6,2.5,5,3.5, 2,2,5,5,3, 2,1.5,2.5,5,4.5, 3,2,1,0];
  const hTot = hWt.reduce((a, b) => a + b, 0);
  const pickHr = () => {
    let r = rand() * hTot;
    for (let h = 0; h < 24; h++) { r -= hWt[h]; if (r <= 0) return h; }
    return 13;
  };

  const DAYS = [31, 28, 31, 30, 31, 30];
  const txs = [];

  for (let m = 0; m < 6; m++) {
    for (let d = 1; d <= DAYS[m]; d++) {
      const dow = new Date(2025, m, d).getDay();
      const isWknd = dow === 0 || dow === 6;
      const count = Math.max(2, Math.round((isWknd ? 22 : 11) * (0.55 + rand() * 0.9)));
      for (let i = 0; i < count; i++) {
        const cust = pickCust();
        const logAmt = Math.log(22) + (rand() - 0.5) * 1.1;
        const amount = Math.max(2, Math.round(Math.exp(logAmt) * 100) / 100);
        txs.push({ m, monthLabel: MONTH_LABELS[m], d, dow, customerId: cust.id, segment: cust.seg, amount, hour: pickHr() });
      }
    }
  }
  return txs;
}

const TXS = buildTxs();

// ── Shared formatters ─────────────────────────────────────────────────────────
const fmtEur  = (n) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const fmtEur2 = (n) => new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const tooltipStyle = { borderRadius: 10, border: `1px solid ${B.border}`, fontSize: 12, fontFamily: B.body, boxShadow: "0 4px 16px rgba(0,0,0,.08)" };

// ── Sub-components ────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, color, icon: Icon }) {
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px", flex: "1 1 180px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: `${color}18`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Icon size={17} color={color} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".09em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: B.text, letterSpacing: "-.02em", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: B.muted, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function Card({ title, sub, children, style = {} }) {
  return (
    <div style={{ background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, padding: "20px", ...style }}>
      {title && <div style={{ fontSize: 13, fontWeight: 700, color: B.text, marginBottom: 2 }}>{title}</div>}
      {sub   && <div style={{ fontSize: 11, color: B.muted, marginBottom: 16 }}>{sub}</div>}
      {children}
    </div>
  );
}

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ total, txCount, avgBasket, custCount, monthly, segments }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontWeight: 800, fontSize: 22, color: B.text, margin: 0 }}>Performance Overview</h2>
        <p style={{ color: B.muted, fontSize: 13, margin: "4px 0 0 0" }}>January – June 2025 · Bank of Ireland cardholders at your store</p>
      </div>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KPICard label="Total Revenue"      value={fmtEur(total)}     sub="H1 2025"                    color={B.blue}   icon={TrendingUp}  />
        <KPICard label="Transactions"        value={txCount.toLocaleString()} sub="BOI card payments"  color={B.green}  icon={ShoppingBag} />
        <KPICard label="Avg Basket"          value={fmtEur2(avgBasket)} sub="per visit"                color={B.amber}  icon={Star}        />
        <KPICard label="Active Customers"    value={custCount}         sub="unique BOI cardholders"     color={B.purple} icon={Users}       />
      </div>

      {/* Monthly revenue + segment split */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, flexWrap: "wrap" }}>
        <Card title="Monthly Revenue" sub="BOI card spend at your store">
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={monthly} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={v => [fmtEur(v), "Revenue"]} contentStyle={tooltipStyle} />
              <Bar dataKey="revenue" fill={B.blue} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="Revenue by Segment" sub="Customer loyalty tiers">
          <ResponsiveContainer width="100%" height={130}>
            <PieChart>
              <Pie data={segments} dataKey="revenue" nameKey="name" cx="50%" cy="50%" innerRadius={36} outerRadius={60}>
                {segments.map((_, i) => <Cell key={i} fill={SEG_COLORS[i]} />)}
              </Pie>
              <Tooltip formatter={v => [fmtEur(v), "Revenue"]} contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
            {segments.map((s, i) => (
              <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: SEG_COLORS[i], flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: B.sub, flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: B.text }}>{fmtEur(s.revenue)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Monthly transaction count */}
      <Card title="Transaction Volume" sub="Number of BOI card payments per month">
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={monthly} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={B.blue} stopOpacity={0.18} />
                <stop offset="95%" stopColor={B.blue} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
            <Tooltip formatter={v => [v.toLocaleString(), "Transactions"]} contentStyle={tooltipStyle} />
            <Area type="monotone" dataKey="transactions" stroke={B.blue} strokeWidth={2} fill="url(#blueGrad)" dot={{ r: 4, fill: B.blue, strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ── Customers tab ─────────────────────────────────────────────────────────────
function CustomersTab({ segments, topCustomers, newVsReturning }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontWeight: 800, fontSize: 22, color: B.text, margin: 0 }}>Customer Intelligence</h2>
        <p style={{ color: B.muted, fontSize: 13, margin: "4px 0 0 0" }}>Loyalty segments, visit frequency, and high-value customers</p>
      </div>

      {/* Segment summary cards */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {segments.map((s, i) => (
          <div key={s.name} style={{ flex: "1 1 200px", background: B.surface, border: `2px solid ${SEG_COLORS[i]}30`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Award size={16} color={SEG_COLORS[i]} />
              <span style={{ fontSize: 12, fontWeight: 700, color: SEG_COLORS[i], textTransform: "uppercase", letterSpacing: ".07em" }}>{s.name}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: B.text }}>{s.customers}</div>
            <div style={{ fontSize: 11, color: B.muted, marginTop: 4 }}>customers</div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${B.border}`, display: "flex", justifyContent: "space-between" }}>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>{fmtEur(s.revenue)}</div><div style={{ fontSize: 10, color: B.muted }}>revenue</div></div>
              <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 700, color: B.text }}>{s.transactions.toLocaleString()}</div><div style={{ fontSize: 10, color: B.muted }}>visits</div></div>
            </div>
          </div>
        ))}
      </div>

      {/* New vs Returning */}
      <Card title="New vs Returning Customers" sub="Monthly breakdown of first-time vs repeat BOI cardholders">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={newVsReturning} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="returning" name="Returning" stackId="a" fill={B.blue}  radius={[0, 0, 0, 0]} />
            <Bar dataKey="new"       name="New"       stackId="a" fill={B.blue3} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
          {[["Returning", B.blue], ["New", B.blue3]].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
              <span style={{ fontSize: 11, color: B.sub }}>{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Top customers table */}
      <Card title="Top 10 Customers by Spend" sub="Anonymised BOI cardholder IDs ranked by total spend at your store">
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: B.body }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${B.border}` }}>
                {["#", "Customer ID", "Segment", "Total Spend", "Visits", "Avg per Visit"].map(h => (
                  <th key={h} style={{ textAlign: "left", fontSize: 10, fontWeight: 700, color: B.muted, textTransform: "uppercase", letterSpacing: ".07em", padding: "8px 10px 10px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topCustomers.map((c, i) => (
                <tr key={c.id} style={{ borderBottom: `1px solid ${B.border}`, background: i % 2 === 0 ? "transparent" : B.surfaceAlt }}>
                  <td style={{ padding: "10px", fontSize: 12, color: B.muted, fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ padding: "10px", fontSize: 12, fontFamily: B.mono, color: B.text }}>{c.id}</td>
                  <td style={{ padding: "10px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${SEG_COLORS[["Regular","Occasional","New"].indexOf(c.segment)]}15`, color: SEG_COLORS[["Regular","Occasional","New"].indexOf(c.segment)] }}>
                      {c.segment}
                    </span>
                  </td>
                  <td style={{ padding: "10px", fontSize: 13, fontWeight: 700, color: B.text }}>{fmtEur2(c.spend)}</td>
                  <td style={{ padding: "10px", fontSize: 12, color: B.sub }}>{c.visits}</td>
                  <td style={{ padding: "10px", fontSize: 12, color: B.sub }}>{fmtEur2(c.avg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ── Trends tab ────────────────────────────────────────────────────────────────
function TrendsTab({ hourly, dow }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h2 style={{ fontWeight: 800, fontSize: 22, color: B.text, margin: 0 }}>Spending Patterns</h2>
        <p style={{ color: B.muted, fontSize: 13, margin: "4px 0 0 0" }}>Peak trading hours and days — optimise staffing and promotions</p>
      </div>

      {/* Peak hours */}
      <Card title="Transactions by Hour" sub="When your BOI customers shop (6am – 11pm)">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourly} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="hour" tick={{ fontSize: 10, fill: B.muted }} axisLine={false} tickLine={false} interval={1} />
            <YAxis tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
            <Tooltip formatter={v => [v.toLocaleString(), "Transactions"]} contentStyle={tooltipStyle} />
            <Bar dataKey="transactions" fill={B.blue2} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Breakfast peak", time: "8–9am", color: B.blue },
            { label: "Lunch rush",     time: "1–2pm", color: B.amber },
            { label: "Evening peak",   time: "6–7pm", color: B.green },
          ].map(p => (
            <div key={p.label} style={{ display: "flex", alignItems: "center", gap: 6, background: `${p.color}10`, padding: "5px 12px", borderRadius: 999, border: `1px solid ${p.color}25` }}>
              <Clock size={11} color={p.color} />
              <span style={{ fontSize: 11, fontWeight: 600, color: p.color }}>{p.label}</span>
              <span style={{ fontSize: 11, color: B.muted }}>{p.time}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Day of week */}
      <Card title="Revenue by Day of Week" sub="Which days drive the most spend — Mon through Sun">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={dow} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: B.muted }} axisLine={false} tickLine={false} tickFormatter={v => `€${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={v => [fmtEur(v), "Revenue"]} contentStyle={tooltipStyle} />
            <Bar dataKey="revenue" radius={[6, 6, 0, 0]}>
              {dow.map((d, i) => (
                <Cell key={i} fill={d.day === "Sat" || d.day === "Sun" ? B.green : B.blue} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ display: "flex", gap: 16, marginTop: 10 }}>
          {[["Weekdays", B.blue], ["Weekends", B.green]].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 3, background: color }} />
              <span style={{ fontSize: 11, color: B.sub }}>{label}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* Insight callouts */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {[
          { icon: Clock,  color: B.blue,   title: "Busiest hour",   body: "1pm–2pm accounts for ~18% of daily transactions. Consider extra staff at lunch." },
          { icon: Award,  color: B.green,  title: "Weekend uplift",  body: "Saturdays generate ~2× weekday revenue. Weekend promotions could amplify this." },
          { icon: Users,  color: B.purple, title: "Regular power",   body: "Your top 25 regular customers drive over 40% of total revenue — a loyalty scheme could boost retention." },
        ].map(({ icon: Icon, color, title, body }) => (
          <div key={title} style={{ flex: "1 1 240px", background: B.surface, border: `1px solid ${B.border}`, borderRadius: 16, padding: "18px 20px", borderLeft: `4px solid ${color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <Icon size={15} color={color} />
              <span style={{ fontSize: 12, fontWeight: 700, color: B.text }}>{title}</span>
            </div>
            <p style={{ fontSize: 12, color: B.sub, lineHeight: 1.6, margin: 0 }}>{body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BankPlatform({ onHome }) {
  const [tab, setTab] = useState("overview");

  // ── Derived metrics ───────────────────────────────────────────────────────
  const total       = useMemo(() => TXS.reduce((s, t) => s + t.amount, 0), []);
  const txCount     = TXS.length;
  const avgBasket   = total / txCount;
  const custCount   = useMemo(() => new Set(TXS.map(t => t.customerId)).size, []);

  const monthly = useMemo(() => {
    const m = {};
    TXS.forEach(t => {
      if (!m[t.monthLabel]) m[t.monthLabel] = { month: t.monthLabel, revenue: 0, transactions: 0 };
      m[t.monthLabel].revenue += t.amount;
      m[t.monthLabel].transactions++;
    });
    return MONTH_LABELS.map(ml => ({ month: ml, revenue: Math.round(m[ml]?.revenue ?? 0), transactions: m[ml]?.transactions ?? 0 }));
  }, []);

  const segments = useMemo(() => {
    const s = {};
    TXS.forEach(t => {
      if (!s[t.segment]) s[t.segment] = { name: t.segment, revenue: 0, transactions: 0, customers: new Set() };
      s[t.segment].revenue += t.amount;
      s[t.segment].transactions++;
      s[t.segment].customers.add(t.customerId);
    });
    return ["Regular", "Occasional", "New"].map(n => ({
      name: n,
      revenue: Math.round(s[n]?.revenue ?? 0),
      transactions: s[n]?.transactions ?? 0,
      customers: s[n]?.customers.size ?? 0,
    }));
  }, []);

  const topCustomers = useMemo(() => {
    const c = {};
    TXS.forEach(t => {
      if (!c[t.customerId]) c[t.customerId] = { id: t.customerId, segment: t.segment, spend: 0, visits: 0 };
      c[t.customerId].spend += t.amount;
      c[t.customerId].visits++;
    });
    return Object.values(c)
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10)
      .map(c => ({ ...c, spend: Math.round(c.spend * 100) / 100, avg: Math.round(c.spend / c.visits * 100) / 100 }));
  }, []);

  const firstSeen = useMemo(() => {
    const fs = {};
    TXS.forEach(t => { if (fs[t.customerId] === undefined) fs[t.customerId] = t.m; });
    return fs;
  }, []);

  const newVsReturning = useMemo(() => {
    const m = Object.fromEntries(MONTH_LABELS.map((ml, i) => [i, { month: ml, new: 0, returning: 0 }]));
    TXS.forEach(t => {
      if (firstSeen[t.customerId] === t.m) m[t.m].new++;
      else m[t.m].returning++;
    });
    return MONTH_LABELS.map((ml, i) => m[i]);
  }, [firstSeen]);

  const hourly = useMemo(() => {
    const h = {};
    TXS.forEach(t => {
      if (!h[t.hour]) h[t.hour] = { hour: t.hour, transactions: 0, revenue: 0 };
      h[t.hour].transactions++;
      h[t.hour].revenue += t.amount;
    });
    return Array.from({ length: 18 }, (_, i) => {
      const hr = i + 6;
      const label = hr < 12 ? `${hr}am` : hr === 12 ? "12pm" : `${hr - 12}pm`;
      return { hour: label, transactions: h[hr]?.transactions ?? 0, revenue: Math.round(h[hr]?.revenue ?? 0) };
    });
  }, []);

  const dow = useMemo(() => {
    const d = {};
    TXS.forEach(t => {
      if (!d[t.dow]) d[t.dow] = { day: DOW_NAMES[t.dow], transactions: 0, revenue: 0 };
      d[t.dow].transactions++;
      d[t.dow].revenue += t.amount;
    });
    return DOW_ORDER.map(i => ({ day: DOW_NAMES[i], transactions: d[i]?.transactions ?? 0, revenue: Math.round(d[i]?.revenue ?? 0) }));
  }, []);

  const TABS = [
    { id: "overview",   label: "Overview",   Icon: BarChart2   },
    { id: "customers",  label: "Customers",  Icon: Users        },
    { id: "trends",     label: "Trends",     Icon: TrendingUp   },
  ];

  return (
    <div style={{ minHeight: "100vh", background: B.bg, fontFamily: B.body }}>
      {/* Top bar */}
      <div style={{ background: B.surface, borderBottom: `1px solid ${B.border}`, padding: "0 24px", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", alignItems: "center", gap: 16, height: 56 }}>
          <button
            onClick={onHome}
            style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: B.muted, fontSize: 13, fontFamily: B.body, padding: "4px 0" }}
          >
            <ArrowLeft size={14} /> Home
          </button>
          <div style={{ width: 1, height: 20, background: B.border }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ background: B.blue, borderRadius: 6, padding: "3px 9px", fontSize: 10, fontWeight: 800, color: "#fff", letterSpacing: ".06em" }}>BOI</div>
            <span style={{ fontWeight: 700, fontSize: 15, color: B.text }}>Merchant Insights</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: B.muted }}>Murphy's Deli · Dublin 2 · Demo</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ background: B.surface, borderBottom: `1px solid ${B.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px", display: "flex" }}>
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                background: "none", border: "none", cursor: "pointer", fontFamily: B.body,
                borderBottom: `2px solid ${tab === id ? B.blue : "transparent"}`,
                padding: "12px 18px", fontSize: 13,
                fontWeight: tab === id ? 700 : 500,
                color: tab === id ? B.blue : B.sub,
                display: "flex", alignItems: "center", gap: 6,
                transition: "color .15s",
              }}
            >
              <Icon size={14} />{label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 24px 60px" }}>
        {tab === "overview"  && <OverviewTab total={total} txCount={txCount} avgBasket={avgBasket} custCount={custCount} monthly={monthly} segments={segments} />}
        {tab === "customers" && <CustomersTab segments={segments} topCustomers={topCustomers} newVsReturning={newVsReturning} />}
        {tab === "trends"    && <TrendsTab hourly={hourly} dow={dow} />}
      </div>
    </div>
  );
}
