import type { MorphProject, MorphProjectFilePayload, MorphWord, MorphFolder } from "@/types/morphology";
import { newMorphId, sanitizeFilenameBase } from "@/lib/morphology-utils";

export const MORPH_PROJECTS_LIBRARY_KEY = "morphology-projects-library";
export const MORPH_PROJECT_FILE_SCHEMA_VERSION = 1;

export type MorphProjectsLibrary = { v: 1; projects: MorphProject[]; folders?: MorphFolder[] };

// תבניות ברירת מחדל למנגנון המיזוג (השלמת חוסרים אוטומטית)
const DEFAULT_MORPH_WORD: MorphWord = {
  id: "",
  originalText: "",
  meaning: "",
  classifications: []
};

const DEFAULT_MORPH_PROJECT = {
  title: "",
  folderId: null,
  sourceText: "",
  processedText: "",
  words: [],
  literalTranslation: "",
  notes: "",
  syntacticTranslation: "",
  answer: ""
};

// פונקציית עזר חכמה שמשדרגת פרויקטים ישנים לגרסה החדשה ביותר
function migrateProjectData(p: any) {
  if (!p || typeof p !== "object") return p;
  
  // 1. משלים שדות חסרים ברמת הפרויקט (כמו 'הערות' ו'תשובה')
  const merged = { ...DEFAULT_MORPH_PROJECT, ...p };
  
  // 2. סורק את המילים ומשדרג את הסיווגים הישנים
  if (Array.isArray(merged.words)) {
    merged.words = merged.words.map((w: any) => {
      const newWord = { ...DEFAULT_MORPH_WORD, ...w };
      if (Array.isArray(newWord.classifications)) {
        newWord.classifications = newWord.classifications.map((c: any) => {
          // המרה חכמה: הופך את P הישן ל-F עם תת-סיווג של Preposition
          if (c && c.pos === "P") {
            return { ...c, pos: "F", data: { type: "Preposition" } };
          }
          return c;
        });
      }
      return newWord;
    });
  }
  return merged;
}

function isMorphWord(x: unknown): x is MorphWord {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as MorphWord).id === "string" &&
    typeof (x as MorphWord).originalText === "string" &&
    typeof (x as MorphWord).meaning === "string" &&
    Array.isArray((x as MorphWord).classifications)
  );
}

function isMorphProject(x: unknown): x is MorphProject {
  return (
    !!x &&
    typeof x === "object" &&
    typeof (x as MorphProject).id === "string" &&
    typeof (x as MorphProject).title === "string" &&
    typeof (x as MorphProject).sourceText === "string" &&
    typeof (x as MorphProject).processedText === "string" &&
    Array.isArray((x as MorphProject).words) &&
    (x as MorphProject).words.every(isMorphWord) &&
    typeof (x as MorphProject).literalTranslation === "string" &&
    typeof (x as MorphProject).notes === "string" &&
    typeof (x as MorphProject).syntacticTranslation === "string" &&
    typeof (x as MorphProject).answer === "string"
  );
}

export function readMorphProjectsLibrary(): MorphProjectsLibrary {
  try {
    const raw = localStorage.getItem(MORPH_PROJECTS_LIBRARY_KEY);
    if (!raw) return { v: 1, projects: [], folders: [] };
    const parsed = JSON.parse(raw) as Partial<MorphProjectsLibrary>;
    if (parsed.v === 1 && Array.isArray(parsed.projects)) {
      const migratedProjects = parsed.projects.map(migrateProjectData);
      return {
        v: 1,
        projects: migratedProjects.filter(isMorphProject),
        folders: Array.isArray(parsed.folders) ? parsed.folders : []
      };
    }
  } catch {
    /* ignore */
  }
  return { v: 1, projects: [], folders: [] };
}

export function writeMorphProjectsLibrary(lib: MorphProjectsLibrary) {
  try {
    localStorage.setItem(MORPH_PROJECTS_LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    /* ignore */
  }
}

export function newMorphProjectId(): string {
  return newMorphId();
}

export function isValidMorphProjectPayload(
  x: unknown
): x is MorphProjectFilePayload {
  return (
    !!x &&
    typeof x === "object" &&
    (x as MorphProjectFilePayload).schemaVersion ===
      MORPH_PROJECT_FILE_SCHEMA_VERSION &&
    typeof (x as MorphProjectFilePayload).title === "string" &&
    typeof (x as MorphProjectFilePayload).sourceText === "string" &&
    typeof (x as MorphProjectFilePayload).processedText === "string" &&
    Array.isArray((x as MorphProjectFilePayload).words) &&
    (x as MorphProjectFilePayload).words.every(isMorphWord) &&
    typeof (x as MorphProjectFilePayload).literalTranslation === "string" &&
    typeof (x as MorphProjectFilePayload).notes === "string" &&
    typeof (x as MorphProjectFilePayload).syntacticTranslation === "string" &&
    typeof (x as MorphProjectFilePayload).answer === "string"
  );
}

export function parseMorphProjectFileJson(
  text: string
): MorphProjectFilePayload | null {
  try {
    const parsed = JSON.parse(text) as any;
    if (!parsed || typeof parsed !== "object") return null;

    const migrated = migrateProjectData(parsed);
    migrated.schemaVersion = MORPH_PROJECT_FILE_SCHEMA_VERSION;

    if (isValidMorphProjectPayload(migrated)) return migrated;
  } catch {
    /* ignore */
  }
  return null;
}

export function exportMorphProjectFile(payload: MorphProjectFilePayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilenameBase(payload.title)}.json`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function exportMorphLibraryFile(lib: MorphProjectsLibrary) {
  const blob = new Blob([JSON.stringify(lib, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const date = new Date().toISOString().split("T")[0];
  a.download = `morphology-library-backup-${date}.json`;
  a.rel = "noopener";
  a.click();
  URL.revokeObjectURL(url);
}

export function parseMorphLibraryFileJson(
  text: string
): MorphProjectsLibrary | null {
  try {
    const parsed = JSON.parse(text) as any;
    if (parsed && parsed.v === 1 && Array.isArray(parsed.projects)) {
      const migratedProjects = parsed.projects.map(migrateProjectData);
      const validProjects = migratedProjects.filter(isMorphProject);
      return { 
        v: 1, 
        projects: validProjects,
        folders: Array.isArray(parsed.folders) ? parsed.folders : []
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}
