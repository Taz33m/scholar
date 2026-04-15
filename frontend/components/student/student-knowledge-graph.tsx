"use client";

import { useMemo, useState } from "react";

import { getStudentCourseTone } from "@/lib/student-app/presentation";
import type {
  StudentCourse,
  StudentGraphNode,
  StudentGraphResponse,
} from "@/lib/student-app/types";
import { cn } from "@/lib/utils";

interface StudentKnowledgeGraphProps {
  course: StudentCourse;
  graph: StudentGraphResponse | null;
  loading?: boolean;
  error?: string | null;
  onStartConceptSession: (node: StudentGraphNode) => void;
}

function formatLastStudied(value: string | null, hasMasteryData: boolean) {
  if (!hasMasteryData) {
    return "Not yet";
  }

  if (!value) {
    return "Not studied recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatMasteryLabel(score: number, hasMasteryData: boolean) {
  if (!hasMasteryData) {
    return "Not assessed yet";
  }

  return `${Math.round(score)}% mastery`;
}

export function StudentKnowledgeGraph({
  course,
  graph,
  loading = false,
  error = null,
  onStartConceptSession,
}: StudentKnowledgeGraphProps) {
  const tone = getStudentCourseTone(course.colorToken);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const nodes = useMemo(() => graph?.nodes ?? [], [graph]);
  const edges = useMemo(() => graph?.edges ?? [], [graph]);
  const hasMasteryData = useMemo(
    () =>
      course.sessionCount > 0 ||
      nodes.some((node) => node.evidenceCount > 0 || Boolean(node.lastStudiedAt)),
    [course.sessionCount, nodes],
  );
  const activeNode = useMemo(() => {
    if (nodes.length === 0) {
      return null;
    }

    return (
      nodes.find((node) => node.id === activeNodeId) ??
      (hasMasteryData
        ? nodes.find((node) => node.id === graph?.recommendations[0]?.conceptId)
        : null) ??
      nodes[0]
    );
  }, [activeNodeId, graph?.recommendations, hasMasteryData, nodes]);

  return (
    <section className={cn("rounded-md border bg-white", tone.containerClassName)}>
      <div className="border-b border-[var(--m3-outline-variant)] px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
              Knowledge graph
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[var(--m3-on-surface)]">
              Course progress and next concepts
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--m3-on-surface-variant)]">
              {hasMasteryData
                ? "This map reflects where recent tutoring has concentrated, what feels steady, and which concepts should come next."
                : "This map outlines the main concepts showing up on the current exam. Mastery starts updating after the first tutoring session."}
            </p>
          </div>

          {hasMasteryData && graph?.recommendations?.length ? (
            <div className="flex max-w-xl flex-wrap gap-2">
              {graph.recommendations.map((recommendation) => (
                <button
                  key={recommendation.conceptId}
                  type="button"
                  onClick={() => {
                    const matchedNode = nodes.find(
                      (node) => node.id === recommendation.conceptId,
                    );

                    if (matchedNode) {
                      setActiveNodeId(matchedNode.id);
                    }
                  }}
                  className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fbfbf8] px-3 py-2 text-left text-xs text-[var(--m3-on-surface)] transition-colors hover:bg-[var(--m3-surface-container-low)]"
                >
                  <span className="block font-semibold">{recommendation.conceptName}</span>
                  <span className="mt-1 block text-[var(--m3-on-surface-variant)]">
                    {recommendation.reason}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="px-5 py-6 text-sm text-[#7c2d12]">{error}</div>
      ) : loading ? (
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.15fr)_320px]">
          <div className="h-[340px] animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
          <div className="h-[340px] animate-pulse rounded-md bg-[var(--m3-surface-container-low)]" />
        </div>
      ) : nodes.length === 0 ? (
        <div className="px-5 py-8">
          <div className="rounded-md border border-dashed border-[var(--m3-outline-variant)] bg-[#fcfcfa] px-5 py-8 text-sm text-[var(--m3-on-surface-variant)]">
            No graph data is available for this course yet. Start a tutoring session in{" "}
            <span className="font-semibold text-[var(--m3-on-surface)]">{course.title}</span>{" "}
            and the graph can begin filling in.
          </div>
        </div>
      ) : (
        <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.15fr)_320px]">
          <div className="relative min-h-[340px] overflow-hidden rounded-md border border-[var(--m3-outline-variant)] bg-[#fcfcfa]">
            <svg
              aria-hidden
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {edges.map((edge) => {
                const source = nodes.find((node) => node.id === edge.source);
                const target = nodes.find((node) => node.id === edge.target);

                if (!source || !target) {
                  return null;
                }

                return (
                  <line
                    key={edge.id}
                    x1={source.x}
                    y1={source.y}
                    x2={target.x}
                    y2={target.y}
                    stroke="rgba(100, 116, 139, 0.34)"
                    strokeWidth={0.45 + edge.strength * 0.45}
                  />
                );
              })}
            </svg>

            {nodes.map((node) => {
              const isActive = node.id === activeNode?.id;
              const nodeSize = hasMasteryData ? 52 + Math.round(node.masteryScore / 5) : 60;

              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => onStartConceptSession(node)}
                  onMouseEnter={() => setActiveNodeId(node.id)}
                  onFocus={() => setActiveNodeId(node.id)}
                  className={cn(
                    "absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border bg-white text-center shadow-[0_10px_30px_rgba(15,23,42,0.05)] transition-all",
                    isActive
                      ? cn("scale-[1.03]", tone.strokeClassName)
                      : "border-[var(--m3-outline-variant)] hover:border-[var(--m3-outline)]",
                  )}
                  style={{
                    height: `${nodeSize}px`,
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    width: `${nodeSize}px`,
                  }}
                  title={`${node.conceptName} · ${formatMasteryLabel(node.masteryScore, hasMasteryData)}`}
                >
                  <span className="max-w-[78%] text-[11px] font-semibold leading-tight text-[var(--m3-on-surface)]">
                    {node.conceptName}
                  </span>
                </button>
              );
            })}
          </div>

          <aside className="rounded-md border border-[var(--m3-outline-variant)] bg-[#fcfcfa] p-5">
            {activeNode ? (
              <>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--m3-on-surface-variant)]">
                  Selected concept
                </p>
                <h3 className="mt-2 text-lg font-semibold text-[var(--m3-on-surface)]">
                  {activeNode.conceptName}
                </h3>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className={cn("rounded-md px-2.5 py-1 font-semibold", tone.badgeClassName)}>
                    {formatMasteryLabel(activeNode.masteryScore, hasMasteryData)}
                  </span>
                  <span className="rounded-md border border-[var(--m3-outline-variant)] px-2.5 py-1 font-medium text-[var(--m3-on-surface-variant)]">
                    {hasMasteryData
                      ? `${activeNode.evidenceCount} tutoring checkpoints`
                      : "No tutoring checkpoints yet"}
                  </span>
                  <span className="rounded-md border border-[var(--m3-outline-variant)] px-2.5 py-1 font-medium text-[var(--m3-on-surface-variant)]">
                    Last studied {formatLastStudied(activeNode.lastStudiedAt, hasMasteryData)}
                  </span>
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--m3-on-surface-variant)]">
                  {activeNode.evidenceSummary}
                </p>
                <button
                  type="button"
                  onClick={() => onStartConceptSession(activeNode)}
                  className="mt-5 inline-flex items-center justify-center rounded-md bg-[var(--m3-primary)] px-4 py-2.5 text-sm font-semibold text-[var(--m3-on-primary)] transition-colors hover:bg-[color-mix(in_srgb,var(--m3-primary)_92%,black)]"
                >
                  Start session on this concept
                </button>
              </>
            ) : null}

            <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-[var(--m3-outline-variant)] pt-5 text-sm">
              <div>
                <dt className="text-[var(--m3-on-surface-variant)]">Concepts</dt>
                <dd className="mt-1 font-semibold text-[var(--m3-on-surface)]">
                  {graph?.stats.conceptCount ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--m3-on-surface-variant)]">Avg mastery</dt>
                <dd className="mt-1 font-semibold text-[var(--m3-on-surface)]">
                  {hasMasteryData ? `${graph?.stats.masteryAverage ?? 0}%` : "Not assessed"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--m3-on-surface-variant)]">Focus areas</dt>
                <dd className="mt-1 font-semibold text-[var(--m3-on-surface)]">
                  {hasMasteryData ? graph?.stats.focusCount ?? 0 : "Not yet"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--m3-on-surface-variant)]">Updated</dt>
                <dd className="mt-1 font-semibold text-[var(--m3-on-surface)]">
                  {formatLastStudied(graph?.lastUpdatedAt ?? null, hasMasteryData)}
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      )}
    </section>
  );
}
