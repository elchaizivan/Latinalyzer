const LANGUAGES = [
  "All",
  "English",
  "Spanish",
  "French",
  "German",
  "Italian",
  "Portuguese",
  "Latin",
  "Dutch",
  "Polish",
  "Russian",
  "Chinese",
  "Japanese",
  "Arabic",
  "Swedish",
  "Norwegian",
  "Finnish",
];

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  selectedLanguage: string;
  onLanguageChange: (lang: string) => void;
}

export default function TextInput({
  value,
  onChange,
  onSubmit,
  selectedLanguage,
  onLanguageChange,
}: TextInputProps) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-sm font-medium text-foreground">
        Paste your text
      </label>
      <textarea
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        rows={6}
        placeholder="Paste any text here in any language…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            onSubmit();
          }
        }}
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <label
            htmlFor="text-language"
            className="text-xs font-medium text-muted-foreground shrink-0"
          >
            Text language
          </label>
          <select
            id="text-language"
            value={selectedLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer"
          >
            {LANGUAGES.map((lang) => (
              <option
                key={lang}
                value={lang}
                {...(lang === "Latin" ? { "data-iso": "lat" } : {})}
              >
                {lang}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-muted-foreground">
            {value.trim() ? `${value.trim().split(/\s+/).length} words` : "No text yet"}
          </span>
          <button
            onClick={onSubmit}
            disabled={!value.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:opacity-80"
          >
            Show text
            <kbd className="hidden sm:inline-block text-xs opacity-70 font-mono">⌘↵</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
