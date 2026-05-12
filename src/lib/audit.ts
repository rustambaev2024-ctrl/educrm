import type { AuditEntry } from "@/lib/data/types";

type Translate = (key: string) => string;

const ENTITY_ALIASES: Record<string, string> = {
  account: "user",
  accounts: "user",
  auth: "auth",
  branch: "branch",
  branches: "branch",
  course: "course",
  courses: "course",
  group: "group",
  groups: "group",
  homework: "homework",
  homeworks: "homework",
  lesson: "lesson",
  lessons: "lesson",
  lead: "lead",
  leads: "lead",
  payment: "payment",
  payments: "payment",
  penalties: "penalty",
  penalty: "penalty",
  student: "student",
  students: "student",
  staff: "staff",
  user: "user",
  users: "user",
};

function normalizeEntity(entity: string) {
  const key = entity.trim().toLowerCase().replace(/[^a-z_]/g, "").split("_").pop() ?? entity;
  return ENTITY_ALIASES[key] ?? key;
}

function translateOrFallback(t: Translate, key: string, fallback: string) {
  const translated = t(key);
  return translated === key ? fallback : translated;
}

export function formatAuditSummary(entry: AuditEntry, t: Translate) {
  const entityKey = normalizeEntity(entry.entity);
  const rawEntity = entry.entity || entry.summary;
  const entity = translateOrFallback(t, `audit.entity.${entityKey}`, rawEntity);
  const template = translateOrFallback(t, `audit.summary.${entry.action}`, "");

  if (template) return template.replace("{entity}", entity);

  const action = translateOrFallback(t, `audit.action.${entry.action}`, entry.action);
  return `${action} ${entity}`;
}
