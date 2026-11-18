export type PartOfSpeech = "V" | "N" | "Adj" | "Adv" | "F";

export type FunctionalType =
  | "Preposition"
  | "Conjunction"
  | "Determiner"
  | "Interrogatives"
  | "Negation";

export type FunctionalData = {
  type?: FunctionalType;
  manual?: string;
};

export type VerbTense =
  | "present"
  | "imperfect"
  | "future"
  | "perfect"
  | "plqp"
  | "future perfect";
  
export type Person = "1" | "2" | "3";

export type GrammaticalNumber = "singular" | "plural";

export type Conjugation = "1" | "2" | "3" | "4" | "mixed";

export type Voice = "active" | "passive";

export type Mood =
  | "indicativus"
  | "imperativus"
  | "coniunctivus"
  | "infinitivus"
  | "gerundium"
  | "supinum";

export type NounCase = "Nom" | "Acc" | "Gen" | "Dat" | "Abl";

export type Gender = "M" | "F" | "N";

export type NounDeclension = "1" | "2" | "3" | "4" | "5";

export type AdjectiveDeclension = "1-2" | "3";

export type VerbData = {
  tense?: VerbTense;
  person?: Person;
  number?: GrammaticalNumber;
  conjugation?: Conjugation;
  voice?: Voice;
  mood?: Mood;
  manual?: string;
};

export type NounData = {
  case?: NounCase;
  number?: GrammaticalNumber;
  gender?: Gender;
  declension?: NounDeclension;
  manual?: string;
};

export type AdjectiveData = {
  case?: NounCase;
  number?: GrammaticalNumber;
  gender?: Gender;
  declension?: AdjectiveDeclension;
  manual?: string;
};

export type Classification =
  | { pos: "V"; data: Partial<VerbData>; rejected?: boolean }
  | { pos: "N"; data: Partial<NounData>; rejected?: boolean }
  | { pos: "Adj"; data: Partial<AdjectiveData>; rejected?: boolean }
  | { pos: "Adv"; data?: Record<string, never>; rejected?: boolean }
  | { pos: "F"; data: Partial<FunctionalData>; rejected?: boolean };

export type MorphWord = {
  id: string;
  originalText: string;
  meaning: string;
  classifications: Classification[];
};

export type MorphFolder = {
  id: string;
  name: string;
  parentId: string | null;
};

export type MorphProject = {
  id: string;
  title: string;
  folderId?: string | null;
  sourceText: string;
  processedText: string;
  words: MorphWord[];
  literalTranslation: string;
  notes: string;
  syntacticTranslation: string;
  answer: string;
  updatedAt: string;
};

export type MorphProjectFilePayload = {
  schemaVersion: 1;
  title: string;
  sourceText: string;
  processedText: string;
  words: MorphWord[];
  literalTranslation: string;
  notes: string;
  syntacticTranslation: string;
  answer: string;
};
