import { BarChart3, Layers3 } from "lucide-react";

export default function DiscoverTabs({ active, onCompanies, onSectors }: {
  active: "companies" | "sectors";
  onCompanies: () => void;
  onSectors: () => void;
}) {
  return <section className="mb-6 flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4 md:flex-row md:items-center md:justify-between">
    <div>
      <div className="text-[9px] font-black uppercase tracking-[0.2em] text-cyan-300">Discover</div>
      <div className="mt-1 text-sm font-semibold text-white">Explore companies directly or begin with sector participation.</div>
    </div>
    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1" role="tablist" aria-label="Discover view">
      <button type="button" role="tab" aria-selected={active === "companies"} onClick={onCompanies} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${active === "companies" ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400 hover:text-white"}`}><BarChart3 className="h-4 w-4" /> Company Momentum</button>
      <button type="button" role="tab" aria-selected={active === "sectors"} onClick={onSectors} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.1em] transition ${active === "sectors" ? "bg-cyan-300/15 text-cyan-100" : "text-zinc-400 hover:text-white"}`}><Layers3 className="h-4 w-4" /> Sector Lens</button>
    </div>
  </section>;
}
