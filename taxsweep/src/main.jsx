import { useState } from "react";
import ReactDOM from "react-dom/client";
import TaxSweep from "./App.jsx";
import BankPlatform from "./BankPlatform.jsx";
import { Zap, BarChart2, ArrowRight, Shield, Globe } from "lucide-react";

const C = {
  bg: "#f8fafc",
  surface: "#ffffff",
  border: "#e2e8f0",
  text: "#0f172a",
  sub: "#475569",
  muted: "#94a3b8",
  green: "#10b981",
  blue: "#1d4ed8",
  body: "'Inter', system-ui, sans-serif",
  display: "'Inter', system-ui, sans-serif",
};

function AppCard({ accentColor, icon: Icon, title, titleAccent, description, tags, cta, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: "1 1 320px",
        maxWidth: 400,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 22,
        padding: "28px 28px 24px",
        cursor: "pointer",
        transition: "transform .18s, box-shadow .18s",
        transform: hovered ? "translateY(-3px)" : "none",
        boxShadow: hovered ? "0 12px 40px rgba(0,0,0,.11)" : "0 2px 12px rgba(0,0,0,.06)",
      }}
    >
      {/* Icon */}
      <div style={{ width: 52, height: 52, borderRadius: 16, background: `${accentColor}14`, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
        <Icon size={26} color={accentColor} />
      </div>

      {/* Name */}
      <div style={{ fontFamily: C.display, fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 10, letterSpacing: "-.02em" }}>
        {title}<span style={{ color: accentColor }}>{titleAccent}</span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: C.sub, lineHeight: 1.65, marginBottom: 20, margin: "0 0 20px" }}>
        {description}
      </p>

      {/* Tags */}
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 24 }}>
        {tags.map(t => (
          <span
            key={t}
            style={{ fontSize: 11, fontWeight: 600, padding: "3px 11px", borderRadius: 999, background: `${accentColor}10`, color: accentColor, border: `1px solid ${accentColor}22` }}
          >
            {t}
          </span>
        ))}
      </div>

      {/* CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: accentColor, fontWeight: 700, fontSize: 14 }}>
        {cta} <ArrowRight size={16} />
      </div>
    </div>
  );
}

function HomePage({ onSelect }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: C.body,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 24px",
      }}
    >
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 52 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: `${C.green}12`, border: `1px solid ${C.green}28`, borderRadius: 100, padding: "5px 14px", marginBottom: 20 }}>
          <Globe size={11} color={C.green} />
          <span style={{ fontSize: 11, fontWeight: 700, color: C.green, letterSpacing: ".07em", textTransform: "uppercase" }}>Built for Ireland</span>
        </div>
        <h1
          style={{
            fontFamily: C.display,
            fontSize: "clamp(32px, 5vw, 50px)",
            fontWeight: 800,
            color: C.text,
            letterSpacing: "-.03em",
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Financial Intelligence Suite
        </h1>
        <p style={{ color: C.sub, fontSize: 15, marginTop: 14, maxWidth: 460, lineHeight: 1.65, margin: "14px auto 0" }}>
          Two AI-powered platforms — one for sole traders managing tax,<br />one for merchants understanding their customers.
        </p>
      </div>

      {/* App cards */}
      <div style={{ display: "flex", gap: 22, flexWrap: "wrap", justifyContent: "center", width: "100%", maxWidth: 860 }}>
        <AppCard
          accentColor={C.green}
          icon={Zap}
          title="Tax"
          titleAccent="Sweep"
          description="AI-powered expense categoriser for Irish sole traders. Upload your bank statement and every transaction is instantly classified against Revenue rules — fully offline."
          tags={["Works offline", "Irish tax rules", "PDF + CSV", "Sole traders"]}
          cta="Launch app"
          onClick={() => onSelect("taxsweep")}
        />
        <AppCard
          accentColor={C.blue}
          icon={BarChart2}
          title="BOI Merchant"
          titleAccent=" Insights"
          description="A Bank of Ireland data platform that turns your card transaction data into actionable customer intelligence. Track loyalty, peak times, and spending patterns."
          tags={["Customer segments", "Spend trends", "Peak hours", "Dashboards"]}
          cta="Explore platform"
          onClick={() => onSelect("bank")}
        />
      </div>

      {/* Footer note */}
      <div style={{ marginTop: 48, display: "flex", alignItems: "center", gap: 8, color: C.muted, fontSize: 12 }}>
        <Shield size={12} color={C.muted} />
        No data leaves your device · Fully offline · Made for Ireland 🇮🇪
      </div>
    </div>
  );
}

function AppShell() {
  const [app, setApp] = useState("home");
  const goHome = () => setApp("home");

  if (app === "taxsweep") return <TaxSweep onHome={goHome} />;
  if (app === "bank")     return <BankPlatform onHome={goHome} />;
  return <HomePage onSelect={setApp} />;
}

ReactDOM.createRoot(document.getElementById("root")).render(<AppShell />);
