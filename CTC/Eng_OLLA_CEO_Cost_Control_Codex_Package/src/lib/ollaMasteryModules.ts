import {
  OLLA_MODULES as BASE_OLLA_MODULES,
  MAX_QUESTIONS_PER_PAGE,
  type ExecutiveQuestion,
  type ExecutiveModule
} from "@/lib/ollaMasteryContent";
import { CEO_COST_CONTROL_MASTERY } from "@/lib/ollaCeoMasteryContent";

export const OLLA_MODULES: ExecutiveModule[] = [
  ...BASE_OLLA_MODULES,
  CEO_COST_CONTROL_MASTERY
];

export { MAX_QUESTIONS_PER_PAGE };
export type { ExecutiveQuestion, ExecutiveModule };
