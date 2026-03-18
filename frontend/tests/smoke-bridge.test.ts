import { describe, expect, it } from "vitest";

import {
  buildSmokeSnapshot,
  clearCanvasEditor,
  doesToolEventMatchExpectedTools,
  seedCanvasFixture,
} from "@/lib/smoke-bridge";

import { createFakeCanvasEditor } from "./utils/fake-canvas-editor";

const NOW = new Date("2026-03-10T12:00:00.000Z");

describe("smoke bridge helpers", () => {
  it("matches tool expectations using either requested or executed tool names", () => {
    const event = {
      id: "tool-1",
      toolName: "get_canvas_snapshot",
      requestedToolName: "edit_canvas",
      executedToolName: "get_canvas_snapshot",
      args: { goal: "Explain the canvas" },
      success: true,
      message: "Inspection request detected.",
      timestamp: NOW,
    };

    expect(doesToolEventMatchExpectedTools(event, ["edit_canvas"])).toBe(true);
    expect(
      doesToolEventMatchExpectedTools(event, ["get_canvas_snapshot"]),
    ).toBe(true);
    expect(doesToolEventMatchExpectedTools(event, ["generate_quiz"])).toBe(
      false,
    );
  });

  it("seeds and clears the canvas editor using the smoke fixture format", () => {
    const editor = createFakeCanvasEditor([]);

    seedCanvasFixture(editor as never, {
      clearExisting: true,
      shapes: [
        {
          id: "shape:main",
          type: "geo",
          text: "Main idea",
          x: 120,
          y: 140,
        },
        {
          id: "shape:label",
          type: "text",
          text: "Important note",
          x: 380,
          y: 180,
        },
      ],
    });

    expect(editor.snapshot()).toHaveLength(2);
    expect(editor.snapshot().map((shape) => shape.id)).toEqual([
      "shape:main",
      "shape:label",
    ]);

    clearCanvasEditor(editor as never);
    expect(editor.snapshot()).toHaveLength(0);
  });

  it("builds a compact snapshot with canvas and session event summaries", () => {
    const editor = createFakeCanvasEditor([
      {
        id: "shape:main",
        type: "geo",
        x: 120,
        y: 140,
        props: {
          color: "blue",
          h: 100,
          richText: {
            content: [{ content: [{ text: "Main idea" }] }],
          },
          w: 180,
        },
      },
    ]);

    const snapshot = buildSmokeSnapshot({
      activeTab: "canvas",
      availableTabs: ["canvas", "flashcards"],
      voiceStatus: "connected",
      lastToolEvent: {
        id: "tool-1",
        toolName: "get_canvas_snapshot",
        requestedToolName: "edit_canvas",
        executedToolName: "get_canvas_snapshot",
        args: { goal: "Explain the canvas" },
        success: true,
        message: "Inspection request detected.",
        timestamp: NOW,
      },
      lastAssistantTurn: {
        id: "assistant-1",
        text: "Arrays are contiguous blocks of memory.",
        timestamp: NOW,
      },
      flashcardSession: {
        cards: [],
        currentIndex: 0,
        isFlipped: false,
        mode: "idle",
        generatedAt: null,
      },
      quizContext: {
        title: "Cell Quiz",
        summary: "Quick review",
        isSubmitted: false,
        answeredCount: 0,
        totalQuestions: 4,
        score: null,
        questions: [],
      },
      visualizationState: {
        imageData: null,
        description: null,
        generatedAt: null,
        mode: "idle",
      },
      canvasEditor: editor as never,
      activeSession: {
        id: "session-1",
        title: "Session 1",
        summary: "",
        status: "active",
        createdAt: NOW,
        updatedAt: NOW,
        endedAt: null,
        artifacts: [],
        snapshot: {
          contentView: "flashcards",
          activeTab: "flashcards",
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
            selections: {},
            isSubmitted: false,
          },
        },
        events: [
          {
            id: "event-1",
            type: "tool_result",
            timestamp: NOW,
            text: "Completed edit_canvas -> get_canvas_snapshot",
            metadata: {
              toolName: "get_canvas_snapshot",
              requestedToolName: "edit_canvas",
              executedToolName: "get_canvas_snapshot",
            },
          },
        ],
      },
    });

    expect(snapshot.activeTab).toBe("canvas");
    expect(snapshot.availableTabs).toContain("flashcards");
    expect(snapshot.lastToolEvent).toMatchObject({
      requestedToolName: "edit_canvas",
      executedToolName: "get_canvas_snapshot",
    });
    expect(snapshot.assistant).toMatchObject({
      text: "Arrays are contiguous blocks of memory.",
      timestamp: NOW.toISOString(),
    });
    expect(snapshot.quiz).toMatchObject({
      available: true,
      questionCount: 4,
      isSubmitted: false,
    });
    expect(snapshot.canvas.shapeCount).toBe(1);
    expect(snapshot.canvas.shapes[0]).toMatchObject({
      id: "shape:main",
      text: "Main idea",
      type: "geo",
    });
    expect(snapshot.recentEvents[0]).toMatchObject({
      requestedToolName: "edit_canvas",
      executedToolName: "get_canvas_snapshot",
      toolName: "get_canvas_snapshot",
    });
  });
});
