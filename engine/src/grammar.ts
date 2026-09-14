import { checkArc } from "./arcs.ts";
import { beatTarget, captionStyleOf } from "./captions.ts";
import type { LookDef } from "./look.ts";
import { beatPost } from "./layers.ts";
import type { VideoSpec } from "./spec.ts";
import { stageVideoCount } from "./stage.ts";

// Grammar of a video of v2 beats (ROADMAP D4, «Грамматика»). Errors stop the build before the voice and fail verify;
// warnings are the rhythm rules the director should read. Density of a beat = 1 + its devices (a scene beat counts 2).

export interface GrammarResult {
  errors: string[];
  warnings: string[];
  density: number[];
}

const HERO_POST = ["chromatic", "light-leak", "flicker", "blur-pull"];
const TEXT_PARAMS = ["text", "label", "kicker", "sub", "title"];

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * Text on screen (ROADMAP D6), warnings: the captions keep the look's preset (≤ 2 beats aside); slam and particle-burst — one
 * beat a video unless the look is energetic; text.kinetic — two beats unless the look is typographic; near-target needs a target.
 */
export function textWarnings(spec: VideoSpec, look: LookDef): string[] {
  const out: string[] = [];
  const styles = spec.beats.map((b) => captionStyleOf(look, spec, b));
  const aside = spec.beats.filter((_, i) => styles[i]?.preset !== look.captions.preset).map((b) => b.id);
  if (aside.length > 2) out.push(`субтитры: пресет не из look (${look.captions.preset}) в ${aside.length} битах (${aside.join(", ")}) — отклонений не больше 2`);
  const loud = spec.beats.filter((b, i) => ["kinetic-slam", "particle-burst"].includes(styles[i]?.preset ?? "") || (b.devices ?? []).some((d) => (d.type === "text.kinetic" || d.type === "text.title") && d.params?.mode === "slam")).map((b) => b.id);
  if (loud.length > 1 && look.captions.family !== "energetic") out.push(`slam и particle-burst в ${loud.length} битах (${loud.join(", ")}) — не больше одного на ролик, кроме look семейства energetic`);
  const kinetic = spec.beats.filter((b) => (b.devices ?? []).some((d) => d.type === "text.kinetic")).map((b) => b.id);
  if (kinetic.length > 2 && !look.typography.kinetic) out.push(`text.kinetic в ${kinetic.length} битах (${kinetic.join(", ")}) — не больше 2, кроме типографического look`);
  spec.beats.forEach((b, i) => {
    if (styles[i]?.position === "near-target" && !beatTarget(b)) out.push(`${b.id}: субтитры near-target без устройства с целью — встанут внизу`);
    (b.devices ?? []).forEach((d, k) => {
      if (d.params?.position !== "near-target" || d.target !== undefined) return;
      const others = (b.devices ?? []).filter((o, j) => j !== k && o.target !== undefined && typeof o.target !== "string");
      if (!others.length) out.push(`${b.id}: devices[${k}] ${d.type} near-target без другого устройства с целью`);
    });
  });
  return out;
}

export function checkGrammar(spec: VideoSpec, look: LookDef, videoDir: string): GrammarResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const density: number[] = [];
  let heroBeats = 0;
  spec.beats.forEach((beat, i) => {
    if (beat.scene !== undefined) {
      density.push(2);
    } else {
      const devices = beat.devices ?? [];
      density.push(1 + devices.length);
      if (!beat.stage) errors.push(`${beat.id}: нет stage — ровно один stage на бит`);
      if (devices.length > 3) errors.push(`${beat.id}: ${devices.length} устройств — не больше 3`);
      const data = devices.filter((d) => d.type.startsWith("data."));
      if (data.length > 1) errors.push(`${beat.id}: ${data.length} устройства data.* — не больше одного`);
      devices.forEach((d, k) => {
        if (d.type.startsWith("annotate.") && !d.explains) errors.push(`${beat.id}: devices[${k}] ${d.type} без explains`);
        for (const key of TEXT_PARAMS) {
          const v = d.params?.[key];
          if (typeof v === "string" && d.type !== "text.quote" && words(v) > 7) warnings.push(`${beat.id}: devices[${k}] ${d.type}.${key} — ${words(v)} слов на экране (> 7)`);
        }
      });
      if (beat.dominant === undefined) errors.push(`${beat.id}: нет dominant`);
      // one rhythm per beat (ROADMAP D6): every device on the words, every device on the beats of the music, or every device both
      if (beat.sync !== undefined && !["voice", "music", "both"].includes(beat.sync)) errors.push(`${beat.id}: sync — voice, music или both`);
      // text.kinetic is the frame: it leads the beat and keeps at most one device beside it
      const kin = devices.findIndex((d) => d.type === "text.kinetic");
      if (kin >= 0 && beat.dominant !== kin) errors.push(`${beat.id}: у бита с text.kinetic dominant — это устройство (${kin})`);
      if (kin >= 0 && devices.length > 2) errors.push(`${beat.id}: рядом с text.kinetic не больше одного устройства, а их ${devices.length - 1}`);
      const syncs = new Set(devices.map((d) => d.sync ?? beat.sync ?? "voice"));
      if (syncs.size > 1) errors.push(`${beat.id}: в бите два ритма (${[...syncs].join(" и ")}) — все устройства voice, все music или все both`);
      const videos = stageVideoCount(beat, videoDir);
      if (videos > 2) errors.push(`${beat.id}: ${videos} видео одновременно — не больше 2`);
      const cam = beat.camera;
      const moving = cam !== undefined && (typeof cam === "string" ? cam !== "none" : (cam as Record<string, unknown>).preset !== "none");
      if (moving && !(typeof cam === "object" && cam !== null && (cam as Record<string, unknown>).reason)) warnings.push(`${beat.id}: камера без camera.reason — у stage-бита она стоит на месте`);
    }
    const post = beatPost(beat, look);
    if (post.some((p) => p.strength >= 0.6 && HERO_POST.includes(p.id)) || (beat.textures ?? []).some((t) => ["lightning"].includes(t.id))) heroBeats++;
    const prev = spec.beats[i - 1];
    if (prev && beat.intent && prev.intent === beat.intent) warnings.push(`${beat.id}: intent ${beat.intent} второй раз подряд`);
  });
  for (let i = 1; i < density.length; i++) {
    if ((density[i - 1] as number) >= 3 && (density[i] as number) >= 3) warnings.push(`${spec.beats[i - 1]?.id} → ${spec.beats[i]?.id}: два плотных бита подряд (${density[i - 1]} и ${density[i]})`);
  }
  for (let i = 0; i < density.length - 1; i++) {
    if ((density[i] as number) < 3) continue;
    const next = density.slice(i + 1, i + 3);
    if (!next.some((d) => d <= 1) && i + 1 < density.length - 1) warnings.push(`${spec.beats[i]?.id}: после плотного бита нет паузы (бит плотности ≤ 1 в двух следующих)`);
  }
  if (heroBeats > 1) warnings.push(`hero-эффект (пост ≥ 0,6, молния) в ${heroBeats} битах — не чаще одного на ролик`);
  warnings.push(...textWarnings(spec, look));
  if (spec.beats.some((b) => b.scene === undefined) && !spec.arc) errors.push("ролик с битами v2 без arc {structure, hook, protagonist, ending}");
  errors.push(...checkArc(spec));
  return { errors, warnings, density };
}
