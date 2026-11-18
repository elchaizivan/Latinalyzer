import {
  useState,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Settings,
  Upload,
} from "lucide-react";
import TextInput from "@/components/TextInput";
import ClickableText from "@/components/ClickableText";
import DictionaryPanel from "@/components/DictionaryPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TRANSLATION_STORAGE_KEY = "word-lookup-sentence-translations-v2";
const PROJECTS_LIBRARY_KEY = "word-lookup-projects-library";
const PROJECT_FILE_SCHEMA_VERSION = 2;
const SHOW_SENTENCE_BOXES_KEY = "word-lookup-show-sentence-boxes";
const SHOW_WORD_BOXES_KEY = "word-lookup-show-word-boxes";

/** Default Wiktionary filter language (matches TextInput option value). */
const DEFAULT_SOURCE_LANGUAGE = "Latin";
const MIN_WORD_COUNT_STORAGE_KEY = "word-lookup-min-words-per-unit";
const WORD_REORDERING_STORAGE_KEY = "word-lookup-word-reordering-enabled";
const DISPLAY_MODE_STORAGE_KEY = "word-lookup-display-mode";

/** `true` = Translation Workspace; `false` = Reading Mode (basic view). */
function readTranslationWorkspaceModeFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(DISPLAY_MODE_STORAGE_KEY);
    if (raw === "reading") return false;
    if (raw === "workspace") return true;
  } catch {
    /* ignore */
  }
  return false;
}

function persistTranslationWorkspaceMode(workspace: boolean) {
  try {
    localStorage.setItem(
      DISPLAY_MODE_STORAGE_KEY,
      workspace ? "workspace" : "reading"
    );
  } catch {
    /* ignore */
  }
}

const MIN_WORDS_SLIDER_MIN = 1;
const MIN_WORDS_SLIDER_MAX = 30;

function readMinWordCountFromStorage(): number {
  try {
    const raw = localStorage.getItem(MIN_WORD_COUNT_STORAGE_KEY);
    if (raw == null) return 6;
    const n = Number.parseInt(raw, 10);
    if (
      Number.isFinite(n) &&
      n >= MIN_WORDS_SLIDER_MIN &&
      n <= MIN_WORDS_SLIDER_MAX
    ) {
      return n;
    }
  } catch {
    /* ignore */
  }
  return 6;
}

function clampMinWordCount(n: number): number {
  return Math.min(
    MIN_WORDS_SLIDER_MAX,
    Math.max(MIN_WORDS_SLIDER_MIN, Math.round(n))
  );
}

function persistMinWordCount(n: number) {
  try {
    localStorage.setItem(MIN_WORD_COUNT_STORAGE_KEY, String(n));
  } catch {
    /* ignore */
  }
}

function readWordReorderingFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(WORD_REORDERING_STORAGE_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

function persistWordReordering(enabled: boolean) {
  try {
    localStorage.setItem(WORD_REORDERING_STORAGE_KEY, enabled ? "true" : "false");
  } catch {
    /* ignore */
  }
}

function readShowSentenceBoxesFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_SENTENCE_BOXES_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

function persistShowSentenceBoxes(on: boolean) {
  try {
    localStorage.setItem(SHOW_SENTENCE_BOXES_KEY, on ? "true" : "false");
  } catch {
    /* ignore */
  }
}

function readShowWordBoxesFromStorage(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_WORD_BOXES_KEY);
    if (raw === "true") return true;
    if (raw === "false") return false;
  } catch {
    /* ignore */
  }
  return false;
}

function persistShowWordBoxes(on: boolean) {
  try {
    localStorage.setItem(SHOW_WORD_BOXES_KEY, on ? "true" : "false");
  } catch {
    /* ignore */
  }
}

type SerializableWord = { id: string; surface: string };

type WordToken = {
  id: string;
  surface: string;
  clean: string;
};

type WorkspaceFingerprintData = {
  translations: Record<string, string>;
  sentenceWords: SerializableWord[][];
  wordTranslations?: Record<string, string>;
};

type TranslationStoreV2 = {
  v: 2;
  byFingerprint: Record<string, unknown>;
};

/** Split after sentence/clause punctuation or on newlines. */
function initialSplitFragments(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  return t
    .split(/(?<=[.!?:;])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

/** True if this fragment must not start its own translation block. */
function isNumericOrWordNumberFragment(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^\d+\.?$/.test(t)) return true;
  return /^\p{L}+\s+\d+\.?$/u.test(t);
}

/** Attach list-only / numbering tails to neighbors so they never get a lone box. */
function mergeNumericProtected(fragments: string[]): string[] {
  if (fragments.length === 0) return [];
  const result: string[] = [];
  let pending: string | null = null;

  for (const frag of fragments) {
    const f = frag.trim();
    if (!f) continue;

    if (isNumericOrWordNumberFragment(f)) {
      if (result.length > 0) {
        result[result.length - 1] = `${result[result.length - 1]} ${f}`.trim();
      } else {
        pending = pending ? `${pending} ${f}`.trim() : f;
      }
    } else {
      if (pending !== null) {
        result.push(`${pending} ${f}`.trim());
        pending = null;
      } else {
        result.push(f);
      }
    }
  }

  if (pending !== null) {
    if (result.length > 0) {
      result[result.length - 1] = `${result[result.length - 1]} ${pending}`.trim();
    } else {
      result.push(pending);
    }
  }

  return result;
}

/** Merge fragments with fewer than `minWordCount` words into the following fragment. */
function mergeShortFragments(
  fragments: string[],
  minWordCount: number
): string[] {
  if (fragments.length === 0) return [];
  const threshold = Math.max(1, minWordCount);
  const out: string[] = [];
  let i = 0;
  while (i < fragments.length) {
    let block = fragments[i];
    i += 1;
    while (wordCount(block) < threshold && i < fragments.length) {
      block = `${block} ${fragments[i]}`.trim();
      i += 1;
    }
    out.push(block);
  }
  return out;
}

function buildMergedTranslationBlocks(
  text: string,
  minWordCount: number
): string[] {
  const raw = initialSplitFragments(text);
  if (raw.length === 0) return [];
  return mergeShortFragments(mergeNumericProtected(raw), minWordCount);
}

function hashMergedBlocks(blocks: string[]): string {
  if (blocks.length === 0) return "";
  const joined = blocks.join("\u0001");
  let h = 5381;
  for (let i = 0; i < joined.length; i++) {
    h = Math.imul(h, 33) ^ joined.charCodeAt(i);
  }
  return `m${(h >>> 0).toString(36)}_${blocks.length}`;
}

function cleanFromSurface(surface: string): string {
  return surface.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

function newWordId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function tokenizeToWordTokens(text: string): WordToken[] {
  const out: WordToken[] = [];
  const regex = /(\s+|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (/^\s+$/.test(value)) continue;
    out.push({
      id: newWordId(),
      surface: value,
      clean: cleanFromSurface(value),
    });
  }
  return out;
}

function joinWordsAsText(words: WordToken[]): string {
  return words.map((w) => w.surface).join(" ");
}

function hydrateSentenceWords(rows: SerializableWord[][]): WordToken[][] {
  return rows.map((row) =>
    row.map((w) => ({
      id: w.id,
      surface: w.surface,
      clean: cleanFromSurface(w.surface),
    }))
  );
}

function serializeSentenceWords(rows: WordToken[][]): SerializableWord[][] {
  return rows.map((row) => row.map((w) => ({ id: w.id, surface: w.surface })));
}

function parseFingerprintEntry(raw: unknown): WorkspaceFingerprintData {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>;
    if ("translations" in o || "sentenceWords" in o) {
      const translations: Record<string, string> = {};
      if (
        o.translations &&
        typeof o.translations === "object" &&
        o.translations !== null &&
        !Array.isArray(o.translations)
      ) {
        for (const [k, v] of Object.entries(
          o.translations as Record<string, unknown>
        )) {
          if (typeof v === "string") translations[k] = v;
        }
      }
      let sentenceWords: SerializableWord[][] = [];
      if (Array.isArray(o.sentenceWords)) {
        sentenceWords = o.sentenceWords.map((row) => {
          if (!Array.isArray(row)) return [];
          return row.filter(
            (w): w is SerializableWord =>
              !!w &&
              typeof w === "object" &&
              typeof (w as SerializableWord).id === "string" &&
              typeof (w as SerializableWord).surface === "string"
          );
        });
      }
      let wordTranslations: Record<string, string> | undefined;
      if (
        o.wordTranslations &&
        typeof o.wordTranslations === "object" &&
        !Array.isArray(o.wordTranslations)
      ) {
        wordTranslations = {};
        for (const [k, v] of Object.entries(
          o.wordTranslations as Record<string, unknown>
        )) {
          if (typeof v === "string") wordTranslations[k] = v;
        }
      }
      return { translations, sentenceWords, wordTranslations };
    }
    const legacy: Record<string, string> = {};
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === "string") legacy[k] = v;
    }
    return { translations: legacy, sentenceWords: [], wordTranslations: {} };
  }
  return { translations: {}, sentenceWords: [], wordTranslations: {} };
}

function readTranslationStore(): TranslationStoreV2 {
  try {
    const raw = localStorage.getItem(TRANSLATION_STORAGE_KEY);
    if (!raw) return { v: 2, byFingerprint: {} };
    const parsed = JSON.parse(raw) as Partial<TranslationStoreV2>;
    if (
      parsed.v === 2 &&
      parsed.byFingerprint &&
      typeof parsed.byFingerprint === "object"
    ) {
      return { v: 2, byFingerprint: { ...parsed.byFingerprint } };
    }
  } catch {
    /* ignore */
  }
  return { v: 2, byFingerprint: {} };
}

function readWorkspaceFromStore(fingerprint: string): WorkspaceFingerprintData {
  if (!fingerprint) {
    return { translations: {}, sentenceWords: [], wordTranslations: {} };
  }
  const root = readTranslationStore();
  return parseFingerprintEntry(root.byFingerprint[fingerprint]);
}

function writeWorkspaceToStore(fingerprint: string, data: WorkspaceFingerprintData) {
  if (!fingerprint) return;
  try {
    const root = readTranslationStore();
    root.byFingerprint[fingerprint] = {
      translations: data.translations,
      sentenceWords: data.sentenceWords,
      wordTranslations: data.wordTranslations ?? {},
    };
    localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(root));
  } catch {
    /* ignore quota / private mode */
  }
}

type LibraryProject = {
  id: string;
  title: string;
  fullOriginalText: string;
  wordArrays: SerializableWord[][];
  sentenceTranslations: Record<string, string>;
  wordTranslations?: Record<string, string>;
  minWordCount: number;
  translationWorkspaceMode?: boolean;
  wordReorderingEnabled?: boolean;
  showSentenceBoxes?: boolean;
  showWordBoxes?: boolean;
  updatedAt?: string;
};

type ProjectsLibrary = { v: 1; projects: LibraryProject[] };

type ProjectFilePayload = {
  schemaVersion: number;
  title: string;
  fullOriginalText: string;
  wordArrays: SerializableWord[][];
  sentenceTranslations: Record<string, string>;
  wordTranslations?: Record<string, string>;
  minWordCount: number;
  translationWorkspaceMode?: boolean;
  wordReorderingEnabled?: boolean;
  showSentenceBoxes?: boolean;
  showWordBoxes?: boolean;
};

function readProjectsLibrary(): ProjectsLibrary {
  try {
    const raw = localStorage.getItem(PROJECTS_LIBRARY_KEY);
    if (!raw) return { v: 1, projects: [] };
    const p = JSON.parse(raw) as Partial<ProjectsLibrary>;
    if (p.v === 1 && Array.isArray(p.projects)) {
      const projects = p.projects
        .filter(
          (x): x is LibraryProject =>
            !!x &&
            typeof x === "object" &&
            typeof (x as LibraryProject).id === "string" &&
            typeof (x as LibraryProject).title === "string" &&
            typeof (x as LibraryProject).fullOriginalText === "string" &&
            Array.isArray((x as LibraryProject).wordArrays) &&
            typeof (x as LibraryProject).minWordCount === "number"
        )
        .map((x) => ({
          ...x,
          sentenceTranslations:
            x.sentenceTranslations &&
            typeof x.sentenceTranslations === "object" &&
            !Array.isArray(x.sentenceTranslations)
              ? (x.sentenceTranslations as Record<string, string>)
              : {},
        }));
      return { v: 1, projects };
    }
  } catch {
    /* ignore */
  }
  return { v: 1, projects: [] };
}

function writeProjectsLibrary(lib: ProjectsLibrary) {
  try {
    localStorage.setItem(PROJECTS_LIBRARY_KEY, JSON.stringify(lib));
  } catch {
    /* ignore */
  }
}

function newLibraryProjectId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeFilenameBase(s: string): string {
  const t = s.trim().replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "");
  return t.slice(0, 80) || "word-lookup-project";
}

function hydrateWordRow(row: SerializableWord[] | undefined): WordToken[] {
  if (!row || !Array.isArray(row)) return [];
  return row
    .filter(
      (w): w is SerializableWord =>
        !!w &&
        typeof w === "object" &&
        typeof w.id === "string" &&
        typeof w.surface === "string"
    )
    .map((w) => ({
      id: w.id,
      surface: w.surface,
      clean: cleanFromSurface(w.surface),
    }));
}

/** Align saved word rows to current merge blocks; fill gaps by tokenizing blocks. */
function reconcileWordArraysToBlocks(
  blocks: string[],
  saved: SerializableWord[][]
): WordToken[][] {
  return blocks.map((b, i) => {
    const row = saved[i];
    if (row && Array.isArray(row) && row.length > 0) {
      return hydrateWordRow(row);
    }
    return tokenizeToWordTokens(b);
  });
}

function isValidProjectPayload(x: unknown): x is ProjectFilePayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const ver = o.schemaVersion;
  if (ver !== 1 && ver !== 2) return false;
  if (typeof o.title !== "string") return false;
  if (typeof o.fullOriginalText !== "string") return false;
  if (typeof o.minWordCount !== "number") return false;
  if (!Array.isArray(o.wordArrays)) return false;
  if (!o.sentenceTranslations || typeof o.sentenceTranslations !== "object") return false;
  return true;
}

function parseProjectFileJson(text: string): ProjectFilePayload | null {
  try {
    const data = JSON.parse(text) as unknown;
    if (isValidProjectPayload(data)) return data;
  } catch {
    /* ignore */
  }
  return null;
}

type LatinUnitViewProps = {
  words: WordToken[];
  sentenceIndex: number;
  totalUnits: number;
  showReorderArrows: boolean;
  showWordBoxes: boolean;
  wordTranslations: Record<string, string>;
  onWordTranslationChange: (wordId: string, value: string) => void;
  selectedWord: string | null;
  onWordClick: (w: string) => void;
  moveWord: (si: number, wi: number, dir: "left" | "right") => void;
};

function LatinUnitView({
  words,
  sentenceIndex,
  totalUnits,
  showReorderArrows,
  showWordBoxes,
  wordTranslations,
  onWordTranslationChange,
  selectedWord,
  onWordClick,
  moveWord,
}: LatinUnitViewProps) {
  if (!showReorderArrows && !showWordBoxes) {
    return (
      <ClickableText
        text={joinWordsAsText(words)}
        selectedWord={selectedWord}
        onWordClick={onWordClick}
        dictionaryEnabled
      />
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-x-1 gap-y-1.5 min-w-0 text-base leading-6 text-foreground">
      {words.map((word, wi) => {
        const disableLeft = sentenceIndex === 0 && wi === 0;
        const disableRight =
          sentenceIndex === totalUnits - 1 && wi === words.length - 1;
        const isSelected =
          !showReorderArrows &&
          selectedWord !== null &&
          !!word.clean &&
          word.clean.toLowerCase() === selectedWord.toLowerCase();

        const wordEl = showReorderArrows ? (
          <span className="px-0.5 select-text text-foreground">{word.surface}</span>
        ) : word.clean ? (
          <button
            type="button"
            onClick={() => onWordClick(word.clean)}
            className={[
              "rounded px-0.5 text-left transition-colors cursor-pointer",
              isSelected
                ? "bg-accent text-accent-foreground underline underline-offset-2"
                : "hover:bg-accent/60 hover:text-accent-foreground",
            ].join(" ")}
          >
            {word.surface}
          </button>
        ) : (
          <span className="px-0.5">{word.surface}</span>
        );

        const glossInput = showWordBoxes ? (
          <Input
            value={wordTranslations[word.id] ?? ""}
            onChange={(e) => onWordTranslationChange(word.id, e.target.value)}
            placeholder="…"
            aria-label={`Gloss for ${word.surface}`}
            className="h-5 min-h-[1.25rem] w-full min-w-[2.75rem] max-w-full border-border/40 bg-muted/30 px-1 py-0 text-[10px] leading-tight text-foreground shadow-none placeholder:text-muted-foreground/45 focus-visible:ring-1 focus-visible:ring-border/50 md:text-[11px]"
          />
        ) : null;

        if (showReorderArrows) {
          return (
            <div
              key={word.id}
              className="inline-flex max-w-full flex-col gap-0.5 rounded-md border border-border/30 bg-muted/20 px-0.5 py-0.5"
            >
              <span className="inline-flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Move word left"
                  disabled={disableLeft}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    moveWord(sentenceIndex, wi, "left");
                  }}
                >
                  <ChevronLeft className="size-3" aria-hidden />
                </Button>
                {wordEl}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label="Move word right"
                  disabled={disableRight}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    moveWord(sentenceIndex, wi, "right");
                  }}
                >
                  <ChevronRight className="size-3" aria-hidden />
                </Button>
              </span>
              {glossInput}
            </div>
          );
        }

        return (
          <div
            key={word.id}
            className="inline-flex min-w-0 max-w-[min(100%,9rem)] flex-col gap-0.5 align-bottom"
          >
            {wordEl}
            {glossInput}
          </div>
        );
      })}
    </div>
  );
}

export default function Home() {
  const isMobile = useIsMobile();
  const [rawText, setRawText] = useState("");
  const [submittedText, setSubmittedText] = useState("");
  const [minWordCount, setMinWordCount] = useState(readMinWordCountFromStorage);
  const [wordReorderingEnabled, setWordReorderingEnabled] = useState(
    readWordReorderingFromStorage
  );
  const [translationWorkspaceMode, setTranslationWorkspaceMode] = useState(
    readTranslationWorkspaceModeFromStorage
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sentenceWords, setSentenceWords] = useState<WordToken[][]>([]);
  const [sentenceTranslations, setSentenceTranslations] = useState<
    Record<number, string>
  >({});
  const [wordTranslations, setWordTranslations] = useState<
    Record<string, string>
  >({});
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [showSentenceBoxes, setShowSentenceBoxes] = useState(
    readShowSentenceBoxesFromStorage
  );
  const [showWordBoxes, setShowWordBoxes] = useState(readShowWordBoxesFromStorage);
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] =
    useState<string>(DEFAULT_SOURCE_LANGUAGE);
  const [lookupGeneration, setLookupGeneration] = useState(0);

  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [clearLibraryOpen, setClearLibraryOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const libraryProjects = useMemo(
    () => readProjectsLibrary().projects,
    [libraryRevision]
  );

  const sentenceWordsRef = useRef(sentenceWords);
  const sentenceTranslationsRef = useRef(sentenceTranslations);
  const wordTranslationsRef = useRef(wordTranslations);
  sentenceWordsRef.current = sentenceWords;
  sentenceTranslationsRef.current = sentenceTranslations;
  wordTranslationsRef.current = wordTranslations;

  const setShowSentenceBoxesPersisted = useCallback((on: boolean) => {
    setShowSentenceBoxes(on);
    persistShowSentenceBoxes(on);
  }, []);

  const setShowWordBoxesPersisted = useCallback((on: boolean) => {
    setShowWordBoxes(on);
    persistShowWordBoxes(on);
  }, []);

  const setMinWordCountPersisted = useCallback((value: number) => {
    const next = clampMinWordCount(value);
    setMinWordCount(next);
    persistMinWordCount(next);
  }, []);

  const setWordReorderingPersisted = useCallback((enabled: boolean) => {
    setWordReorderingEnabled(enabled);
    persistWordReordering(enabled);
    if (enabled) setSelectedWord(null);
  }, []);

  const setTranslationWorkspaceModePersisted = useCallback(
    (workspace: boolean) => {
      setTranslationWorkspaceMode(workspace);
      persistTranslationWorkspaceMode(workspace);
    },
    []
  );

  const applyProjectData = useCallback(
    (payload: ProjectFilePayload, options?: { setAsCurrentProjectId?: string | null }) => {
      const full = payload.fullOriginalText;
      const trimmed = full.trim();
      const mc = clampMinWordCount(payload.minWordCount);
      const wt: Record<string, string> = {};
      if (payload.wordTranslations && typeof payload.wordTranslations === "object") {
        for (const [k, v] of Object.entries(payload.wordTranslations)) {
          if (typeof v === "string") wt[k] = v;
        }
      }
      const twm = payload.translationWorkspaceMode ?? false;
      const wre = payload.wordReorderingEnabled ?? false;
      const ssb = payload.showSentenceBoxes ?? false;
      const swb = payload.showWordBoxes ?? false;

      if (!trimmed) {
        setRawText(full);
        setSubmittedText("");
        setMinWordCount(mc);
        persistMinWordCount(mc);
        setSentenceWords([]);
        setSentenceTranslations({});
        setWordTranslations({});
        setTranslationWorkspaceMode(twm);
        persistTranslationWorkspaceMode(twm);
        setWordReorderingEnabled(wre);
        persistWordReordering(wre);
        setShowSentenceBoxes(ssb);
        persistShowSentenceBoxes(ssb);
        setShowWordBoxes(swb);
        persistShowWordBoxes(swb);
        setSelectedWord(null);
        if (options?.setAsCurrentProjectId !== undefined) {
          setCurrentProjectId(options.setAsCurrentProjectId);
        }
        return;
      }
      const blocks = buildMergedTranslationBlocks(trimmed, mc);
      const fp = hashMergedBlocks(blocks);
      const words = reconcileWordArraysToBlocks(blocks, payload.wordArrays);
      const trans: Record<number, string> = {};
      for (const [k, v] of Object.entries(payload.sentenceTranslations)) {
        const i = Number(k);
        if (!Number.isNaN(i) && typeof v === "string") trans[i] = v;
      }
      writeWorkspaceToStore(fp, {
        translations: Object.fromEntries(
          Object.entries(trans).map(([k, v]) => [String(k), v])
        ),
        sentenceWords: serializeSentenceWords(words),
        wordTranslations: wt,
      });
      setRawText(full);
      setSubmittedText(trimmed);
      setMinWordCount(mc);
      persistMinWordCount(mc);
      setSentenceWords(words);
      setSentenceTranslations(trans);
      setWordTranslations(wt);
      setTranslationWorkspaceMode(twm);
      persistTranslationWorkspaceMode(twm);
      setWordReorderingEnabled(wre);
      persistWordReordering(wre);
      setShowSentenceBoxes(ssb);
      persistShowSentenceBoxes(ssb);
      setShowWordBoxes(swb);
      persistShowWordBoxes(swb);
      setSelectedWord(null);
      if (options?.setAsCurrentProjectId !== undefined) {
        setCurrentProjectId(options.setAsCurrentProjectId);
      }
    },
    []
  );

  const exportCurrentProjectFile = useCallback(() => {
    const trimmed = submittedText.trim();
    if (!trimmed) return;
    const titleBase =
      trimmed.split(/\s+/).slice(0, 8).join(" ").slice(0, 72) || "project";
    const payload: ProjectFilePayload = {
      schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
      title: titleBase,
      fullOriginalText: rawText.length > 0 ? rawText : submittedText,
      wordArrays: serializeSentenceWords(sentenceWords),
      sentenceTranslations: Object.fromEntries(
        Object.entries(sentenceTranslations).map(([k, v]) => [
          String(k),
          v,
        ])
      ),
      wordTranslations: { ...wordTranslations },
      minWordCount,
      translationWorkspaceMode,
      wordReorderingEnabled,
      showSentenceBoxes,
      showWordBoxes,
    };
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
  }, [
    submittedText,
    rawText,
    sentenceWords,
    sentenceTranslations,
    wordTranslations,
    minWordCount,
    translationWorkspaceMode,
    wordReorderingEnabled,
    showSentenceBoxes,
    showWordBoxes,
  ]);

  const persistProjectToLibrary = useCallback(
    (mode: "smart" | "new") => {
      const trimmed = submittedText.trim();
      if (!trimmed) return;
      const lib = readProjectsLibrary();
      const title = newProjectTitle.trim() || "Untitled";
      const snapshotBase: Omit<LibraryProject, "id"> = {
        title,
        fullOriginalText: rawText.length > 0 ? rawText : submittedText,
        wordArrays: serializeSentenceWords(sentenceWords),
        sentenceTranslations: Object.fromEntries(
          Object.entries(sentenceTranslations).map(([k, v]) => [
            String(k),
            v,
          ])
        ),
        wordTranslations: { ...wordTranslations },
        minWordCount,
        translationWorkspaceMode,
        wordReorderingEnabled,
        showSentenceBoxes,
        showWordBoxes,
        updatedAt: new Date().toISOString(),
      };

      if (mode === "smart" && currentProjectId) {
        const idx = lib.projects.findIndex((p) => p.id === currentProjectId);
        if (idx !== -1) {
          lib.projects[idx] = {
            ...snapshotBase,
            id: currentProjectId,
          };
          writeProjectsLibrary(lib);
          setLibraryRevision((r) => r + 1);
          setNewProjectTitle("");
          return;
        }
      }

      const id = newLibraryProjectId();
      lib.projects = [{ ...snapshotBase, id }, ...lib.projects];
      writeProjectsLibrary(lib);
      setCurrentProjectId(id);
      setLibraryRevision((r) => r + 1);
      setNewProjectTitle("");
    },
    [
      submittedText,
      rawText,
      sentenceWords,
      sentenceTranslations,
      wordTranslations,
      minWordCount,
      newProjectTitle,
      currentProjectId,
      translationWorkspaceMode,
      wordReorderingEnabled,
      showSentenceBoxes,
      showWordBoxes,
    ]
  );

  const loadLibraryProject = useCallback(
    (p: LibraryProject) => {
      applyProjectData(
        {
          schemaVersion: PROJECT_FILE_SCHEMA_VERSION,
          title: p.title,
          fullOriginalText: p.fullOriginalText,
          wordArrays: p.wordArrays,
          sentenceTranslations:
            p.sentenceTranslations && typeof p.sentenceTranslations === "object"
              ? p.sentenceTranslations
              : {},
          wordTranslations: p.wordTranslations,
          minWordCount: p.minWordCount,
          translationWorkspaceMode: p.translationWorkspaceMode,
          wordReorderingEnabled: p.wordReorderingEnabled,
          showSentenceBoxes: p.showSentenceBoxes,
          showWordBoxes: p.showWordBoxes,
        },
        { setAsCurrentProjectId: p.id }
      );
      setProjectsOpen(false);
    },
    [applyProjectData]
  );

  const deleteLibraryProject = useCallback((id: string) => {
    const lib = readProjectsLibrary();
    lib.projects = lib.projects.filter((x) => x.id !== id);
    writeProjectsLibrary(lib);
    setLibraryRevision((r) => r + 1);
    setCurrentProjectId((cur) => (cur === id ? null : cur));
  }, []);

  const onImportFileSelected = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = parseProjectFileJson(text);
        if (!parsed) {
          window.alert(
            "Could not read this file. Use a JSON file exported from this app."
          );
          return;
        }
        applyProjectData(parsed, { setAsCurrentProjectId: null });
        setProjectsOpen(false);
      };
      reader.readAsText(file, "utf-8");
    },
    [applyProjectData]
  );

  const handleClearProjectLibrary = useCallback(() => {
    writeProjectsLibrary({ v: 1, projects: [] });
    setLibraryRevision((r) => r + 1);
    setCurrentProjectId(null);
    setClearLibraryOpen(false);
  }, []);

  const mergedBlocks = useMemo(
    () => buildMergedTranslationBlocks(submittedText, minWordCount),
    [submittedText, minWordCount]
  );

  const workspaceFingerprint = useMemo(
    () => hashMergedBlocks(mergedBlocks),
    [mergedBlocks]
  );

  useLayoutEffect(() => {
    if (!submittedText || mergedBlocks.length === 0 || !workspaceFingerprint) {
      setSentenceWords([]);
      setSentenceTranslations({});
      setWordTranslations({});
      return;
    }
    const stored = readWorkspaceFromStore(workspaceFingerprint);
    const trans: Record<number, string> = {};
    for (const [k, v] of Object.entries(stored.translations)) {
      const idx = Number(k);
      if (!Number.isNaN(idx)) trans[idx] = v;
    }
    setSentenceTranslations(trans);

    const loadWordTrans = (raw: Record<string, string> | undefined) => {
      const wt: Record<string, string> = {};
      for (const [k, v] of Object.entries(raw ?? {})) {
        if (typeof v === "string") wt[k] = v;
      }
      return wt;
    };

    if (stored.sentenceWords.length === mergedBlocks.length) {
      setSentenceWords(hydrateSentenceWords(stored.sentenceWords));
      setWordTranslations(loadWordTrans(stored.wordTranslations));
    } else {
      const built = mergedBlocks.map((b) => tokenizeToWordTokens(b));
      setSentenceWords(built);
      setWordTranslations({});
      writeWorkspaceToStore(workspaceFingerprint, {
        translations: Object.fromEntries(
          Object.entries(trans).map(([k, v]) => [String(k), v])
        ),
        sentenceWords: serializeSentenceWords(built),
        wordTranslations: {},
      });
    }
  }, [submittedText, mergedBlocks, workspaceFingerprint]);

  const handleTranslationChange = useCallback(
    (sentenceIndex: number, value: string) => {
      setSentenceTranslations((prev) => {
        const next = { ...prev, [sentenceIndex]: value };
        writeWorkspaceToStore(workspaceFingerprint, {
          translations: Object.fromEntries(
            Object.entries(next).map(([k, v]) => [String(k), v])
          ),
          sentenceWords: serializeSentenceWords(sentenceWordsRef.current),
          wordTranslations: { ...wordTranslationsRef.current },
        });
        return next;
      });
    },
    [workspaceFingerprint]
  );

  const handleWordTranslationChange = useCallback(
    (wordId: string, value: string) => {
      setWordTranslations((prev) => {
        const next = { ...prev, [wordId]: value };
        writeWorkspaceToStore(workspaceFingerprint, {
          translations: Object.fromEntries(
            Object.entries(sentenceTranslationsRef.current).map(([k, v]) => [
              String(k),
              v,
            ])
          ),
          sentenceWords: serializeSentenceWords(sentenceWordsRef.current),
          wordTranslations: next,
        });
        return next;
      });
    },
    [workspaceFingerprint]
  );

  const moveWord = useCallback(
    (sentenceIndex: number, wordIndex: number, direction: "left" | "right") => {
      setSentenceWords((prev) => {
        if (sentenceIndex < 0 || sentenceIndex >= prev.length) return prev;
        const row = prev[sentenceIndex];
        if (wordIndex < 0 || wordIndex >= row.length) return prev;

        const next = prev.map((r) => r.map((w) => ({ ...w })));
        const cur = next[sentenceIndex];
        const w = cur[wordIndex];

        if (direction === "right") {
          if (wordIndex < cur.length - 1) {
            const t = cur[wordIndex];
            cur[wordIndex] = cur[wordIndex + 1];
            cur[wordIndex + 1] = t;
          } else if (sentenceIndex < next.length - 1) {
            cur.splice(wordIndex, 1);
            next[sentenceIndex + 1].unshift(w);
          } else {
            return prev;
          }
        } else {
          if (wordIndex > 0) {
            const t = cur[wordIndex];
            cur[wordIndex] = cur[wordIndex - 1];
            cur[wordIndex - 1] = t;
          } else if (sentenceIndex > 0) {
            cur.splice(wordIndex, 1);
            next[sentenceIndex - 1].push(w);
          } else {
            return prev;
          }
        }

        writeWorkspaceToStore(workspaceFingerprint, {
          translations: Object.fromEntries(
            Object.entries(sentenceTranslationsRef.current).map(([k, v]) => [
              String(k),
              v,
            ])
          ),
          sentenceWords: serializeSentenceWords(next),
          wordTranslations: { ...wordTranslationsRef.current },
        });
        return next;
      });
    },
    [workspaceFingerprint]
  );

  const handleResetLayout = useCallback(() => {
    const t = submittedText.trim();
    if (!t) return;
    const blocks = buildMergedTranslationBlocks(t, 6);
    if (blocks.length === 0) return;
    const fp = hashMergedBlocks(blocks);
    const built = blocks.map((b) => tokenizeToWordTokens(b));
    setSentenceTranslations({});
    setSentenceWords(built);
    setWordTranslations({});
    setCurrentProjectId(null);
    setMinWordCount(6);
    persistMinWordCount(6);
    try {
      const root = readTranslationStore();
      delete root.byFingerprint[workspaceFingerprint];
      root.byFingerprint[fp] = {
        translations: {},
        sentenceWords: serializeSentenceWords(built),
        wordTranslations: {},
      };
      localStorage.setItem(TRANSLATION_STORAGE_KEY, JSON.stringify(root));
    } catch {
      /* ignore */
    }
  }, [submittedText, workspaceFingerprint]);

  const handleSubmit = useCallback(() => {
    setSubmittedText(rawText.trim());
    setSelectedWord(null);
  }, [rawText]);

  const handleWordClick = useCallback((id: string, clean: string) => {
    setSelectedWordId(id);
    setSelectedWord(clean);
    setLookupGeneration((g) => g + 1);
  }, []);

  const handleDictionarySheetOpenChange = useCallback((open: boolean) => {
    if (!open) setSelectedWord(null);
  }, []);

  const dictionaryPanel = (
    <DictionaryPanel
      key={lookupGeneration}
      word={selectedWord}
      selectedLanguage={selectedLanguage}
      onSelectHebrewWord={(hebrewWord) => {
        if (selectedWordId) {
          handleWordTranslationChange(selectedWordId, hebrewWord);
        }
        // התוספת שלנו: סגירת הפאנל במובייל
        if (isMobile) {
          setSelectedWord(null);
        }
      }}
    />
  );

  const showReorderArrows =
    translationWorkspaceMode && wordReorderingEnabled;

  const readingModeHint =
    "Click a word to look it up — units are spaced for readability.";
  const workspaceReorderHint =
    "Use arrows to move words; dictionary lookup is off";
  const workspaceLookupHint = "Click a word to look it up";

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="relative z-20 shrink-0 border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 pr-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Word Lookup
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Paste any text, then click a word to see its definition.
            </p>
          </div>
          <div className="flex shrink-0 items-start gap-2 mt-0.5">
          <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="My projects"
              onClick={() => {
                // התוספת שלנו: שולפים את שם הפרויקט הנוכחי ומכניסים לתיבה לפני פתיחת החלון
                if (currentProjectId) {
                  const currentProject = libraryProjects.find(p => p.id === currentProjectId);
                  if (currentProject) {
                    setNewProjectTitle(currentProject.title);
                  }
                }
                setProjectsOpen(true);
              }}
            >
              <FolderOpen className="size-4" aria-hidden />
            </Button>
            <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label="Open settings"
                >
                  <Settings className="size-4" aria-hidden />
                </Button>
              </PopoverTrigger>
            <PopoverContent
              align="end"
              side="bottom"
              sideOffset={8}
              collisionPadding={16}
              className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(28rem,calc(100vh-6rem))] overflow-y-auto p-4 bg-white opacity-100 shadow-2xl z-50 border border-slate-200"
            >
              <div className="space-y-4">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    Settings
                  </h2>
                  <p className="text-xs text-muted-foreground leading-snug">
                    Layout, editing, and reset options for the current passage.
                  </p>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Layout
                  </h3>
                  <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
                    <div className="space-y-2">
                      <Label
                        htmlFor="display-mode"
                        className="text-sm font-medium text-foreground"
                      >
                        Display mode
                      </Label>
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={
                            !translationWorkspaceMode
                              ? "text-xs font-semibold text-foreground"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          Reading Mode
                        </span>
                        <Switch
                          id="display-mode"
                          checked={translationWorkspaceMode}
                          onCheckedChange={setTranslationWorkspaceModePersisted}
                          aria-label="Translation Workspace when on, Reading Mode when off"
                        />
                        <span
                          className={
                            translationWorkspaceMode
                              ? "text-xs font-semibold text-foreground"
                              : "text-xs text-muted-foreground"
                          }
                        >
                          Translation Workspace
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Reading Mode hides translation fields and shows a continuous
                        clickable flow with spacing between units (grouping still
                        follows the threshold below).
                      </p>
                    </div>
                    <Separator className="bg-border/60" />
                    <div className="space-y-3">
                      <div className="flex items-end justify-between gap-3">
                        <Label
                          htmlFor="min-word-count"
                          className="text-sm font-medium leading-tight text-foreground"
                        >
                          Minimum words per translation unit
                        </Label>
                        <Input
                          id="min-word-count"
                          type="number"
                          inputMode="numeric"
                          min={MIN_WORDS_SLIDER_MIN}
                          max={MIN_WORDS_SLIDER_MAX}
                          value={minWordCount}
                          onChange={(e) => {
                            const v = Number.parseInt(e.target.value, 10);
                            if (Number.isNaN(v)) return;
                            setMinWordCountPersisted(v);
                          }}
                          className="h-8 w-14 shrink-0 px-2 text-center text-sm tabular-nums"
                        />
                      </div>
                      <Slider
                        value={[minWordCount]}
                        min={MIN_WORDS_SLIDER_MIN}
                        max={MIN_WORDS_SLIDER_MAX}
                        step={1}
                        onValueChange={(v) => {
                          const next = v[0];
                          if (next !== undefined) setMinWordCountPersisted(next);
                        }}
                      />
                      <p className="text-xs text-muted-foreground leading-snug">
                        Short segments merge forward until each unit has at least
                        this many words (after list/number handling).
                      </p>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Translation
                  </h3>
                  <div className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <Label
                          htmlFor="sentence-boxes"
                          className="text-sm font-medium text-foreground"
                        >
                          Show Sentence Boxes
                        </Label>
                        <p className="text-xs text-muted-foreground leading-snug">
                          Per-unit translation fields in Translation Workspace.
                        </p>
                      </div>
                      <Switch
                        id="sentence-boxes"
                        checked={showSentenceBoxes}
                        disabled={!translationWorkspaceMode}
                        onCheckedChange={setShowSentenceBoxesPersisted}
                      />
                    </div>
                    <Separator className="bg-border/60" />
                    <div className="flex items-center justify-between gap-3">
                      <div className="space-y-0.5 min-w-0 pr-2">
                        <Label
                          htmlFor="word-boxes"
                          className="text-sm font-medium text-foreground"
                        >
                          Show Word Boxes
                        </Label>
                        <p className="text-xs text-muted-foreground leading-snug">
                          Small gloss fields under each Latin word (interlinear).
                        </p>
                      </div>
                      <Switch
                        id="word-boxes"
                        checked={showWordBoxes}
                        onCheckedChange={setShowWordBoxesPersisted}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Editing
                  </h3>
                  <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/10 p-3">
                    <div className="space-y-0.5 min-w-0 pr-2">
                      <Label
                        htmlFor="word-reordering"
                        className="text-sm font-medium text-foreground"
                      >
                        Enable Word Reordering
                      </Label>
                      <p className="text-xs text-muted-foreground leading-snug">
                        Arrows appear only in Translation Workspace. Dictionary
                        tap is off while reordering is on.
                      </p>
                    </div>
                    <Switch
                      id="word-reordering"
                      checked={wordReorderingEnabled}
                      disabled={!translationWorkspaceMode}
                      onCheckedChange={setWordReorderingPersisted}
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Actions
                  </h3>
                  <div className="space-y-2 rounded-md border border-border/60 bg-muted/10 p-3">
                    <p className="text-xs text-muted-foreground leading-snug">
                      Clear saved translations, custom word order, and reset the
                      word threshold to the default for this passage.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={
                        !workspaceFingerprint || mergedBlocks.length === 0
                      }
                      onClick={() => {
                        handleResetLayout();
                        setSettingsOpen(false);
                      }}
                    >
                      Reset layout
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        setSettingsOpen(false);
                        setClearLibraryOpen(true);
                      }}
                    >
                      Clear project library…
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
        <DialogContent className="flex max-h-[min(90vh,40rem)] w-[min(100vw-2rem,28rem)] max-w-none flex-col gap-0 overflow-hidden p-6 sm:max-w-xl">
          <DialogHeader className="shrink-0 space-y-2 pr-8 text-left">
            <DialogTitle>My Projects</DialogTitle>
            <DialogDescription>
              Save the current workspace, open a saved project, or move work
              between devices with export/import (JSON).
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto py-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-title" className="text-sm font-medium">
                Project title
              </Label>
              {currentProjectId ? (
                <p className="text-xs text-muted-foreground leading-snug">
                  This workspace is linked to a library entry.{" "}
                  <span className="font-medium text-foreground">Save</span>{" "}
                  updates that entry; use{" "}
                  <span className="font-medium text-foreground">
                    Save as New
                  </span>{" "}
                  to keep a separate copy.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground leading-snug">
                  <span className="font-medium text-foreground">Save</span> adds
                  a new project. Use{" "}
                  <span className="font-medium text-foreground">
                    Save as New
                  </span>{" "}
                  anytime to duplicate the current state.
                </p>
              )}
              <Input
                id="new-project-title"
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="Project title"
                className="w-full"
              />
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button
                  type="button"
                  className="sm:min-w-[7rem] active:scale-80 transition-all"
                  disabled={!submittedText.trim()}
                  onClick={() => persistProjectToLibrary("smart")}
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="sm:min-w-[7rem] active:scale-80 transition-all"
                  disabled={!submittedText.trim()}
                  onClick={() => persistProjectToLibrary("new")}
                >
                  Save as New
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={!submittedText.trim()}
                onClick={exportCurrentProjectFile}
              >
                <Download className="size-3.5" aria-hidden />
                Export project
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => importFileInputRef.current?.click()}
              >
                <Upload className="size-3.5" aria-hidden />
                Import project
              </Button>
            </div>
            <Separator />
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <p className="text-sm font-medium text-foreground">
                Saved on this device
              </p>
              <ul className="max-h-48 min-h-[4.5rem] space-y-2 overflow-y-auto rounded-md border border-border/60 bg-muted/10 p-2">
                {libraryProjects.length === 0 ? (
                  <li className="px-1 py-2 text-xs text-muted-foreground">
                    No saved projects yet.
                  </li>
                ) : (
                  libraryProjects.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/40 bg-background px-2 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {p.title}
                        {currentProjectId === p.id ? (
                          <span className="ml-2 text-xs font-normal text-primary">
                            (current)
                          </span>
                        ) : null}
                      </span>
                      <div className="flex shrink-0 gap-1">
                      <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="active:scale-80 transition-all"
                          onClick={() => loadLibraryProject(p)}
                        >
                          Load
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          onClick={() => deleteLibraryProject(p.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-4 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setProjectsOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <input
        ref={importFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportFileSelected(f);
          e.target.value = "";
        }}
      />

      <AlertDialog open={clearLibraryOpen} onOpenChange={setClearLibraryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear project library?</AlertDialogTitle>
            <AlertDialogDescription>
              All entries in My Projects on this device will be removed. Your
              current workspace stays as it is. Use Export if you need backups.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={handleClearProjectLibrary}>
              Clear library
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 flex flex-col gap-0 overflow-y-auto">
          <div className="p-6 border-b border-border">
            <TextInput
              value={rawText}
              onChange={setRawText}
              onSubmit={handleSubmit}
              selectedLanguage={selectedLanguage}
              onLanguageChange={setSelectedLanguage}
            />
          </div>

          {submittedText && (
            <div className="p-6 min-w-0">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                {!translationWorkspaceMode
                  ? readingModeHint
                  : showReorderArrows
                    ? workspaceReorderHint
                    : workspaceLookupHint}
              </p>
              {!translationWorkspaceMode ? (
                <div className="flex flex-col gap-4 min-w-0">
                  {mergedBlocks.map((_, index) => {
                    const words = sentenceWords[index] ?? [];
                    return (
                      <div
                        key={`${workspaceFingerprint}-read-${index}`}
                        className="min-w-0"
                      >
                        {words.length === 0 ? (
                          <span className="text-muted-foreground italic text-sm">
                            No words in this unit.
                          </span>
                        ) : (
                          <LatinUnitView
                            words={words}
                            sentenceIndex={index}
                            totalUnits={mergedBlocks.length}
                            showReorderArrows={false}
                            showWordBoxes={showWordBoxes}
                            wordTranslations={wordTranslations}
                            onWordTranslationChange={handleWordTranslationChange}
                            selectedWord={selectedWord}
                            onWordClick={(clean) => handleWordClick(words.find(w => w.clean === clean)?.id || "", clean)}
                            moveWord={moveWord}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  {mergedBlocks.map((_, index) => {
                    const words = sentenceWords[index] ?? [];
                    return (
                      <div
                        key={`${workspaceFingerprint}-${index}`}
                        className="flex flex-col gap-2 min-w-0"
                      >
                        {words.length === 0 ? (
                          <span className="text-muted-foreground italic text-sm">
                            No words in this unit.
                          </span>
                        ) : (
                          <LatinUnitView
                            words={words}
                            sentenceIndex={index}
                            totalUnits={mergedBlocks.length}
                            showReorderArrows={showReorderArrows}
                            showWordBoxes={showWordBoxes}
                            wordTranslations={wordTranslations}
                            onWordTranslationChange={handleWordTranslationChange}
                            selectedWord={selectedWord}
                            onWordClick={(clean) => handleWordClick(words.find(w => w.clean === clean)?.id || "", clean)}
                            moveWord={moveWord}
                          />
                        )}
                        {showSentenceBoxes ? (
                          <div className="flex flex-col gap-1.5 mt-1">
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[10.5px] uppercase tracking-wider text-muted-foreground hover:text-primary hover:bg-primary/10 active:scale-95 transition-all gap-1.5"
                                title="Copy all word translations into the sentence box"
                                onClick={() => {
                                  // אוספים את התרגומים לפי הסדר, מסננים מילים ריקות, ומחברים
                                  const gathered = words
                                    .map((w) => wordTranslations[w.id])
                                    .filter((t) => t && t.trim() !== "")
                                    .join(" ");
                                  
                                  // מציבים את הטקסט המחובר בתיבת התרגום של המשפט
                                  handleTranslationChange(index, gathered);
                                }}
                              >
                                <Download className="size-3" aria-hidden />
                                Assemble Sentence
                              </Button>
                            </div>
                            <Textarea
                              dir="rtl"
                              value={sentenceTranslations[index] ?? ""}
                              onChange={(e) =>
                                handleTranslationChange(index, e.target.value)
                              }
                              placeholder="Translation…"
                              rows={2}
                              className="min-h-[52px] resize-y text-sm leading-relaxed bg-white/95 text-foreground border-border/50 shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-border/40 dark:bg-zinc-950/60 dark:border-border/40"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </main>

        {!isMobile && (
          <aside className="w-[360px] shrink-0 border-l border-border overflow-y-auto bg-card">
            {dictionaryPanel}
          </aside>
        )}
      </div>

      {isMobile && (
        <Sheet
          open={selectedWord !== null}
          onOpenChange={handleDictionarySheetOpenChange}
        >
          <SheetContent
            side="bottom"
            className="h-[80vh] max-h-[80vh] flex flex-col gap-0 overflow-hidden rounded-t-xl border-border p-0"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6 pt-12">
              {dictionaryPanel}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
