import { afterEach, describe, expect, it, vi } from "vitest";

import { loadTutorSessions, saveTutorSessions } from "@/lib/session-storage";
import type { TutorSession } from "@/types/session";

const createMemoryStorage = () => {
  const store = new Map<string, string>();

  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("session storage", () => {
  it("persists active tab and quiz snapshot state", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    const session: TutorSession = {
      id: "session-1",
      title: "Session 1",
      summary: "Quiz in progress.",
      status: "active",
      createdAt: new Date("2026-03-10T10:00:00.000Z"),
      updatedAt: new Date("2026-03-10T10:05:00.000Z"),
      endedAt: null,
      events: [],
      artifacts: [],
      snapshot: {
        contentView: "flashcards",
        activeTab: "quiz",
        flashcardSession: {
          cards: [],
          currentIndex: 0,
          isFlipped: false,
          mode: "idle",
          generatedAt: null,
        },
        visualizationState: {
          imageData: null,
          description: null,
          generatedAt: null,
          mode: "idle",
        },
        deepDiveState: {
          imageData: null,
          overviewText: null,
          topic: null,
          generatedAt: null,
          mode: "idle",
        },
        quizState: {
          selections: {
            0: "B",
            2: "A",
          },
          isSubmitted: true,
        },
      },
    };

    saveTutorSessions([session]);
    const [loaded] = loadTutorSessions();

    expect(loaded.snapshot.activeTab).toBe("quiz");
    expect(loaded.snapshot.quizState).toEqual({
      selections: {
        0: "B",
        2: "A",
      },
      isSubmitted: true,
    });
  });

  it("normalizes missing quiz snapshot and invalid active tab from older sessions", () => {
    const localStorage = createMemoryStorage();
    vi.stubGlobal("window", { localStorage });

    localStorage.setItem(
      "geminilearn.sessions.v1",
      JSON.stringify([
        {
          id: "legacy-session",
          title: "Legacy Session",
          summary: "",
          status: "active",
          createdAt: "2026-03-10T10:00:00.000Z",
          updatedAt: "2026-03-10T10:05:00.000Z",
          endedAt: null,
          events: [],
          artifacts: [],
          snapshot: {
            contentView: "flashcards",
            activeTab: "not-a-real-tab",
            flashcardSession: {
              cards: [],
              currentIndex: 0,
              isFlipped: false,
              mode: "idle",
              generatedAt: null,
            },
            visualizationState: {
              imageData: null,
              description: null,
              generatedAt: null,
              mode: "idle",
            },
            deepDiveState: {
              imageData: null,
              overviewText: null,
              topic: null,
              generatedAt: null,
              mode: "idle",
            },
          },
        },
      ]),
    );

    const [loaded] = loadTutorSessions();

    expect(loaded.snapshot.activeTab).toBe("flashcards");
    expect(loaded.snapshot.quizState).toEqual({
      selections: {},
      isSubmitted: false,
    });
  });
});
