import type { Editor } from "@tldraw/tldraw";

import { canvasSceneSchema, type CanvasScene } from "@/lib/canvas-plan";

const getStringProp = (props: Record<string, unknown>, key: string) => {
  const value = props[key];
  return typeof value === "string" && value.length > 0 ? value : null;
};

const extractPlainTextFromRichText = (value: unknown): string | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const lines: string[] = [];

  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }

    const candidate = node as Record<string, unknown>;
    if (typeof candidate.text === "string" && candidate.text.length > 0) {
      lines.push(candidate.text);
    }

    if (Array.isArray(candidate.content)) {
      candidate.content.forEach(visit);
    }
  };

  visit(value);

  const text = lines.join(" ").replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : null;
};

const getShapeText = (shape: { props?: object }): string | null => {
  if (!shape.props || typeof shape.props !== "object") {
    return null;
  }

  const props = shape.props as Record<string, unknown>;

  if ("richText" in props) {
    const richText = extractPlainTextFromRichText(props.richText);
    if (richText) {
      return richText;
    }
  }

  return getStringProp(props, "text");
};

export function serializeCanvasScene(editor: Editor): CanvasScene {
  const shapes = editor
    .getCurrentPageShapes()
    .map((shape) => {
      const props =
        shape.props && typeof shape.props === "object"
          ? (shape.props as Record<string, unknown>)
          : {};
      const bounds = editor.getShapePageBounds(shape.id);

      return {
        id: shape.id,
        type: shape.type,
        text: getShapeText(shape),
        bounds: bounds
          ? {
              x: bounds.x,
              y: bounds.y,
              w: bounds.w,
              h: bounds.h,
            }
          : null,
        style: {
          color: getStringProp(props, "color"),
          dash: getStringProp(props, "dash"),
          fill: getStringProp(props, "fill"),
        },
        isLocked: Boolean(shape.isLocked),
      };
    })
    .sort((left, right) => {
      const leftY = left.bounds?.y ?? 0;
      const rightY = right.bounds?.y ?? 0;
      if (leftY !== rightY) {
        return leftY - rightY;
      }

      const leftX = left.bounds?.x ?? 0;
      const rightX = right.bounds?.x ?? 0;
      return leftX - rightX;
    });

  return canvasSceneSchema.parse({ shapes });
}
