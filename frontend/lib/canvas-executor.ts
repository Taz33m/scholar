import {
  createShapeId,
  toRichText,
  type Editor,
  type TLShape,
  type TLShapeId,
} from "@tldraw/tldraw";

import type { CanvasColor, CanvasPlan } from "@/lib/canvas-plan";

type CanvasEditor = Pick<
  Editor,
  | "bailToMark"
  | "createShapes"
  | "deleteShapes"
  | "getCurrentPageId"
  | "getCurrentPageShapes"
  | "getShape"
  | "getShapePageBounds"
  | "markHistoryStoppingPoint"
  | "putExternalContent"
  | "run"
  | "select"
  | "selectNone"
  | "updateShapes"
>;

export interface ExecuteCanvasPlanResult {
  summary: string;
  operationCount: number;
  changedShapeIds: TLShapeId[];
}

const DEFAULT_COLOR: CanvasColor = "blue";
const DEFAULT_TEXT_COLOR: CanvasColor = "black";

const createTextWidth = (text: string) =>
  Math.max(140, Math.min(320, text.length * 8));

const getShapeCenter = (shape: TLShape, editor: CanvasEditor) => {
  const bounds = editor.getShapePageBounds(shape.id);
  if (!bounds) {
    throw new Error(`Shape ${shape.id} has no page bounds`);
  }

  return {
    x: bounds.x + bounds.w / 2,
    y: bounds.y + bounds.h / 2,
    bounds,
  };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const resolveEmphasisBounds = (
  shape: TLShape,
  editor: CanvasEditor,
  region?: { x: number; y: number; w: number; h: number },
) => {
  const { bounds } = getShapeCenter(shape, editor);
  if (!region) {
    return bounds;
  }

  const x = clamp(region.x, 0, 1);
  const y = clamp(region.y, 0, 1);
  const w = clamp(region.w, 0.05, 1);
  const h = clamp(region.h, 0.05, 1);

  const maxWidth = Math.max(1, 1 - x);
  const maxHeight = Math.max(1, 1 - y);
  const normalizedWidth = Math.min(w, maxWidth);
  const normalizedHeight = Math.min(h, maxHeight);

  return {
    x: bounds.x + bounds.w * x,
    y: bounds.y + bounds.h * y,
    w: Math.max(16, bounds.w * normalizedWidth),
    h: Math.max(16, bounds.h * normalizedHeight),
  };
};

const resolveShapeRef = (
  editor: CanvasEditor,
  aliases: Map<string, TLShapeId>,
  shapeRef: string,
) => {
  const resolvedId = aliases.get(shapeRef) ?? (shapeRef as TLShapeId);
  const shape = editor.getShape(resolvedId);
  if (!shape) {
    throw new Error(`Canvas shape not found: ${shapeRef}`);
  }

  return shape;
};

const supportsRichText = (shape: TLShape) => {
  const props =
    shape.props && typeof shape.props === "object"
      ? (shape.props as Record<string, unknown>)
      : null;

  return Boolean(props && "richText" in props);
};

const createAnnotationPosition = (
  shape: TLShape,
  editor: CanvasEditor,
  placement: "above" | "below" | "left" | "right" | "center",
  text: string,
) => {
  const { bounds } = getShapeCenter(shape, editor);
  const width = createTextWidth(text);
  const gap = 24;

  switch (placement) {
    case "above":
      return {
        x: Math.max(24, bounds.x),
        y: Math.max(24, bounds.y - gap - 24),
        width,
      };
    case "below":
      return {
        x: Math.max(24, bounds.x),
        y: Math.max(24, bounds.y + bounds.h + gap),
        width,
      };
    case "left":
      return {
        x: Math.max(24, bounds.x - width - gap),
        y: Math.max(24, bounds.y),
        width,
      };
    case "right":
      return {
        x: Math.max(24, bounds.x + bounds.w + gap),
        y: Math.max(24, bounds.y),
        width,
      };
    case "center":
    default:
      return {
        x: Math.max(24, bounds.x + bounds.w / 2 - width / 2),
        y: Math.max(24, bounds.y + bounds.h / 2 - 20),
        width,
      };
  }
};

const createTextShape = async (
  editor: CanvasEditor,
  {
    text,
    x,
    y,
    color = DEFAULT_TEXT_COLOR,
    width = createTextWidth(text),
  }: {
    text: string;
    x: number;
    y: number;
    color?: CanvasColor;
    width?: number;
  },
) => {
  const beforeIds = new Set(editor.getCurrentPageShapes().map((shape) => shape.id));
  await editor.putExternalContent(
    {
      type: "text",
      point: { x, y },
      text,
    },
    { force: true },
  );

  const created = editor
    .getCurrentPageShapes()
    .find((shape) => !beforeIds.has(shape.id) && shape.type === "text");

  if (created) {
    editor.updateShapes([
      {
        id: created.id,
        type: created.type,
        props: {
          ...(created.props as Record<string, unknown>),
          autoSize: false,
          color,
          font: "sans",
          richText: toRichText(text),
          size: "m",
          textAlign: "start",
          w: width,
        },
      },
    ]);
    return created.id;
  }

  const shapeId = createShapeId();
  editor.createShapes([
    {
      id: shapeId,
      parentId: editor.getCurrentPageId(),
      type: "text",
      x,
      y,
      props: {
        autoSize: false,
        color,
        font: "sans",
        richText: toRichText(text),
        scale: 1,
        size: "m",
        textAlign: "start",
        w: width,
      },
    },
  ]);
  return shapeId;
};

const createGeoShape = (
  editor: CanvasEditor,
  {
    shape,
    text,
    x,
    y,
    w,
    h,
    color = DEFAULT_COLOR,
    fill = "none",
    dash = "solid",
  }: {
    shape: "rectangle" | "ellipse" | "diamond";
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    color?: CanvasColor;
    fill?: "none" | "semi" | "solid" | "fill" | "pattern";
    dash?: "solid" | "dashed" | "dotted" | "draw";
  },
) => {
  const shapeId = createShapeId();
  editor.createShapes([
    {
      id: shapeId,
      parentId: editor.getCurrentPageId(),
      type: "geo",
      x,
      y,
      props: {
        align: "middle",
        color,
        dash,
        fill,
        font: "draw",
        geo: shape,
        growY: 0,
        h,
        labelColor: DEFAULT_TEXT_COLOR,
        richText: toRichText(text),
        scale: 1,
        size: "m",
        url: "",
        verticalAlign: "middle",
        w,
      },
    },
  ]);
  return shapeId;
};

const createArrowShape = (
  editor: CanvasEditor,
  {
    start,
    end,
    label,
    color = DEFAULT_COLOR,
  }: {
    start: { x: number; y: number };
    end: { x: number; y: number };
    label?: string;
    color?: CanvasColor;
  },
) => {
  const shapeId = createShapeId();
  editor.createShapes([
    {
      id: shapeId,
      parentId: editor.getCurrentPageId(),
      type: "arrow",
      x: 0,
      y: 0,
      props: {
        arrowheadEnd: "arrow",
        arrowheadStart: "none",
        bend: 0,
        color,
        dash: "solid",
        end,
        fill: "none",
        font: "draw",
        kind: "arc",
        labelColor: DEFAULT_TEXT_COLOR,
        labelPosition: 0.5,
        richText: toRichText(label ?? ""),
        scale: 1,
        size: "m",
        start,
      },
    },
  ]);
  return shapeId;
};

const createHighlightShape = (
  editor: CanvasEditor,
  {
    bounds,
    color = "yellow",
  }: {
    bounds: { x: number; y: number; w: number; h: number };
    color?: CanvasColor;
  },
) => {
  const shapeId = createShapeId();
  const lineCount = bounds.h > 120 ? 2 : 1;
  const step = lineCount === 1 ? 0 : bounds.h / (lineCount + 1);
  const left = Math.max(0, bounds.x - 8);
  const width = Math.max(48, bounds.w + 16);

  editor.createShapes([
    {
      id: shapeId,
      parentId: editor.getCurrentPageId(),
      type: "highlight",
      x: left,
      y: Math.max(0, bounds.y + bounds.h / 2 - 8),
      props: {
        color,
        isComplete: true,
        isPen: false,
        scale: 1,
        segments: Array.from({ length: lineCount }, (_, index) => {
          const y = lineCount === 1 ? 0 : step * (index + 1) - bounds.h / 2;
          return {
            type: "straight",
            points: [
              { x: 0, y, z: 0.5 },
              { x: width, y, z: 0.5 },
            ],
          };
        }),
        size: "l",
      },
    },
  ]);
  return shapeId;
};

export async function executeCanvasPlan(
  editor: CanvasEditor,
  plan: CanvasPlan,
): Promise<ExecuteCanvasPlanResult> {
  const changedShapeIds = new Set<TLShapeId>();
  const aliases = new Map<string, TLShapeId>();
  const markId = editor.markHistoryStoppingPoint("canvas-specialist");

  try {
    for (const operation of plan.operations) {
      switch (operation.type) {
        case "annotate": {
          const target = resolveShapeRef(
            editor,
            aliases,
            operation.targetShapeRef,
          );
          const position = createAnnotationPosition(
            target,
            editor,
            operation.placement,
            operation.text,
          );
          const shapeId = await createTextShape(editor, {
            color: operation.color ?? DEFAULT_TEXT_COLOR,
            text: operation.text,
            width: position.width,
            x: position.x,
            y: position.y,
          });
          changedShapeIds.add(shapeId);
          break;
        }
        case "emphasize": {
          const target = resolveShapeRef(
            editor,
            aliases,
            operation.targetShapeRef,
          );
          const bounds = resolveEmphasisBounds(
            target,
            editor,
            operation.region,
          );
          const shapeId =
            operation.style === "highlight"
              ? createHighlightShape(editor, {
                  bounds,
                  color: operation.color ?? "yellow",
                })
              : createGeoShape(editor, {
                  color: operation.color ?? "orange",
                  dash: "dashed",
                  fill: "none",
                  h: Math.max(48, bounds.h + 40),
                  shape:
                    operation.style === "circle"
                      ? "ellipse"
                      : "rectangle",
                  text: "",
                  w: Math.max(64, bounds.w + 40),
                  x: bounds.x - 20,
                  y: bounds.y - 20,
                });
          changedShapeIds.add(shapeId);
          break;
        }
        case "connect": {
          const fromShape = resolveShapeRef(
            editor,
            aliases,
            operation.fromShapeRef,
          );
          const toShape = resolveShapeRef(editor, aliases, operation.toShapeRef);
          const from = getShapeCenter(fromShape, editor);
          const to = getShapeCenter(toShape, editor);
          const shapeId = createArrowShape(editor, {
            color: operation.color ?? DEFAULT_COLOR,
            end: { x: to.x, y: to.y },
            label: operation.label,
            start: { x: from.x, y: from.y },
          });
          changedShapeIds.add(shapeId);
          break;
        }
        case "create_node": {
          if (aliases.has(operation.tempId)) {
            throw new Error(`Duplicate tempId in canvas plan: ${operation.tempId}`);
          }
          const shapeId = createGeoShape(editor, {
            color: operation.color ?? DEFAULT_COLOR,
            h: operation.h ?? 110,
            shape: operation.shape,
            text: operation.text,
            w: operation.w ?? 220,
            x: operation.x,
            y: operation.y,
          });
          aliases.set(operation.tempId, shapeId);
          changedShapeIds.add(shapeId);
          break;
        }
        case "replace_text": {
          const target = resolveShapeRef(
            editor,
            aliases,
            operation.targetShapeRef,
          );
          if (!supportsRichText(target)) {
            throw new Error(
              `Shape ${operation.targetShapeRef} does not support text replacement`,
            );
          }

          editor.run(() => {
            editor.updateShapes([
              {
                id: target.id,
                type: target.type,
                props: {
                  ...(target.props as Record<string, unknown>),
                  richText: toRichText(operation.text),
                },
              },
            ]);
          }, { ignoreShapeLock: true });
          changedShapeIds.add(target.id);
          break;
        }
        case "move": {
          const target = resolveShapeRef(
            editor,
            aliases,
            operation.targetShapeRef,
          );
          const bounds = editor.getShapePageBounds(target.id);
          if (!bounds) {
            throw new Error(
              `Shape ${operation.targetShapeRef} cannot be moved because it has no bounds`,
            );
          }

          editor.run(() => {
            editor.updateShapes([
              {
                id: target.id,
                type: target.type,
                x: target.x + (operation.x - bounds.x),
                y: target.y + (operation.y - bounds.y),
              },
            ]);
          }, { ignoreShapeLock: true });
          changedShapeIds.add(target.id);
          break;
        }
        case "delete": {
          const target = resolveShapeRef(
            editor,
            aliases,
            operation.targetShapeRef,
          );
          editor.run(() => {
            editor.deleteShapes([target.id]);
          }, { ignoreShapeLock: true });
          changedShapeIds.delete(target.id);
          break;
        }
      }
    }
  } catch (error) {
    editor.bailToMark(markId);
    throw error instanceof Error
      ? error
      : new Error("Failed to execute canvas plan");
  }

  if (changedShapeIds.size > 0) {
    editor.selectNone();
    editor.select(...Array.from(changedShapeIds));
  }

  return {
    changedShapeIds: Array.from(changedShapeIds),
    operationCount: plan.operations.length,
    summary: plan.summary,
  };
}
