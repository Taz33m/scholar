import { describe, expect, it } from "vitest";

import {
  applyProfileSignalCandidates,
  type StudentProfileSignalLedgerRecord,
} from "@/lib/student-memory/profile-signals";

describe("student memory profile signals", () => {
  it("promotes a repeated signal to confirmed after two authoritative episodes", () => {
    const firstPass = applyProfileSignalCandidates({
      now: "2026-04-01T15:00:00.000Z",
      studentId: "student-1",
      existingLedger: [],
      candidates: [
        {
          profileKey: "prefers_case_based_drills",
          family: "drill_preference",
          summary: "Case-based drills are a productive tutoring mode for this student.",
          trustClass: "behavioral_inference",
          confidence: "medium",
          sourceSessionId: "session-1",
          createdAt: "2026-04-01T15:00:00.000Z",
        },
      ],
    });

    expect(firstPass.nextLedger[0]?.status).toBe("candidate");

    const secondPass = applyProfileSignalCandidates({
      now: "2026-04-10T15:00:00.000Z",
      studentId: "student-1",
      existingLedger: firstPass.nextLedger,
      candidates: [
        {
          profileKey: "prefers_case_based_drills",
          family: "drill_preference",
          summary: "Case-based drills are a productive tutoring mode for this student.",
          trustClass: "behavioral_inference",
          confidence: "medium",
          sourceSessionId: "session-2",
          createdAt: "2026-04-10T15:00:00.000Z",
        },
      ],
    });

    expect(secondPass.nextLedger[0]?.status).toBe("confirmed");
    expect(secondPass.nextLedger[0]?.evidenceCount).toBe(2);
    expect(secondPass.promotedSignals).toEqual([
      expect.objectContaining({
        profileKey: "prefers_case_based_drills",
        status: "confirmed",
      }),
    ]);
  });

  it("supersedes a conflicting active signal in the same family", () => {
    const existingLedger: StudentProfileSignalLedgerRecord[] = [
      {
        studentId: "student-1",
        profileKey: "prefers_case_based_drills",
        family: "drill_preference",
        summary: "Case-based drills are productive.",
        trustClass: "behavioral_inference",
        confidence: "medium",
        status: "confirmed",
        evidenceCount: 2,
        firstSeenAt: "2026-04-01T15:00:00.000Z",
        lastSeenAt: "2026-04-10T15:00:00.000Z",
        lastConfirmedAt: "2026-04-10T15:00:00.000Z",
        sourceSessionIds: ["session-1", "session-2"],
      },
    ];

    const next = applyProfileSignalCandidates({
      now: "2026-04-15T15:00:00.000Z",
      studentId: "student-1",
      existingLedger,
      candidates: [
        {
          profileKey: "prefers_narrow_timed_drills",
          family: "drill_preference",
          summary: "Narrow timed drills are the better fit right now.",
          trustClass: "behavioral_inference",
          confidence: "medium",
          sourceSessionId: "session-3",
          createdAt: "2026-04-15T15:00:00.000Z",
        },
      ],
    });

    expect(next.nextLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileKey: "prefers_case_based_drills",
          status: "superseded",
        }),
        expect.objectContaining({
          profileKey: "prefers_narrow_timed_drills",
          status: "candidate",
        }),
      ]),
    );
  });
});
