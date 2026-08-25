export type MetricCandidate = { value: number; source_sheet: string; source_cell: string; source_label: string; score: number };
export type MetricBlock = { preferred: MetricCandidate | null; candidates: MetricCandidate[] };
export type ProjectHistoryItem = {
  reporting_period: string;
  source_fingerprint: string;
  metrics: Record<string, number>;
  normalized_path?: string | null;
};
export type ProjectRegistryItem = {
  project_id: string;
  project_name: string;
  reporting_period: string;
  source_fingerprint: string;
  normalized_path?: string | null;
  approved_parity?: boolean;
  metrics: Record<string, number>;
  capabilities: Record<string, boolean>;
  quality_count: number;
  sheet_count: number;
  chart_count: number;
  history?: ProjectHistoryItem[];
};
export type SheetManifest = {
  index: number; name: string; state: string; dimension: string | null; cell_count: number;
  chart_count: number; table_count: number; raw_path: string; preview: unknown[][];
};
export type ExcelChart = {
  title: string; type: string; source_sheet: string; chart_path: string;
  series: { title: string; references: string[]; cached_values: unknown[] }[];
};
export type ProjectData = {
  schema_version: number; project_id: string; project_name: string; reporting_period: string;
  source: { filename: string; sha256: string; bytes: number; identity_evidence: string[] };
  generated_at: string;
  normalized_path?: string | null;
  approved_parity?: { matched?: boolean; reference_file?: string | null; source_sha256?: string | null };
  metrics: Record<string, MetricBlock | number>;
  capabilities: Record<string, boolean>;
  manifest: { sheet_count: number; visible_sheet_count: number; hidden_sheet_count: number; cell_count: number; detected_table_count: number; excel_chart_count: number; sheets: SheetManifest[]; charts: ExcelChart[]; unaccounted_sheets: number };
  quality: { severity: string; code: string; message: string; sheet?: string; cell?: string }[];
};
export type NormalizedData = Record<string, any>;
export type PortfolioModel = {
  registry: ProjectRegistryItem;
  normalized: NormalizedData | null;
};
