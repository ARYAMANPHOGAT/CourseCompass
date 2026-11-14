import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BookOpenCheck,
  Bookmark,
  ChartLine,
  Columns3,
  Menu,
  Route,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useAppData, useUiPrefs } from "../hooks/AppContext";
import { ErrorState } from "./ui/states";

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="32" cy="32" r="27" fill="none" stroke="rgb(var(--cc-violet))" strokeWidth="3" />
      <circle cx="32" cy="32" r="21" fill="none" stroke="rgb(var(--cc-line-strong))" strokeWidth="1" strokeDasharray="2 3" />
      <path d="M32 10 L38.5 32 L32 54 L25.5 32 Z" fill="rgb(var(--cc-cyan))" />
      <path d="M32 10 L38.5 32 H25.5 Z" fill="rgb(var(--cc-violet-bright))" />
      <circle cx="32" cy="32" r="3" fill="rgb(var(--cc-midnight))" />
    </svg>
  );
}

const NAV: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/for-you", label: "For You", icon: <Sparkles className="h-[18px] w-[18px]" /> },
  { to: "/discover", label: "Discover", icon: <Search className="h-[18px] w-[18px]" /> },
  { to: "/learning", label: "My Learning", icon: <BookOpenCheck className="h-[18px] w-[18px]" /> },
  { to: "/analytics", label: "Analytics", icon: <ChartLine className="h-[18px] w-[18px]" /> },
  { to: "/roadmap", label: "Roadmap", icon: <Route className="h-[18px] w-[18px]" /> },
  { to: "/compare", label: "Compare", icon: <Columns3 className="h-[18px] w-[18px]" /> },
  { to: "/wishlist", label: "Wishlist", icon: <Bookmark className="h-[18px] w-[18px]" /> },
  { to: "/profile", label: "Profile", icon: <UserRound className="h-[18px] w-[18px]" /> },
  { to: "/insights", label: "Insights & settings", icon: <SlidersHorizontal className="h-[18px] w-[18px]" /> },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { compareIds } = useUiPrefs();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            `group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold no-underline transition-colors duration-fast hover:no-underline ${
              isActive ? "bg-violet/15 text-ink shadow-[inset_2px_0_0_rgb(var(--cc-violet))]" : "text-muted hover:bg-slate hover:text-ink"
            }`
          }
        >
          <span className="text-current opacity-90">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          {item.to === "/compare" && compareIds.length > 0 && (
            <span className="num rounded-full bg-cyan/15 px-2 text-2xs font-bold text-cyan">{compareIds.length}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function ProfileChip() {
  const { profile, careerLabel } = useAppData();
  if (!profile) return null;
  return (
    <Link to="/profile" className="block rounded-md border border-line bg-abyss/60 p-3 no-underline hover:border-line-strong hover:no-underline">
      <p className="truncate text-sm font-semibold text-ink">{profile.display_name}</p>
      <p className="truncate text-xs text-muted">{profile.onboarded ? careerLabel(profile.career_goal) : "Preferences not set yet"}</p>
      <p className="mt-1 truncate text-2xs text-faint">Local demo profile ({profile.id}), no sign-in</p>
    </Link>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { error, reload } = useAppData();
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    document.getElementById("main")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-midnight">
      <a href="#main" className="sr-only z-[70] rounded-md bg-violet px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <aside className="fixed inset-y-0 left-0 hidden w-[var(--cc-rail)] flex-col border-r border-line bg-abyss/80 px-4 py-5 lg:flex">
        <Link to="/" className="mb-6 flex items-center gap-2.5 px-2 no-underline hover:no-underline">
          <BrandMark />
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">CourseCompass</span>
        </Link>
        <NavItems />
        <div className="mt-auto">
          <ProfileChip />
        </div>
      </aside>

      <header className="sticky top-0 z-40 flex items-center justify-between border-b border-line bg-midnight/85 px-4 py-3 backdrop-blur lg:hidden">
        <Link to="/" className="flex items-center gap-2 no-underline hover:no-underline">
          <BrandMark size={28} />
          <span className="font-display text-sm font-semibold text-ink">CourseCompass</span>
        </Link>
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-line p-2 text-ink"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>
      {open && (
        <div className="fixed inset-0 z-30 bg-midnight/95 px-4 pb-6 pt-20 lg:hidden">
          <NavItems onNavigate={() => setOpen(false)} />
          <div className="mt-6">
            <ProfileChip />
          </div>
        </div>
      )}

      <main id="main" tabIndex={-1} className="outline-none lg:pl-[var(--cc-rail)]">
        <div className="mx-auto w-full max-w-[1240px] px-[var(--cc-gutter)] py-8 lg:py-10">
          {error && (
            <div className="mb-6">
              <ErrorState message={`${error} Start the backend with run.bat (or see Insights & settings > Troubleshooting).`} onRetry={() => void reload()} />
            </div>
          )}
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-prose">
        <h1 className="page-title text-balance">{title}</h1>
        {description && <p className="mt-2 text-pretty text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
