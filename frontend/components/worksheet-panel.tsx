'use client';

import { PanelCard } from "@/components/ui/panel-card";
import { MarkdownText } from "@/components/ui/markdown-text";
import { SectionHeader } from "@/components/ui/section-header";
import { buildWorksheetPrintHtml } from "@/lib/worksheet-print";
import { cn } from "@/lib/utils";
import {
  countAnsweredWorksheetItems,
  countWorksheetItems,
} from "@/lib/worksheet-state";
import type {
  WorksheetArtifact,
  WorksheetResponse,
} from "@/types/session";

interface WorksheetPanelProps {
  worksheets: WorksheetArtifact[];
  selectedWorksheetId: string | null;
  responsesByArtifactId: Record<string, Record<string, WorksheetResponse>>;
  onSelectWorksheet: (artifactId: string) => void;
  onUpdateResponse: (
    artifactId: string,
    questionId: string,
    response: WorksheetResponse,
  ) => void;
}

const difficultyLabel = (difficulty: WorksheetArtifact["difficulty"]) => {
  if (!difficulty) {
    return "Adaptive";
  }

  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
};

const openPrintPreview = (
  artifact: WorksheetArtifact,
  responses: Record<string, WorksheetResponse>,
  mode: "worksheet" | "answer-key",
) => {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);

  const printDocument = iframe.contentWindow?.document;
  const printWindow = iframe.contentWindow;

  if (!printDocument || !printWindow) {
    iframe.remove();
    return;
  }

  printDocument.open();
  printDocument.write(
    buildWorksheetPrintHtml({
      artifact,
      responses,
      mode,
    }),
  );
  printDocument.close();

  const cleanup = () => {
    window.setTimeout(() => {
      iframe.remove();
    }, 250);
  };

  printWindow.onafterprint = cleanup;
  window.setTimeout(() => {
    printWindow.focus();
    printWindow.print();
  }, 120);
};

export function WorksheetPanel({
  worksheets,
  selectedWorksheetId,
  responsesByArtifactId,
  onSelectWorksheet,
  onUpdateResponse,
}: WorksheetPanelProps) {
  const selectedWorksheet =
    worksheets.find((worksheet) => worksheet.id === selectedWorksheetId) ??
    worksheets[0] ??
    null;

  if (!selectedWorksheet) {
    return (
      <div className="p-6">
        <PanelCard>
          <SectionHeader
            title="Worksheet"
            subtitle="No worksheet artifact yet."
          />
          <p className="text-sm text-slate-600">
            Ask the tutor to generate a worksheet and it will appear here as a
            printable practice handout.
          </p>
        </PanelCard>
      </div>
    );
  }

  const responses = responsesByArtifactId[selectedWorksheet.id] ?? {};
  const answeredCount = countAnsweredWorksheetItems(selectedWorksheet, responses);
  const totalQuestions = countWorksheetItems(selectedWorksheet);

  return (
    <div className="p-6">
      <PanelCard className="border-0 bg-transparent p-0 shadow-none">
        <SectionHeader
          title={selectedWorksheet.title}
          subtitle={
            <MarkdownText inline className="text-[11px] text-slate-500">
              {selectedWorksheet.summary}
            </MarkdownText>
          }
          right={
            <div className="flex flex-wrap items-center gap-2">
              {worksheets.length > 1 ? (
                <select
                  value={selectedWorksheet.id}
                  onChange={(event) => onSelectWorksheet(event.target.value)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 outline-none transition-colors focus:border-slate-400"
                >
                  {worksheets.map((worksheet) => (
                    <option key={worksheet.id} value={worksheet.id}>
                      {worksheet.title}
                    </option>
                  ))}
                </select>
              ) : null}
              <button
                type="button"
                onClick={() =>
                  openPrintPreview(selectedWorksheet, responses, "worksheet")
                }
                className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
              >
                Print Worksheet
              </button>
              <button
                type="button"
                onClick={() =>
                  openPrintPreview(selectedWorksheet, responses, "answer-key")
                }
                className="rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800"
              >
                Print Answer Key
              </button>
            </div>
          }
        />

        <div className="mx-auto max-w-4xl rounded-[28px] bg-white px-8 py-8 shadow-sm">
          <header className="border-b border-slate-200 pb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Apple Scholar Worksheet
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
              {selectedWorksheet.title}
            </h2>
            {selectedWorksheet.document.subtitle ? (
              <div className="mt-2 text-sm text-slate-600">
                <MarkdownText>{selectedWorksheet.document.subtitle}</MarkdownText>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                {difficultyLabel(selectedWorksheet.difficulty)}
              </span>
              {selectedWorksheet.estimatedTimeMinutes ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                  {selectedWorksheet.estimatedTimeMinutes} minutes
                </span>
              ) : null}
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                Answered {answeredCount} of {totalQuestions}
              </span>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-7 text-slate-700">
              <MarkdownText>{selectedWorksheet.instructions}</MarkdownText>
            </div>

            {selectedWorksheet.document.learningObjectives.length > 0 ? (
              <div className="mt-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Learning Objectives
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-7 text-slate-700">
                  {selectedWorksheet.document.learningObjectives.map((objective) => (
                      <li key={objective}>
                        <MarkdownText>{objective}</MarkdownText>
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </header>

          <div className="mt-8 space-y-8">
            {selectedWorksheet.document.sections.map((section, sectionIndex) => {
              const questionOffset = selectedWorksheet.document.sections
                .slice(0, sectionIndex)
                .reduce((count, currentSection) => count + currentSection.items.length, 0);

              return (
              <section key={section.id} className="space-y-5">
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="text-lg font-semibold text-slate-900">
                    {section.heading}
                  </h3>
                  {section.directions ? (
                    <div className="mt-2 text-sm leading-7 text-slate-600">
                      <MarkdownText>{section.directions}</MarkdownText>
                    </div>
                  ) : null}
                </div>

                <div className="space-y-6">
                  {section.items.map((item, itemIndex) => {
                    const questionNumber = questionOffset + itemIndex + 1;
                    const response = responses[item.questionId];

                    return (
                      <article
                        key={item.questionId}
                        className="border-b border-slate-100 pb-6 last:border-b-0"
                      >
                        <div className="space-y-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Question {questionNumber}
                          </p>
                          <h4 className="text-base font-semibold leading-7 text-slate-900">
                            {item.prompt}
                          </h4>
                        </div>

                        {item.kind === "multiple_choice" ? (
                          <div className="mt-4 space-y-2">
                            {item.choices.map((choice) => {
                              const selected =
                                response?.kind === "multiple_choice" &&
                                response.selectedOptionId === choice.id;

                              return (
                                <label
                                  key={choice.id}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors",
                                    selected
                                      ? "border-slate-400 bg-slate-100 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={`${selectedWorksheet.id}-${item.questionId}`}
                                    checked={selected}
                                    onChange={() =>
                                      onUpdateResponse(selectedWorksheet.id, item.questionId, {
                                        kind: "multiple_choice",
                                        selectedOptionId: choice.id,
                                        note: response?.note ?? "",
                                      })
                                    }
                                    className="mt-0.5 h-4 w-4 border-slate-300 text-slate-900 focus:ring-slate-400"
                                  />
                                  <span className="leading-6">
                                    <span className="mr-2 font-semibold text-slate-500">
                                      {choice.label}.
                                    </span>
                                    {choice.text}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {item.kind === "multi_select" ? (
                          <div className="mt-4 space-y-2">
                            {item.choices.map((choice) => {
                              const selected =
                                response?.kind === "multi_select" &&
                                response.selectedOptionIds.includes(choice.id);

                              return (
                                <label
                                  key={choice.id}
                                  className={cn(
                                    "flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-colors",
                                    selected
                                      ? "border-slate-400 bg-slate-100 text-slate-900"
                                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={(event) => {
                                      const currentIds =
                                        response?.kind === "multi_select"
                                          ? response.selectedOptionIds
                                          : [];
                                      const nextIds = event.target.checked
                                        ? [...currentIds, choice.id]
                                        : currentIds.filter((id) => id !== choice.id);

                                      onUpdateResponse(selectedWorksheet.id, item.questionId, {
                                        kind: "multi_select",
                                        selectedOptionIds: nextIds,
                                        note: response?.note ?? "",
                                      });
                                    }}
                                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                                  />
                                  <span className="leading-6">
                                    <span className="mr-2 font-semibold text-slate-500">
                                      {choice.label}.
                                    </span>
                                    {choice.text}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : null}

                        {item.kind === "short_answer" ? (
                          <div className="mt-4 space-y-3">
                            <textarea
                              value={
                                response?.kind === "short_answer"
                                  ? response.answerText
                                  : ""
                              }
                              rows={item.lineCount}
                              placeholder={
                                item.placeholder ?? "Write a concise answer."
                              }
                              onChange={(event) =>
                                onUpdateResponse(selectedWorksheet.id, item.questionId, {
                                  kind: "short_answer",
                                  answerText: event.target.value,
                                  note: response?.note ?? "",
                                })
                              }
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400"
                            />
                          </div>
                        ) : null}

                        <div className="mt-4">
                          <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            Student Note
                          </label>
                          <textarea
                            value={response?.note ?? ""}
                            rows={2}
                            placeholder="Add a quick note, reminder, or reasoning step."
                            onChange={(event) => {
                              if (item.kind === "multiple_choice") {
                                onUpdateResponse(selectedWorksheet.id, item.questionId, {
                                  kind: "multiple_choice",
                                  selectedOptionId:
                                    response?.kind === "multiple_choice"
                                      ? response.selectedOptionId
                                      : null,
                                  note: event.target.value,
                                });
                                return;
                              }

                              if (item.kind === "multi_select") {
                                onUpdateResponse(selectedWorksheet.id, item.questionId, {
                                  kind: "multi_select",
                                  selectedOptionIds:
                                    response?.kind === "multi_select"
                                      ? response.selectedOptionIds
                                      : [],
                                  note: event.target.value,
                                });
                                return;
                              }

                              onUpdateResponse(selectedWorksheet.id, item.questionId, {
                                kind: "short_answer",
                                answerText:
                                  response?.kind === "short_answer"
                                    ? response.answerText
                                    : "",
                                note: event.target.value,
                              });
                            }}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
              );
            })}
          </div>
        </div>
      </PanelCard>
    </div>
  );
}
