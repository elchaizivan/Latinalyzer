import { useState } from "react";
import type { Classification, MorphWord } from "@/types/morphology";
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

type MorphWordBlockProps = {
  word: MorphWord;
  onMeaningChange: (meaning: string) => void;
  onClassificationsChange: (classifications: Classification[]) => void;
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
            colors.bg,
            colors.text
          )}
          title={pos}
        >
          {pos === "Adj" ? "A" : pos.charAt(0)}
        </span>
      ) : (
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/40 text-[11px] text-muted-foreground">
          ?
        </span>
      )}
      <span className="text-sm text-muted-foreground">
        {formatPrimaryInfo(classification)}
      </span>
    </div>
  );
}

export default function MorphWordBlock({
  word,
  onMeaningChange,
  onClassificationsChange,
}: MorphWordBlockProps) {
  const [menuOpen, setMenuOpen] = useState(false);
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
      // יוצרים עותק של הסיווג ומשנים את הסטטוס שלו (נפסל / אושר)
      nextClassifications[index] = { ...target, rejected: !target.rejected };
      onClassificationsChange(nextClassifications);
    }
  };

  return (
    <div className="inline-flex w-auto max-w-full flex-col items-center justify-end gap-1.5 mb-8 md:mb-10">
      <div className="flex w-auto flex-col items-center gap-1">
        {alternatives.length > 0 ? (
          <>
            {alternatives.map((alt, i) => (
              <ClassificationSummary
                key={`${word.id}-alt-${i}`}
                classification={alt}
                compact
                onToggleReject={() => toggleReject(i + 1)}
              />
            ))}
            <hr className="w-full border-border/50" />
          </>
        ) : null}

        <ClassificationSummary 
          classification={main} 
          onToggleReject={() => toggleReject(0)} 
        />

        {secondary ? (
          <p className="max-w-[9rem] text-center text-sm leading-snug text-muted-foreground">
            {secondary}
          </p>
        ) : null}
      </div>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="whitespace-nowrap font-serif text-lg font-medium leading-tight text-foreground underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 md:text-xl lg:text-2xl"
          >
            {word.originalText}
          </button>
        </PopoverTrigger>
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
      </Popover>

      <Input
        dir="rtl"
        value={word.meaning}
        onChange={(e) => onMeaningChange(e.target.value)}
        placeholder="meaning"
        className="relative h-7 w-auto min-w-[3.5rem] max-w-[9rem] shrink-0 border-border bg-white px-1.5 text-right text-xs shadow-none dark:bg-slate-900"
      />
    </div>
  );
}
