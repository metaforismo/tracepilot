type MetricProps = {
  label: string;
  value: string | number;
  tone?: "default" | "pass" | "warn" | "fail";
  className?: string;
};

export function Metric({ label, value, tone = "default", className = "" }: MetricProps) {
  const toneClass = tone === "default" ? "" : ` metric--${tone}`;
  return (
    <div className={`metric${toneClass} ${className}`.trim()}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}