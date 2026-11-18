import type {
  Classification,
  MorphWord,
  PartOfSpeech,
} from "@/types/morphology";

export function newMorphId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function tokenizeLatinSentence(text: string): string[] {
  const out: string[] = [];
  const regex = /(\s+|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (/^\s+$/.test(value)) continue;
    out.push(value);
  }
  return out;
}

export function createMorphWord(surface: string): MorphWord {
  return {
    id: newMorphId(),
    originalText: surface,
    meaning: "",
    classifications: [],
  };
}

export function reconcileMorphWords(
  tokens: string[],
  existing: MorphWord[]
): MorphWord[] {
  return tokens.map((token, index) => {
    const prev = existing[index];
    if (prev && prev.originalText === token) {
      return prev;
    }
    const byText = existing.find((w) => w.originalText === token);
    if (byText) {
      return { ...byText, id: newMorphId() };
    }
    return createMorphWord(token);
  });
}

export const POS_LABELS: Record<PartOfSpeech, string> = {
  V: "Verb",
  N: "Noun",
  Adj: "Adjective",
  Adv: "Adverb",
  F: "Functional",
};

export const POS_COLORS: Record<
  PartOfSpeech,
  { bg: string; text: string }
> = {
  N: { bg: "bg-blue-600", text: "text-white" },
  V: { bg: "bg-red-600", text: "text-white" },
  Adv: { bg: "bg-red-300", text: "text-red-950" },
  Adj: { bg: "bg-sky-300", text: "text-sky-950" },
  F: { bg: "bg-slate-400", text: "text-white" },
};

function abbrevNumber(n?: string): string | null {
  if (n === "singular") return "sg";
  if (n === "plural") return "pl";
  return null;
}

function abbrevTense(t?: string): string | null {
  if (!t) return null;
  const map: Record<string, string> = {
    present: "pres.",
    imperfect: "impf.",
    future: "fut.",
    perfect: "perf.",
    plqp: "plupf.",
    "future perfect": "fut. perf.",
  };
  return map[t] ?? t;
}

function abbrevMood(m?: string): string | null {
  if (!m) return null;
  const map: Record<string, string> = {
    indicativus: "ind.",
    imperativus: "imp.",
    coniunctivus: "subj.",
    infinitivus: "inf.",
    gerundium: "ger.",
    supinum: "sup.",
  };
  return map[m] ?? m;
}

function abbrevGender(g?: string): string | null {
  if (g === "M") return "m";
  if (g === "F") return "f";
  if (g === "N") return "n";
  return g ?? null;
}

export function formatPrimaryInfo(c: Classification | undefined): string {
  if (!c) return "—";
  
  // זיהוי סיווג ידני והצגתו על פני הסיווג הרגיל
  if (c.pos !== "Adv" && c.data && (c.data as any).manual) {
    return (c.data as any).manual;
  }

  if (c.pos === "V") {
    return [
      abbrevTense(c.data.tense),
      c.data.person ? `${c.data.person}` : null,
      abbrevNumber(c.data.number),
    ]
      .filter(Boolean)
      .join(", ") || "—";
  }
  if (c.pos === "N" || c.pos === "Adj") {
    // הפונקציה מזהה אם יש כמה יחסות בפורמט שהגדרנו (מופרדות בלוכסן)
    const displayCase = c.data.case ? c.data.case.replace(/\//g, "/") : undefined;
    return [
      displayCase,
      abbrevGender(c.data.gender),
      abbrevNumber(c.data.number),
    ]
      .filter(Boolean)
      .join(", ") || "—";
  }
  if (c.pos === "F") {
    return c.data.type || POS_LABELS[c.pos];
  }
  return POS_LABELS[c.pos];
}

export function formatSecondaryInfo(c: Classification | undefined): string {
  if (!c) return "";
  if (c.pos === "V") {
    return [
      c.data.conjugation ? `conj. ${c.data.conjugation}` : null,
      c.data.voice,
      abbrevMood(c.data.mood),
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (c.pos === "N" || c.pos === "Adj") {
    return c.data.declension ? `decl. ${c.data.declension}` : "";
  }
  return "";
}

export function emptyClassification(pos: PartOfSpeech): Classification {
  switch (pos) {
    case "V":
      return { pos: "V", data: {} };
    case "N":
      return { pos: "N", data: {} };
    case "Adj":
      return { pos: "Adj", data: {} };
    case "Adv":
      return { pos: "Adv" };
    case "F":
      return { pos: "F", data: {} };
  }
}

export function sanitizeFilenameBase(s: string): string {
  const t = s.trim().replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
  return t.slice(0, 80) || "morphology-project";
}
