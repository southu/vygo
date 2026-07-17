/** Shared chart payload types (mirrors readiness score API shapes). */

export type ChartSubMetric = {
  name: string;
  score: number;
  weight?: number;
  key?: string;
};

export type ChartDimension = {
  dimension: string;
  score: number;
  sub_metrics: ChartSubMetric[];
};

export type ReadinessChartData = {
  overall: number;
  dimensions: ChartDimension[];
  /** Optional source label for staging UI (snapshot id or preview). */
  sourceLabel?: string;
  bucket?: string | null;
};
