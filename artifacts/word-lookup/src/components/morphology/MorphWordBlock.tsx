import { useState } from "react";
import type { Classification, MorphWord, SyntacticRole } from "@/types/morphology";
import {
  formatPrimaryInfo,
  formatSecondaryInfo,
  POS_COLORS,
} from "@/lib/morphology-utils";
import ClassificationMenu from "@/components/morphology/ClassificationMenu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

type MorphWordBlockProps = {
  word: MorphWord;
  isEditMode?: boolean;
  isSelectingClause?: boolean;
  clauseColorClass?: string;
  onMeaningChange: (meaning: string) => void;
  onClassificationsChange: (classifications: Classification[]) => void;
  onSyntacticRoleChange?: (role: SyntacticRole | undefined) => void;
  onToggleHideLabel?: () => void;
  onStartClause?: () => void;
  onWordClick?: () => void;
};

function ClassificationSummary({
  classification,
  compact,
  onToggleReject,
}: {
  classification?: Classification;
  compact?: boolean;
  onToggleReject?: () => void;
}) {
  const pos = classification?.pos;
  const colors = pos ? POS_COLORS[pos] : null;
  const isRejected = classification?.rejected;
  const isParticipium = pos === "Adj" && classification?.data && (classification.data as any).participium;
  const isPronomen = pos === "N" && classification?.data && (classification.data as any).pronomen;
  
  const participiumType = isParticipium ? (classification?.data as any)?.participium?.trim() : "";
  const personType = isPronomen && (classification?.data as any)?.person ? `${(classification?.data as any).person}p.` : "";
  const nonFiniteType = pos === "V" ? (classification?.data as any)?.nonFinite : undefined;
  const degree = (classification?.data as any)?.degree;
  const degreeStr = degree === "comparativus" ? "comp." : degree === "superlativus" ? "sup." : "";
  
  const primaryInfo = formatPrimaryInfo(classification);
  let displayText = primaryInfo;
  
  if (nonFiniteType === "infinitivus") {
    const t = (classification?.data as any).tense;
    const v = (classification?.data as any).voice;
    const m = { present: "pres.", perfect: "perf.", future: "fut." };
    const vMap = { active: "act.", passive: "pass." };
    displayText = `Inf. ${t ? m[t as keyof typeof m] || t : ""} ${v ? vMap[v as keyof typeof vMap] || v : ""}`.trim();
  } else if (nonFiniteType === "gerundium") {
    const c = (classification?.data as any).case;
    displayText = `Ger. ${c || ""}, n, sg`.trim();
  } else if (nonFiniteType === "supinum") {
    const c = (classification?.data as any).case;
    displayText = `Sup. ${c || ""}, n, sg`.trim();
  } else {
    if (participiumType) displayText = `${participiumType} ${displayText}`.trim();
    if (personType) displayText = `${personType} ${displayText}`.trim();
    if (degreeStr) displayText = `${displayText} ${degreeStr}`.trim();
  }

  return (
    <div
      onClick={onToggleReject}
      className={cn(
        "flex max-w-[9rem] items-center justify-center gap-1.5",
        compact ? "text-sm text-muted-foreground" : "text-sm",
        onToggleReject && "cursor-pointer transition-all hover:opacity-70",
        isRejected && "line-through opacity-40 grayscale"
      )}
      title={onToggleReject ? "לחץ כדי לפסול/לאשר סיווג זה" : undefined}
    >
      {pos && colors ? (
        <span
          className={cn(
            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none",
            isParticipium ? "bg-purple-600 text-white" : 
            isPronomen ? "bg-teal-600 text-white" : 
            `${colors.bg} ${colors.text}`
          )}
          title={isParticipium ? "Participium" : isPronomen ? "Pronomen" : pos}
        >
          {isParticipium ? "P" : isPronomen ? "PN" : pos === "Adj" ? "A" : pos.charAt(0)}
        </span>
      ) : (
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-[11px] text-muted-foreground">
          ?
        </span>
      )}
      <span className="text-sm text-muted-foreground">
        {displayText}
      </span>
    </div>
  );
}

export default function MorphWordBlock({
  word,
  isEditMode = true,
  isSelectingClause,
  clauseColorClass,
  onMeaningChange,
  onClassificationsChange,
  onSyntacticRoleChange,
  onToggleHideLabel,
  onStartClause,
  onWordClick,
}: MorphWordBlockProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelMenuOpen, setLabelMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const main = word.classifications[0];
  const alternatives = word.classifications.slice(1);
  const secondary = formatSecondaryInfo(main);

  const ensureClassifications = (): Classification[] => word.classifications;

  const handleClassificationsChange = (next: Classification[]) => {
    onClassificationsChange(next);
    if (activeIndex >= next.length) {
      setActiveIndex(Math.max(0, next.length - 1));
    }
  };

  const toggleReject = (index: number) => {
    const nextClassifications = [...word.classifications];
    const target = nextClassifications[index];
    if (target) {
      nextClassifications[index] = { ...target, rejected: !target.rejected };
      onClassificationsChange(nextClassifications);
    }
  };

// חישוב התוויות למצב קריאה
const posColors = main?.pos ? POS_COLORS[main.pos] : null;
const isParticipiumMain = main?.pos === "Adj" && main?.data && (main?.data as any).participium;
const isPronomenMain = main?.pos === "N" && main?.data && (main?.data as any).pronomen;
const isNonFiniteMain = main?.pos === "V" ? (main?.data as any)?.nonFinite : undefined;

let topLabel: string | null = word.syntacticRole || null;
if (!topLabel && main && !isEditMode) {
  const degree = (main?.data as any)?.degree;
  const degreeStr = degree === "comparativus" ? "comp." : degree === "superlativus" ? "sup." : "";
  
  if (main.pos === "N" || main.pos === "Adj") {
    topLabel = (main?.data as any)?.case ? (main?.data as any)?.case.replace(/\//g, "/") : null;
    if (isParticipiumMain && (main?.data as any)?.participium?.trim()) {
      topLabel = `${(main?.data as any).participium} ${topLabel || ""}`.trim();
    }
    if (isPronomenMain && (main?.data as any)?.person) {
      topLabel = `${(main?.data as any).person}p. ${topLabel || ""}`.trim();
    }
    if (degreeStr) {
      topLabel = topLabel ? `${topLabel} ${degreeStr}` : degreeStr;
    }
  } else if (main.pos === "V") {
    if (isNonFiniteMain === "infinitivus") {
      const t = (main?.data as any)?.tense;
      const v = (main?.data as any)?.voice;
      const m = { present: "pres.", perfect: "perf.", future: "fut." };
      const vMap = { active: "act.", passive: "pass." };
      topLabel = `Inf. ${t ? m[t as keyof typeof m] || t : ""} ${v ? vMap[v as keyof typeof vMap] || v : ""}`.trim();
    } else if (isNonFiniteMain === "gerundium") {
      topLabel = `Ger. ${(main?.data as any)?.case || ""}, n, sg`.trim();
    } else if (isNonFiniteMain === "supinum") {
      topLabel = `Sup. ${(main?.data as any)?.case || ""}, n, sg`.trim();
    } else {
      const t = (main?.data as any)?.tense;
      const m: Record<string, string> = { present: "pres.", imperfect: "impf.", future: "fut.", perfect: "perf.", plqp: "plupf.", "future perfect": "fut. perf.", "Future II": "Fut II" };
      topLabel = t ? m[t] || t : null;
    }
  } else if (main.pos === "Adv") {
    topLabel = degreeStr || null;
  }
}

  return (
    <div 
      data-word-id={word.id}
      onClick={() => {
        if (isSelectingClause && onWordClick) {
          onWordClick();
        }
      }}
      className={cn(
        "inline-flex w-auto max-w-full flex-col items-center justify-end gap-1.5 mb-3 md:mb-4 group rounded px-1 transition-all duration-300",
        clauseColorClass,
        isSelectingClause && "cursor-crosshair hover:bg-primary/20 hover:ring-2 hover:ring-primary/50"
      )}
    >
      
      {/* 1. החלק העליון (סיווגים) */}
      <div className="flex w-auto flex-col items-center gap-1">
        {alternatives.length > 0 ? (
          <div className={cn("flex flex-col items-center gap-1 w-full", !isEditMode && "invisible")}>
            {alternatives.map((alt, i) => (
              <ClassificationSummary
                key={`${word.id}-alt-${i}`}
                classification={alt}
                compact
                onToggleReject={() => toggleReject(i + 1)}
              />
            ))}
            <hr className="w-full border-border/50" />
          </div>
        ) : null}

        <div className="relative flex items-center justify-center">
          {/* מצב רפאים */}
          <div className={cn(!isEditMode && "invisible")}>
            <ClassificationSummary
              classification={main}
              onToggleReject={() => toggleReject(0)}
            />
          </div>

          {/* מצב קריאה - צף בדיוק מעל הרפאים */}
          {!isEditMode && (
            <div className="absolute inset-0 flex items-center justify-center gap-1 z-10">
              <Popover open={labelMenuOpen} onOpenChange={setLabelMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded transition-all outline-none",
                      word.hideReadingLabel
                        ? "opacity-0 hover:opacity-100 hover:bg-muted/50 h-6 w-8 cursor-pointer"
                        : "hover:bg-muted/50 cursor-pointer px-1 py-0.5"
                    )}
                    title={word.hideReadingLabel ? "Show label" : "Hide label"}
                  >
                    {word.hideReadingLabel ? (
                      <EyeOff className="size-3.5 text-muted-foreground" />
                    ) : (
                      <>
                        {main?.pos && posColors ? (
                          <span className={cn(
                            "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold leading-none",
                            isParticipiumMain ? "bg-purple-600 text-white" : 
                            isPronomenMain ? "bg-teal-600 text-white" : 
                            `${posColors.bg} ${posColors.text}`
                          )}>
                            {isParticipiumMain ? "P" : isPronomenMain ? "PN" : main.pos === "Adj" ? "A" : main.pos.charAt(0)}
                          </span>
                        ) : null}
                        {topLabel ? (
                          <span className="text-sm text-muted-foreground font-medium">
                            {topLabel}
                          </span>
                        ) : null}
                      </>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="center" side="top" sideOffset={4} className="w-auto p-1 border-border bg-white dark:bg-slate-900 shadow-md z-50">
                  <button
                    type="button"
                    onClick={() => {
                      onToggleHideLabel?.();
                      setLabelMenuOpen(false);
                    }}
                    className="text-xs px-3 py-1.5 rounded-sm hover:bg-muted transition-colors text-foreground flex items-center gap-2 font-medium"
                  >
                    {word.hideReadingLabel ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    {word.hideReadingLabel ? "Show Label" : "Hide Label"}
                  </button>
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        {secondary ? (
          <p className={cn("max-w-[9rem] text-center text-sm leading-snug text-muted-foreground", !isEditMode && "invisible")}>
            {secondary}
          </p>
        ) : null}
      </div>

      {/* 2. המילה הלטינית (מרכז) */}
      <Popover open={menuOpen && !isSelectingClause} onOpenChange={(open) => !isSelectingClause && setMenuOpen(open)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="whitespace-nowrap font-serif text-lg font-medium leading-tight text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:text-xl lg:text-2xl"
          >
            {word.originalText}
          </button>
        </PopoverTrigger>
        {isEditMode ? (
          <PopoverContent
            align="center"
            side="bottom"
            sideOffset={8}
            collisionPadding={16}
            className="z-50 w-[min(17rem,calc(100vw-2rem))] border border-slate-200 bg-white p-3 opacity-100 shadow-xl dark:border-slate-700 dark:bg-slate-900"
          >
            <ClassificationMenu
              open={menuOpen}
              classifications={ensureClassifications()}
              activeIndex={activeIndex}
              onActiveIndexChange={setActiveIndex}
              onChange={handleClassificationsChange}
              onDone={() => setMenuOpen(false)}
              wordText={word.originalText}
            />
          </PopoverContent>
        ) : (
          <PopoverContent align="center" side="bottom" className="w-32 p-1 border-border bg-white dark:bg-slate-900 shadow-lg z-50">
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 px-2 pt-1">Syntax Role</p>
              {(["subj.", "obj.", "predic.", "mod."] as SyntacticRole[]).map(role => (
                <button
                  key={role}
                  onClick={() => {
                    onSyntacticRoleChange?.(role === word.syntacticRole ? undefined : role);
                    setMenuOpen(false);
                  }}
                  className={cn(
                    "text-xs px-2 py-1.5 text-left rounded-sm hover:bg-muted transition-colors",
                    word.syntacticRole === role ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                  )}
                >
                  {role}
                </button>
              ))}
              
              <div className="mt-1 border-t border-border pt-1">
                <button
                  onClick={() => {
                    onStartClause?.();
                    setMenuOpen(false);
                  }}
                  className="text-xs px-2 py-1.5 text-left rounded-sm hover:bg-primary/10 hover:text-primary transition-colors text-foreground w-full flex items-center gap-1.5 font-medium"
                >
                  Start Clause {"{"}
                </button>
              </div>
            </div>
          </PopoverContent>
        )}
      </Popover>


      {/* 3. החלק התחתון (תרגום מילולי) */}
      {/* משתמשים במערכת grid כדי לאלץ את הרוחב להיות בדיוק לפי המילה הלטינית או הטקסט העברי (הגדול מביניהם) */}
      <div className="relative grid w-full h-7 min-w-[3rem] place-items-center">
        
        {/* "אלמנט רפאים": מכתיב את הרוחב המדויק, ולא נותן לתיבת הטקסט להשתלט על הגודל */}
        <span className="invisible whitespace-pre px-2 text-xs">
          {word.meaning || "      "}
        </span>
        
        <Input
          dir="rtl"
          value={word.meaning}
          onChange={(e) => onMeaningChange(e.target.value)}
          placeholder="meaning"
          tabIndex={isEditMode ? 0 : -1} 
          className={cn(
            // התיבה יוצאת מחישוב הגודל (absolute) ונמתחת בדיוק לגודל הרשת
            "absolute inset-0 h-full w-full border-border bg-white px-1 text-center text-xs shadow-none dark:bg-slate-900 transition-all",
            !isEditMode && "invisible"
          )}
        />
        {!isEditMode && (
          <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-1 pointer-events-none">
            <span className="truncate text-[13px] text-muted-foreground">
              {word.meaning}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}