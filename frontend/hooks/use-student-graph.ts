"use client";

import { useEffect, useState } from "react";

import type { StudentGraphResponse } from "@/lib/student-app/types";

interface StudentGraphErrorResponse {
  error?: string;
}

interface UseStudentGraphResult {
  error: string | null;
  graph: StudentGraphResponse | null;
  loading: boolean;
}

const hasErrorMessage = (value: unknown): value is StudentGraphErrorResponse =>
  value !== null &&
  typeof value === "object" &&
  "error" in value &&
  typeof (value as { error?: unknown }).error === "string";

const hasGraphPayload = (value: unknown): value is StudentGraphResponse =>
  value !== null &&
  typeof value === "object" &&
  "nodes" in value &&
  Array.isArray((value as { nodes?: unknown }).nodes) &&
  "edges" in value &&
  Array.isArray((value as { edges?: unknown }).edges);

export function useStudentGraph(courseId: string | null): UseStudentGraphResult {
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<StudentGraphResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(courseId));

  useEffect(() => {
    if (!courseId) {
      setGraph(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const safeCourseId = courseId;

    async function loadGraph() {
      setLoading(true);
      setError(null);

      try {
        const url = new URL("/api/student/graph", window.location.origin);
        url.searchParams.set("courseId", safeCourseId);

        const response = await fetch(url.toString(), {
          credentials: "include",
          signal: controller.signal,
        });
        const body = (await response.json().catch(() => null)) as
          | StudentGraphResponse
          | StudentGraphErrorResponse
          | null;

        if (!response.ok) {
          throw new Error(
            hasErrorMessage(body) ? body.error : "Unable to load the course graph.",
          );
        }

        setGraph(hasGraphPayload(body) ? body : null);
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }

        console.error("Failed to load student graph:", cause);
        setError(
          cause instanceof Error ? cause.message : "Unable to load the course graph.",
        );
        setGraph(null);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadGraph();

    return () => {
      controller.abort();
    };
  }, [courseId]);

  return {
    error,
    graph,
    loading,
  };
}
