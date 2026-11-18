import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Word Lookup" },
  { href: "/morphology", label: "Morphological Analysis" },
] as const;

export default function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="shrink-0 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 px-4 sm:px-6">
        <span className="mr-3 hidden text-xs font-semibold uppercase tracking-widest text-muted-foreground sm:inline">
          Latin Tools
        </span>
        {NAV_ITEMS.map((item) => {
          const active =
            item.href === "/"
              ? location === "/" || location === ""
              : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
