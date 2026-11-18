import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, Trash2, BookOpen, Search } from "lucide-react";
import type {
  AdjectiveData,
  Classification,
  NounData,
  PartOfSpeech,
  VerbData,
  FunctionalData,
} from "@/types/morphology";
import { emptyClassification } from "@/lib/morphology-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type ClassificationMenuProps = {
  open: boolean;
  classifications: Classification[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onChange: (classifications: Classification[]) => void;
  onDone: () => void;
  wordText?: string;
};

const POS_OPTIONS: PartOfSpeech[] = ["V", "N", "Adj", "Adv", "F"];

const FUNCTIONAL_STEPS: AttributeStep[] = [
  {
    key: "type",
    title: "Select type",
    options: [
      { value: "Preposition", label: "Preposition" },
      { value: "Conjunction", label: "Conjunction" },
      { value: "Determiner", label: "Determiner" },
      { value: "Interrogatives", label: "Interrogatives" },
      { value: "Negation", label: "Negation" },
    ],
  },
];

type StepOption = { value: string; label: string };

type AttributeStep = {
  key: string;
  title: string;
  options: StepOption[];
};

const NOUN_STEPS: AttributeStep[] = [
  {
    key: "case",
    title: "Select case",
    options: [
      { value: "Nom", label: "Nominative" },
      { value: "Acc", label: "Accusative" },
      { value: "Gen", label: "Genitive" },
      { value: "Dat", label: "Dative" },
      { value: "Abl", label: "Ablative" },
    ],
  },
  {
    key: "gender",
    title: "Select gender",
    options: [
      { value: "M", label: "Masculine" },
      { value: "F", label: "Feminine" },
      { value: "N", label: "Neuter" },
    ],
  },
  {
    key: "number",
    title: "Select number",
    options: [
      { value: "singular", label: "Singular" },
      { value: "plural", label: "Plural" },
    ],
  },
  {
    key: "declension",
    title: "Select declension",
    options: [
      { value: "1", label: "1st" },
      { value: "2", label: "2nd" },
      { value: "3", label: "3rd" },
      { value: "4", label: "4th" },
      { value: "5", label: "5th" },
    ],
  },
];

const ADJECTIVE_STEPS: AttributeStep[] = [
  {
    key: "case",
    title: "Select case",
    options: [
      { value: "Nom", label: "Nominative" },
      { value: "Acc", label: "Accusative" },
      { value: "Gen", label: "Genitive" },
      { value: "Dat", label: "Dative" },
      { value: "Abl", label: "Ablative" },
    ],
  },
  {
    key: "gender",
    title: "Select gender",
    options: [
      { value: "M", label: "Masculine" },
      { value: "F", label: "Feminine" },
      { value: "N", label: "Neuter" },
    ],
  },
  {
    key: "number",
    title: "Select number",
    options: [
      { value: "singular", label: "Singular" },
      { value: "plural", label: "Plural" },
    ],
  },
  {
    key: "degree",
    title: "Select degree",
    options: [
      { value: "positivus", label: "Positivus" },
      { value: "comparativus", label: "Comparativus" },
      { value: "superlativus", label: "Superlativus" },
    ],
  },
  {
    key: "declension",
    title: "Select declension",
    options: [
      { value: "1-2", label: "1st–2nd" },
      { value: "3", label: "3rd" },
    ],
  },
];

const ADVERB_STEPS: AttributeStep[] = [
  {
    key: "degree",
    title: "Select degree",
    options: [
      { value: "positivus", label: "Positivus" },
      { value: "comparativus", label: "Comparativus" },
      { value: "superlativus", label: "Superlativus" },
    ],
  },
];

const VERB_STEPS: AttributeStep[] = [
  {
    key: "tense",
    title: "Select tense",
    options: [
      { value: "present", label: "Present" },
      { value: "imperfect", label: "Imperfect" },
      { value: "future", label: "Future" },
      { value: "perfect", label: "Perfect" },
      { value: "plqp", label: "Pluperfect" },
      { value: "future perfect", label: "Future II" },
    ],
  },
  {
    key: "person",
    title: "Select person",
    options: [
      { value: "1", label: "1st" },
      { value: "2", label: "2nd" },
      { value: "3", label: "3rd" },
    ],
  },
  {
    key: "number",
    title: "Select number",
    options: [
      { value: "singular", label: "Singular" },
      { value: "plural", label: "Plural" },
    ],
  },
  {
    key: "voice",
    title: "Select voice",
    options: [
      { value: "active", label: "Active" },
      { value: "passive", label: "Passive" },
    ],
  },
  {
    key: "mood",
    title: "Select mood",
    options: [
      { value: "indicativus", label: "Indicative" },
      { value: "imperativus", label: "Imperative" },
      { value: "coniunctivus", label: "Subjunctive" },
    ],
  },
  {
    key: "conjugation",
    title: "Select conjugation",
    options: [
      { value: "1", label: "1st" },
      { value: "2", label: "2nd" },
      { value: "3", label: "3rd" },
      { value: "4", label: "4th" },
      { value: "mixed", label: "Mixed" },
    ],
  },
];

function getAttributeSteps(pos: PartOfSpeech): AttributeStep[] {
  switch (pos) {
    case "N":
      return NOUN_STEPS;
    case "Adj":
      return ADJECTIVE_STEPS;
    case "V":
      return VERB_STEPS;
    case "F":
      return FUNCTIONAL_STEPS;
    case "Adv":
      return ADVERB_STEPS;
    default:
      return [];
  }
}

function getStepValue(
  classification: Classification | undefined,
  key: string
): string | undefined {
  if (!classification || !classification.data) {
    return undefined;
  }
  const data = classification.data as Record<string, string | undefined>;
  return data[key];
}

function getDynamicAttributeSteps(classification: Classification | undefined): AttributeStep[] {
  if (!classification?.pos) return [];
  const pos = classification.pos;
  const nonFinite = getStepValue(classification, "nonFinite");

  // ענף פעלים נון-פיניטיים
  if (pos === "V" && nonFinite) {
    if (nonFinite === "infinitivus") {
      return [
        { key: "tense", title: "Select tense", options: [ { value: "present", label: "Present" }, { value: "perfect", label: "Perfect" }, { value: "future", label: "Future" } ] },
        { key: "voice", title: "Select voice", options: [ { value: "active", label: "Active" }, { value: "passive", label: "Passive" } ] }
      ];
    } else if (nonFinite === "gerundium") {
      return [ { key: "case", title: "Select case", options: [ { value: "Acc", label: "Accusative" }, { value: "Gen", label: "Genitive" }, { value: "Dat", label: "Dative" }, { value: "Abl", label: "Ablative" } ] } ];
    } else if (nonFinite === "supinum") {
      return [ { key: "case", title: "Select case", options: [ { value: "1 (Acc)", label: "Supine 1 (Acc)" }, { value: "2 (Abl)", label: "Supine 2 (Abl)" } ] } ];
    }
  }

  // ענף רגיל
  const steps = [...getAttributeSteps(pos)];
  if (pos === "N" && getStepValue(classification, "pronomen")) {
    steps.splice(3, 0, { key: "person", title: "Select person", options: [ { value: "1", label: "1st" }, { value: "2", label: "2nd" }, { value: "3", label: "3rd" } ] });
  }
  return steps;
}

export function getInitialClassificationStep(
  classification: Classification | undefined
): number {
  if (!classification?.pos) return 1;

  const steps = getDynamicAttributeSteps(classification);
  if (steps.length === 0) return 1;

  for (let i = 0; i < steps.length; i++) {
    if (!getStepValue(classification, steps[i].key)) {
      return i + 2;
    }
  }

  return 1;
}

function StepChoices({
  options,
  selected,
  onSelect,
  extraButton,
  bottomButton,
}: {
  options: StepOption[];
  selected?: string;
  onSelect: (value: string) => void;
  extraButton?: { label: string; onClick: () => void; isActive?: boolean; colorTheme?: "purple" | "teal" };
  bottomButton?: { label: string; onClick: () => void; isActive?: boolean };
}) {
  // פיצול המחרוזת למערך כדי לתמוך בבחירה מרובה (ליחסות)
  const selectedValues = selected ? selected.split("/") : [];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            className={cn(
              "rounded-md border px-2 py-2 text-left text-xs font-medium transition-colors",
              selectedValues.includes(opt.value)
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/80 bg-background text-foreground hover:bg-muted/60",
              opt.label.length > 12 && "col-span-2"
            )}
          >
            {opt.label}
          </button>
        ))}
        {extraButton && (
          <button
            type="button"
            onClick={extraButton.onClick}
            className={cn(
              "rounded-md border px-2 py-2 text-left text-xs font-medium transition-colors",
              extraButton.colorTheme === "teal"
                ? extraButton.isActive
                  ? "border-teal-400 bg-teal-100 text-teal-800 dark:border-teal-700 dark:bg-teal-900/50 dark:text-teal-300"
                  : "border-teal-200 bg-teal-50 text-black hover:bg-teal-100 dark:border-teal-900/40 dark:bg-teal-900/20 dark:text-teal-100 dark:hover:bg-teal-900/40"
                : extraButton.isActive // default purple
                  ? "border-purple-400 bg-purple-100 text-purple-700 dark:border-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                  : "border-purple-200 bg-purple-50 text-black hover:bg-purple-100 dark:border-purple-900/40 dark:bg-purple-900/20 dark:text-purple-100 dark:hover:bg-purple-900/40"
            )}
          >
            {extraButton.label}
          </button>
        )}
      </div>
      {bottomButton && (
        <button
          type="button"
          onClick={bottomButton.onClick}
          className={cn(
            "w-full rounded-md border px-2 py-2 text-center text-xs font-medium transition-colors",
            bottomButton.isActive
              ? "border-amber-400 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300"
              : "border-border/80 bg-muted/40 text-foreground hover:bg-muted"
          )}
        >
          {bottomButton.label}
        </button>
      )}
    </div>
  );
}

export default function ClassificationMenu({
  open,
  classifications,
  activeIndex,
  onActiveIndexChange,
  onChange,
  onDone,
  wordText = "",
}: ClassificationMenuProps) {
  const current = classifications[activeIndex];
  const [currentStep, setCurrentStep] = useState(1);
  const [isManualMode, setIsManualMode] = useState(false);
  const [isSelectingParticipium, setIsSelectingParticipium] = useState(false);
  const [isSelectingNonFinite, setIsSelectingNonFinite] = useState(false);
  
  // משתני המילון
  const [isDictionaryOpen, setIsDictionaryOpen] = useState(false);
  const [dictionaryQuery, setDictionaryQuery] = useState(wordText);

  // מאכלס אוטומטית את תיבת החיפוש בכל פעם שפותחים מילה
  useEffect(() => {
    if (open) {
      setDictionaryQuery(wordText);
    }
  }, [open, wordText]);

  const pos = current?.pos;

  const attributeSteps = useMemo(
    () => getDynamicAttributeSteps(current),
    [current]
  );

  const totalSteps = pos
    ? attributeSteps.length > 0
      ? 1 + attributeSteps.length
      : 2
    : 1;

    useEffect(() => {
      if (!open) return;
      setCurrentStep(getInitialClassificationStep(classifications[activeIndex]));
      setIsManualMode(!!getStepValue(classifications[activeIndex], "manual"));
      setIsSelectingParticipium(false);
      setIsSelectingNonFinite(false);
    }, [open, activeIndex]);
  
    const updateCurrent = (next: Classification) => {
    const copy = [...classifications];
    if (copy.length === 0) {
      onChange([next]);
      return;
    }
    copy[activeIndex] = next;
    onChange(copy);
  };

  const updateAttribute = (key: string, value: string) => {
    if (!pos) return;
    const base =
      current?.pos === pos
        ? { ...current.data }
        : ({} as any);
    const data = { ...base, [key]: value };

    if (pos === "V") {
      updateCurrent({ pos: "V", data: data as Partial<VerbData> });
    } else if (pos === "N") {
      updateCurrent({ pos: "N", data: data as Partial<NounData> });
    } else if (pos === "Adj") {
      updateCurrent({ pos: "Adj", data: data as Partial<AdjectiveData> });
    } else if (pos === "F") {
      updateCurrent({ pos: "F", data: data as Partial<FunctionalData> });
    } else if (pos === "Adv") {
      updateCurrent({ pos: "Adv", data: data as any });
    }
  };

  const handlePosSelect = (nextPos: PartOfSpeech) => {
    updateCurrent(emptyClassification(nextPos));
    setCurrentStep(2);
    setIsManualMode(false);
  };

  const handleAttributeSelect = (key: string, value: string) => {
    // 1. טיפול ייעודי ליחסות (בחירה מרובה)
    if (key === "case") {
      const currentValue = getStepValue(current, key) || "";
      const currentValues = currentValue ? currentValue.split("/") : [];
      let newValues;

      // הוספה או הסרה של היחסה שנבחרה
      if (currentValues.includes(value)) {
        newValues = currentValues.filter((v) => v !== value);
      } else {
        newValues = [...currentValues, value];
      }

      updateAttribute(key, newValues.join("/"));
    } else {
      // 2. טיפול רגיל (בחירה יחידה) לשאר המאפיינים
      updateAttribute(key, value);
    }

    // 3. מעבר אוטומטי לשלב הבא - תמיד! לכל מאפיין ובכל לחיצה
    const stepIndex = attributeSteps.findIndex((s) => s.key === key);
    if (stepIndex >= 0 && stepIndex < attributeSteps.length - 1) {
      setCurrentStep(stepIndex + 3);
    }
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(1, s - 1));
  };

  const handleSkip = () => {
    if (currentStep <= 1) return;
    if (currentStep >= totalSteps) {
      onDone();
      return;
    }
    setCurrentStep((s) => s + 1);
  };

  const handleAddAlternative = () => {
    // דוחפים סיווג "ריק" כדי שהמערכת תישאר בשלב הראשון של בחירת חלק הדיבר
    const next = [...classifications, { pos: "" as any, data: {} }];
    onChange(next);
    onActiveIndexChange(next.length - 1);
  };

  const handleDelete = () => {
    // מסנן החוצה רק את הסיווג הפעיל הנוכחי
    const next = classifications.filter((_, i) => i !== activeIndex);
    
    if (next.length === 0) {
      // אם זה היה הסיווג האחרון, מרוקנים וסוגרים את החלון
      onChange([]);
      onDone(); 
    } else {
      // אם יש עוד אלטרנטיבות, מעדכנים ועוברים לאלטרנטיבה הקודמת
      onChange(next);
      onActiveIndexChange(Math.max(0, activeIndex - 1));
    }
  };

  const activeAttributeStep =
    currentStep > 1 && attributeSteps.length > 0
      ? attributeSteps[currentStep - 2]
      : undefined;

  const isSimplePosDone =
    currentStep === 2 && pos && attributeSteps.length === 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {currentStep > 1 ? (
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden />
            Back
          </button>
        ) : (
          <span />
        )}
        {classifications.length > 1 ? (
          <div className="flex gap-1">
            {classifications.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  onActiveIndexChange(i);
                  setCurrentStep(getInitialClassificationStep(classifications[i]));
                }}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  i === activeIndex
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {i === 0 ? "1°" : `${i + 1}°`}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {currentStep === 1 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">Part of speech</p>
          <div className="grid grid-cols-3 gap-1.5">
            {POS_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => handlePosSelect(option)}
                className={cn(
                  "rounded-md border px-2 py-2.5 text-sm font-semibold transition-colors",
                  pos === option
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/80 bg-background text-foreground hover:bg-muted/60"
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ) : null}

{isSelectingNonFinite ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Select non-finite type
            </p>
            <div className="flex items-center gap-1">
              {getStepValue(current, "nonFinite") && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    updateAttribute("nonFinite", "");
                    setIsSelectingNonFinite(false);
                  }}
                >
                  Remove
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                onClick={() => setIsSelectingNonFinite(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
          <StepChoices
            options={[
              { value: "infinitivus", label: "Infinitivus" },
              { value: "gerundium", label: "Gerundium" },
              { value: "supinum", label: "Supinum" },
            ]}
            selected={getStepValue(current, "nonFinite")}
            onSelect={(value) => {
              updateAttribute("nonFinite", value);
              setIsSelectingNonFinite(false);
            }}
          />
        </div>
      ) : isSelectingParticipium ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              Select participium type
            </p>
            <div className="flex items-center gap-1">
              {getStepValue(current, "participium") && getStepValue(current, "participium") !== " " && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs text-red-500 hover:bg-red-50 hover:text-red-600"
                  onClick={() => {
                    updateAttribute("participium", "");
                    setIsSelectingParticipium(false);
                  }}
                >
                  Remove
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
                onClick={() => {
                  if (getStepValue(current, "participium") === " ") {
                    updateAttribute("participium", ""); // מוחק את הסטטוס הזמני אם המשתמש התחרט
                  }
                  setIsSelectingParticipium(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
          <StepChoices
            options={[
              { value: "Pr.", label: "Present" },
              { value: "p.p.p.", label: "Perfect Passive" },
              { value: "Fu.", label: "Future" },
            ]}
            selected={getStepValue(current, "participium")}
            onSelect={(value) => {
              updateAttribute("participium", value);
              setIsSelectingParticipium(false);
            }}
          />
        </div>
      ) : activeAttributeStep && !isManualMode ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
              {activeAttributeStep.title}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 shrink-0 px-2 text-xs",
                activeAttributeStep.key === "case" && getStepValue(current, "case") 
                  ? "bg-primary/10 text-primary hover:bg-primary/20" 
                  : "text-muted-foreground"
              )}
              onClick={handleSkip}
            >
              {activeAttributeStep.key === "case" && getStepValue(current, "case") ? "Next →" : "Skip →"}
            </Button>
          </div>
          <StepChoices
            options={activeAttributeStep.options}
            selected={getStepValue(current, activeAttributeStep.key)}
            onSelect={(value) =>
              handleAttributeSelect(activeAttributeStep.key, value)
            }
            extraButton={
              pos === "Adj" && activeAttributeStep.key === "case"
                ? {
                    label: getStepValue(current, "participium")?.trim() ? `Participium (${getStepValue(current, "participium")})` : "Participium",
                    isActive: !!getStepValue(current, "participium"),
                    colorTheme: "purple",
                    onClick: () => {
                      if (!getStepValue(current, "participium")) {
                        updateAttribute("participium", " "); 
                      }
                      setIsSelectingParticipium(true);
                    },
                  }
                : pos === "N" && activeAttributeStep.key === "case"
                ? {
                    label: "Pronomen",
                    isActive: !!getStepValue(current, "pronomen"),
                    colorTheme: "teal",
                    onClick: () => {
                      if (getStepValue(current, "pronomen")) {
                        updateAttribute("pronomen", "");
                        updateAttribute("person", "");
                      } else {
                        updateAttribute("pronomen", "true");
                      }
                    },
                  }
                : undefined
            }
            bottomButton={
              pos === "V" && (activeAttributeStep.key === "tense" || activeAttributeStep.key === "case")
                ? {
                    label: getStepValue(current, "nonFinite") 
                      ? `Change Type (${getStepValue(current, "nonFinite")})` 
                      : "Non-finite Verbs (Inf, Ger, Sup)",
                    isActive: !!getStepValue(current, "nonFinite"), 
                    onClick: () => setIsSelectingNonFinite(true),
                  }
                : undefined
            }
          />
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => setIsManualMode(true)}
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              write manually
            </button>
          </div>
        </div>
      ) : null}

      {isManualMode && currentStep > 1 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground">
            write manually
            </p>
            <button
              type="button"
              onClick={() => {
                setIsManualMode(false);
                updateAttribute("manual", "");
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ביטול
            </button>
          </div>
          <Input
            dir="ltr"
            placeholder="הקלד סיווג..."
            value={getStepValue(current, "manual") || ""}
            onChange={(e) => updateAttribute("manual", e.target.value)}
            className="h-8 text-sm"
          />
        </div>
      ) : null}

      {isSimplePosDone ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Classification saved. Add more detail or tap Done.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
            onClick={handleSkip}
          >
            Skip →
          </Button>
        </div>
      ) : null}

{isDictionaryOpen && (
        <div className="space-y-2 border-t border-border/60 pt-3 pb-1 mt-2">
          <p className="text-xs font-medium text-foreground">
            Logeion Dictionary
          </p>
          <div className="flex gap-2">
            <Input
              dir="ltr"
              placeholder="Type lemma (e.g. romanus)..."
              value={dictionaryQuery}
              onChange={(e) => setDictionaryQuery(e.target.value)}
              className="h-8 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && dictionaryQuery.trim()) {
                  window.open(`https://logeion.uchicago.edu/${encodeURIComponent(dictionaryQuery.trim())}`, "_blank", "noopener,noreferrer");
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-8 px-2 shrink-0 bg-primary/10 text-primary hover:bg-primary/20"
              disabled={!dictionaryQuery.trim()}
              onClick={() => {
                window.open(`https://logeion.uchicago.edu/${encodeURIComponent(dictionaryQuery.trim())}`, "_blank", "noopener,noreferrer");
              }}
              title="Search in Logeion"
            >
              <Search className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-2 mt-1 border-t border-transparent">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleAddAlternative}
            className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Add alternative
          </button>
          
          {classifications.length > 0 ? (
            <button
              type="button"
              onClick={handleDelete}
              className="text-muted-foreground transition-colors hover:text-red-500"
              title="Delete classification"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => setIsDictionaryOpen(!isDictionaryOpen)}
            className={cn(
              "transition-colors",
              isDictionaryOpen ? "text-primary" : "text-muted-foreground hover:text-blue-500"
            )}
            title="Open Dictionary Search"
          >
            <BookOpen className="size-3.5" aria-hidden />
          </button>
        </div>
        
        <Button type="button" size="sm" className="h-7 px-3 text-xs" onClick={onDone}>
          Done
        </Button>
      </div>

      {pos && currentStep > 1 ? (
        <p className="text-center text-[10px] text-muted-foreground">
          Step {Math.min(currentStep, totalSteps)} of {totalSteps}
        </p>
      ) : null}
    </div>
  );
}
