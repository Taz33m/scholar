"use client";

import {
  createContext,
  useEffect,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  openStudentHistorySession,
  startStudentTutorSession,
} from "@/lib/student-app/session-actions";
import type {
  StudentCourse,
  StudentSession,
  StudentUser,
} from "@/lib/student-app/types";

interface StudentAppProviderProps {
  children: ReactNode;
  courses: StudentCourse[];
  user: StudentUser;
}

interface StudentAppContextValue {
  courses: StudentCourse[];
  currentCourse: StudentCourse | null;
  currentCourseId: string | null;
  homeHref: string;
  openSession: (session: StudentSession) => void;
  setCurrentCourse: (courseId: string | null) => void;
  signOut: () => Promise<void>;
  startSession: (courseTitle?: string, focusTopic?: string) => void;
  user: StudentUser;
}

const StudentAppContext = createContext<StudentAppContextValue | null>(null);
const CURRENT_COURSE_STORAGE_KEY = "scholar.student.current-course";

export function StudentAppProvider({
  children,
  courses,
  user,
}: StudentAppProviderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [preferredCourseId, setPreferredCourseId] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      return window.localStorage.getItem(CURRENT_COURSE_STORAGE_KEY);
    } catch {
      return null;
    }
  });
  const routeCourseId = useMemo(() => {
    const matchedCourseId = pathname.match(/^\/student\/course\/([^/?#]+)/)?.[1] ?? null;
    return courses.some((course) => course.id === matchedCourseId) ? matchedCourseId : null;
  }, [courses, pathname]);
  const currentCourseId = useMemo(() => {
    if (routeCourseId) {
      return routeCourseId;
    }

    if (preferredCourseId && courses.some((course) => course.id === preferredCourseId)) {
      return preferredCourseId;
    }

    return courses[0]?.id ?? null;
  }, [courses, preferredCourseId, routeCourseId]);

  useEffect(() => {
    if (!routeCourseId || typeof window === "undefined") {
      return;
    }

    try {
      window.localStorage.setItem(CURRENT_COURSE_STORAGE_KEY, routeCourseId);
    } catch {
      // Ignore localStorage access issues in constrained environments.
    }
  }, [routeCourseId]);

  const currentCourse = useMemo(
    () =>
      courses.find((course) => course.id === currentCourseId) ??
      courses[0] ??
      null,
    [courses, currentCourseId],
  );
  const homeHref = currentCourse ? `/student/course/${currentCourse.id}` : "/student/courses";

  async function handleSignOut() {
    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Local demo mode may not have browser auth keys configured.
    }

    router.push("/login");
  }

  function handleStartSession(courseTitle?: string, focusTopic?: string) {
    const seedTitle = focusTopic
      ? `${courseTitle ? `${courseTitle}: ` : ""}${focusTopic}`
      : courseTitle;
    const nextUrl = seedTitle
      ? `/sessions/${startStudentTutorSession(seedTitle)}`
      : "/sessions/new";

    if (typeof window !== "undefined") {
      window.location.assign(nextUrl);
      return;
    }

    router.push(nextUrl);
  }

  function handleOpenSession(session: StudentSession) {
    const sessionId = openStudentHistorySession(session);
    router.push(`/sessions/${sessionId}`);
  }

  function handleSetCurrentCourse(nextCourseId: string | null) {
    setPreferredCourseId(nextCourseId);

    if (typeof window !== "undefined") {
      try {
        if (nextCourseId) {
          window.localStorage.setItem(CURRENT_COURSE_STORAGE_KEY, nextCourseId);
        } else {
          window.localStorage.removeItem(CURRENT_COURSE_STORAGE_KEY);
        }
      } catch {
        // Ignore localStorage access issues in constrained environments.
      }
    }
  }

  return (
    <StudentAppContext.Provider
      value={{
        courses,
        currentCourse,
        currentCourseId: currentCourse?.id ?? null,
        homeHref,
        openSession: handleOpenSession,
        setCurrentCourse: handleSetCurrentCourse,
        signOut: handleSignOut,
        startSession: handleStartSession,
        user,
      }}
    >
      {children}
    </StudentAppContext.Provider>
  );
}

export function useStudentApp() {
  const context = useContext(StudentAppContext);

  if (!context) {
    throw new Error("useStudentApp must be used within StudentAppProvider.");
  }

  return context;
}
