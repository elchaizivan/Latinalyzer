import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Morphological Analysis" },
  { href: "/continuous-reading", label: "Continuous Reading" },
  { href: "/word-lookup", label: "Word Lookup" },
] as const;

export default function Navbar() {
  const [location] = useLocation();

  return (
    <nav className="shrink-0 border-b border-[#d8e3da] bg-[#eff4f0]/95 backdrop-blur supports-[backdrop-filter]:bg-[#eff4f0]/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-1 px-4 sm:px-6">
        <Link href="/" className="mr-5 flex items-center gap-2.5">
          <img
            src="/icon-192.png"
            alt="Latinalyzer"
            className="h-8 w-8 rounded-lg shadow-sm"
          />
          <span className="font-serif text-lg font-bold tracking-tight text-[#1e3a28]">
            Latinalyzer
          </span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_ITEMS.map((item) => {
            const active =
              item.href === "/"
                ? location === "/" ||
                  location === "" ||
                  location.startsWith("/morphology")
                : location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-[#3b5941] text-white shadow-sm"
                    : "text-[#2d3b30] hover:bg-[#e1ebe3] hover:text-[#1a261d]"
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
