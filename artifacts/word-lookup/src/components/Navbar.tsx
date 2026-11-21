import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Cloud, LogIn, LogOut, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase, pullLibraryFromCloud, syncLibraryToCloud } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NAV_ITEMS = [
  { href: "/", label: "Morphological Analysis" },
  { href: "/continuous-reading", label: "Continuous Reading" },
  { href: "/word-lookup", label: "Word Lookup" },
] as const;

export default function Navbar() {
  const [location] = useLocation();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!supabase) return;

    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setAuthError(null);
    setLoading(true);

    try {
      const { error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setAuthError(error.message);
        setLoading(false);
        return;
      }

      setAuthOpen(false);
      setEmail("");
      setPassword("");

      // משיכת הפרויקטים מהענן מיד לאחר התחברות ורענון הדף כדי שיופיעו
      await pullLibraryFromCloud();
      window.location.reload();
    } catch (err: any) {
      setAuthError(err?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    await syncLibraryToCloud();
    await pullLibraryFromCloud();
    setSyncing(false);
    window.location.reload();
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUserEmail(null);
  };

  return (
    <nav className="shrink-0 border-b border-[#d8e3da] bg-[#eff4f0]/95 backdrop-blur supports-[backdrop-filter]:bg-[#eff4f0]/85">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-1 overflow-x-auto">
          <Link href="/" className="mr-4 flex shrink-0 items-center gap-2.5">
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
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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

        {/* אזור התחברות וסנכרון ענן */}
        {supabase && (
          <div className="flex shrink-0 items-center gap-2">
            {userEmail ? (
              <>
                <span
                  className="hidden items-center gap-1.5 text-xs font-medium text-[#2d3b30] md:inline-flex"
                  title={`מחובר כ-${userEmail}`}
                >
                  <Cloud className="size-3.5 text-[#3b5941]" />
                  {userEmail.split("@")[0]}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-[#2d3b30] hover:bg-[#e1ebe3]"
                  onClick={handleManualSync}
                  disabled={syncing}
                  title="Sync with cloud now"
                >
                  <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 border-[#c5d6c8] bg-white/70 text-xs text-[#2d3b30] hover:bg-[#e1ebe3]"
                  onClick={handleSignOut}
                >
                  <LogOut className="size-3.5" />
                  <span className="hidden sm:inline">Sign Out</span>
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-[#c5d6c8] bg-white/80 text-xs font-medium text-[#1e3a28] hover:bg-[#e1ebe3]"
                onClick={() => {
                  setAuthError(null);
                  setAuthOpen(true);
                }}
              >
                <LogIn className="size-3.5" />
                Sign In
              </Button>
            )}
          </div>
        )}
      </div>

      {/* חלון התחברות / הרשמה */}
      <Dialog open={authOpen} onOpenChange={setAuthOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{isSignUp ? "Create Account" : "Sign In to Latinalyzer"}</DialogTitle>
            <DialogDescription>
              {isSignUp
                ? "Create an account to sync your projects across devices."
                : "Sign in to load and sync your saved projects."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAuthSubmit} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label htmlFor="auth-email">Email</Label>
              <Input
                id="auth-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
            </div>

            {authError && (
              <p className="text-xs font-medium text-destructive">{authError}</p>
            )}

            <Button type="submit" className="w-full bg-[#3b5941] hover:bg-[#2f4734]" disabled={loading}>
              {loading ? "Please wait..." : isSignUp ? "Sign Up" : "Sign In"}
            </Button>

            <div className="text-center text-xs text-muted-foreground">
              {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                className="font-semibold text-[#3b5941] hover:underline"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setAuthError(null);
                }}
              >
                {isSignUp ? "Sign In" : "Sign Up"}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
