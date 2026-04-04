"use client";

import { useState, useEffect } from "react";
import { AppShell } from "@/components/ui/app-shell";
import { NavRail, NavRailItem } from "@/components/ui/nav-rail";
import { PrimaryAction } from "@/components/ui/primary-action";
import { EmptyState } from "@/components/ui/empty-state";
const BookOpenIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
);
const CalendarIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
);
const ClockIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
);
const PlusIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
);
const ChevronRightIcon = ({ className }: { className?: string }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><polyline points="9 18 15 12 9 6"/></svg>
);
import { cn } from "@/lib/utils";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Course {
  id: string;
  title: string;
  colorToken: string | null;
  lastActivityAt: string | null;
  sessionCount: number;
}

interface Session {
  externalSessionId: string;
  title: string;
  summary: string;
  status: "active" | "ended";
  courseId: string | null;
  courseTitle: string | null;
  artifactCount: number;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
}

interface StudentHomeClientProps {
  initialCourses: Course[];
  user: {
    id: string;
    email: string;
    display_name: string | null;
  };
}

export function StudentHomeClient({ initialCourses, user }: StudentHomeClientProps) {
  const router = useRouter();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [calendarDays, setCalendarDays] = useState<{ day: string; sessionCount: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const handleSignOut = async () => {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  // Nav Rail setup
  const navItems: NavRailItem[] = [
    {
      id: "home",
      label: "Home",
      icon: <BookOpenIcon className="h-5 w-5" />,
      onClick: () => setSelectedCourseId(null),
      active: selectedCourseId === null,
    },
    {
      id: "calendar",
      label: "Calendar",
      icon: <CalendarIcon className="h-5 w-5" />,
      onClick: () => {}, // Future: full calendar view
    },
    {
      id: "sign-out",
      label: "Sign Out",
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
      onClick: handleSignOut,
    },
  ];

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        const sessionUrl = new URL("/api/student/sessions", window.location.origin);
        const calendarUrl = new URL("/api/student/calendar", window.location.origin);
        
        const now = new Date();
        const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

        calendarUrl.searchParams.set("month", monthStr);
        calendarUrl.searchParams.set("tz", tz);

        if (selectedCourseId) {
          sessionUrl.searchParams.set("courseId", selectedCourseId);
          calendarUrl.searchParams.set("courseId", selectedCourseId);
        }

        const [sessionRes, calendarRes] = await Promise.all([
          fetch(sessionUrl.toString()),
          fetch(calendarUrl.toString())
        ]);

        const sessionData = await sessionRes.json();
        const calendarData = await calendarRes.json();

        setSessions(sessionData.sessions || []);
        setCalendarDays(calendarData.days || []);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [selectedCourseId]);

  return (
    <AppShell
      nav={<NavRail items={navItems} />}
      side={
        <div className="flex h-full flex-col p-6">
          <div className="mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Student</p>
            <p className="mt-1 font-display text-lg text-slate-950 truncate">
              {user.display_name || user.email}
            </p>
          </div>

          <div className="flex-1 space-y-6">
            <section>
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                Enrolled Courses
              </h3>
              <div className="space-y-1">
                {initialCourses.map((course) => (
                  <button
                    key={course.id}
                    onClick={() => setSelectedCourseId(course.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all",
                      selectedCourseId === course.id
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                    )}
                  >
                    <div 
                      className={cn(
                        "h-2 w-2 rounded-full",
                        selectedCourseId === course.id ? "bg-white" : "bg-slate-300 group-hover:bg-slate-400"
                      )} 
                    />
                    <span className="flex-1 truncate text-sm font-medium">{course.title}</span>
                    <span className={cn(
                      "text-[10px] tabular-nums",
                      selectedCourseId === course.id ? "text-slate-400" : "text-slate-400"
                    )}>
                      {course.sessionCount}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <div className="mt-auto pt-6">
            <PrimaryAction className="w-full justify-center gap-2 py-6 rounded-2xl shadow-xl shadow-slate-200">
              <PlusIcon className="h-4 w-4" />
              <span>New Tutor Session</span>
            </PrimaryAction>
          </div>
        </div>
      }
      main={
        <div className="h-full overflow-y-auto px-10 py-12">
          <div className="mx-auto max-w-4xl space-y-12">
            <header className="space-y-2">
              <h1 className="font-display text-4xl text-slate-950">
                {selectedCourseId 
                  ? initialCourses.find(c => c.id === selectedCourseId)?.title 
                  : "Learning Journal"}
              </h1>
              <p className="text-slate-500">
                {selectedCourseId 
                  ? "View your past study sessions and artifacts for this course." 
                  : "Your chronological history of academic study and growth."}
              </p>
            </header>

            {/* Simple Stats / Calendar Placeholder */}
            <section className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-slate-500">
                  <ClockIcon className="h-4 w-4" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Study Time</span>
                </div>
                <p className="mt-2 text-3xl font-display text-slate-950">12.4h</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:col-span-2">
                <div className="flex items-center gap-2 text-slate-500">
                  <CalendarIcon className="h-4 w-4" />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Active Days</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {/* Visualizing simple activity dots for the month */}
                  {[...Array(30)].map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const dayData = calendarDays.find(d => d.day === dateStr);
                    const isActive = !!dayData;
                    
                    return (
                      <div 
                        key={i} 
                        title={isActive ? `${dayData.sessionCount} sessions on ${dateStr}` : `No activity on ${dateStr}`}
                        className={cn(
                          "h-3 w-3 rounded-[3px] transition-colors",
                          isActive ? "bg-slate-900" : "bg-slate-100"
                        )} 
                      />
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Recent Sessions</h2>
              </div>

              {loading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-32 animate-pulse rounded-[2rem] bg-slate-100" />
                  ))}
                </div>
              ) : sessions.length > 0 ? (
                <div className="space-y-4">
                  {sessions.map((session) => (
                    <div 
                      key={session.externalSessionId}
                      className="group relative flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-8 transition-all hover:border-slate-300 hover:shadow-lg hover:shadow-slate-100"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            {session.status === "active" && (
                              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            )}
                            <h3 className="font-display text-xl text-slate-900 group-hover:text-slate-950">{session.title}</h3>
                          </div>
                          {!selectedCourseId && session.courseTitle && (
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">{session.courseTitle}</p>
                          )}
                        </div>
                        <div className="flex gap-4 text-right">
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Artifacts</p>
                            <p className="text-sm font-medium text-slate-900">{session.artifactCount}</p>
                          </div>
                        </div>
                      </div>
                      
                      <p className="text-sm leading-relaxed text-slate-600 line-clamp-2">
                        {session.summary || "No summary available for this session."}
                      </p>

                      <div className="mt-2 flex items-center justify-between border-t border-slate-50 pt-6">
                        <span className="text-[11px] font-medium tabular-nums text-slate-400">
                          {new Date(session.startedAt).toLocaleDateString(undefined, { 
                            month: 'short', 
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit'
                          })}
                        </span>
                        <Link 
                          href={`/sessions/${session.externalSessionId}`}
                          className="flex items-center gap-1 text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors"
                        >
                          Review
                          <ChevronRightIcon className="h-4 w-4" />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-12">
                  <EmptyState 
                    title="No sessions found"
                    description={selectedCourseId 
                      ? "You haven't studied for this course yet." 
                      : "Start your first learning session to build your journal."}
                  />
                </div>
              )}
            </section>
          </div>
        </div>
      }
    />
  );
}
