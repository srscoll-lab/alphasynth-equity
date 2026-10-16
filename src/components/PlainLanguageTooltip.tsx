import { useState } from "react";
import { HelpCircle } from "lucide-react";

type Props = {
  label: string;
  explanation: string;
};

export default function PlainLanguageTooltip({ label, explanation }: Props) {
  const [open, setOpen] = useState(false);
  return <span className="group relative inline-flex items-center gap-1.5 normal-case tracking-normal">
    <span>{label}</span>
    <button
      type="button"
      aria-label={`Explain ${label}`}
      aria-expanded={open}
      onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}
      className="rounded-full text-cyan-200/75 outline-none hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300/60"
    >
      <HelpCircle className="h-3.5 w-3.5" />
    </button>
    <span
      role="tooltip"
      className={`${open ? "flex" : "hidden"} absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-cyan-200/20 bg-[#07101e] p-3 text-left text-[11px] font-medium normal-case leading-relaxed tracking-normal text-zinc-200 shadow-2xl group-hover:flex`}
    >
      {explanation}
    </span>
  </span>;
}
