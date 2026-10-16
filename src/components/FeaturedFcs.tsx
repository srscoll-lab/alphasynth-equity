import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { fundamentalChangeLibrary, onDemandLibraryRecord } from "../data/fundamentalChangeLibrary";
import { mergeFcsPublications, type FcsPublicationSummary } from "../fcs-publications";
import { lifecycleDisplay } from "../lifecycle-copy";

type RadarCompany = {
  symbol: string;
  company_name: string;
  radar_state: string;
  experimental_rank_score: number | null;
  data_status: string;
  liquidity_gate?: { qualified: boolean };
  market_cap_segment: { id: string; label: string; industry: string | null };
};

const uptrends = new Set(["STARTING", "CONFIRMED", "EXTENDED"]);
const trendLabel: Record<string, string> = {
  STARTING: "Early Uptrend",
  CONFIRMED: "Established Uptrend",
  EXTENDED: "Stretched Uptrend",
};

export function selectFeaturedFcs<T extends RadarCompany>(companies: T[], availableSymbols: Set<string>, count = 5): T[] {
  const ranked = companies
    .filter((company) => availableSymbols.has(company.symbol)
      && company.data_status === "full_history"
      && company.liquidity_gate?.qualified === true
      && uptrends.has(company.radar_state)
      && Number.isFinite(company.experimental_rank_score))
    .sort((left, right) => (right.experimental_rank_score ?? 0) - (left.experimental_rank_score ?? 0)
      || left.symbol.localeCompare(right.symbol));
  // Keep the shortlist close to the highest ranks while making room for different sectors and sizes.
  const pool = ranked.slice(0, Math.max(25, count * 5));
  const selected: T[] = [];
  const usedSectors = new Set<string>();
  const usedSizes = new Set<string>();
  const add = (company: T) => {
    selected.push(company);
    usedSectors.add(company.market_cap_segment.industry || "Unclassified");
    usedSizes.add(company.market_cap_segment.label);
  };
  for (const company of pool) {
    if (selected.length >= count) break;
    if (!usedSectors.has(company.market_cap_segment.industry || "Unclassified")
      && !usedSizes.has(company.market_cap_segment.label)) add(company);
  }
  for (const company of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(company) && !usedSizes.has(company.market_cap_segment.label)) add(company);
  }
  for (const company of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(company) && !usedSectors.has(company.market_cap_segment.industry || "Unclassified")) add(company);
  }
  for (const company of pool) {
    if (selected.length >= count) break;
    if (!selected.includes(company)) add(company);
  }
  return selected;
}

export default function FeaturedFcs({ companies, radarAsOf, onBrowseLibrary, onDeepDive }: {
  companies: RadarCompany[];
  radarAsOf: string;
  onBrowseLibrary: (symbol: string) => void;
  onDeepDive: (company: { symbol: string; company_name: string; bms_status: "ready" | "fcs_ready" }) => void;
}) {
  const [publications, setPublications] = useState<FcsPublicationSummary[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/bms/fundamental-review/publications", { cache: "no-store", signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!controller.signal.aborted && Array.isArray(payload?.publications)) setPublications(payload.publications);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);
  const library = useMemo(() => mergeFcsPublications(fundamentalChangeLibrary, publications, onDemandLibraryRecord), [publications]);
  const libraryBySymbol = useMemo(() => new Map(library.map((record) => [record.symbol, record])), [library]);
  const lifecycleSymbols = useMemo(() => new Set(library
    .filter((record) => record.lifecycleReady && record.checkpoints >= 3 && record.lifecycle)
    .map((record) => record.symbol)), [library]);
  const featured = useMemo(() => selectFeaturedFcs(companies, lifecycleSymbols), [companies, lifecycleSymbols]);

  if (!featured.length) return null;
  return <section aria-label="Featured FCS research" className="border-b border-emerald-300/15 bg-emerald-300/[0.025] px-5 py-6 md:px-8">
    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">Featured research examples</div>
        <h2 className="mt-1 text-xl font-semibold text-white">{featured.length} companies with FCS and lifecycle reports ready</h2>
        <p className="mt-2 max-w-3xl text-xs leading-relaxed text-zinc-300">Selected from highly ranked positive momentum companies with published FCS and a three-period lifecycle, with a spread across sectors and company sizes. Radar rank describes price behaviour; the FCS report examines business evidence.</p>
      </div>
      <span className="text-[10px] text-zinc-400">Radar data through {radarAsOf}</span>
    </div>
    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {featured.map((company) => {
        const report = libraryBySymbol.get(company.symbol)!;
        return <article key={company.symbol} className="flex flex-col rounded-2xl border border-emerald-300/20 bg-[#132135] p-4">
          <div className="font-mono text-sm font-bold text-white">{company.symbol}</div>
          <div className="mt-1 min-h-8 text-xs text-zinc-200">{company.company_name}</div>
          <div className="mt-2 text-[10px] text-zinc-300">{company.market_cap_segment.industry || "Sector unclassified"} · {company.market_cap_segment.label === "Extended NSE" ? "Broader NSE" : company.market_cap_segment.label}</div>
          <div className="mt-3 text-[10px] text-cyan-100">{trendLabel[company.radar_state]} · Radar {company.experimental_rank_score?.toFixed(1)}</div>
          <div className="mt-2 text-[10px] text-emerald-100">FCS {report.fcsScore} · Lifecycle: {lifecycleDisplay(report.lifecycle).label}</div>
          <div className="mt-1 text-[9px] text-zinc-300">{lifecycleDisplay(report.lifecycle).explanation}</div>
          <div className="mt-1 text-[9px] text-zinc-300">Lifecycle through {report.lifecycleAsOf || report.fcsPeriod}</div>
          <div className="mt-1 text-[9px] text-zinc-400">FCS evidence as of {report.fcsAsOf.slice(0, 10)}</div>
          <div className="mt-auto flex flex-wrap gap-2 pt-4">
            <button type="button" onClick={() => onBrowseLibrary(company.symbol)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300/35 bg-emerald-300/10 px-2.5 py-2 text-[9px] font-bold text-emerald-100 hover:bg-emerald-300/20"><ArrowRight className="h-3 w-3" /> View FCS</button>
            <button type="button" onClick={() => onDeepDive({ symbol: company.symbol, company_name: company.company_name, bms_status: "ready" })} className="inline-flex items-center gap-1 rounded-lg border border-amber-300/30 bg-amber-300/10 px-2.5 py-2 text-[9px] font-bold text-amber-100 hover:bg-amber-300/20"><BookOpen className="h-3 w-3" /> Deep Dive</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
