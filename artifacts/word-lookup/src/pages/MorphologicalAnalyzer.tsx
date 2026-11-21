import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Download, FolderOpen, Upload, Folder, FolderPlus, ChevronRight, CornerUpLeft, Trash2 } from "lucide-react";
import MorphWordBlock from "@/components/morphology/MorphWordBlock";
import type { Classification, MorphProject, MorphWord, MorphFolder } from "@/types/morphology";
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
  readMorphProjectsLibrary,
  writeMorphProjectsLibrary,
  readContinuousReadingLibrary,
  writeContinuousReadingLibrary,
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

export default function MorphologicalAnalyzer() {
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

  const libraryProjects = useMemo(
    () => readMorphProjectsLibrary().projects,
    [libraryRevision]
  );
  
  const libraryFolders = useMemo(
    () => readMorphProjectsLibrary().folders || [],
    [libraryRevision]
  );

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
      if (options?.setAsCurrentProjectId !== undefined) {
        setCurrentProjectId(options.setAsCurrentProjectId);
      }
    },
    []
  );

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
    (title: string): Omit<MorphProject, "id"> => ({
      title,
      sourceText,
      processedText,
      words,
      literalTranslation,
      notes,
      syntacticTranslation,
      answer,
      updatedAt: new Date().toISOString(),
    }),
    [sourceText, processedText, words, literalTranslation, notes, syntacticTranslation, answer]
  );

  const persistProjectToLibrary = useCallback(
    (mode: "smart" | "new") => {
      if (!processedText.trim()) return;
      const lib = readMorphProjectsLibrary();
      const title = newProjectTitle.trim() || "Untitled";
      const snapshotBase = buildSnapshot(title);

      if (mode === "smart" && currentProjectId) {
        const idx = lib.projects.findIndex((p) => p.id === currentProjectId);
        if (idx !== -1) {
          // שומרים על התיקייה שבה הפרויקט כבר נמצא!
          lib.projects[idx] = { ...snapshotBase, id: currentProjectId, folderId: lib.projects[idx].folderId };
          writeMorphProjectsLibrary(lib);
          setLibraryRevision((r) => r + 1);
          setNewProjectTitle("");
          return;
        }
      }

      const id = newMorphProjectId();
      // שומרים פרויקט חדש בתוך התיקייה הפתוחה כרגע
      lib.projects = [{ ...snapshotBase, id, folderId: currentFolderId }, ...lib.projects];
      writeMorphProjectsLibrary(lib);
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
    const lib = readMorphProjectsLibrary();
    lib.projects = lib.projects.filter((x) => x.id !== id);
    writeMorphProjectsLibrary(lib);
    setLibraryRevision((r) => r + 1);
    setCurrentProjectId((cur) => (cur === id ? null : cur));
  }, []);

  // --- פונקציות חדשות לניהול תיקיות --- //
  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    const lib = readMorphProjectsLibrary();
    const newFolder: MorphFolder = {
      id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      parentId: currentFolderId,
    };
    lib.folders = [...(lib.folders || []), newFolder];
    writeMorphProjectsLibrary(lib);
    setLibraryRevision(r => r + 1);
    setNewFolderName("");
  }, [newFolderName, currentFolderId]);

  const moveProject = useCallback((projectId: string, newFolderId: string) => {
    const lib = readMorphProjectsLibrary();
    const targetFolder = newFolderId === "" ? null : newFolderId;
    lib.projects = lib.projects.map(p => p.id === projectId ? { ...p, folderId: targetFolder } : p);
    writeMorphProjectsLibrary(lib);
    setLibraryRevision(r => r + 1);
  }, []);

  const deleteFolder = useCallback((folderId: string) => {
    if (!window.confirm("Are you sure? Projects inside this folder will be moved up to the parent folder.")) return;
    const lib = readMorphProjectsLibrary();
    const target = (lib.folders || []).find(f => f.id === folderId);
    if (!target) return;
    
    // מזיז את כל התוכן הפנימי לתיקיית האב כדי שלא יאבדו נתונים
    const parentId = target.parentId;
    lib.folders = (lib.folders || []).map(f => f.parentId === folderId ? { ...f, parentId } : f).filter(f => f.id !== folderId);
    lib.projects = lib.projects.map(p => p.folderId === folderId ? { ...p, folderId: parentId } : p);
    
    writeMorphProjectsLibrary(lib);
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
        const lib = readMorphProjectsLibrary();
        lib.projects = [{ ...parsed, id: newProjId, folderId: currentFolderId, updatedAt: new Date().toISOString() }, ...lib.projects];
        writeMorphProjectsLibrary(lib);
        
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
    writeMorphProjectsLibrary({ v: 1, projects: [] });
    setLibraryRevision((r) => r + 1);
    setCurrentProjectId(null);
    setClearLibraryOpen(false);
  }, []);

  return (
    <div className="flex h-full flex-col bg-background">
      <header className="relative z-10 shrink-0 border-b border-border bg-[#FAE5B9] px-4 py-4 sm:px-6">
        <div className="flex items-start gap-3 sm:gap-4">
          <div className="min-w-0 flex-1 pr-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Morphological Analysis
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

      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
            <section className="min-h-[12rem] shrink-0 border-b border-border p-4 sm:p-6">
              <div className="mx-auto max-w-5xl">
                <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Word workspace
                </p>
                {words.length === 0 ? (
                  <p className="text-sm italic text-muted-foreground">
                    No words detected.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-x-2 gap-y-6 leading-relaxed">
                    {words.map((word) => (
                      <MorphWordBlock
                        key={word.id}
                        word={word}
                        onMeaningChange={(meaning) =>
                          updateWord(word.id, { meaning })
                        }
                        onClassificationsChange={(classifications) =>
                          updateWord(word.id, {
                            classifications: classifications as Classification[],
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="shrink-0 p-4 pb-40 sm:p-6 sm:pb-10">
              <div className="mx-auto flex max-w-5xl flex-col gap-4">
                <div className="space-y-2">
                  <Label htmlFor="literal-translation" className="text-sm font-medium">
                    Literal Translation
                  </Label>
                  <AutoResizingTextarea
                    id="literal-translation"
                    dir="rtl"
                    value={literalTranslation}
                    onChange={(e) => setLiteralTranslation(e.target.value)}
                    placeholder="תרגום מילולי..."
                    rows={1}
                    className="min-h-[4.5rem] text-right text-sm leading-relaxed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes" className="text-sm font-medium">
                    Notes
                  </Label>
                  <AutoResizingTextarea
                    id="notes"
                    dir="rtl"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="הערות..."
                    rows={1}
                    className="min-h-[4.5rem] text-right text-sm leading-relaxed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="syntactic-translation" className="text-sm font-medium">
                    Syntactic Translation
                  </Label>
                  <AutoResizingTextarea
                    id="syntactic-translation"
                    dir="rtl"
                    value={syntacticTranslation}
                    onChange={(e) => setSyntacticTranslation(e.target.value)}
                    placeholder="תרגום תחבירי..."
                    rows={1}
                    className="min-h-[4.5rem] text-right text-sm leading-relaxed"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="answer" className="text-sm font-medium">
                    Answer
                  </Label>
                  <AutoResizingTextarea
                    id="answer"
                    dir="rtl"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="תשובה..."
                    rows={1}
                    className="min-h-[4.5rem] text-right text-sm leading-relaxed"
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}
      </main>

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
