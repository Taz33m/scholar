import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateContentMock } = vi.hoisted(() => ({
  generateContentMock: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateContent: generateContentMock,
    },
  })),
}));

import { POST as tutorPost } from "@/app/api/tutor/respond/route";

const BEL_STUDY_CONTEXT = {
  courseId: "11111111-1111-4111-8111-111111111111",
  courseTitle: "Business Ethics and Law",
  courseCode: null,
  examId: "22222222-2222-4222-8222-222222222222",
  examTitle: "Exam 2 Review",
  examKind: "midterm",
  examScheduledFor: "2026-04-20T08:00:00.000Z",
  examFocusTopics: ["Ethical frameworks and case-based reasoning"],
  selectedFocusTopics: [],
  sessionGoal: "Get fast and accurate on the exam.",
  courseBrainVersionId: "2026-04-13",
  selectedConceptIds: ["bel-ethical-frameworks"],
  checklistArtifactId: "checklist-1",
  conceptProgressSnapshot: [],
  derivedMemoryContext: {
    recentStudyEpisodes: [
      {
        memoryType: "study_episode",
        externalSessionId: "session-prev-1",
        trigger: "session_exit",
        label: "Recent session exit",
        summary: "Recent point-loss risk was distinguishing legal analysis from ethical analysis under time pressure.",
        trustClass: "authoritative_derived",
        confidence: "high",
        provenance: "authoritative_session_exit",
        timestamp: "2026-04-13T18:30:00.000Z",
        focusConceptIds: ["bel-ethical-frameworks"],
        focusConceptLabels: ["Ethical frameworks"],
        materialsTouched: [],
      },
    ],
    confirmedProfileMemory: [
      {
        memoryType: "student_profile",
        profileKey: "prefers_case_based_drills",
        label: "Confirmed profile memory",
        summary: "Case-based drills are a productive tutoring mode for this student.",
        trustClass: "behavioral_inference",
        confidence: "medium",
        provenance: "derived_profile_update",
        timestamp: "2026-04-12T18:30:00.000Z",
        status: "confirmed",
      },
    ],
  },
  entryPoint: "course_home",
  focusTopic: "Danone",
};

const UNsubmittedQuizContext = {
  title: "Quiz 1",
  summary: "Diagnostic quiz.",
  isSubmitted: false,
  answeredCount: 1,
  totalQuestions: 2,
  score: null,
  questions: [
    {
      index: 0,
      prompt: "Which agency regulates deceptive advertising?",
      choices: ["SEC", "FTC", "OSHA", "EEOC"],
      correctAnswer: "FTC",
      explanation: "The FTC regulates deceptive advertising practices.",
      selectedAnswer: "SEC",
      isCorrect: null,
    },
  ],
};

const WORKSHEET_CONTEXT = {
  worksheetId: "worksheet-1",
  title: "Worksheet 1",
  summary: "Worksheet on due care.",
  instructions: "Answer each question.",
  estimatedTimeMinutes: 10,
  difficulty: "medium" as const,
  answeredCount: 1,
  totalQuestions: 1,
  sections: [
    {
      id: "section-1",
      heading: "Practice",
      directions: null,
      items: [
        {
          questionId: "q1",
          kind: "short_answer" as const,
          prompt: "Explain due care.",
          placeholder: null,
          lineCount: 3,
          response: {
            kind: "short_answer" as const,
            answerText: "Do not mislead consumers.",
            note: "",
          },
          answerKey: {
            questionId: "q1",
            answerText: "Due care requires reasonable steps to avoid foreseeable consumer harm.",
            explanation: "It is broader than mere legal compliance.",
          },
        },
      ],
    },
  ],
  answerKey: [
    {
      questionId: "q1",
      answerText: "Due care requires reasonable steps to avoid foreseeable consumer harm.",
      explanation: "It is broader than mere legal compliance.",
    },
  ],
};

const buildRequest = (body: Record<string, unknown>) =>
  new Request("http://localhost/api/tutor/respond", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const getCapturedPrompt = () =>
  String(generateContentMock.mock.calls.at(-1)?.[0]?.contents ?? "");

describe("text tutor runtime route", () => {
  beforeEach(() => {
    generateContentMock.mockReset();
    generateContentMock.mockResolvedValue({ text: "Tutor reply." });
    process.env.GEMINI_API_KEY = "test-key";
    process.env.TUTOR_PROMPT_BUNDLE_ENABLED = "true";
  });

  it("does not expose quiz answers before submission without explicit review", async () => {
    const response = await tutorPost(
      buildRequest({
        prompt: "Coach me through the current quiz question without spoiling it.",
        quizContext: UNsubmittedQuizContext,
        studyContext: BEL_STUDY_CONTEXT,
        worksheetContext: null,
        fileContext: null,
      }) as never,
    );

    expect(response.status).toBe(200);
    const prompt = getCapturedPrompt();
    expect(prompt).not.toContain('"correctAnswer":"FTC"');
    expect(prompt).not.toContain("The FTC regulates deceptive advertising practices.");
  });

  it("exposes quiz answers when the student explicitly asks for review", async () => {
    const response = await tutorPost(
      buildRequest({
        prompt: "Review the correct answers and explanations for my quiz.",
        quizContext: UNsubmittedQuizContext,
        studyContext: BEL_STUDY_CONTEXT,
        worksheetContext: null,
        fileContext: null,
      }) as never,
    );

    expect(response.status).toBe(200);
    const prompt = getCapturedPrompt();
    expect(prompt).toContain('"correctAnswer":"FTC"');
    expect(prompt).toContain("The FTC regulates deceptive advertising practices.");
  });

  it("does not expose worksheet solutions before an explicit request", async () => {
    const response = await tutorPost(
      buildRequest({
        prompt: "Help me improve my worksheet answer.",
        quizContext: null,
        studyContext: BEL_STUDY_CONTEXT,
        worksheetContext: WORKSHEET_CONTEXT,
        fileContext: null,
      }) as never,
    );

    expect(response.status).toBe(200);
    const prompt = getCapturedPrompt();
    expect(prompt).not.toContain(
      "Due care requires reasonable steps to avoid foreseeable consumer harm.",
    );
  });

  it("uses the text-route tool surface instead of implying live workspace tools", async () => {
    const response = await tutorPost(
      buildRequest({
        prompt: "Help me reason through this case.",
        quizContext: null,
        studyContext: BEL_STUDY_CONTEXT,
        worksheetContext: null,
        fileContext: null,
      }) as never,
    );

    expect(response.status).toBe(200);
    const prompt = getCapturedPrompt();
    expect(prompt).toContain("Derived memory context:");
    expect(prompt).toContain("Use this block only for personalization and recent study continuity.");
    expect(prompt).toContain("No live workspace tools are available on this route.");
    expect(prompt).not.toContain('"name": "open_course_material"');
  });
});
