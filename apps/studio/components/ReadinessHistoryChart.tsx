import styles from "./ReadinessHistory.module.css";

export type ReadinessTrendDatum = {
  id: string;
  label: string;
  generatedAt: string;
  value: number | null;
};

type ReadinessHistoryChartProps = {
  title: string;
  description: string;
  data: ReadinessTrendDatum[];
  format: "percent" | "usd";
  threshold?: number;
  thresholdLabel?: string;
  betterDirection: "higher" | "lower";
  tone: "success" | "risk" | "cost";
};

type Point = ReadinessTrendDatum & {
  x: number;
  y: number | null;
};

const width = 720;
const height = 244;
const padding = { top: 18, right: 18, bottom: 38, left: 54 };

export function ReadinessHistoryChart(props: ReadinessHistoryChartProps) {
  const domain = chartDomain(props.data, props.format, props.threshold);
  const points = chartPoints(props.data, domain);
  const segments = pathSegments(points);
  const ticks = tickValues(domain);
  const latest = lastValue(props.data);
  const previous = previousValue(props.data);
  const delta = latest === null || previous === null ? null : latest - previous;
  const deltaTone = delta === null || Math.abs(delta) < 1e-12
    ? "neutral"
    : (props.betterDirection === "higher" ? delta > 0 : delta < 0)
      ? "positive"
      : "negative";
  const titleId = `chart-${slug(props.title)}-title`;
  const descriptionId = `chart-${slug(props.title)}-description`;

  return (
    <section className={`${styles.chartPanel} ${styles[props.tone]}`}>
      <div className={styles.chartHeader}>
        <div>
          <span className={styles.sectionEyebrow}>Release trend</span>
          <h2>{props.title}</h2>
          <p>{props.description}</p>
        </div>
        <div className={styles.chartValue}>
          <strong>{formatValue(latest, props.format)}</strong>
          <span className={styles[deltaTone]}>
            {formatDelta(delta, props.format)} vs previous
          </span>
        </div>
      </div>

      <div className={styles.chartFrame}>
        <svg
          aria-labelledby={`${titleId} ${descriptionId}`}
          className={styles.chart}
          role="img"
          viewBox={`0 0 ${width} ${height}`}
        >
          <title id={titleId}>{props.title}</title>
          <desc id={descriptionId}>
            {`${props.description} ${accessibleSeries(props.data, props.format)}`}
          </desc>

          {ticks.map((tick) => {
            const y = yPosition(tick, domain);
            return (
              <g key={tick}>
                <line
                  className={styles.gridLine}
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={y}
                  y2={y}
                />
                <text className={styles.axisLabel} x={padding.left - 10} y={y + 4} textAnchor="end">
                  {formatAxisValue(tick, props.format)}
                </text>
              </g>
            );
          })}

          {props.threshold === undefined ? null : (
            <g>
              <line
                className={styles.thresholdLine}
                x1={padding.left}
                x2={width - padding.right}
                y1={yPosition(props.threshold, domain)}
                y2={yPosition(props.threshold, domain)}
              />
              <text
                className={styles.thresholdLabel}
                x={padding.left + 8}
                y={yPosition(props.threshold, domain) - 7}
                textAnchor="start"
              >
                {props.thresholdLabel ?? "threshold"}
              </text>
            </g>
          )}

          {segments.map((path, index) => (
            <path className={styles.dataLine} d={path} fill="none" key={`${path}-${index}`} />
          ))}

          {points.map((point) => point.y === null ? null : (
            <g key={point.id}>
              <circle className={styles.dataPointHalo} cx={point.x} cy={point.y} r="8" />
              <circle className={styles.dataPoint} cx={point.x} cy={point.y} r="3.5">
                <title>{`${point.label}, ${point.generatedAt.slice(0, 10)}: ${formatValue(point.value, props.format)}`}</title>
              </circle>
            </g>
          ))}

          {labelIndexes(points.length).map((index) => {
            const point = points[index];
            if (point === undefined) return null;
            return (
              <text
                className={styles.xAxisLabel}
                key={`${point.id}-label`}
                textAnchor={index === 0 ? "start" : index === points.length - 1 ? "end" : "middle"}
                x={point.x}
                y={height - 12}
              >
                {point.generatedAt.slice(5, 10)}
              </text>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

function chartDomain(
  data: ReadinessTrendDatum[],
  format: ReadinessHistoryChartProps["format"],
  threshold: number | undefined
): { min: number; max: number } {
  if (format === "percent") return { min: 0, max: 1 };
  const values = data.flatMap((datum) => datum.value === null ? [] : [datum.value]);
  const rawMax = Math.max(...values, threshold ?? 0, 0.1);
  return { min: 0, max: Math.ceil(rawMax * 10 * 1.12) / 10 };
}

function chartPoints(
  data: ReadinessTrendDatum[],
  domain: { min: number; max: number }
): Point[] {
  const plotWidth = width - padding.left - padding.right;
  const denominator = Math.max(data.length - 1, 1);
  return data.map((datum, index) => ({
    ...datum,
    x: padding.left + (index / denominator) * plotWidth,
    y: datum.value === null ? null : yPosition(datum.value, domain)
  }));
}

function yPosition(value: number, domain: { min: number; max: number }): number {
  const plotHeight = height - padding.top - padding.bottom;
  const ratio = (value - domain.min) / Math.max(domain.max - domain.min, Number.EPSILON);
  return padding.top + (1 - ratio) * plotHeight;
}

function pathSegments(points: Point[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  for (const point of points) {
    if (point.y === null) {
      if (current.length > 0) segments.push(current.join(" "));
      current = [];
      continue;
    }

    current.push(`${current.length === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`);
  }

  if (current.length > 0) segments.push(current.join(" "));
  return segments;
}

function tickValues(domain: { min: number; max: number }): number[] {
  const step = (domain.max - domain.min) / 4;
  return Array.from({ length: 5 }, (_, index) => domain.min + step * index);
}

function labelIndexes(length: number): number[] {
  if (length <= 1) return length === 0 ? [] : [0];
  if (length === 2) return [0, 1];
  return [...new Set([0, Math.floor((length - 1) / 2), length - 1])];
}

function lastValue(data: ReadinessTrendDatum[]): number | null {
  return data.at(-1)?.value ?? null;
}

function previousValue(data: ReadinessTrendDatum[]): number | null {
  return data.at(-2)?.value ?? null;
}

function formatValue(value: number | null, format: ReadinessHistoryChartProps["format"]): string {
  if (value === null) return "No evidence";
  return format === "percent" ? `${(value * 100).toFixed(1)}%` : `$${value.toFixed(4)}`;
}

function formatAxisValue(value: number, format: ReadinessHistoryChartProps["format"]): string {
  return format === "percent" ? `${Math.round(value * 100)}%` : `$${value.toFixed(2)}`;
}

function formatDelta(delta: number | null, format: ReadinessHistoryChartProps["format"]): string {
  if (delta === null) return "—";
  if (format === "percent") {
    const points = delta * 100;
    return `${points > 0 ? "+" : ""}${points.toFixed(1)} pp`;
  }
  return `${delta > 0 ? "+" : delta < 0 ? "−" : ""}$${Math.abs(delta).toFixed(4)}`;
}

function accessibleSeries(data: ReadinessTrendDatum[], format: ReadinessHistoryChartProps["format"]): string {
  return data
    .map((datum) => `${datum.label} ${formatValue(datum.value, format)}`)
    .join("; ");
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
