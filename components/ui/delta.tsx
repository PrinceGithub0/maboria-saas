type DeltaMode = "default" | "muted";

export type DeltaProps = {
  value: number | null | undefined;
  compareLabel?: string;
  suffix?: string;
  precision?: number;
  inverse?: boolean;
  mode?: DeltaMode;
  className?: string;
  displayValue?: string;
};

type DeltaTone = "positive" | "negative" | "neutral" | "unknown";

function resolveTone(value: number | null | undefined, inverse: boolean): DeltaTone {
  if (value == null || Number.isNaN(value)) return "unknown";
  if (value === 0) return "neutral";
  const positive = value > 0;
  if (inverse) return positive ? "negative" : "positive";
  return positive ? "positive" : "negative";
}

function formatDeltaValue(
  value: number | null | undefined,
  precision: number,
  suffix: string,
  displayValue?: string
) {
  if (displayValue) return displayValue;
  if (value == null || Number.isNaN(value)) return "--";
  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  });
  return `${formatter.format(Math.abs(value))}${suffix}`;
}

function toneClasses(tone: DeltaTone) {
  if (tone === "positive") {
    return "delta-text delta-positive dark:text-emerald-300";
  }
  if (tone === "negative") {
    return "delta-text delta-negative dark:text-rose-300";
  }
  if (tone === "unknown") {
    return "delta-text delta-unknown dark:text-muted-foreground";
  }
  return "delta-text delta-neutral dark:text-muted-foreground";
}

function symbolForTone(tone: DeltaTone) {
  if (tone === "positive") return "?";
  if (tone === "negative") return "?";
  if (tone === "neutral") return "?";
  return "";
}

export function Delta({
  value,
  compareLabel,
  suffix = "",
  precision = 1,
  inverse = false,
  mode = "default",
  className = "",
  displayValue,
}: DeltaProps) {
  const tone = resolveTone(value, inverse);
  const symbol = symbolForTone(tone);
  const valueText = formatDeltaValue(value, precision, suffix, displayValue);
  const weight = mode === "muted" ? "font-semibold" : "font-bold";

  return (
    <span className={`inline-flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5 ${className}`.trim()}>
      <span
        className={`inline-flex items-center gap-1 text-xs leading-4 tabular-nums ${weight} ${toneClasses(tone)}`}
      >
        {symbol ? <span aria-hidden="true">{symbol}</span> : null}
        <span>{valueText}</span>
      </span>
      {compareLabel ? <span className="min-w-0 break-words text-xs leading-4 text-muted-foreground">{compareLabel}</span> : null}
    </span>
  );
}
