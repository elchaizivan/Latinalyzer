import { useState, useEffect, useRef, type ReactNode } from "react";

const POS_HEBREW_MAP: Record<string, string> = {
  "noun": "שם עצם",
  "proper noun": "שם עצם פרטי",
  "verb": "פועל",
  "adjective": "שם תואר",
  "adverb": "תואר הפועל",
  "pronoun": "כינוי גוף",
  "preposition": "מילת יחס",
  "conjunction": "מילת חיבור",
  "interjection": "מילת קריאה",
  "numeral": "מספר",
  "particle": "מילת עזר",
  "article": "תווית",
  "phrase": "ביטוי",
  "suffix": "סיומת",
  "prefix": "קידומת",
  "idiom": "ניב"
};

interface WiktionaryPart {
  partOfSpeech: string;
  language: string;
  definitions: Array<{
    definition: string;
    examples?: string[];
  }>;
}

interface WiktionaryResult {
  word: string;
  parts: WiktionaryPart[];
}

type FetchState<TData = WiktionaryResult> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: TData }
  | { status: "not_found" }
  | { status: "error"; message: string };

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

async function fetchWiktionary(word: string): Promise<WiktionaryResult | null> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;

  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();

  if (!json || typeof json !== "object") return null;

  // Collect parts from every language section in the response
  const LANG_NAMES: Record<string, string> = {
    en: "English", es: "Spanish", fr: "French", de: "German",
    it: "Italian", pt: "Portuguese", la: "Latin", nl: "Dutch",
    pl: "Polish", ru: "Russian", zh: "Chinese", ja: "Japanese",
    ar: "Arabic", sv: "Swedish", no: "Norwegian", fi: "Finnish",
  };

  const parts: WiktionaryPart[] = [];

  for (const [langCode, sections] of Object.entries(json)) {
    if (!Array.isArray(sections)) continue;
    const langLabel = LANG_NAMES[langCode] ?? langCode;

    for (const s of sections as Array<{ partOfSpeech?: string; definitions?: unknown[] }>) {
      if (!s.partOfSpeech || !Array.isArray(s.definitions)) continue;
      parts.push({
        partOfSpeech: s.partOfSpeech,
        language: langLabel,
        definitions: (s.definitions as Array<{ definition: string; examples?: string[] }>)
          .slice(0, 4)
          .map((d) => ({
            definition: stripHtml(d.definition),
            examples: d.examples?.map(stripHtml).filter(Boolean).slice(0, 2),
          })),
      });
    }
  }

  if (!parts.length) return null;

  return { word, parts };
}

// Latin enclitics to strip as a fallback, in priority order
const LATIN_ENCLITICS = ["que", "ve", "ne"] as const;

interface FallbackResult {
  data: WiktionaryResult;
  resolvedWord: string;
}

/** מנסה למצוא את המילה המקורית, ואז באותיות קטנות, ואז ללא סיומות לטיניות. 
 * הפונקציה תמשיך בחיפוש אם היא לא מצאה תוצאות בשפה המבוקשת. */
async function fetchWithFallback(word: string, targetLanguage: string): Promise<FallbackResult | null> {
  const isSatisfactory = (res: WiktionaryResult | null) => {
    if (!res) return false;
    if (targetLanguage === "All") return true;
    return res.parts.some(p => p.language === targetLanguage);
  };

  // 1. נסיון למצוא את המילה כפי שהיא
  const direct = await fetchWiktionary(word);
  if (isSatisfactory(direct)) return { data: direct!, resolvedWord: word };

  // 2. נסיון למצוא באותיות קטנות (lowercase)
  const lower = word.toLowerCase();
  if (lower !== word) {
    const lowerResult = await fetchWiktionary(lower);
    if (isSatisfactory(lowerResult)) return { data: lowerResult!, resolvedWord: lower };
  }

  // 2.5 נסיון להמיר ליגטורות (אותיות מחוברות) לאותיות נפרדות
  const unligatured = lower.replace(/æ/g, "ae").replace(/œ/g, "oe");
  if (unligatured !== lower) {
    const unligaturedResult = await fetchWiktionary(unligatured);
    if (isSatisfactory(unligaturedResult)) return { data: unligaturedResult!, resolvedWord: unligatured };
  }

  // 3. נסיון להסיר סיומות לטיניות (על הבסיס החדש ללא הליגטורות)
  const base = unligatured;
  for (const suffix of LATIN_ENCLITICS) {
    if (base.length > suffix.length + 1 && base.endsWith(suffix)) {
      const stripped = base.slice(0, base.length - suffix.length);
      const strippedResult = await fetchWiktionary(stripped);
      if (isSatisfactory(strippedResult)) return { data: strippedResult!, resolvedWord: stripped };
    }
  }

  return null;
}

// רשימת מונחי דקדוק שמופיעים בוויקימילון. לוכד מילת בסיס רק אם קדם ל-"of" מונח דקדוקי חוקי.
// \p{Script=Latin} מבטיח שנתפוס רק מילים באותיות לטיניות (כולל אותיות עם מקרון) ולא מילים בשפות אחרות.
const OF_LEMMA_RE = /\b(?:singular|plural|inflection|indicative|subjunctive|imperative|infinitive|participle|supine|gerund|gerundive|nominative|accusative|genitive|dative|ablative|vocative|locative|masculine|feminine|neuter|form|spelling|variant|tense|voice|mood|person)\s+of\s+([\p{Script=Latin}\p{M}'-]+)/ui;

const LATIN_GRAMMAR_HEBREW: Record<string, string> = {
  "third-person": "גוף שלישי",
  "first-person": "גוף ראשון",
  "second-person": "גוף שני",
  singular: "יחיד",
  plural: "רבים",
  present: "הווה",
  past: "עבר",
  future: "עתיד",
  imperfect: "בלתי מושלם",
  perfect: "מושלם",
  passive: "סביל",
  active: "פעיל",
  subjunctive: "בצורת תילוי",
  indicative: "אינדיקטיב",
  imperative: "ציווי",
  infinitive: "שם הפועל",
  participle: "בינוני",
  gerund: "גרונד",
  accusative: "אקוזטיב",
  nominative: "נומינטיב",
  genitive: "גניטיב",
  dative: "דטיב",
  ablative: "אבלטיב",
  vocative: "ווקטיב",
  of: "של",
};

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateGrammar(text: string): ReactNode {
  const keys = Object.keys(LATIN_GRAMMAR_HEBREW).sort((a, b) => b.length - a.length);
  let translated = text;
  for (const key of keys) {
    const re = new RegExp(`\\b${escapeRegex(key)}\\b`, "gi");
    translated = translated.replace(re, LATIN_GRAMMAR_HEBREW[key]);
  }

  const ofLemmaHeRe = /\bשל\s+([\p{L}\p{M}'-]+)/u;
  const m = ofLemmaHeRe.exec(translated);
  if (!m) return translated;

  const lemma = m[1];
  const matchIdx = m.index + m[0].indexOf(lemma);
  
  const beforeLemma = translated.slice(0, matchIdx);
  const afterLemma = translated.slice(matchIdx + lemma.length);

  return (
    <>
      {beforeLemma}
      <strong className="font-bold">{lemma}</strong>
      {afterLemma}
    </>
  );
}

function renderDefinitionWithBoldLemma(definition: string): ReactNode {
  const m = OF_LEMMA_RE.exec(definition);
  if (!m) return definition;

  const lemma = m[1];
  const matchIdx = m.index + m[0].indexOf(lemma);
  
  const beforeLemma = definition.slice(0, matchIdx);
  const afterLemma = definition.slice(matchIdx + lemma.length);

  return (
    <>
      {beforeLemma}
      <strong className="font-bold">{lemma}</strong>
      {afterLemma}
    </>
  );
}

function extractLemmas(result: WiktionaryResult, targetLanguage: string): string[] {
  const seen = new Set<string>();
  for (const part of result.parts) {
    // תיקון: מחלץ מילות בסיס רק מהשפה שנבחרה (אלא אם נבחר "All")
    if (targetLanguage !== "All" && part.language !== targetLanguage) continue;
    
    for (const def of part.definitions) {
      const m = OF_LEMMA_RE.exec(def.definition);
      if (m) {
        const lemma = m[1];
        if (lemma.toLowerCase() !== result.word.toLowerCase()) {
          seen.add(lemma);
        }
      }
    }
  }
  return Array.from(seen);
}

function removeDiacritics(word: string): string {
  // מפרק את המילה, מסיר סימנים דיאקריטיים, וגם פותח ליגטורות נפוצות
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/æ/g, "ae")
    .replace(/œ/g, "oe")
    .replace(/Æ/g, "Ae")
    .replace(/Œ/g, "Oe");
}

interface DictionaryPanelProps {
  word: string | null;
  selectedLanguage: string;
  onSelectHebrewWord?: (word: string) => void;
}

type DefinitionTranslationState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; text: string }
  | { status: "error"; message: string };

async function fetchHebrewTranslation(text: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=iw&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json: unknown = await res.json();
  if (!Array.isArray(json) || !Array.isArray(json[0])) {
    throw new Error("Invalid translation response");
  }
  const translated = (json[0] as unknown[])
    .filter(Array.isArray)
    .map((chunk) => (chunk as unknown[])[0])
    .filter((part): part is string => typeof part === "string")
    .join("");
  return translated.trim();
}

function isGrammarOnlyDefinition(definition: string): boolean {
  return OF_LEMMA_RE.test(definition);
}

interface WhitakerData {
  forms: string | null;
  partOfSpeech: string | null;
  declension: string | null;
  gender: string | null;
}

const DECLENSION_MAP: Record<string, string> = {
  "1st": "נטייה ראשונה",
  "2nd": "נטייה שנייה",
  "3rd": "נטייה שלישית",
  "4th": "נטייה רביעית",
  "5th": "נטייה חמישית",
};

const GENDER_MAP: Record<string, string> = {
  "M": "זכר",
  "F": "נקבה",
  "N": "סתמי",
  "C": "משותף",
};

function WhitakerInfo({ word }: { word: string }) {
  const [data, setData] = useState<WhitakerData | null>(null);

  useEffect(() => {
    let active = true;
    // הפיכה לאותיות קטנות, טיפול בליגטורות והסרת כל סימן שאינו אות רגילה כדי שוויטקר יבין בוודאות
    const cleanWord = word
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/æ/g, "ae")
      .replace(/œ/g, "oe")
      .replace(/[^a-z]/g, "");
    
    fetch(`/api/whitaker?word=${encodeURIComponent(cleanWord)}`)
      .then(r => r.json())
      .then(d => { if (active && d && d.forms) setData(d); })
      .catch(() => {});
      
    return () => { active = false; };
  }, [word]);

  if (!data) return null;

  let cleanForms = data.forms || "";
  let rawDeclension = data.declension || "";

  // ניקוי שאריות כמו "V" או סוגריים מהטקסט הגולמי
  const fallbackMatch = cleanForms.match(/\s+[A-Z]+\s*\((.*?)\).*$/);
  if (fallbackMatch) {
    if (!rawDeclension) rawDeclension = fallbackMatch[1];
    cleanForms = cleanForms.replace(/\s+[A-Z]+\s*\([^)]*\).*$/, "");
  }
  cleanForms = cleanForms.replace(/\s+[A-Z]+$/, "").trim();

  const translatedDeclension = DECLENSION_MAP[rawDeclension] || rawDeclension;
  const translatedGender = data.gender ? GENDER_MAP[data.gender] : null;

  return (
    // שימוש ב-block וב-mt-3 מבטיח ירידת שורה מהקישור של ויקימילון
    <div className="block mt-3 mb-2 px-3 py-2 bg-zinc-50 border border-zinc-200/80 rounded-md shadow-sm text-sm w-fit">
      {/* שורה ראשונה: צורה מילונית */}
      <div className="font-semibold text-zinc-900 leading-tight">
        {cleanForms}
      </div>
      
      {/* שורה שנייה: נטייה ומין */}
      {(translatedDeclension || translatedGender) && (
        <div className="text-xs text-zinc-500 mt-1 flex gap-1.5" dir="rtl">
          {translatedDeclension && <span>{translatedDeclension}</span>}
          {translatedDeclension && translatedGender && <span>•</span>}
          {translatedGender && <span>{translatedGender}</span>}
        </div>
      )}
    </div>
  );
}

export default function DictionaryPanel({ word, selectedLanguage, onSelectHebrewWord }: DictionaryPanelProps) {
  const [state, setState] = useState<FetchState<WiktionaryResult>>({ status: "idle" });
  const [whitakerState, setWhitakerState] = useState<FetchState<WhitakerData>>({ status: "idle" });
  const [lemmaState, setLemmaState] = useState<FetchState<WiktionaryResult[]>>({ status: "idle" });
  const [definitionTranslations, setDefinitionTranslations] = useState<Record<string, DefinitionTranslationState>>({});
  // Set when the fallback pipeline resolved via a different form than the original word
  const resolvedAsRef = useRef<string | null>(null);

  useEffect(() => {
    if (!word) {
      setState({ status: "idle" });
      setLemmaState({ status: "idle" });
      setDefinitionTranslations({});
      resolvedAsRef.current = null;
      return;
    }

    let cancelled = false;
    setState({ status: "loading" });
    setLemmaState({ status: "idle" });
    setWhitakerState({ status: "loading" });
    setDefinitionTranslations({});
    resolvedAsRef.current = null;

    // קריאה לשרת הפרטי שלנו כדי להביא מידע דקדוקי
    fetch(`/api/whitaker?word=${encodeURIComponent(word)}`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        if (data && data.forms) {
          setWhitakerState({ status: "success", data });
        } else {
          setWhitakerState({ status: "not_found" });
        }
      })
      .catch(err => {
        if (cancelled) return;
        setWhitakerState({ status: "error", message: err.message });
      });

    fetchWithFallback(word, selectedLanguage)
      .then((result) => {
        if (cancelled) return;
        if (result) {
          const { data, resolvedWord } = result;
          if (resolvedWord !== word) resolvedAsRef.current = resolvedWord;
          setState({ status: "success", data });
          const mainParts =
            selectedLanguage === "All"
              ? data.parts
              : data.parts.filter((p) => p.language === selectedLanguage);
          for (const [pi, part] of mainParts.entries()) {
            const definitionBlock = part.definitions
              .map((d) => d.definition)
              .filter((d) => !isGrammarOnlyDefinition(d))
              .join("\n");
            const partKey = `main-${data.word}-${pi}`;
            if (!definitionBlock.trim()) {
              setDefinitionTranslations((prev) => ({
                ...prev,
                [partKey]: { status: "idle" },
              }));
              continue;
            }
            setDefinitionTranslations((prev) => ({
              ...prev,
              [partKey]: { status: "loading" },
            }));
            fetchHebrewTranslation(definitionBlock)
              .then((hebrewText) => {
                if (cancelled) return;
                setDefinitionTranslations((prev) => ({
                  ...prev,
                  [partKey]: { status: "success", text: hebrewText },
                }));
              })
              .catch((err: unknown) => {
                if (cancelled) return;
                const message = err instanceof Error ? err.message : "Unknown error";
                setDefinitionTranslations((prev) => ({
                  ...prev,
                  [partKey]: { status: "error", message },
                }));
              });
          }

          // Secondary lookup: fetch all lemmas referenced in definitions
          const lemmas = extractLemmas(data, selectedLanguage);
          if (lemmas.length > 0) {
            setLemmaState({ status: "loading" });
            Promise.all(
              lemmas.map(async (lemma): Promise<WiktionaryResult | null> => {
                const isSatisfactory = (res: WiktionaryResult | null) => {
                  if (!res) return false;
                  if (selectedLanguage === "All") return true;
                  return res.parts.some(p => p.language === selectedLanguage);
                };

                // 1. נסיון עם המילה כפי שהיא (כולל מקרונים)
                const lemmaData = await fetchWiktionary(lemma);
                if (isSatisfactory(lemmaData)) return lemmaData;

                // 2. אם לא נמצאה השפה המבוקשת, ננסה להסיר את כל הסימנים הדיאקריטיים (מקרון, ברווה וכו')
                const normalized = removeDiacritics(lemma);
                if (normalized !== lemma) {
                  const normalizedResult = await fetchWiktionary(normalized);
                  if (isSatisfactory(normalizedResult)) return normalizedResult;
                }

                // 3. מוצא אחרון: נחזיר את התוצאה המקורית גם אם השפה לא תואמת (או null אם אין כלום)
                return lemmaData;
              })
            )
              .then((lemmaResults) => {
                if (cancelled) return;
                const validLemmaResults = lemmaResults.filter(
                  (result): result is WiktionaryResult => result !== null
                );
                if (validLemmaResults.length > 0) {
                  setLemmaState({ status: "success", data: validLemmaResults });
                  validLemmaResults.forEach((lemmaResult, lemmaIdx) => {
                    const filteredParts = lemmaResult.parts.filter(
                      (p) => selectedLanguage === "All" || p.language === selectedLanguage
                    );
                    filteredParts.forEach((part, pi) => {
                      const definitionBlock = part.definitions
                        .map((d) => d.definition)
                        .filter((d) => !isGrammarOnlyDefinition(d))
                        .join("\n");
                      const partKey = `lemma-${lemmaIdx}-${lemmaResult.word}-${pi}`;
                      if (!definitionBlock.trim()) {
                        setDefinitionTranslations((prev) => ({
                          ...prev,
                          [partKey]: { status: "idle" },
                        }));
                        return;
                      }
                      setDefinitionTranslations((prev) => ({
                        ...prev,
                        [partKey]: { status: "loading" },
                      }));
                      fetchHebrewTranslation(definitionBlock)
                        .then((hebrewText) => {
                          if (cancelled) return;
                          setDefinitionTranslations((prev) => ({
                            ...prev,
                            [partKey]: { status: "success", text: hebrewText },
                          }));
                        })
                        .catch((err: unknown) => {
                          if (cancelled) return;
                          const message = err instanceof Error ? err.message : "Unknown error";
                          setDefinitionTranslations((prev) => ({
                            ...prev,
                            [partKey]: { status: "error", message },
                          }));
                        });
                    });
                  });
                } else {
                  setLemmaState({ status: "not_found" });
                }
              })
              .catch((err: unknown) => {
                if (cancelled) return;
                const msg = err instanceof Error ? err.message : "Unknown error";
                setLemmaState({ status: "error", message: msg });
              });
          }
        } else {
          setState({ status: "not_found" });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState({ status: "error", message: msg });
      });

    return () => {
      cancelled = true;
    };
  }, [word, selectedLanguage]);

  return (
    <div className="p-6 h-full">
      {state.status === "idle" && (
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 min-h-[200px]">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <p className="text-sm text-muted-foreground max-w-[180px]">
            Click any word in the text to see its definition here.
          </p>
        </div>
      )}

      {state.status === "loading" && (
        <div className="flex flex-col gap-4 animate-pulse">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded" />
          <div className="space-y-2 mt-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-4/5 bg-muted rounded" />
            <div className="h-3 w-3/4 bg-muted rounded" />
          </div>
          <div className="space-y-2 mt-4">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-2/3 bg-muted rounded" />
          </div>
        </div>
      )}

      {state.status === "not_found" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">"{word}"</h2>
          <div className="rounded-md bg-muted/60 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              No definition found for this word. It may be a proper noun, abbreviation, or not yet in Wiktionary.
            </p>
          </div>
        </div>
      )}

      {state.status === "error" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-foreground">"{word}"</h2>
          <div className="rounded-md bg-muted/60 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              Could not load the definition. Check your connection and try again.
            </p>
          </div>
        </div>
      )}

{state.status === "success" && (
        <div className="flex flex-col gap-5">
          <div>
            <h2 className="text-2xl font-bold text-foreground tracking-tight">{state.data.word}</h2>
            <a
              href={`https://en.wiktionary.org/wiki/${encodeURIComponent(state.data.word)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline mt-1 inline-block"
            >
              View on Wiktionary
            </a>
            {/* הצגת המידע הדקדוקי תחת המילה הראשית: רק אם אין לה מילות בסיס, או אם מילת הבסיס היא בעצם אותה מילה בדיוק (כמו במקרה של ליגטורות) */}
            {lemmaState.status !== "loading" && 
             !(lemmaState.status === "success" && lemmaState.data.length > 0 && lemmaState.data.some(l => 
               l.word.toLowerCase().replace(/æ/g, "ae").replace(/œ/g, "oe") !== state.data.word.toLowerCase().replace(/æ/g, "ae").replace(/œ/g, "oe")
             )) && (
              <WhitakerInfo word={state.data.word} />
            )}
          </div>

          {(() => {
            const availableLanguages = Array.from(
              new Set(state.data.parts.map((p) => p.language))
            );
            const filteredParts =
              selectedLanguage === "All"
                ? state.data.parts
                : state.data.parts.filter((p) => p.language === selectedLanguage);

            return (
              <>
                {filteredParts.length === 0 ? (
                  <div className="rounded-md bg-muted/60 px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      No results for {selectedLanguage}.
                    </p>
                  </div>
                ) : (
                  filteredParts.map((part, pi) => (
                    <div key={pi} className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-accent px-2 py-0.5 rounded-full">
                          {POS_HEBREW_MAP[part.partOfSpeech.toLowerCase()] || part.partOfSpeech}
                        </span>
                        {selectedLanguage === "All" && availableLanguages.length > 1 && (
                          <span className="text-xs text-muted-foreground">
                            {part.language}
                          </span>
                        )}
                      </div>

                      <ol className="flex flex-col gap-3">
                        {part.definitions.map((def, di) => (
                          <li key={di} className="flex gap-2.5">
                            <span className="text-xs font-mono text-muted-foreground mt-0.5 w-4 shrink-0 text-right">
                              {di + 1}.
                            </span>
                            <div className="flex flex-col gap-1">
                              <p className="text-sm text-foreground leading-relaxed">
                                {renderDefinitionWithBoldLemma(def.definition)}
                              </p>
                              {(() => {
                                if (!isGrammarOnlyDefinition(def.definition)) return null;
                                const grammarHebrew = translateGrammar(def.definition);
                                return (
                                  <div dir="rtl" className="text-xs text-muted-foreground leading-relaxed">
                                    {grammarHebrew}
                                  </div>
                                );
                              })()}
                              {def.examples && def.examples.length > 0 && (
                                <ul className="flex flex-col gap-1 mt-0.5">
                                  {def.examples.map((ex, ei) => (
                                    <li key={ei} className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                                      {ex}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                      {(() => {
                        const partKey = `main-${state.data.word}-${pi}`;
                        const translationState = definitionTranslations[partKey];
                        if (!translationState || translationState.status === "idle") return null;
                        return (
                          <div className="mt-2 pt-2 border-t border-border/70">
                            {translationState.status === "loading" && (
                              <p className="text-xs text-muted-foreground">Translating Hebrew meanings...</p>
                            )}
                            {translationState.status === "success" && (
                              <ol dir="rtl" className="flex flex-col gap-3">
                                {translationState.text.split('\n').filter(line => line.trim()).map((line, idx) => (
                                  <li key={idx} className="flex gap-2.5">
                                    <span className="text-xs font-mono text-muted-foreground mt-0.5 w-4 shrink-0 text-left">
                                      {idx + 1}.
                                    </span>
                                    <div className="text-sm text-foreground leading-relaxed flex flex-wrap gap-x-1">
                                              {line.replace(/^\d+[\s.)]+/, '').trim().split(/[\s,]+/).map((w, wi) => (
                                                <button
                                                key={wi}
                                                onClick={() => onSelectHebrewWord?.(w.replace(/[.,:;]/g, ""))}
                                                className="hover:text-blue-600 hover:bg-blue-50 active:bg-blue-200 active:scale-95 px-0.5 rounded transition-all cursor-pointer"
                                              >
                                                {w}
                                              </button>
                                              ))}
                                            </div>
                                  </li>
                                ))}
                              </ol>
                            )}
                            {translationState.status === "error" && (
                              <p className="text-xs text-muted-foreground">Could not translate Hebrew meanings.</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </>
            );
          })()}

          {/* Lemma section — only shown when a secondary lookup was triggered */}
          {lemmaState.status !== "idle" && (
            <div className="mt-2 pt-4 border-t border-border flex flex-col gap-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Lemmas
              </p>

              {lemmaState.status === "loading" && (
                <div className="flex flex-col gap-3 animate-pulse">
                  <div className="h-5 w-28 bg-muted rounded" />
                  <div className="space-y-2">
                    <div className="h-3 w-full bg-muted rounded" />
                    <div className="h-3 w-4/5 bg-muted rounded" />
                  </div>
                </div>
              )}

              {lemmaState.status === "not_found" && (
                <p className="text-sm text-muted-foreground">
                  No entries found for extracted lemmas on Wiktionary.
                </p>
              )}

              {lemmaState.status === "error" && (
                <p className="text-sm text-muted-foreground">
                  Could not load the lemma definition.
                </p>
              )}

              {lemmaState.status === "success" && (
                <div className="flex flex-col gap-4">
                  {lemmaState.data.map((lemmaResult, lemmaIdx) => (
                    <div key={`${lemmaResult.word}-${lemmaIdx}`} className="flex flex-col gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-foreground tracking-tight">{lemmaResult.word}</h3>
                        <div> {/* עטיפה נוספת שמבטיחה שהקישור יהיה בשורה משלו */}
                          <a
                            href={`https://en.wiktionary.org/wiki/${encodeURIComponent(lemmaResult.word)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-0.5 inline-block"
                          >
                            View on Wiktionary
                          </a>
                        </div>
                        {/* הרכיב עכשיו יופיע בוודאות מתחת בזכות ה-block שהוספנו לו */}
                        <WhitakerInfo word={lemmaResult.word} />
                      </div>

                      {lemmaResult.parts
                        .filter((p) => selectedLanguage === "All" || p.language === selectedLanguage)
                        .map((part, pi) => (
                          <div key={pi} className="flex flex-col gap-2">
                            <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-accent px-2 py-0.5 rounded-full w-fit">
                              {POS_HEBREW_MAP[part.partOfSpeech.toLowerCase()] || part.partOfSpeech}
                            </span>
                            <ol className="flex flex-col gap-2.5">
                              {part.definitions.map((def, di) => (
                                <li key={di} className="flex gap-2.5">
                                  <span className="text-xs font-mono text-muted-foreground mt-0.5 w-4 shrink-0 text-right">
                                    {di + 1}.
                                  </span>
                                  <div className="flex flex-col gap-1">
                                    <p className="text-sm text-foreground leading-relaxed">
                                      {renderDefinitionWithBoldLemma(def.definition)}
                                    </p>
                                    {(() => {
                                      if (!isGrammarOnlyDefinition(def.definition)) return null;
                                      const grammarHebrew = translateGrammar(def.definition);
                                      return (
                                        <div dir="rtl" className="text-xs text-muted-foreground leading-relaxed">
                                          {grammarHebrew}
                                        </div>
                                      );
                                    })()}
                                    {def.examples && def.examples.length > 0 && (
                                      <ul className="flex flex-col gap-1 mt-0.5">
                                        {def.examples.map((ex, ei) => (
                                          <li key={ei} className="text-xs text-muted-foreground italic border-l-2 border-border pl-2">
                                            {ex}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                </li>
                              ))}
                            </ol>
                            {(() => {
                              const partKey = `lemma-${lemmaIdx}-${lemmaResult.word}-${pi}`;
                              const translationState = definitionTranslations[partKey];
                              if (!translationState || translationState.status === "idle") return null;
                              return (
                                <div className="mt-2 pt-2 border-t border-border/70">
                                  {translationState.status === "loading" && (
                                    <p className="text-xs text-muted-foreground">Translating Hebrew meanings...</p>
                                  )}
                                  {translationState.status === "success" && (
                                    <ol dir="rtl" className="flex flex-col gap-3">
                                      {translationState.text.split('\n').filter(line => line.trim()).map((line, idx) => (
                                        <li key={idx} className="flex gap-2.5">
                                          <span className="text-xs font-mono text-muted-foreground mt-0.5 w-4 shrink-0 text-left">
                                            {idx + 1}.
                                          </span>
                                          <div className="text-sm text-foreground leading-relaxed flex flex-wrap gap-x-1">
                                                    {line.replace(/^\d+[\s.)]+/, '').trim().split(/[\s,]+/).map((w, wi) => (
                                                      <button
                                                      key={wi}
                                                      onClick={() => onSelectHebrewWord?.(w.replace(/[.,:;]/g, ""))}
                                                      className="hover:text-blue-600 hover:bg-blue-50 active:bg-blue-200 active:scale-95 px-0.5 rounded transition-all cursor-pointer"
                                                    >
                                                      {w}
                                                    </button>
                                                    ))}
                                                  </div>
                                        </li>
                                      ))}
                                    </ol>
                                  )}
                                  {translationState.status === "error" && (
                                    <p className="text-xs text-muted-foreground">Could not translate Hebrew meanings.</p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
