interface ClickableTextProps {
  text: string;
  selectedWord: string | null;
  onWordClick: (word: string) => void;
  /** When false, words render as static text (no dictionary lookup). */
  dictionaryEnabled?: boolean;
}

function tokenize(text: string): Array<{ type: "word" | "space"; value: string; clean: string }> {
  const tokens: Array<{ type: "word" | "space"; value: string; clean: string }> = [];
  const regex = /(\s+|[^\s]+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const value = match[0];
    if (/^\s+$/.test(value)) {
      tokens.push({ type: "space", value, clean: value });
    } else {
      const clean = value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      tokens.push({ type: "word", value, clean });
    }
  }
  return tokens;
}

export default function ClickableText({
  text,
  selectedWord,
  onWordClick,
  dictionaryEnabled = true,
}: ClickableTextProps) {
  const tokens = tokenize(text);

  return (
    <p className="text-base leading-8 text-foreground whitespace-pre-wrap break-words">
      {tokens.map((token, i) => {
        if (token.type === "space") {
          return <span key={i}>{token.value}</span>;
        }

        if (!token.clean) {
          return <span key={i}>{token.value}</span>;
        }

        const isSelected =
          dictionaryEnabled &&
          selectedWord !== null &&
          token.clean.toLowerCase() === selectedWord.toLowerCase();

        const prefix = token.value.slice(0, token.value.indexOf(token.clean));
        const suffix = token.value.slice(
          token.value.indexOf(token.clean) + token.clean.length
        );

        const wordClass = [
          "rounded px-0.5 -mx-0.5 transition-colors",
          dictionaryEnabled
            ? "cursor-pointer hover:bg-accent/60 hover:text-accent-foreground"
            : "cursor-default text-foreground",
          isSelected
            ? "bg-accent text-accent-foreground underline underline-offset-2"
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <span key={i}>
            {prefix}
            {dictionaryEnabled ? (
              <button
                type="button"
                onClick={() => onWordClick(token.clean)}
                className={wordClass}
                title={`Look up "${token.clean}"`}
              >
                {token.clean}
              </button>
            ) : (
              <span className={wordClass} title={undefined}>
                {token.clean}
              </span>
            )}
            {suffix}
          </span>
        );
      })}
    </p>
  );
}
