import Link from "next/link";
import { BarChart3, CalendarDays, Crown, Home, Shield, Trophy, Users } from "lucide-react";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/players", label: "Players", icon: Users },
  { href: "/matches", label: "Matches", icon: CalendarDays },
  { href: "/leagues", label: "Leagues", icon: Crown },
  { href: "/admin", label: "Admin", icon: Shield },
];

export function Sidebar() {
  return (
    <aside className="hidden min-h-screen w-72 shrink-0 border-r border-cyan-300/10 bg-slate-950/55 p-6 backdrop-blur lg:block">
      <Link href="/" className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-400 text-slate-950 shadow-lg shadow-cyan-500/20">
          <BarChart3 className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm text-cyan-200">Team Kazakhstan</p>
          <h1 className="font-semibold text-white">Chess Analytics</h1>
        </div>
      </Link>
      <nav className="mt-10 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:bg-cyan-400/10 hover:text-white">
              <Icon className="h-4 w-4 text-yellow-300" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function TopNav() {
  return (
    <header className="sticky top-0 z-20 border-b border-cyan-300/10 bg-slate-950/75 px-4 py-4 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between">
        <Link href="/" className="font-semibold text-white">Kazakhstan Chess</Link>
        <nav className="flex gap-3 text-xs text-slate-300">
          {navItems.slice(1, 5).map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
        </nav>
      </div>
    </header>
  );
}
