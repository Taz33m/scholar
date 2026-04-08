import type { WorksheetArtifact, WorksheetResponse } from "@/types/session";

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const nlToBr = (value: string) => escapeHtml(value).replaceAll("\n", "<br />");

type WorksheetPrintMode = "worksheet" | "answer-key";

export const buildWorksheetPrintHtml = ({
  artifact,
  responses,
  mode,
}: {
  artifact: WorksheetArtifact;
  responses: Record<string, WorksheetResponse>;
  mode: WorksheetPrintMode;
}) => {
  let questionNumber = 0;

  const questionPromptById = new Map<string, string>();

  const sectionsHtml = artifact.document.sections
    .map((section) => {
      const itemsHtml = section.items
        .map((item) => {
          questionNumber += 1;
          questionPromptById.set(item.questionId, item.prompt);
          const response = responses[item.questionId];

          const body =
            item.kind === "short_answer"
              ? `
                <div class="response-lines">
                  ${Array.from({ length: item.lineCount }, (_, index) => {
                    const filled =
                      index === 0 &&
                      response?.kind === "short_answer" &&
                      response.answerText.trim().length > 0
                        ? escapeHtml(response.answerText)
                        : "&nbsp;";
                    return `<div class="line">${filled}</div>`;
                  }).join("")}
                </div>
              `
              : `
                <ul class="choice-list">
                  ${item.choices
                    .map((choice) => {
                      const isSelected =
                        response?.kind === "multiple_choice"
                          ? response.selectedOptionId === choice.id
                          : response?.kind === "multi_select"
                            ? response.selectedOptionIds.includes(choice.id)
                            : false;

                      return `
                        <li class="choice-row">
                          <span class="choice-mark">${isSelected ? "■" : "□"}</span>
                          <span class="choice-label">${escapeHtml(choice.label)}.</span>
                          <span>${escapeHtml(choice.text)}</span>
                        </li>
                      `;
                    })
                    .join("")}
                </ul>
              `;

          const note =
            response && response.note.trim().length > 0
              ? `<div class="note-block"><span class="note-label">Student note:</span> ${nlToBr(response.note)}</div>`
              : "";

          return `
            <div class="question-block">
              <div class="question-label">Question ${questionNumber}</div>
              <div class="question-prompt">${escapeHtml(item.prompt)}</div>
              ${body}
              ${note}
            </div>
          `;
        })
        .join("");

      return `
        <section class="section-block">
          <div class="section-heading">${escapeHtml(section.heading)}</div>
          ${
            section.directions
              ? `<div class="section-directions">${escapeHtml(section.directions)}</div>`
              : ""
          }
          ${itemsHtml}
        </section>
      `;
    })
    .join("");

  const answerKeyHtml = artifact.answerKey
    .map((entry, index) => {
      const prompt = questionPromptById.get(entry.questionId) ?? `Question ${index + 1}`;
      return `
        <div class="answer-key-entry">
          <div class="answer-key-question">Question ${index + 1}: ${escapeHtml(prompt)}</div>
          <div class="answer-key-answer"><strong>Answer:</strong> ${escapeHtml(entry.answerText)}</div>
          ${
            entry.explanation.trim().length > 0
              ? `<div class="answer-key-explanation">${escapeHtml(entry.explanation)}</div>`
              : ""
          }
        </div>
      `;
    })
    .join("");

  const bodyHtml =
    mode === "worksheet"
      ? sectionsHtml
      : `
          <section class="section-block">
            <div class="section-heading">Answer Key</div>
            ${answerKeyHtml}
          </section>
        `;

  const title =
    mode === "worksheet" ? artifact.title : `${artifact.title} Answer Key`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page {
        size: Letter;
        margin: 0.65in;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        color: #0f172a;
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: white;
      }

      .sheet {
        width: 100%;
      }

      .header {
        border-bottom: 1px solid #cbd5e1;
        padding-bottom: 18px;
        margin-bottom: 20px;
      }

      .eyebrow {
        font-size: 11px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 8px;
      }

      .title {
        font-size: 28px;
        font-weight: 700;
        line-height: 1.15;
      }

      .subtitle {
        margin-top: 6px;
        color: #475569;
        font-size: 14px;
      }

      .meta {
        margin-top: 14px;
        display: flex;
        gap: 18px;
        flex-wrap: wrap;
        font-size: 12px;
        color: #475569;
      }

      .instructions {
        margin-top: 16px;
        padding: 14px 16px;
        border: 1px solid #dbe4f0;
        background: #f8fafc;
        border-radius: 14px;
        font-size: 14px;
        line-height: 1.6;
      }

      .objectives {
        margin-top: 14px;
        padding-left: 18px;
        color: #334155;
        font-size: 13px;
        line-height: 1.7;
      }

      .section-block {
        margin-top: 22px;
        break-inside: avoid;
      }

      .section-heading {
        font-size: 17px;
        font-weight: 700;
        border-bottom: 1px solid #dbe4f0;
        padding-bottom: 8px;
        margin-bottom: 10px;
      }

      .section-directions {
        margin-bottom: 14px;
        font-size: 13px;
        color: #475569;
        line-height: 1.6;
      }

      .question-block {
        padding: 14px 0 16px;
        border-bottom: 1px solid #e2e8f0;
        break-inside: avoid;
      }

      .question-label {
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #64748b;
        margin-bottom: 8px;
      }

      .question-prompt {
        font-size: 15px;
        line-height: 1.6;
        font-weight: 600;
        margin-bottom: 10px;
      }

      .choice-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 8px;
      }

      .choice-row {
        display: grid;
        grid-template-columns: 18px 18px 1fr;
        gap: 8px;
        align-items: start;
        font-size: 14px;
        line-height: 1.5;
      }

      .choice-mark,
      .choice-label {
        color: #334155;
        font-weight: 600;
      }

      .response-lines {
        display: grid;
        gap: 8px;
      }

      .line {
        min-height: 26px;
        padding-bottom: 4px;
        border-bottom: 1px solid #cbd5e1;
        font-size: 14px;
        line-height: 1.5;
      }

      .note-block {
        margin-top: 12px;
        padding: 10px 12px;
        border: 1px solid #e2e8f0;
        background: #f8fafc;
        border-radius: 12px;
        font-size: 12px;
        color: #334155;
        line-height: 1.5;
      }

      .note-label {
        font-weight: 700;
      }

      .answer-key-entry {
        padding: 14px 0;
        border-bottom: 1px solid #e2e8f0;
        break-inside: avoid;
      }

      .answer-key-question {
        font-size: 15px;
        font-weight: 600;
        line-height: 1.5;
        margin-bottom: 8px;
      }

      .answer-key-answer,
      .answer-key-explanation {
        font-size: 14px;
        line-height: 1.6;
        color: #334155;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <header class="header">
        <div class="eyebrow">Apple Scholar Worksheet</div>
        <div class="title">${escapeHtml(title)}</div>
        ${
          artifact.document.subtitle
            ? `<div class="subtitle">${escapeHtml(artifact.document.subtitle)}</div>`
            : ""
        }
        <div class="meta">
          ${
            artifact.difficulty
              ? `<span>Difficulty: ${escapeHtml(
                  artifact.difficulty[0].toUpperCase() + artifact.difficulty.slice(1),
                )}</span>`
              : ""
          }
          ${
            artifact.estimatedTimeMinutes
              ? `<span>Estimated time: ${artifact.estimatedTimeMinutes} minutes</span>`
              : ""
          }
        </div>
        <div class="instructions">${escapeHtml(artifact.instructions)}</div>
        ${
          artifact.document.learningObjectives.length > 0
            ? `<ul class="objectives">${artifact.document.learningObjectives
                .map((objective) => `<li>${escapeHtml(objective)}</li>`)
                .join("")}</ul>`
            : ""
        }
      </header>
      ${bodyHtml}
    </main>
  </body>
</html>`;
};
