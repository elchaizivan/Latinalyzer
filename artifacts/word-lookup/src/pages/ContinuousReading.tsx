import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Download, FolderOpen, Upload, Folder, FolderPlus, ChevronRight, CornerUpLeft, Trash2, Eye, EyeOff, Pen, StickyNote } from "lucide-react";
import MorphWordBlock from "@/components/morphology/MorphWordBlock";
import type { Classification, MorphProject, MorphWord, MorphFolder, Clause } from "@/types/morphology";
import {
  reconcileMorphWords,
  tokenizeLatinSentence,
} from "@/lib/morphology-utils";
import {
  exportMorphProjectFile,
  exportMasterLibraryFile,
  parseMasterLibraryFileJson,
  MORPH_PROJECT_FILE_SCHEMA_VERSION,
  newMorphProjectId,
  parseMorphProjectFileJson,
  readContinuousReadingLibrary,
  writeContinuousReadingLibrary,
  readMorphProjectsLibrary,
  writeMorphProjectsLibrary,
} from "@/lib/morphology-storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// רכיב תיבה חכמה שמתרחב אוטומטית בהתאם לתוכן
function AutoResizingTextarea(props: React.ComponentProps<typeof Textarea>) {
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textAreaRef.current) {
      // מאפס את הגובה כדי לחשב מחדש, ואז קובע את הגובה לפי התוכן (+2 פיקסלים למסגרת)
      textAreaRef.current.style.height = "auto";
      textAreaRef.current.style.height = `${textAreaRef.current.scrollHeight + 2}px`;
    }
  }, [props.value]);

  return (
    <Textarea
      {...props}
      ref={textAreaRef}
      style={{ overflow: "hidden", resize: "none" }}
    />
  );
}

// צבעים לתצוגת פלטת הבחירה בתפריט
const PALETTE_COLORS = [
  "bg-red-200", "bg-orange-200", "bg-amber-200", "bg-yellow-200", "bg-lime-200",
  "bg-green-200", "bg-emerald-200", "bg-teal-200", "bg-cyan-200", "bg-sky-200",
  "bg-blue-200", "bg-indigo-200", "bg-violet-200", "bg-purple-200", "bg-fuchsia-200",
  "bg-pink-200", "bg-rose-200", "bg-slate-200", "bg-gray-200", "bg-zinc-200"
];

// רכיב המצייר את הסוגריים המסולסלים בזמן אמת מעל המשפט
function ClauseBracesOverlay({ words, clauses, isEditMode, onUpdateClause, onDeleteClause }: { words: MorphWord[]; clauses: Clause[]; isEditMode: boolean; onUpdateClause: (id: string, updates: Partial<Clause>) => void; onDeleteClause: (id: string) => void; }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [braces, setBraces] = useState<{ id: string; clauseObj: Clause; top: number; height: number; left: number; }[]>([]);

  useEffect(() => {
    if (isEditMode) {
      setBraces([]);
      return;
    }

    const updateLayout = () => {
      if (!containerRef.current) return;
      const overlayElement = containerRef.current;
      const parentContainer = overlayElement.parentElement;
      
      if (!parentContainer) return;
      
      const containerRect = overlayElement.getBoundingClientRect();
      const sentenceWordIds = new Set(words.map(w => w.id));
      const sentenceClauses = clauses.filter(c => sentenceWordIds.has(c.startWordId) && sentenceWordIds.has(c.endWordId));

      const newBraces = sentenceClauses
        .sort((a, b) => {
          const lenA = Math.abs(words.findIndex(w => w.id === a.endWordId) - words.findIndex(w => w.id === a.startWordId));
          const lenB = Math.abs(words.findIndex(w => w.id === b.endWordId) - words.findIndex(w => w.id === b.startWordId));
          return lenA - lenB; // הפסוקית הקצרה ביותר מצוירת ראשונה ומוסטת הכי פחות (הכי קרובה לטקסט, מימין)
        })
        .map((clause, index) => {
          const startEl = parentContainer.querySelector(`[data-word-id="${clause.startWordId}"]`);
          const endEl = parentContainer.querySelector(`[data-word-id="${clause.endWordId}"]`);
          
          if (!startEl || !endEl) return null;

          const startRect = startEl.getBoundingClientRect();
          const endRect = endEl.getBoundingClientRect();

          const top = startRect.top - containerRect.top;
          const bottom = endRect.bottom - containerRect.top;
          const height = Math.max(20, bottom - top);
          const left = -12 - (index * 16); // הזחה שמאלה לפי רמת העומק

          return {
            id: clause.id,
            clauseObj: clause,
            top,
            height,
            left,
          };
      }).filter(Boolean) as any[];

      setBraces(newBraces);
    };

    updateLayout();
    const timer1 = setTimeout(updateLayout, 100);
    const timer2 = setTimeout(updateLayout, 500); 
    window.addEventListener("resize", updateLayout);
    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      window.removeEventListener("resize", updateLayout);
    };
  }, [words, clauses, isEditMode]);

  if (isEditMode) return null;

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-10">
      {braces.map((brace) => {
        const h = brace.height;
        const h2 = h / 2;
        const c = Math.min(12, h / 4); 
        const path = `M 12 0 Q 4 0, 4 ${c} L 4 ${h2 - c} Q 4 ${h2}, -2 ${h2} Q 4 ${h2}, 4 ${h2 + c} L 4 ${h - c} Q 4 ${h}, 12 ${h}`;

        return (
          <div
            key={brace.id}
            // כאן שינינו את הצבע ל- text-foreground כדי שיהיה תמיד שחור (או לבן במצב לילה)
            className="absolute flex items-center justify-end overflow-visible transition-all duration-300 pointer-events-auto text-foreground"
            style={{ top: brace.top, left: brace.left, height: brace.height, width: "12px" }}
          >
            <Popover>
              <PopoverTrigger asChild>
                <button className="outline-none h-full w-full flex items-center justify-center opacity-40 hover:opacity-100 hover:scale-110 transition-transform cursor-pointer" title="הגדרות פסוקית">
                  <svg width="12" height={brace.height} className="overflow-visible drop-shadow-sm">
                    <path
                      d={path}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </PopoverTrigger>
              <PopoverContent side="left" sideOffset={10} className="w-64 p-3 flex flex-col gap-3 border-border/60 shadow-xl z-50">
                <div className="flex justify-between items-center mb-1">
                   <span className="text-xs font-semibold uppercase text-muted-foreground">Clause Settings</span>
                </div>
                
                {/* פלטת הצבעים החדשה */}
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE_COLORS.map((color, i) => (
                    <button
                      key={i}
                      onClick={() => onUpdateClause(brace.id, { colorIndex: i })}
                      className={cn("size-5 rounded-full border border-border/50 hover:scale-110 transition-transform", color, brace.clauseObj.colorIndex % PALETTE_COLORS.length === i ? "ring-2 ring-primary ring-offset-1" : "")}
                      title="בחר צבע"
                    />
                  ))}
                </div>

                <Separator className="my-1" />
                
                <div className="flex flex-col gap-1.5">
                  <button onClick={() => onUpdateClause(brace.id, { hideHighlight: !brace.clauseObj.hideHighlight })} className="text-xs bg-muted hover:bg-muted/80 px-2.5 py-2 rounded font-medium transition-colors text-left flex justify-between items-center">
                    {brace.clauseObj.hideHighlight ? "הצג מרקר" : "הסתר מרקר"}
                    {brace.clauseObj.hideHighlight ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                  </button>
                  <button onClick={() => onDeleteClause(brace.id)} className="text-xs bg-red-50 text-red-600 hover:bg-red-100 px-2.5 py-2 rounded font-medium transition-colors text-left flex justify-between items-center">
                    מחק פסוקית
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        );
      })}
    </div>
  );
}

export default function ContinuousReading() {
  const [sourceText, setSourceText] = useState("");
  const [processedText, setProcessedText] = useState("");
  const [words, setWords] = useState<MorphWord[]>([]);
  const [literalTranslation, setLiteralTranslation] = useState("");
  const [notes, setNotes] = useState("");
  const [syntacticTranslation, setSyntacticTranslation] = useState("");
  const [answer, setAnswer] = useState("");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [libraryRevision, setLibraryRevision] = useState(0);
  const [clearLibraryOpen, setClearLibraryOpen] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const importLibraryInputRef = useRef<HTMLInputElement>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editModes, setEditModes] = useState<Record<number, boolean>>({});
  const [sentenceTranslations, setSentenceTranslations] = useState<Record<number, string>>({});
  const [sentenceNotes, setSentenceNotes] = useState<Record<number, string>>({});
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [clauseSelection, setClauseSelection] = useState<{ active: boolean; startWordId: string | null }>({ active: false, startWordId: null });
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const lastScrollY = useRef(0);

  // 1. הפונקציה החסרה: מאזין הגלילה של העמוד
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const currentScrollY = e.currentTarget.scrollTop;
    if (currentScrollY < 50) {
      setIsHeaderVisible(true);
    } else if (currentScrollY > lastScrollY.current + 15) {
      setIsHeaderVisible(false);
    } else if (currentScrollY < lastScrollY.current - 15) {
      setIsHeaderVisible(true);
    }
    lastScrollY.current = currentScrollY;
  }, []);

  // 2. קסם הזום-אאוט לדפדפן
  useEffect(() => {
    const viewportMeta = document.querySelector('meta[name="viewport"]');
    const originalContent = viewportMeta?.getAttribute('content') || 'width=device-width, initial-scale=1.0';
    
    if (viewportMeta) {
      // מחיקת initial-scale מאלצת את הדפדפן לעשות זום-אאוט מקסימלי אוטומטית בכניסה!
      viewportMeta.setAttribute('content', 'width=550, maximum-scale=5.0');
    }
    
    return () => {
      if (viewportMeta) {
        viewportMeta.setAttribute('content', originalContent);
      }
    };
  }, []);
  
  // פלטת צבעי פסטל רחבה לפסוקיות (20 צבעים)
  const CLAUSE_COLORS = [
    "bg-red-200/50", "bg-orange-200/50", "bg-amber-200/50", "bg-yellow-200/50", "bg-lime-200/50",
    "bg-green-200/50", "bg-emerald-200/50", "bg-teal-200/50", "bg-cyan-200/50", "bg-sky-200/50",
    "bg-blue-200/50", "bg-indigo-200/50", "bg-violet-200/50", "bg-purple-200/50", "bg-fuchsia-200/50",
    "bg-pink-200/50", "bg-rose-200/50", "bg-slate-200/50", "bg-gray-200/50", "bg-zinc-200/50"
  ];

  const libraryProjects = useMemo(
    () => readContinuousReadingLibrary().projects,
    [libraryRevision]
  );
  
  const libraryFolders = useMemo(
    () => readContinuousReadingLibrary().folders || [],
    [libraryRevision]
  );

// חלוקת המילים למשפטים (בלוקים) לפי סימני פיסוק
const sentences = useMemo(() => {
  const chunks: MorphWord[][] = [];
  let currentChunk: MorphWord[] = [];
  for (const w of words) {
    currentChunk.push(w);
    if (/[.?!;]/.test(w.originalText)) {
      chunks.push(currentChunk);
      currentChunk = [];
    }
  }
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}, [words]);

const toggleEditMode = useCallback((index: number) => {
  setEditModes(prev => ({ ...prev, [index]: !prev[index] }));
}, []);

const applyProjectData = useCallback(
  (
    data: {
      sourceText: string;
      processedText: string;
      words: MorphWord[];
      literalTranslation: string;
      notes: string;
      syntacticTranslation: string;
      answer: string;
      sentenceTranslations?: Record<number, string>;
      sentenceNotes?: Record<number, string>;
      clauses?: Clause[];
      editModes?: Record<number, boolean>;
    },
    options?: { setAsCurrentProjectId?: string | null }
  ) => {
    setSourceText(data.sourceText);
    setProcessedText(data.processedText);
    setWords(data.words);
    setLiteralTranslation(data.literalTranslation);
    setNotes(data.notes || "");
    setSyntacticTranslation(data.syntacticTranslation);
    setAnswer(data.answer || "");
    setSentenceTranslations(data.sentenceTranslations || {});
    setSentenceNotes(data.sentenceNotes || {});
    setClauses(data.clauses || []);
    setEditModes(data.editModes || {}); // שחזור מצבי העריכה מהשמירה
    
    if (options?.setAsCurrentProjectId !== undefined) {
      setCurrentProjectId(options.setAsCurrentProjectId);
    }

    // קסם הגלילה: ממתין שבריר שנייה שהעמוד ייטען, ואז קופץ למשפט הפתוח
    setTimeout(() => {
      const activeIndex = data.editModes ? Object.keys(data.editModes).find(k => data.editModes![Number(k)]) : undefined;
      if (activeIndex !== undefined) {
        document.getElementById(`sentence-${activeIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        // אם אין משפט פתוח, נקפוץ לראש המסמך
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 150);
  },
  []
);

  const getWordIndex = useCallback((id: string) => words.findIndex((w) => w.id === id), [words]);

  const getWordClauseColor = useCallback((wordId: string) => {
    const wordIdx = getWordIndex(wordId);
    if (wordIdx === -1) return undefined;

    const overlapping = clauses.filter((c) => {
      if (c.hideHighlight) return false; // המרקר כבוי עבור פסוקית זו!
      const start = getWordIndex(c.startWordId);
      const end = getWordIndex(c.endWordId);
      if (start === -1 || end === -1) return false;
      return wordIdx >= Math.min(start, end) && wordIdx <= Math.max(start, end);
    });

    if (overlapping.length === 0) return undefined;

    // הפסוקית הקצרה ביותר מנצחת
    overlapping.sort((a, b) => {
      const lenA = Math.abs(getWordIndex(a.endWordId) - getWordIndex(a.startWordId));
      const lenB = Math.abs(getWordIndex(b.endWordId) - getWordIndex(b.startWordId));
      return lenA - lenB;
    });

    return CLAUSE_COLORS[overlapping[0].colorIndex % CLAUSE_COLORS.length];
  }, [clauses, getWordIndex, CLAUSE_COLORS]);

  const handleStartClause = useCallback((wordId: string) => {
    setClauseSelection({ active: true, startWordId: wordId });
  }, []);

  const handleWordClick = useCallback((wordId: string) => {
    if (!clauseSelection.active || !clauseSelection.startWordId) return;
    
    const newClause: Clause = {
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      startWordId: clauseSelection.startWordId,
      endWordId: wordId,
      colorIndex: clauses.length,
      hideHighlight: true, // ברירת המחדל היא שהמרקר מוסתר
    };
    
    setClauses((prev) => [...prev, newClause]);
    setClauseSelection({ active: false, startWordId: null });
  }, [clauseSelection, clauses.length]);

  const handleUpdateClause = useCallback((id: string, updates: Partial<Clause>) => {
    setClauses(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const handleDeleteClause = useCallback((id: string) => {
    setClauses(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleProcess = useCallback(() => {
    const trimmed = sourceText.trim();
    if (!trimmed) return;
    const tokens = tokenizeLatinSentence(trimmed);
    setProcessedText(trimmed);
    setWords((prev) => reconcileMorphWords(tokens, prev));
    setCurrentProjectId(null);
  }, [sourceText]);

  const updateWord = useCallback(
    (id: string, patch: Partial<MorphWord>) => {
      setWords((prev) =>
        prev.map((w) => (w.id === id ? { ...w, ...patch } : w))
      );
    },
    []
  );

  const buildSnapshot = useCallback(
    (title: string): any => ({
      title,
      sourceText,
      processedText,
      words,
      literalTranslation,
      notes,
      syntacticTranslation,
      answer,
      sentenceTranslations,
      sentenceNotes,
      clauses,
      editModes, // שומר את מצב העריכה של כל משפט!
      updatedAt: new Date().toISOString(),
    }),
    [sourceText, processedText, words, literalTranslation, notes, syntacticTranslation, answer, sentenceTranslations, sentenceNotes, clauses, editModes]
  );

  const persistProjectToLibrary = useCallback(
    (mode: "smart" | "new") => {
      if (!processedText.trim()) return;
      const lib = readContinuousReadingLibrary();
      const title = newProjectTitle.trim() || "Untitled";
      const snapshotBase = buildSnapshot(title);

      if (mode === "smart" && currentProjectId) {
        const idx = lib.projects.findIndex((p) => p.id === currentProjectId);
        if (idx !== -1) {
          // שומרים על התיקייה שבה הפרויקט כבר נמצא!
          lib.projects[idx] = { ...snapshotBase, id: currentProjectId, folderId: lib.projects[idx].folderId };
          writeContinuousReadingLibrary(lib);
          setLibraryRevision((r) => r + 1);
          setNewProjectTitle("");
          return;
        }
      }

      const id = newMorphProjectId();
      // שומרים פרויקט חדש בתוך התיקייה הפתוחה כרגע
      lib.projects = [{ ...snapshotBase, id, folderId: currentFolderId }, ...lib.projects];
      writeContinuousReadingLibrary(lib);
      setCurrentProjectId(id);
      setLibraryRevision((r) => r + 1);
      setNewProjectTitle("");
    },
    [buildSnapshot, currentProjectId, newProjectTitle, processedText, currentFolderId]
  );

  const loadLibraryProject = useCallback(
    (p: MorphProject) => {
      applyProjectData(p, { setAsCurrentProjectId: p.id });
      setProjectsOpen(false);
    },
    [applyProjectData]
  );

  const deleteLibraryProject = useCallback((id: string) => {
    const lib = readContinuousReadingLibrary();
    lib.projects = lib.projects.filter((x) => x.id !== id);
    writeContinuousReadingLibrary(lib);
    setLibraryRevision((r) => r + 1);
    setCurrentProjectId((cur) => (cur === id ? null : cur));
  }, []);

  // --- פונקציות חדשות לניהול תיקיות --- //
  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    const lib = readContinuousReadingLibrary();
    const newFolder: MorphFolder = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      parentId: currentFolderId,
    };
    lib.folders = [...(lib.folders || []), newFolder];
    writeContinuousReadingLibrary(lib);
    setLibraryRevision(r => r + 1);
    setNewFolderName("");
  }, [newFolderName, currentFolderId]);

  const moveProject = useCallback((projectId: string, newFolderId: string) => {
    const lib = readContinuousReadingLibrary();
    const targetFolder = newFolderId === "" ? null : newFolderId;
    lib.projects = lib.projects.map(p => p.id === projectId ? { ...p, folderId: targetFolder } : p);
    writeContinuousReadingLibrary(lib);
    setLibraryRevision(r => r + 1);
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    if (!window.confirm("Are you sure? Projects inside this folder will be moved up to the parent folder.")) return;
    const lib = readContinuousReadingLibrary();
    const target = (lib.folders || []).find(f => f.id === folderId);
    if (!target) return;
    
    // מזיז את כל התוכן הפנימי לתיקיית האב כדי שלא יאבדו נתונים
    const parentId = target.parentId;
    lib.folders = (lib.folders || []).map(f => f.parentId === folderId ? { ...f, parentId } : f).filter(f => f.id !== folderId);
    lib.projects = lib.projects.map(p => p.folderId === folderId ? { ...p, folderId: parentId } : p);
    
    writeContinuousReadingLibrary(lib);
    setLibraryRevision(r => r + 1);
  }, []);

  const breadcrumbs = useMemo(() => {
    const path: MorphFolder[] = [];
    let curr = currentFolderId;
    while (curr) {
      const f = libraryFolders.find(x => x.id === curr);
      if (f) {
        path.unshift(f);
        curr = f.parentId;
      } else {
        break;
      }
    }
    return path;
  }, [currentFolderId, libraryFolders]);

  const currentLevelFolders = libraryFolders.filter(f => f.parentId === currentFolderId);
  const currentLevelProjects = libraryProjects.filter(p => (p.folderId || null) === currentFolderId);
  // ----------------------------------- //

  const exportCurrentProjectFile = useCallback(() => {
    if (!processedText.trim()) return;
    const title =
      newProjectTitle.trim() ||
      processedText.split(/\s+/).slice(0, 8).join(" ").slice(0, 72) ||
      "morphology-project";
      exportMorphProjectFile({
        schemaVersion: MORPH_PROJECT_FILE_SCHEMA_VERSION,
        title,
        sourceText,
        processedText,
        words,
        literalTranslation,
        notes,
        syntacticTranslation,
        answer,
      });
    }, [
      processedText,
      newProjectTitle,
      sourceText,
      words,
      literalTranslation,
      notes,
      syntacticTranslation,
      answer,
    ]);

  const onImportFileSelected = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        const parsed = parseMorphProjectFileJson(text);
        if (!parsed) {
          window.alert(
            "Could not read this file. Use a JSON file exported from Morphological Analysis."
          );
          return;
        }
        // שמירת קובץ מיובא לתיקייה הפתוחה כרגע
        const newProjId = newMorphProjectId();
        const lib = readContinuousReadingLibrary();
        lib.projects = [{ ...parsed, id: newProjId, folderId: currentFolderId, updatedAt: new Date().toISOString() }, ...lib.projects];
        writeContinuousReadingLibrary(lib);
        
        applyProjectData(parsed, { setAsCurrentProjectId: newProjId });
        setNewProjectTitle(parsed.title);
        setLibraryRevision(r => r + 1);
        setProjectsOpen(false);
      };
      reader.readAsText(file, "utf-8");
    },
    [applyProjectData, currentFolderId]
  );

  const handleExportLibrary = useCallback(() => {
    exportMasterLibraryFile();
  }, []);

  const onImportLibrarySelected = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === "string" ? reader.result : "";
        const master = parseMasterLibraryFileJson(text);
        if (!master) {
          window.alert("Could not read this master library file. Make sure it's a valid master backup.");
          return;
        }
        
        // 1. סנכרון ספריית הניתוח המורפולוגי (Morphology)
        const currentMorph = readMorphProjectsLibrary();
        const mergedMorphProjects = [...master.morphology.projects];
        const morphProjIds = new Set(master.morphology.projects.map((p: any) => p.id));
        for (const p of currentMorph.projects) {
          if (!morphProjIds.has(p.id)) mergedMorphProjects.push(p);
        }
        const mergedMorphFolders = [...(master.morphology.folders || [])];
        const morphFolderIds = new Set(mergedMorphFolders.map(f => f.id));
        for (const f of (currentMorph.folders || [])) {
          if (!morphFolderIds.has(f.id)) mergedMorphFolders.push(f);
        }
        writeMorphProjectsLibrary({ v: 1, projects: mergedMorphProjects, folders: mergedMorphFolders });

        // 2. סנכרון ספריית הקריאה השוטפת (Continuous Reading)
        const currentRead = readContinuousReadingLibrary();
        const mergedReadProjects = [...master.continuousReading.projects];
        const readProjIds = new Set(master.continuousReading.projects.map((p: any) => p.id));
        for (const p of currentRead.projects) {
          if (!readProjIds.has(p.id)) mergedReadProjects.push(p);
        }
        const mergedReadFolders = [...(master.continuousReading.folders || [])];
        const readFolderIds = new Set(mergedReadFolders.map(f => f.id));
        for (const f of (currentRead.folders || [])) {
          if (!readFolderIds.has(f.id)) mergedReadFolders.push(f);
        }
        writeContinuousReadingLibrary({ v: 1, projects: mergedReadProjects, folders: mergedReadFolders });

        setLibraryRevision((r) => r + 1);
        window.alert("Master Library (Both environments) synced successfully!");
      };
      reader.readAsText(file, "utf-8");
    },
    []
  );

  const handleClearProjectLibrary = useCallback(() => {
    writeContinuousReadingLibrary({ v: 1, projects: [] });
    setLibraryRevision((r) => r + 1);
    setCurrentProjectId(null);
    setClearLibraryOpen(false);
  }, []);

  return (
    // העטיפה החיצונית מקבלת חזרה את יכולת הגלילה (overflow-auto) ואת חיישן הכותרת הנעלמת (onScroll)
    <div className="flex h-full flex-col bg-background overflow-auto scroll-smooth" onScroll={handleScroll}>
      {/* הקנבס הפנימי שומר על רוחב 550px ומקבל מרחב נשימה בתחתית (pb-32) כדי שלא ייתקע */}
      <div className="flex flex-col min-w-[550px] md:min-w-0 min-h-max pb-32">
      {clauseSelection.active && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-5 py-2.5 rounded-full shadow-2xl flex items-center gap-4 text-sm font-medium animate-in slide-in-from-bottom-5">
          <span>Select the end word of the clause...</span>
          <button onClick={() => setClauseSelection({ active: false, startWordId: null })} className="underline hover:text-white/80">Cancel</button>
        </div>
      )}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur shadow-sm" style={{ display: 'grid', gridTemplateRows: isHeaderVisible ? '1fr' : '0fr', transition: 'grid-template-rows 300ms ease-out' }}>
        <div className="overflow-hidden">
          <header className="relative z-10 shrink-0 border-b border-border bg-[#FAE5B9] px-4 py-4 sm:px-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="min-w-0 flex-1 pr-1">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                  Continuous Reading
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Paste a Latin sentence, classify each word, and record translations.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="My projects"
                className="shrink-0"
                onClick={() => {
                  if (currentProjectId) {
                    const current = libraryProjects.find(
                      (p) => p.id === currentProjectId
                    );
                    if (current) setNewProjectTitle(current.title);
                  }
                  setProjectsOpen(true);
                }}
              >
                <FolderOpen className="size-4" aria-hidden />
              </Button>
            </div>
          </header>
        </div>
      </div>

      <main className="flex flex-1 flex-col">
        <div className="flex flex-col flex-1 pb-16">
        <section className="shrink-0 border-b border-border p-4 sm:p-6">
          <div className="mx-auto flex max-w-5xl flex-col gap-3">
            <Label htmlFor="latin-sentence" className="text-sm font-medium">
              Latin sentence
            </Label>
            <Textarea
              id="latin-sentence"
              value={sourceText}
              onChange={(e) => setSourceText(e.target.value)}
              placeholder="Paste or type a Latin sentence…"
              rows={3}
              className="min-h-[4.5rem] resize-y font-serif text-base leading-relaxed"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleProcess}
                disabled={!sourceText.trim()}
              >
                Process
              </Button>
            </div>
          </div>
        </section>

        {processedText ? (
          <>
            <section className="min-h-[12rem] shrink-0 border-b border-border p-4 sm:p-6 bg-muted/5">
              <div className="mx-auto max-w-5xl">
                <p className="mb-4 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Continuous Reading Workspace
                </p>
                {words.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    No words detected. Paste text above and click Process.
                  </p>
                ) : (
                  <div className="flex flex-col gap-6">
                    {sentences.map((sentenceWords, sentenceIndex) => {
                      // ברירת המחדל היא מצב קריאה (false)
                      const isEditMode = editModes[sentenceIndex] || false;
                      
                      return (
                        <div 
                          key={sentenceIndex} 
                          id={`sentence-${sentenceIndex}`}
                          className="relative rounded-xl border border-border/80 transition-all shadow-sm"
                        >
                          {/* צמצמנו שוליים צדדיים מ-px-5 ל-px-2 כדי להרוויח רוחב למילים */}
                          <div className="px-2 md:px-5 pb-4 md:pb-5 pt-10 relative">
                            
                            {/* כפתור החלפת מצבים */}
                            <div className="absolute top-2 right-2 md:top-3 md:right-3 z-20">
                              <button
                                type="button"
                                onClick={() => toggleEditMode(sentenceIndex)}
                                className="flex items-center gap-1.5 rounded-md border border-border/40 bg-muted/20 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground transition-all"
                              >
                                {isEditMode ? (
                                  <><Eye className="size-3.5" /> Switch to Read</>
                                ) : (
                                  <><Pen className="size-3.5" /> Switch to Edit</>
                                )}
                              </button>
                            </div>

                            {/* המילים נפרסות בחופשיות ומנצלות את כל רוחב המסך */}
                            <div className="flex flex-wrap items-end gap-x-2 md:gap-x-3 gap-y-3 leading-relaxed relative z-0 ml-6 md:ml-10 pr-2">
                              <ClauseBracesOverlay 
                                words={sentenceWords} 
                                clauses={clauses} 
                                isEditMode={isEditMode} 
                                onUpdateClause={handleUpdateClause}
                                onDeleteClause={handleDeleteClause}
                              />
                              {sentenceWords.map((word) => (
                                <MorphWordBlock
                                  key={word.id}
                                  word={word}
                                  isEditMode={isEditMode}
                                  isSelectingClause={clauseSelection.active}
                                  clauseColorClass={!isEditMode ? getWordClauseColor(word.id) : undefined}
                                  onStartClause={() => handleStartClause(word.id)}
                                  onWordClick={() => handleWordClick(word.id)}
                                  onMeaningChange={(meaning) => updateWord(word.id, { meaning })}
                                  onClassificationsChange={(classifications) =>
                                    updateWord(word.id, { classifications: classifications as Classification[] })
                                  }
                                  onSyntacticRoleChange={(role) =>
                                    updateWord(word.id, { syntacticRole: role })
                                  }
                                  onToggleHideLabel={() =>
                                    updateWord(word.id, { hideReadingLabel: !word.hideReadingLabel })
                                  }
                                />
                              ))}
                            </div>

                            {/* תרגום משפט והערות */}
                            <div className="mt-5 flex gap-3 border-t border-border/40 pt-4 relative z-10">
                              <div className="shrink-0 pt-0.5">
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      className={cn(
                                        "transition-colors hover:text-amber-500",
                                        sentenceNotes[sentenceIndex] ? "text-amber-500" : "text-muted-foreground/30"
                                      )}
                                      title="Notes for this sentence"
                                    >
                                      <StickyNote className="size-4" />
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent side="bottom" align="start" className="w-80 p-3 bg-white dark:bg-slate-900 border border-border/60 shadow-xl z-50">
                                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Sentence Notes
                                    </p>
                                    <AutoResizingTextarea
                                      dir="rtl"
                                      value={sentenceNotes[sentenceIndex] || ""}
                                      onChange={(e) => setSentenceNotes(prev => ({ ...prev, [sentenceIndex]: e.target.value }))}
                                      placeholder="הערות פילולוגיות למשפט זה..."
                                      rows={3}
                                      className="text-sm border-border/50 bg-white dark:bg-slate-950 focus-visible:ring-1"
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              
                              <div className="flex-1">
                                {isEditMode ? (
                                  <AutoResizingTextarea
                                    dir="rtl"
                                    value={sentenceTranslations[sentenceIndex] || ""}
                                    onChange={(e) => setSentenceTranslations(prev => ({ ...prev, [sentenceIndex]: e.target.value }))}
                                    placeholder="תרגום המשפט..."
                                    rows={1}
                                    className="text-sm leading-relaxed border-border/40 bg-white dark:bg-slate-900 shadow-sm min-h-[2.5rem]"
                                  />
                                ) : (
                                  <p dir="rtl" className="text-sm leading-relaxed text-foreground min-h-[1.75rem]">
                                    {sentenceTranslations[sentenceIndex] || <span className="text-muted-foreground/40 italic">אין תרגום...</span>}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            
            
            </>
        ) : null}
        </div>
      </main>
    </div>

    <Dialog open={projectsOpen} onOpenChange={setProjectsOpen}>
        <DialogContent className="flex h-[90vh] w-[95vw] max-w-5xl flex-col gap-0 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 space-y-2 pr-8 text-left border-b border-border/60 pb-4">
            <DialogTitle className="text-2xl">Project Library & File Explorer</DialogTitle>
            <DialogDescription>
              Organize your work in folders, sync between devices, and manage your morphological projects.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex min-h-0 flex-1 flex-col md:flex-row gap-6 overflow-y-auto md:overflow-hidden pt-4">
            {/* Sidebar / Top area for controls */}
            <div className="flex flex-col gap-4 md:w-1/3 shrink-0 md:overflow-y-auto">
              <div className="space-y-2 rounded-lg border border-border/60 bg-muted/10 p-3">
                <Label htmlFor="morph-project-title" className="text-sm font-semibold">
                  Current Workspace
                </Label>
                <Input
                  id="morph-project-title"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  placeholder="Project title"
                  className="bg-background"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button" size="sm" className="flex-1"
                    disabled={!processedText.trim()}
                    onClick={() => persistProjectToLibrary("smart")}
                  >
                    Save
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm" className="flex-1"
                    disabled={!processedText.trim()}
                    onClick={() => persistProjectToLibrary("new")}
                  >
                    Save as New
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-lg border border-border/60 p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Import / Export</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" disabled={!processedText.trim()} onClick={exportCurrentProjectFile}>
                    <Download className="size-3.5" aria-hidden /> Export Active
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => importFileInputRef.current?.click()}>
                    <Upload className="size-3.5" aria-hidden /> Import to Folder
                  </Button>
                </div>
                <Separator className="my-1" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="secondary" size="sm" className="flex-1 gap-1.5 bg-primary/10 text-primary hover:bg-primary/20" onClick={handleExportLibrary}>
                    <Download className="size-3.5" aria-hidden /> Backup Library
                  </Button>
                  <Button type="button" variant="secondary" size="sm" className="flex-1 gap-1.5 bg-primary/10 text-primary hover:bg-primary/20" onClick={() => importLibraryInputRef.current?.click()}>
                    <Upload className="size-3.5" aria-hidden /> Sync Library
                  </Button>
                </div>
              </div>
            </div>

            {/* Main File Explorer Area */}
            <div className="flex min-h-[60vh] md:min-h-0 flex-1 flex-col rounded-lg border border-border/60 bg-card overflow-hidden shadow-sm">
              
              {/* Breadcrumbs & Add Folder */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-muted/20 px-4 py-3 border-b border-border/60">
                <div className="flex items-center flex-wrap gap-1 text-sm font-medium">
                  <button onClick={() => setCurrentFolderId(null)} className="hover:text-primary hover:underline transition-colors">
                    Root
                  </button>
                  {breadcrumbs.map(f => (
                    <span key={f.id} className="flex items-center gap-1">
                      <ChevronRight className="size-3.5 text-muted-foreground" />
                      <button onClick={() => setCurrentFolderId(f.id)} className="hover:text-primary hover:underline transition-colors">
                        {f.name}
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input 
                    value={newFolderName} 
                    onChange={e => setNewFolderName(e.target.value)} 
                    placeholder="New folder..." 
                    className="h-8 w-32 md:w-40 bg-background text-xs" 
                    onKeyDown={e => e.key === 'Enter' && handleCreateFolder()}
                  />
                  <Button type="button" size="sm" variant="secondary" className="h-8 px-2" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                    <FolderPlus className="size-4" />
                  </Button>
                </div>
              </div>

              {/* File List */}
              <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                  
                  {/* Up Folder Button */}
                  {currentFolderId && (
                    <button 
                      onClick={() => {
                        const current = libraryFolders.find(f => f.id === currentFolderId);
                        setCurrentFolderId(current?.parentId || null);
                      }}
                      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/50 transition-colors"
                    >
                      <CornerUpLeft className="size-4" />
                      <span>.. (Go Up)</span>
                    </button>
                  )}

                  {/* Folders List */}
                  {currentLevelFolders.map(f => (
                    <div key={f.id} className="group flex w-full items-center justify-between gap-3 rounded-md border border-transparent px-3 py-2 text-sm hover:bg-primary/5 hover:border-primary/20 transition-all">
                      <button onClick={() => setCurrentFolderId(f.id)} className="flex items-center gap-3 flex-1 text-left font-medium text-foreground">
                        <Folder className="size-4 text-blue-500 fill-blue-500/20" />
                        {f.name}
                      </button>
                      <button onClick={() => deleteFolder(f.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500 transition-all" title="Delete Folder">
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}

                  {currentLevelFolders.length > 0 && currentLevelProjects.length > 0 && (
                    <Separator className="my-2 opacity-50" />
                  )}

                  {/* Projects List */}
                  {currentLevelProjects.map(p => (
                    <div key={p.id} className="group flex w-full flex-wrap items-center justify-between gap-3 rounded-md border border-border/40 bg-background px-3 py-2.5 text-sm shadow-sm hover:border-primary/40 transition-all">
                      <div className="flex items-center gap-3 flex-1 min-w-[200px]">
                        <button onClick={() => loadLibraryProject(p)} className="flex items-center gap-2 text-left font-medium hover:text-primary transition-colors flex-1 truncate">
                          <span className="truncate">{p.title}</span>
                          {currentProjectId === p.id && <span className="text-[10px] uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded">Active</span>}
                        </button>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        {/* Move Folder Dropdown */}
                        <select 
                          value={p.folderId || ""} 
                          onChange={(e) => moveProject(p.id, e.target.value)}
                          className="h-7 max-w-[120px] rounded border border-border bg-muted/30 px-1 text-xs text-muted-foreground outline-none cursor-pointer hover:bg-muted"
                          title="Move to folder"
                        >
                          <option value="">Move to: Root</option>
                          {libraryFolders.map(f => (
                            <option key={f.id} value={f.id}>↳ {f.name}</option>
                          ))}
                        </select>

                        <Button type="button" size="sm" variant="secondary" className="h-7 px-3 text-xs" onClick={() => loadLibraryProject(p)}>
                          Load
                        </Button>
                        <button onClick={() => deleteLibraryProject(p.id)} className="p-1.5 text-muted-foreground hover:bg-red-500/10 hover:text-red-500 rounded transition-all" title="Delete Project">
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  ))}

                  {currentLevelFolders.length === 0 && currentLevelProjects.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                      <FolderOpen className="size-10 opacity-20 mb-2" />
                      <p className="text-sm">This folder is empty.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          
          <DialogFooter className="shrink-0 border-t border-border/60 pt-4 mt-2 sm:justify-between items-center">
             <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setClearLibraryOpen(true)}
              >
                Clear Entire Library (Danger)
              </Button>
            <Button type="button" onClick={() => setProjectsOpen(false)}>
              Close Explorer
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

      <input
        ref={importLibraryInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onImportLibrarySelected(f);
          e.target.value = "";
        }}
      />

      <AlertDialog open={clearLibraryOpen} onOpenChange={setClearLibraryOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear project library?</AlertDialogTitle>
            <AlertDialogDescription>
              All morphological analysis projects on this device will be removed.
              Your current workspace stays as it is.
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
    </div>
  );
}
