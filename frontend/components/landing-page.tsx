'use client';

import Image from "next/image";
import { FormEvent, useCallback, useEffect, useState } from "react";
import Canvas, { canvasEditorRef } from "@/components/canvas";
import { FlashcardPanel } from "@/components/flashcard-panel";
import { PanelCard } from "@/components/ui/panel-card";
import { SectionHeader } from "@/components/ui/section-header";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  seedCanvasFixture,
  type SmokeCanvasFixture,
} from "@/lib/smoke-bridge";
import type { Flashcard } from "@/types/flashcard";
import type { VisualizationState } from "@/types/visualization";

const trustSignals = [
  "Live tutor + canvas",
  "Flashcards and quizzes",
  "Study materials from one session",
];

const lessonScenes = [
  {
    id: "question",
    label: "Question",
    title: "A student starts with a hard question.",
    durationMs: 3400,
    subtitles: [{ speaker: "Student", text: "I understand arrays. I still don’t get linked lists." }],
  },
  {
    id: "voice",
    label: "Tutor",
    title: "The tutor reframes it into a visual lesson.",
    durationMs: 3400,
    subtitles: [{ speaker: "Tutor", text: "Let’s build it visually instead of just defining it." }],
  },
  {
    id: "draw",
    label: "Canvas",
    title: "The board becomes the explanation.",
    durationMs: 4200,
    subtitles: [{ speaker: "Tutor", text: "Each node holds data and a reference to the next node." }],
  },
  {
    id: "highlight",
    label: "Clarify",
    title: "The important part gets called out.",
    durationMs: 3800,
    subtitles: [
      { speaker: "Student", text: "So the structure lives in the connections?" },
      { speaker: "Tutor", text: "Exactly." },
    ],
  },
  {
    id: "diagram",
    label: "Diagram",
    title: "The student asks for a cleaner visualization.",
    durationMs: 3600,
    subtitles: [{ speaker: "Student", text: "Can you turn that into a visualization I can study?" }],
  },
  {
    id: "diagram-settle",
    label: "Refine",
    title: "The visual settles into a study artifact.",
    durationMs: 3400,
    subtitles: [
      {
        speaker: "Tutor",
        text: "See the arrow labeled next pointer? That connection is what links one node to the next.",
      },
    ],
  },
  {
    id: "quiz",
    label: "Check",
    title: "The tutor offers a quick quiz while the idea is still fresh.",
    durationMs: 4400,
    subtitles: [
      { speaker: "Tutor", text: "Ready for a quiz?" },
      { speaker: "Student", text: "Yes." },
    ],
  },
  {
    id: "cards",
    label: "Review",
    title: "The tutor leaves the student with follow-through.",
    durationMs: 3800,
    subtitles: [
      { speaker: "Tutor", text: "Good. Now let’s make it stick." },
      { speaker: "Tutor", text: "I’m turning the key idea into cards you can review later." },
    ],
  },
  {
    id: "resolve",
    label: "Result",
    title: "Understanding, then retention.",
    durationMs: 4200,
    subtitles: [
      { speaker: "Student", text: "This is the first time it actually makes sense." },
      { speaker: "Tutor", text: "That’s the point." },
    ],
  },
] as const;

const lessonFlowSteps = [
  { label: "Question", sceneRange: [0, 1] as const },
  { label: "Board", sceneRange: [2, 3] as const },
  { label: "Diagram", sceneRange: [4, 5] as const },
  { label: "Practice", sceneRange: [6, 6] as const },
  { label: "Review", sceneRange: [7, 8] as const },
] as const;

const demoVisualizationState: VisualizationState = {
  imageData: "/linkedlist.jpg",
  description: "Linked-list diagram with labeled nodes and pointer flow.",
  generatedAt: null,
  mode: "ready",
};

const demoFlashcards: Flashcard[] = [
  {
    id: "demo-linked-list-1",
    title: "Linked list node",
    coreIdea: "A linked list is built from nodes connected by references.",
    question: "What does a node in a linked list store?",
    answer: "Data and a reference to the next node in the sequence.",
  },
  {
    id: "demo-linked-list-2",
    title: "The link",
    coreIdea: "The structure of a linked list lives in the connection between nodes.",
    question: "What does the next pointer do in a linked list?",
    answer: "It stores the reference that connects one node to the next node.",
  },
  {
    id: "demo-linked-list-3",
    title: "Fast insertion",
    coreIdea: "Linked lists are strong when you already know where to insert.",
    question: "Which operation is especially efficient in a linked list?",
    answer: "Insertion after a known node.",
  },
  {
    id: "demo-linked-list-4",
    title: "Traversal",
    coreIdea: "You move through a linked list by following references in sequence.",
    question: "Why is random access slower in a linked list than in an array?",
    answer: "Because you have to follow pointers node by node instead of jumping directly by index.",
  },
];

const demoDashboardSessions = [
  {
    title: "Linked Lists",
    summary: "Nodes, pointers, and insertion after a known node.",
    status: "ended" as const,
    artifacts: 3,
    events: 18,
    updatedLabel: "Just now",
    highlighted: true,
  },
  {
    title: "Stacks & Queues",
    summary: "Push, pop, enqueue, and dequeue tradeoffs.",
    status: "ended" as const,
    artifacts: 2,
    events: 11,
    updatedLabel: "2 hours ago",
    highlighted: false,
  },
  {
    title: "Trees & Traversal",
    summary: "DFS, BFS, and recursive traversal patterns.",
    status: "ended" as const,
    artifacts: 4,
    events: 15,
    updatedLabel: "Yesterday",
    highlighted: false,
  },
  {
    title: "Hash Maps",
    summary: "Collisions, lookups, and practical tradeoffs.",
    status: "ended" as const,
    artifacts: 2,
    events: 9,
    updatedLabel: "2 days ago",
    highlighted: false,
  },
] as const;

const demoDashboardArtifacts = [
  { title: "Linked List Study Set", sessionTitle: "Linked Lists", updatedLabel: "Just now" },
  { title: "Linked List Quiz", sessionTitle: "Linked Lists", updatedLabel: "Just now" },
  { title: "Tree Traversal Cheat Sheet", sessionTitle: "Trees & Traversal", updatedLabel: "Yesterday" },
  { title: "Queue Operations Summary", sessionTitle: "Stacks & Queues", updatedLabel: "2 hours ago" },
] as const;

type DemoFilmPhase = "lesson" | "dashboard" | "replay";

const getDemoArtifactState = (
  activeSceneIndex: number,
  sceneProgress: number,
) => {
  const showVisualizationTab =
    activeSceneIndex > 4 || (activeSceneIndex === 4 && sceneProgress >= 0.45);
  const showQuizTab =
    activeSceneIndex > 6 || (activeSceneIndex === 6 && sceneProgress >= 0.16);
  const showFlashcardsTab =
    activeSceneIndex > 7 || (activeSceneIndex === 7 && sceneProgress >= 0.28);

  let activeArtifactTab: "canvas" | "visualization" | "quiz" | "flashcards" = "canvas";

  if (activeSceneIndex >= 8) {
    activeArtifactTab = "flashcards";
  } else if (activeSceneIndex === 7) {
    activeArtifactTab = sceneProgress >= 0.28 ? "flashcards" : "quiz";
  } else if (activeSceneIndex === 6) {
    activeArtifactTab = sceneProgress >= 0.16 ? "quiz" : "visualization";
  } else if (activeSceneIndex >= 5) {
    activeArtifactTab = "visualization";
  } else if (activeSceneIndex === 4) {
    activeArtifactTab = sceneProgress >= 0.45 ? "visualization" : "canvas";
  }

  return {
    activeArtifactTab,
    showVisualizationTab,
    showQuizTab,
    showFlashcardsTab,
  };
};

const getActiveFlowStepIndex = (activeSceneIndex: number) =>
  lessonFlowSteps.findIndex(
    (step) =>
      activeSceneIndex >= step.sceneRange[0] &&
      activeSceneIndex <= step.sceneRange[1],
  );

const getFlowStepProgress = (
  stepIndex: number,
  activeSceneIndex: number,
  sceneProgress: number,
) => {
  const activeFlowStepIndex = getActiveFlowStepIndex(activeSceneIndex);

  if (stepIndex < activeFlowStepIndex) {
    return 1;
  }

  if (stepIndex > activeFlowStepIndex) {
    return 0;
  }

  const step = lessonFlowSteps[stepIndex];
  const totalStepDuration: number = lessonScenes
    .slice(step.sceneRange[0], step.sceneRange[1] + 1)
    .reduce((total, scene) => total + scene.durationMs, 0);

  const elapsedStepDuration: number = lessonScenes
    .slice(step.sceneRange[0], activeSceneIndex)
    .reduce((total, scene) => total + scene.durationMs, 0);

  const currentSceneDuration: number = lessonScenes[activeSceneIndex]?.durationMs ?? 0;

  if (totalStepDuration === 0 || currentSceneDuration === 0) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, (elapsedStepDuration + currentSceneDuration * sceneProgress) / totalStepDuration),
  );
};

const getLessonCanvasFixture = (activeSceneIndex: number): SmokeCanvasFixture => {
  if (activeSceneIndex < 2) {
    return { shapes: [] };
  }

  const baseShapes: SmokeCanvasFixture["shapes"] = [
    {
      type: "geo",
      shape: "rectangle",
      text: "Node A",
      x: 280,
      y: 220,
      w: 180,
      h: 92,
      color: "blue",
    },
    {
      type: "geo",
      shape: "rectangle",
      text: "Node B",
      x: 600,
      y: 220,
      w: 180,
      h: 92,
      color: "blue",
    },
    {
      type: "text",
      text: "→",
      x: 508,
      y: 232,
      w: 64,
      color: "black",
    },
    {
      type: "text",
      text: "next pointer",
      x: 470,
      y: 320,
      w: 160,
      color: "black",
    },
  ];

  if (activeSceneIndex < 3) {
    return { shapes: baseShapes };
  }

  return {
    shapes: [
      ...baseShapes,
      {
        type: "geo",
        shape: "ellipse",
        text: "",
        x: 452,
        y: 204,
        w: 170,
        h: 86,
        color: "blue",
      },
      {
        type: "text",
        text: "this is the link",
        x: 420,
        y: 152,
        w: 180,
        color: "black",
      },
    ],
  };
};

type WaitlistStatus = "idle" | "submitting" | "success" | "error";

function WaitlistForm({
  waitlistRedirected,
  dark = false,
}: {
  waitlistRedirected: boolean;
  dark?: boolean;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<WaitlistStatus>("idle");
  const [message, setMessage] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (status === "submitting") {
      return;
    }

    setStatus("submitting");
    setMessage("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const payload = (await response.json()) as {
        alreadyJoined?: boolean;
        error?: string;
      };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "Something went wrong. Please try again.");
        return;
      }

      setStatus("success");
      setEmail("");
      setMessage(
        payload.alreadyJoined
          ? "You’re already on the list."
          : "You’re on the list. We’ll reach out when Apple Scholar opens access.",
      );
    } catch {
      setStatus("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  const inputClass = dark
    ? "h-13 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 text-base text-white placeholder:text-white/45 outline-none transition focus:border-white/35"
    : "h-13 flex-1 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-slate-400";

  const buttonClass = dark
    ? "inline-flex h-13 items-center justify-center rounded-2xl bg-white px-5 text-sm font-medium text-slate-950 transition hover:bg-white/90 disabled:cursor-wait disabled:bg-white/75"
    : "inline-flex h-13 items-center justify-center rounded-2xl bg-slate-950 px-5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-wait disabled:bg-slate-700";

  return (
    <div className="mt-6">
      {waitlistRedirected ? (
        <div
          className={`mb-4 rounded-2xl px-4 py-3 text-sm leading-6 ${
            dark
              ? "border border-amber-300/30 bg-amber-300/10 text-amber-100"
              : "border border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          That part of the product isn&apos;t open from the landing page. Request access here and
          we&apos;ll reach out when spots open.
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label htmlFor={`waitlist-email-${dark ? "dark" : "light"}`} className="sr-only">
          Email address
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id={`waitlist-email-${dark ? "dark" : "light"}`}
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Enter your email"
            className={inputClass}
          />
          <button type="submit" disabled={status === "submitting"} className={buttonClass}>
            {status === "submitting" ? "Sending..." : "Request access"}
          </button>
        </div>
      </form>

      {message ? (
        <p className={`mt-3 text-sm ${status === "error" ? "text-red-400" : dark ? "text-white/75" : "text-slate-600"}`}>
          {message}
        </p>
      ) : (
        <p className={`mt-3 text-sm ${dark ? "text-white/55" : "text-slate-500"}`}>
          We&apos;ll only email when access opens.
        </p>
      )}
    </div>
  );
}

function AccessModal({
  open,
  onClose,
  waitlistRedirected,
}: {
  open: boolean;
  onClose: () => void;
  waitlistRedirected: boolean;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-modal-title"
        className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-950/20 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          aria-label="Close request access modal"
          onClick={onClose}
          className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="mb-6 flex items-start gap-4">
          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
            <Image
              src="/logo.png"
              alt="Apple Scholar mascot"
              fill
              sizes="56px"
              className="object-cover"
            />
          </div>
          <div className="pr-10">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              Request access
            </p>
            <h3 id="access-modal-title" className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
              Join the first Apple Scholar release
            </h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Leave your email and we&apos;ll reach out when access opens.
            </p>
          </div>
        </div>

        <WaitlistForm waitlistRedirected={waitlistRedirected} />
      </div>
    </div>
  );
}

function DemoVisualizationPanel({
  visualization,
}: {
  visualization: VisualizationState;
}) {
  const [actionState, setActionState] = useState<"idle" | "ready">("idle");

  useEffect(() => {
    if (actionState !== "ready") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setActionState("idle");
    }, 1800);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionState]);

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-brand-gray-medium/20 bg-white shadow-md">
        <div className="relative h-[360px] w-full">
          <Image
            src={visualization.imageData ?? "/linkedlist.jpg"}
            alt={visualization.description || "Linked list diagram"}
            fill
            unoptimized
            sizes="(max-width: 1024px) 100vw, 720px"
            className="object-contain"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setActionState("ready")}
        className={`w-full rounded-lg px-4 py-3 text-sm font-semibold shadow-md transition-all duration-200 ${
          actionState === "ready"
            ? "bg-emerald-500 text-white"
            : "bg-brand-gray-dark text-white hover:bg-brand-gray-medium hover:shadow-lg"
        }`}
      >
        {actionState === "ready" ? "✓ Ready in the lesson" : "Use this diagram"}
      </button>

      <div className="rounded-lg border border-brand-gray-medium/20 bg-white p-4 text-xs text-brand-gray-medium shadow-sm">
        <p className="mb-2 font-semibold text-brand-gray-dark">Description:</p>
        <p className="leading-relaxed">
          {visualization.description ??
            "Linked-list diagram with labeled nodes and pointer flow."}
        </p>
      </div>
    </section>
  );
}

function DemoDashboardPreview({
  replayVisible,
  onReplay,
}: {
  replayVisible: boolean;
  onReplay: () => void;
}) {
  return (
    <div className="relative h-full bg-white">
      <div
        className={`h-full transition-all duration-700 ease-out ${
          replayVisible ? "scale-[1.01] blur-[6px] opacity-60 saturate-75" : "scale-100 blur-0 opacity-100"
        }`}
      >
        <div className="h-full overflow-hidden bg-white p-6">
          <div className="mx-auto flex h-full max-w-7xl flex-col gap-6">
            <header className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-slate-200">
                  <Image
                    src="/logo.png"
                    alt="Apple Scholar"
                    fill
                    sizes="36px"
                    className="object-cover"
                  />
                </div>
                <div>
                  <h3 className="text-2xl font-semibold text-slate-900">Tutor Sessions</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Review your recent data structures lessons.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="inline-flex items-center rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white"
              >
                New Session
              </button>
            </header>

            <section className="overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(88px,0.45fr)_92px_92px_96px] gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Session</span>
                <span className="text-center">Status</span>
                <span className="text-center">Artifacts</span>
                <span className="text-center">Events</span>
                <span className="text-center">Actions</span>
              </div>

              <div className="divide-y divide-slate-200 bg-white">
                {demoDashboardSessions.map((session) => (
                  <div
                    key={session.title}
                    className={`grid grid-cols-[minmax(0,1.35fr)_minmax(88px,0.45fr)_92px_92px_96px] gap-2 px-4 py-3 text-sm ${
                      session.highlighted ? "bg-sky-50/60" : ""
                    }`}
                  >
                    <div className="min-w-0 text-left">
                      <p className="truncate font-medium text-slate-900">{session.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{session.summary}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{session.updatedLabel}</p>
                    </div>

                    <div className="flex items-center justify-center">
                      <StatusBadge status={session.status} />
                    </div>

                    <div className="flex items-center justify-center text-slate-700">
                      {session.artifacts}
                    </div>
                    <div className="flex items-center justify-center text-slate-700">
                      {session.events}
                    </div>

                    <div className="flex items-center justify-center gap-1.5">
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-700">
                        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
                          <path
                            d="M7 4l6 6-6 6"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 text-red-500">
                        <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden>
                          <path
                            d="M4 6h12M8 6V4h4v2m-5 0v10h6V6"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-200 px-4 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                  Recent Artifacts
                </p>
              </div>
              <div className="divide-y divide-slate-100">
                {demoDashboardArtifacts.map((artifact) => (
                  <div key={`${artifact.sessionTitle}-${artifact.title}`} className="px-4 py-3">
                    <p className="truncate text-sm font-medium text-slate-900">{artifact.title}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{artifact.sessionTitle}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{artifact.updatedLabel}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>

      {replayVisible ? (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/18">
          <button
            type="button"
            onClick={onReplay}
            className="group inline-flex flex-col items-center gap-4 rounded-[2rem] px-8 py-6"
          >
            <span className="inline-flex h-18 w-18 items-center justify-center rounded-full bg-white/95 shadow-2xl ring-1 ring-slate-200 transition group-hover:scale-105">
              <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8 text-slate-900" aria-hidden>
                <path
                  d="M4 12a8 8 0 1 0 2.34-5.66L4 9"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M4 4v5h5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white drop-shadow-sm">
              Replay lesson
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

function LessonDemoFilm() {
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [filmPhase, setFilmPhase] = useState<DemoFilmPhase>("lesson");
  const activeScene = lessonScenes[activeSceneIndex];
  const transcriptTurns = lessonScenes
    .slice(0, activeSceneIndex + 1)
    .flatMap((scene) =>
      scene.subtitles.map((subtitle) => ({
        key: `${scene.id}-${subtitle.speaker}-${subtitle.text}`,
        speaker: subtitle.speaker,
        text: subtitle.text,
      })),
    )
    .slice(-5);
  const activeFlowStepIndex = getActiveFlowStepIndex(activeSceneIndex);

  useEffect(() => {
    if (filmPhase !== "lesson") {
      return;
    }

    const isLastScene = activeSceneIndex === lessonScenes.length - 1;
    const timeoutId = window.setTimeout(() => {
      if (isLastScene) {
        setFilmPhase("dashboard");
        return;
      }

      setActiveSceneIndex((current) => current + 1);
    }, activeScene.durationMs + (isLastScene ? 900 : 0));

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [activeScene.durationMs, activeSceneIndex, filmPhase]);

  useEffect(() => {
    if (filmPhase !== "lesson") {
      return;
    }

    let animationFrameId = 0;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const nextProgress = Math.min(1, (now - startedAt) / activeScene.durationMs);
      setSceneProgress(nextProgress);

      if (nextProgress < 1) {
        animationFrameId = window.requestAnimationFrame(tick);
      }
    };

    setSceneProgress(0);
    animationFrameId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [activeScene.durationMs, activeSceneIndex, filmPhase]);

  useEffect(() => {
    if (filmPhase !== "lesson") {
      return;
    }

    let cancelled = false;

    const applyFixture = () => {
      if (cancelled) {
        return;
      }

      const editor = canvasEditorRef.current;
      if (!editor) {
        window.setTimeout(applyFixture, 150);
        return;
      }

      seedCanvasFixture(editor, getLessonCanvasFixture(activeSceneIndex));
    };

    applyFixture();

    return () => {
      cancelled = true;
    };
  }, [activeSceneIndex, filmPhase]);

  useEffect(() => {
    if (filmPhase !== "dashboard") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setFilmPhase("replay");
    }, 3000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [filmPhase]);

  const replayLesson = useCallback(() => {
    setActiveSceneIndex(0);
    setSceneProgress(0);
    setFilmPhase("lesson");
  }, []);

  const showVoiceState = activeSceneIndex >= 1;
  const {
    activeArtifactTab,
    showVisualizationTab,
    showQuizTab,
    showFlashcardsTab,
  } = getDemoArtifactState(activeSceneIndex, sceneProgress);
  const showQuizSubmitted =
    activeSceneIndex >= 7 || (activeSceneIndex === 6 && sceneProgress >= 0.88);
  const demoFlashcardIndex =
    activeSceneIndex >= 8
      ? Math.min(
          demoFlashcards.length - 1,
          Math.floor(sceneProgress * demoFlashcards.length),
        )
      : 0;
  const showFlashcardAnswer =
    activeSceneIndex === 8 &&
    demoFlashcardIndex === demoFlashcards.length - 1 &&
    sceneProgress >= 0.82;

  return (
    <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.08)]">
      <div className="relative min-h-[52rem]">
        <div
          className={`transition-all duration-700 ease-out ${
            filmPhase === "lesson"
              ? "opacity-100 translate-y-0"
              : "pointer-events-none absolute inset-0 -translate-y-4 opacity-0"
          }`}
        >
          <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
              <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />
            </div>
            <span className="text-xs font-medium text-slate-500">Linked list lesson</span>
          </div>

          <div className="hidden items-center gap-2 sm:flex">
            {lessonScenes.map((scene, index) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => setActiveSceneIndex(index)}
                className={`h-2 rounded-full transition-all ${
                  index === activeSceneIndex ? "w-8 bg-slate-900" : "w-2 bg-slate-200 hover:bg-slate-300"
                }`}
                aria-label={`Show ${scene.label} scene`}
              />
            ))}
          </div>
        </div>

      </div>

      <div className="flex min-h-[44rem] flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white lg:w-[320px] lg:border-b-0 lg:border-r">
          <div className="space-y-3 p-4">
            <PanelCard>
              <SectionHeader title="Session" right={<StatusBadge status="active" />} />
              <p className="text-sm font-semibold text-slate-900">Linked Lists</p>
            </PanelCard>

            <PanelCard>
              <SectionHeader title="Voice Agent" subtitle={showVoiceState ? "Tutor responding live" : "Waiting for the lesson"} />
              <div className="flex items-center gap-2">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full transition ${showVoiceState ? "bg-emerald-500 shadow-[0_0_14px_rgba(34,197,94,0.45)]" : "bg-slate-300"}`} />
                <span className="text-xs text-slate-500">
                  {showVoiceState ? "Live conversation in progress" : "Session ready"}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {transcriptTurns.map((subtitle, index) => {
                  const isLatest = index === transcriptTurns.length - 1;
                  return (
                  <div
                    key={subtitle.key}
                    className={`rounded-xl px-3 py-2.5 text-sm leading-6 transition ${
                      subtitle.speaker === "Student"
                        ? "border border-slate-200 bg-slate-50 text-slate-700"
                        : "bg-slate-950 text-white"
                    } ${isLatest ? "opacity-100 shadow-sm" : "opacity-65"}`}
                  >
                    <span className={`mr-2 font-semibold ${subtitle.speaker === "Student" ? "text-slate-900" : "text-sky-300"}`}>
                      {subtitle.speaker}:
                    </span>
                    {subtitle.text}
                  </div>
                  );
                })}
              </div>
            </PanelCard>

          </div>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
          <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-2 py-1.5">
            {[
              { id: "canvas", label: "Canvas", visible: true, kind: "canvas" as const },
              { id: "visualization", label: "Visualization", visible: showVisualizationTab, kind: "artifact" as const },
              { id: "quiz", label: "Quiz", visible: showQuizTab, kind: "artifact" as const },
              { id: "flashcards", label: "Flashcards", visible: showFlashcardsTab, kind: "artifact" as const },
            ]
              .filter((tab) => tab.visible)
              .map((tab) => (
                <div
                key={tab.id}
                  className={`inline-flex items-center gap-2 rounded-t-lg border px-3 py-1.5 text-xs font-medium transition-all duration-500 ease-out ${
                    activeArtifactTab === tab.id
                      ? "border-slate-300 border-b-white bg-white text-slate-900 shadow-sm"
                      : "border-transparent bg-slate-200 text-slate-600"
                  }`}
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full ${
                      tab.kind === "canvas" ? "bg-indigo-500" : "bg-emerald-500"
                    }`}
                  />
                  {tab.label}
                </div>
              ))}
          </div>

          <div className="relative min-h-[28rem] flex-1 overflow-hidden bg-white">
            <div
              className={`absolute inset-0 transition-all duration-500 ease-out ${
                activeArtifactTab === "canvas"
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <div className="relative h-full">
                <div className="pointer-events-none absolute inset-0 z-10" />
                <Canvas persistenceKey="apple-scholar-landing-demo-canvas" />
              </div>
            </div>

            <div
              className={`absolute inset-0 overflow-auto bg-white p-4 transition-all duration-500 ease-out ${
                activeArtifactTab === "visualization"
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <DemoVisualizationPanel visualization={demoVisualizationState} />
            </div>

            <div
              className={`absolute inset-0 overflow-auto bg-white p-6 transition-all duration-500 ease-out ${
                activeArtifactTab === "quiz"
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <PanelCard>
                <SectionHeader title="Quiz" subtitle="Assessment artifact" />
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm text-slate-600">
                      {showQuizSubmitted ? (
                        <span className="font-medium text-slate-900">Score: 1 / 1</span>
                      ) : (
                        <span>Answered 1 of 1</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={`rounded-md px-3 py-2 text-sm font-medium ${
                          showQuizSubmitted
                            ? "border border-slate-300 bg-white text-slate-700"
                            : "bg-slate-900 text-white"
                        }`}
                      >
                        {showQuizSubmitted ? "Retry Quiz" : "Submit Quiz"}
                      </button>
                    </div>
                  </div>

                  <section className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Question 1</p>
                      <h3 className="text-sm font-semibold text-slate-900">
                        Which operation is especially efficient in a linked list?
                      </h3>
                    </div>
                    <ul className="space-y-2">
                      {[
                        "Random access by index",
                        "Insertion after a known node",
                        "Reading the last item instantly",
                      ].map((choice, index) => {
                        const isSelected = index === 1;
                        const isCorrect = index === 1;
                        return (
                          <li key={choice}>
                            <div
                              className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                showQuizSubmitted && isCorrect
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                  : isSelected
                                    ? "border-slate-500 bg-slate-100 text-slate-900"
                                    : "border-slate-200 bg-white text-slate-700"
                              }`}
                            >
                              <span className="font-medium">{String.fromCharCode(65 + index)}.</span> {choice}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                    {showQuizSubmitted ? (
                      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
                        <p className="font-medium">Correct answer: Insertion after a known node</p>
                        <p className="mt-1">
                          Linked lists are strong when you already have a reference to where you want to insert.
                        </p>
                      </div>
                    ) : null}
                  </section>
                </div>
              </PanelCard>
            </div>

            <div
              className={`absolute inset-0 overflow-auto bg-white p-4 transition-all duration-500 ease-out ${
                activeArtifactTab === "flashcards"
                  ? "pointer-events-auto translate-y-0 opacity-100"
                  : "pointer-events-none translate-y-2 opacity-0"
              }`}
            >
              <FlashcardPanel
                cards={demoFlashcards}
                mode="reviewing"
                currentIndex={demoFlashcardIndex}
                isFlipped={showFlashcardAnswer}
                flipCard={() => {}}
                nextCard={() => {}}
                previousCard={() => {}}
              />
            </div>
          </div>
        </section>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            <span>Now in lesson</span>
            <span className="text-slate-900">{lessonFlowSteps[activeFlowStepIndex]?.label ?? activeScene.label}</span>
          </div>

          <div className="flex flex-wrap items-start gap-x-5 gap-y-3">
            {lessonFlowSteps.map((step, index) => {
              const stepProgress = getFlowStepProgress(index, activeSceneIndex, sceneProgress);
              const isActive = index === activeFlowStepIndex;
              const isCompleted = index < activeFlowStepIndex;
              const circleRadius = 17;
              const circumference = 2 * Math.PI * circleRadius;
              const strokeOffset = circumference * (1 - stepProgress);

              return (
                <div key={step.label} className="flex min-w-[86px] items-center gap-3">
                  <div className="relative flex h-10 w-10 items-center justify-center">
                    {isActive ? (
                      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
                        <circle cx="20" cy="20" r={circleRadius} fill="none" stroke="rgb(226 232 240)" strokeWidth="2.5" />
                        <circle
                          cx="20"
                          cy="20"
                          r={circleRadius}
                          fill="none"
                          stroke="rgb(15 23 42)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeOffset}
                        />
                      </svg>
                    ) : null}

                    <div
                      className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition ${
                        isActive
                          ? "bg-slate-950 text-white"
                          : isCompleted
                            ? "bg-emerald-500 text-white"
                            : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {index + 1}
                    </div>
                  </div>

                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium transition ${
                        isActive
                          ? "text-slate-950"
                          : isCompleted
                            ? "text-slate-700"
                            : "text-slate-400"
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {isActive
                        ? activeScene.title
                        : isCompleted
                          ? "Complete"
                          : "Upcoming"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
        </div>

        <div
          className={`absolute inset-0 transition-all duration-700 ease-out ${
            filmPhase === "lesson"
              ? "pointer-events-none translate-y-4 opacity-0"
              : "translate-y-0 opacity-100"
          }`}
        >
          <DemoDashboardPreview
            replayVisible={filmPhase === "replay"}
            onReplay={replayLesson}
          />
        </div>
      </div>
    </div>
  );
}

export default function LandingPage({
  waitlistRedirected,
}: {
  waitlistRedirected: boolean;
}) {
  const year = new Date().getFullYear();
  const [isAccessModalOpen, setIsAccessModalOpen] = useState(waitlistRedirected);

  useEffect(() => {
    if (waitlistRedirected) {
      setIsAccessModalOpen(true);
    }
  }, [waitlistRedirected]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#fcfcfa]">
      <AccessModal
        open={isAccessModalOpen}
        onClose={() => setIsAccessModalOpen(false)}
        waitlistRedirected={waitlistRedirected}
      />

      <nav className="fixed inset-x-0 top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="relative h-10 w-10 overflow-hidden">
            <Image
              src="/logo.png"
              alt="Apple Scholar logo"
              fill
              sizes="40px"
              className="object-contain"
              priority
            />
          </div>

          <div className="hidden md:block" />

          <button
            type="button"
            onClick={() => setIsAccessModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            Join the waitlist
          </button>
        </div>
      </nav>

      <main>
        <section className="relative overflow-x-hidden pt-24 pb-12 sm:pb-16 lg:pb-20">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage: "radial-gradient(circle, #d1d5db 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-transparent to-white" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white via-transparent to-white" />

          <div className="relative mx-auto w-full max-w-6xl px-4 pb-4 pt-20 sm:px-6 lg:pt-24">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-gray-200 bg-white px-4 py-2 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-medium text-gray-600">
                  Your expensive tutor without the price tag
                </span>
              </div>

              <h1 className="mb-6 text-3xl font-semibold leading-[1.08] tracking-tight text-slate-950 sm:text-5xl lg:text-[3.6rem] xl:text-6xl">
                Learn difficult subjects{' '}
                <span className="relative inline-block">
                  <span className="relative z-10 font-[family-name:var(--font-display)] text-slate-500">
                    with a working tutor
                  </span>
                  <span className="absolute bottom-1 left-0 right-0 h-3 rounded-sm bg-sky-500/12" />
                </span>
              </h1>

              <p className="mx-auto mb-10 max-w-2xl text-base leading-relaxed text-slate-600 sm:text-lg lg:text-xl">
                Apple Scholar is an intelligent live tutor that uses tools to maximize student
                learning beyond a single session while keeping track of the student&apos;s progress.
              </p>

              <div className="mb-10 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setIsAccessModalOpen(true)}
                  className="inline-flex w-full justify-center gap-2 rounded-full bg-slate-950 px-7 py-3 text-sm font-medium text-white transition hover:bg-slate-800 sm:w-auto"
                >
                  Join the waitlist
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500 sm:gap-6">
                {trustSignals.map((signal) => (
                  <div key={signal} className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{signal}</span>
                  </div>
                ))}
              </div>
            </div>
            <div id="lesson-demo" className="relative mt-10 translate-y-8 sm:mt-12 sm:translate-y-10 lg:mt-14 lg:translate-y-12">
              <LessonDemoFilm />
            </div>
          </div>
        </section>
      </main>

      <footer className="mt-20 overflow-hidden border-t border-slate-200 bg-[#fcfcfa] text-slate-900 sm:mt-28 lg:mt-36">
        <div className="border-b border-slate-200">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center sm:px-6 sm:py-20">
            <div className="mx-auto max-w-3xl">
              <h3 className="mb-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Ready to learn with a tutor that can actually{" "}
                <span className="inline-grid align-baseline [grid-template-areas:'stack']">
                  <span className="[grid-area:stack] font-[family-name:var(--font-display)] text-slate-500">
                    show the work?
                  </span>
                </span>
              </h3>
              <p className="mx-auto max-w-2xl text-base text-slate-600 sm:text-lg">
                Apple Scholar brings tutoring, whiteboarding, and study materials into one workflow.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setIsAccessModalOpen(true)}
                  className="inline-flex w-full justify-center gap-2 rounded-full bg-slate-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 sm:w-auto"
                >
                  Join the waitlist
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </button>
                <a
                  href="#lesson-demo"
                  className="inline-flex w-full justify-center rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:text-slate-900 sm:w-auto"
                >
                  See the lesson
                </a>
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-center text-sm text-slate-500 sm:text-left">
            © {year} Apple Scholar. All rights reserved.
          </p>
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setIsAccessModalOpen(true)}
              className="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
            >
              Join the waitlist
            </button>
          </div>
        </div>

        <div className="h-24 overflow-hidden border-t border-slate-200 sm:h-32 md:h-40">
          <div className="relative mx-auto h-full max-w-6xl px-4 sm:px-6">
            <Image
              src="/logo.png"
              alt=""
              aria-hidden
              width={1024}
              height={1024}
              className="pointer-events-none absolute bottom-0 right-0 w-36 translate-y-1/3 select-none sm:w-48 md:w-60"
            />
          </div>
        </div>
      </footer>
    </div>
  );
}
