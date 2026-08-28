/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";

type InputItem = { componentId: string; componentName: string; semanticType: string };
type Extractor = any;

const MODEL_ID = "all-MiniLM-L6-v2";
const FAMILIES = [
  ["cost_performance", "earned value cost performance budget actual cost variance CPI work package"],
  ["profitability", "revenue profit gross margin commercial return deductions"],
  ["cashflow", "monthly cumulative cash in cash out funding collection payment"],
  ["cost_mix", "direct indirect accounting cost composition source mix"],
  ["concentration", "pareto top cost codes resources concentration leading driver"],
  ["waste", "steel concrete material waste efficiency allowance"],
  ["reconciliation", "ledger reconciliation accounting cost control reallocation gap"],
  ["forecast", "forecast ETC EAC BAC VAC remaining budget quantity rate"],
  ["data_quality", "data quality lineage source assurance warning conflict coverage"],
  ["inventory", "lookup register source records inventory evidence"],
  ["scenario", "scenario stress sensitivity revenue realization forecast decision"],
] as const;

let extractor: Extractor | null = null;
let anchorVectors: number[][] | null = null;
let backend = "WASM";

const post = (message: Record<string, unknown>) => self.postMessage(message);
const progress = (info: any) => {
  if (info?.status === "progress") post({ type: "progress", progress: Number(info.progress) || 0, message: `Loading ${info.file || "local semantic model"}` });
};
const dot = (a: number[], b: number[]) => a.reduce((sum, value, index) => sum + value * (b[index] || 0), 0);

async function createExtractor() {
  env.allowRemoteModels = false;
  env.allowLocalModels = true;
  env.localModelPath = "/models/";
  env.useBrowserCache = true;
  (env.backends.onnx.wasm as any).wasmPaths = "/models/wasm/";
  const hasWebGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  if (hasWebGpu) {
    try {
      backend = "WebGPU";
      return await pipeline("feature-extraction", MODEL_ID, { dtype: "q8", device: "webgpu", progress_callback: progress });
    } catch {
      backend = "WASM fallback";
    }
  }
  return await pipeline("feature-extraction", MODEL_ID, { dtype: "q8", device: "wasm", progress_callback: progress });
}

async function embeddings(texts: string[]) {
  if (!extractor) extractor = await createExtractor();
  const output: any = await extractor(texts, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

async function classify(items: InputItem[]) {
  if (!items.length) { post({ type: "ready", backend: "deterministic", mappings: {} }); return; }
  if (!anchorVectors) anchorVectors = await embeddings(FAMILIES.map(item => item[1]));
  const vectors = await embeddings(items.map(item => `${item.componentName}. ${item.semanticType.replaceAll("_", " ")}`));
  const mappings: Record<string, { family: string; score: number }> = {};
  items.forEach((item, index) => {
    const scored = FAMILIES.map((family, familyIndex) => ({ family: family[0], score: dot(vectors[index], anchorVectors![familyIndex]) })).sort((a, b) => b.score - a.score);
    mappings[item.componentId] = scored[0];
  });
  post({ type: "ready", backend, mappings });
}

self.onmessage = async event => {
  const message = event.data || {};
  if (message.type === "dispose") {
    if (extractor) await extractor.dispose();
    extractor = null;
    anchorVectors = null;
    self.close();
    return;
  }
  if (message.type !== "classify") return;
  try { await classify(Array.isArray(message.items) ? message.items : []); }
  catch (error) { post({ type: "fallback", message: error instanceof Error ? error.message : String(error) }); }
};

export {};
