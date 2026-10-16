// Presentation copy only. Persisted lifecycle classifications and scoring stay unchanged.
const lifecycleCopy: Record<string, { label: string; explanation: string }> = {
  WATCH: { label: "No clear trend", explanation: "Comparable FCS scores are mixed or broadly flat." },
  FADING: { label: "Recent weakening", explanation: "The latest comparable FCS fell materially." },
  EMERGING: { label: "Recent improvement", explanation: "The latest comparable FCS improved sharply." },
  BUILDING: { label: "Building improvement", explanation: "FCS improved across two successive comparisons." },
  ESTABLISHED: { label: "Consistently strong", explanation: "FCS remained strong across three comparable periods." },
  RECOVERING: { label: "Recovering", explanation: "FCS improved after a decline but remains below its earlier level." },
  REBOUNDING: { label: "Rebounding", explanation: "FCS improved after a decline and returned near its earlier level." },
};

export function lifecycleDisplay(value: string | null | undefined) {
  const key = value?.trim().toUpperCase() || "";
  return lifecycleCopy[key] || { label: value?.replaceAll("_", " ") || "Pending", explanation: "" };
}
