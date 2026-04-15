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
import type { StudentMemorySettings } from "@/types/student-memory";
import type { StudentSessionEntryPoint } from "@/types/study-context";

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
  setMemorySettings: (settings: StudentMemorySettings) => void;
  signOut: () => Promise<void>;
  startSession: (options: StartStudentSessionOptions) => Promise<void>;
  user: StudentUser;
}

interface StartStudentSessionOptions {
  course: StudentCourse;
  entryPoint?: StudentSessionEntryPoint;
  focusTopic?: string | null;
  sessionGoal?: string | null;
  title?: string | null;
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
  const [userState, setUserState] = useState<StudentUser>(user);
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
      await fetch("/auth/dev-local", {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      // Ignore local dev auth cleanup issues.
    }

    try {
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      // Local demo mode may not have browser auth keys configured.
    }

    router.push("/login");
  }

  async function handleStartSession({
    course,
    entryPoint = "manual",
    focusTopic = null,
    sessionGoal = "",
    title = null,
  }: StartStudentSessionOptions) {
    if (!course.activeExam) {
      throw new Error("This course does not have an active exam yet.");
    }

    const response = await fetch("/api/student/sessions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        courseId: course.id,
        entryPoint,
        examId: course.activeExam.id,
        focusTopic,
        sessionGoal: (sessionGoal ?? "").trim(),
        title,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      | {
          error?: string;
          session?: StudentSession;
        }
      | null;

    if (!response.ok || !payload?.session) {
      throw new Error(payload?.error ?? "Unable to start a course-backed session.");
    }

    const sessionId = startStudentTutorSession({
      artifacts: payload.session.initialArtifacts,
      sessionId: payload.session.externalSessionId,
      studyContext: payload.session.studyContext,
      title: payload.session.title,
    });
    router.push(`/sessions/${sessionId}`);
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

  function handleSetMemorySettings(settings: StudentMemorySettings) {
    setUserState((current) => ({
      ...current,
      memorySettings: settings,
    }));
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
        setMemorySettings: handleSetMemorySettings,
        signOut: handleSignOut,
        startSession: handleStartSession,
        user: userState,
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
