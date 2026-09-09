import { Download, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const trajectory = [
  { year: "FY23", INTELLECT: 43.8, TCS: 39.0, TATAELXSI: 36.9 },
  { year: "FY24", INTELLECT: 52.2, TCS: 51.2, TATAELXSI: 45.1 },
  { year: "FY25", INTELLECT: 53.2, TCS: 63.5, TATAELXSI: 53.3 },
  { year: "FY26", INTELLECT: 71.0, TCS: 81.8, TATAELXSI: 64.9 },
];

const companies = [
  {
    symbol: "INTELLECT",
    name: "Intellect Design Arena",
    model: "Vertical banking software",
    exposure: 25.8,
    readiness: 71.0,
    classification: "Resilient",
    revenue: "+22.7%",
    margin: "-1.8 pp",
    operatingNote: "Platform revenue +140.7%",
    market: "-16.5 pp",
  },
  {
    symbol: "TCS",
    name: "Tata Consultancy Services",
    model: "Scaled IT services",
    exposure: 61.3,
    readiness: 81.8,
    classification: "Credible transition",
    revenue: "-0.5%",
    margin: "+0.7 pp",
    operatingNote: "Employees -3.9%",
    market: "-6.6 pp",
  },
  {
    symbol: "TATAELXSI",
    name: "Tata Elxsi",
    model: "Design-led engineering services",
    exposure: 61.3,
    readiness: 64.9,
    classification: "Credible transition",
    revenue: "+0.8%",
    margin: "Not comparable",
    operatingNote: "Growth slowed across FY24-FY26",
    market: "-15.5 pp",
  },
];

const palette = { gold: "#c9a84c", teal: "#2dd4bf", blue: "#60a5fa" };

export default function AiTransitionObservatory() {
  return (
    <div className="col-span-2 w-full space-y-8 text-left">
      <div className="rounded-3xl border border-teal-400/20 bg-[#10151f] p-7 md:p-9">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 text-[10px] font-black uppercase tracking-[0.22em] text-teal-300">AI Transition Observatory · Pilot</p>
            <h2 className="text-3xl font-semibold tracking-tight text-white md:text-4xl">Exposure is not the same as readiness.</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
              A three-company evidence study separating disruption exposure from the ability to convert AI into platforms, productivity and delivered outcomes.
            </p>
          </div>
          <a
            href="/reports/ai-transition-pilot-comparison.pdf"
            download
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gold/40 bg-gold/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.16em] text-gold hover:bg-gold/20"
          >
            <Download className="h-4 w-4" /> Download pilot PDF
          </a>
        </div>
        <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[0.04] p-4">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <p className="text-xs leading-5 text-zinc-400">
            Historical scores were reconstructed on 9 Sep 2026 from dated official disclosures. They are suitable for hypothesis testing, not an unbiased backtest or investment recommendation.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {companies.map((company) => (
          <article key={company.symbol} className="rounded-2xl border border-app-border bg-app-surface p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-black text-white">{company.symbol}</p>
                <p className="mt-1 text-xs text-zinc-500">{company.name}</p>
              </div>
              <span className="rounded-full border border-teal-400/25 bg-teal-400/[0.08] px-3 py-1 text-[9px] font-black uppercase tracking-wider text-teal-300">
                {company.classification}
              </span>
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{company.model}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Metric label="Exposure" value={company.exposure.toFixed(1)} color="text-gold" />
              <Metric label="Readiness" value={company.readiness.toFixed(1)} color="text-teal-300" />
            </div>
          </article>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-app-border bg-app-surface p-6">
          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Readiness trajectory</p>
            <p className="mt-1 text-xs text-zinc-500">Reconstructed annual measurement; 0–100 scale</p>
          </div>
          <div className="h-[310px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trajectory} margin={{ top: 12, right: 18, left: -12, bottom: 8 }}>
                <CartesianGrid stroke="#272b35" strokeDasharray="3 3" />
                <XAxis dataKey="year" stroke="#71717a" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} stroke="#71717a" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ background: "#111722", border: "1px solid #343946", borderRadius: 10 }} />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Line type="monotone" dataKey="INTELLECT" stroke={palette.teal} strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="TCS" stroke={palette.gold} strokeWidth={3} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="TATAELXSI" stroke={palette.blue} strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-app-border bg-app-surface p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">What the pilot says</p>
          <div className="mt-5 space-y-5">
            <Finding icon={<TrendingUp className="h-4 w-4" />} title="Readiness improved" text="All three histories show higher FY26 readiness than FY23." />
            <Finding icon={<TrendingDown className="h-4 w-4" />} title="The market result is mixed" text="Higher readiness did not reliably produce immediate relative returns." />
            <Finding icon={<ShieldCheck className="h-4 w-4" />} title="Operating evidence matters" text="Revenue, margins, platform conversion and workforce change are kept separate from narrative claims." />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-app-border bg-app-surface">
        <div className="border-b border-app-border px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gold">Latest operating and market bridge</p>
          <p className="mt-1 text-xs text-zinc-500">Market column is latest complete 3-month relative return versus Nifty IT.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-white/[0.03] text-[9px] uppercase tracking-wider text-zinc-500">
              <tr>{["Company", "Revenue", "Margin", "Additional evidence", "Relative return"].map((h) => <th key={h} className="px-5 py-3 text-left">{h}</th>)}</tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.symbol} className="border-t border-app-border text-zinc-300">
                  <td className="px-5 py-4 font-bold text-white">{company.name}</td>
                  <td className="px-5 py-4">{company.revenue}</td>
                  <td className="px-5 py-4">{company.margin}</td>
                  <td className="px-5 py-4">{company.operatingNote}</td>
                  <td className="px-5 py-4 text-rose-300">{company.market}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="rounded-xl border border-app-border bg-black/10 p-3"><p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">{label}</p><p className={`mt-1 text-2xl font-black ${color}`}>{value}</p></div>;
}

function Finding({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="flex gap-3"><div className="mt-0.5 text-teal-300">{icon}</div><div><p className="text-sm font-bold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-zinc-500">{text}</p></div></div>;
}
