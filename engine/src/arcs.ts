import { existsSync } from "node:fs";
import { join } from "node:path";
import type { VideoSpec } from "./spec.ts";
import { ENGINE_DIR, readJson } from "./lib/util.ts";

// Arc v2 (ROADMAP D4): structure × hook × protagonist × ending. engine/arcs/arc.json lists the values (hooks — the 9
// strategies of faceless-explainer/story-design.md), engine/arcs/<structure>.json the roles of its beats.

interface ArcTable {
  structures: Record<string, string>;
  hooks: Record<string, string>;
  protagonists: Record<string, string>;
  endings: Record<string, string>;
}

interface StructureDef {
  id: string;
  roles: { id: string; what: string; repeat: boolean }[];
  required: string[];
}

export const arcTable = (): ArcTable => readJson<ArcTable>(join(ENGINE_DIR, "arcs", "arc.json"));

export function loadStructure(id: string): StructureDef | null {
  const file = join(ENGINE_DIR, "arcs", `${id}.json`);
  return existsSync(file) ? readJson<StructureDef>(file) : null;
}

export const arcKey = (spec: VideoSpec): string | null => (spec.arc ? [spec.arc.structure, spec.arc.hook, spec.arc.protagonist, spec.arc.ending].join(" × ") : null);

/** Errors of the arc: unknown values, beat roles outside the structure, a hook or an ending role in the wrong place. */
export function checkArc(spec: VideoSpec): string[] {
  const arc = spec.arc;
  if (!arc) return [];
  const t = arcTable();
  const errors: string[] = [];
  const oneOf = (field: string, value: unknown, table: Record<string, string>): void => {
    if (typeof value !== "string" || !table[value]) errors.push(`arc.${field} «${String(value)}» — одно из ${Object.keys(table).join(", ")}`);
  };
  oneOf("structure", arc.structure, t.structures);
  oneOf("hook", arc.hook, t.hooks);
  oneOf("protagonist", arc.protagonist, t.protagonists);
  oneOf("ending", arc.ending, t.endings);
  const st = loadStructure(arc.structure);
  if (!st) return errors;
  const roles = st.roles.map((r) => r.id);
  const given = spec.beats.map((b) => b.role);
  given.forEach((role, i) => {
    if (role !== undefined && !roles.includes(role)) errors.push(`${spec.beats[i]?.id}: role «${role}» — у структуры ${st.id} роли ${roles.join(", ")}`);
  });
  if (given.some((r) => r !== undefined)) {
    if (given[0] !== undefined && given[0] !== "hook") errors.push(`${spec.beats[0]?.id}: первый бит — role hook`);
    const last = given[given.length - 1];
    if (last !== undefined && last !== "ending") errors.push(`${spec.beats[spec.beats.length - 1]?.id}: последний бит — role ending`);
  }
  return errors;
}
