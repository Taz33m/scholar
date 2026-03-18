type FakeShape = {
  id: string;
  type: string;
  x: number;
  y: number;
  parentId?: string;
  isLocked?: boolean;
  props: Record<string, unknown>;
};

const cloneShapeMap = (shapeMap: Map<string, FakeShape>) =>
  new Map(
    Array.from(shapeMap.entries()).map(([id, shape]) => [
      id,
      JSON.parse(JSON.stringify(shape)) as FakeShape,
    ]),
  );

export function createFakeCanvasEditor(initialShapes: FakeShape[]) {
  let shapeMap = new Map(initialShapes.map((shape) => [shape.id, shape]));
  let selectedShapeIds: string[] = [];
  const marks = new Map<
    string,
    { shapes: Map<string, FakeShape>; selectedShapeIds: string[] }
  >();
  let nextMark = 1;

  const editor = {
    getCurrentPageId: () => "page:page",
    getCurrentPageShapes: () => Array.from(shapeMap.values()),
    getShape: (shapeId: string) => shapeMap.get(shapeId),
    getShapePageBounds: (shapeId: string) => {
      const shape = shapeMap.get(shapeId);
      if (!shape) {
        return undefined;
      }

      if (shape.type === "arrow") {
        const start = (shape.props.start ?? { x: shape.x, y: shape.y }) as {
          x: number;
          y: number;
        };
        const end = (shape.props.end ?? { x: shape.x + 80, y: shape.y + 40 }) as {
          x: number;
          y: number;
        };
        return {
          x: Math.min(start.x, end.x),
          y: Math.min(start.y, end.y),
          w: Math.max(1, Math.abs(end.x - start.x)),
          h: Math.max(1, Math.abs(end.y - start.y)),
        };
      }

      if (shape.type === "highlight") {
        const segments = Array.isArray(shape.props.segments)
          ? (shape.props.segments as Array<{
              points?: Array<{ x: number; y: number }>;
            }>)
          : [];
        const points = segments.flatMap((segment) => segment.points ?? []);
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        return {
          x: shape.x + (xs.length > 0 ? Math.min(...xs) : 0),
          y: shape.y + (ys.length > 0 ? Math.min(...ys) : 0),
          w: Math.max(1, xs.length > 0 ? Math.max(...xs) - Math.min(...xs) : 120),
          h: Math.max(1, ys.length > 0 ? Math.max(...ys) - Math.min(...ys) : 16),
        };
      }

      return {
        x: shape.x,
        y: shape.y,
        w:
          typeof shape.props.w === "number"
            ? shape.props.w
            : shape.type === "text"
              ? 160
              : 180,
        h:
          typeof shape.props.h === "number"
            ? shape.props.h
            : shape.type === "text"
              ? 48
              : 96,
      };
    },
    createShapes: (partials: Array<Record<string, unknown>>) => {
      partials.forEach((partial) => {
        const id = String(partial.id);
        shapeMap.set(id, {
          id,
          isLocked: Boolean(partial.isLocked),
          parentId:
            typeof partial.parentId === "string" ? partial.parentId : "page:page",
          props:
            partial.props && typeof partial.props === "object"
              ? ({ ...(partial.props as Record<string, unknown>) })
              : {},
          type: String(partial.type),
          x: typeof partial.x === "number" ? partial.x : 0,
          y: typeof partial.y === "number" ? partial.y : 0,
        });
      });
      return editor;
    },
    updateShapes: (partials: Array<Record<string, unknown>>) => {
      partials.forEach((partial) => {
        const id = String(partial.id);
        const existing = shapeMap.get(id);
        if (!existing) {
          return;
        }

        shapeMap.set(id, {
          ...existing,
          ...(typeof partial.x === "number" ? { x: partial.x } : {}),
          ...(typeof partial.y === "number" ? { y: partial.y } : {}),
          ...(partial.props && typeof partial.props === "object"
            ? {
                props: {
                  ...existing.props,
                  ...(partial.props as Record<string, unknown>),
                },
              }
            : {}),
        });
      });
      return editor;
    },
    putExternalContent: async (info: {
      text: string;
      point?: { x: number; y: number };
      type: string;
    }) => {
      if (info.type !== "text") {
        return;
      }

      const id = `shape:external-${shapeMap.size + 1}`;
      shapeMap.set(id, {
        id,
        parentId: "page:page",
        props: {
          autoSize: true,
          color: "black",
          font: "sans",
          richText: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: info.text }],
              },
            ],
          },
          scale: 1,
          size: "m",
          textAlign: "start",
          w: 180,
        },
        type: "text",
        x: info.point?.x ?? 0,
        y: info.point?.y ?? 0,
      });
    },
    deleteShapes: (ids: string[]) => {
      ids.forEach((id) => {
        shapeMap.delete(id);
      });
      selectedShapeIds = selectedShapeIds.filter((id) => shapeMap.has(id));
      return editor;
    },
    selectNone: () => {
      selectedShapeIds = [];
      return editor;
    },
    select: (...ids: string[]) => {
      selectedShapeIds = ids;
      return editor;
    },
    markHistoryStoppingPoint: () => {
      const markId = `mark-${nextMark++}`;
      marks.set(markId, {
        selectedShapeIds: [...selectedShapeIds],
        shapes: cloneShapeMap(shapeMap),
      });
      return markId;
    },
    bailToMark: (markId: string) => {
      const mark = marks.get(markId);
      if (mark) {
        shapeMap = cloneShapeMap(mark.shapes);
        selectedShapeIds = [...mark.selectedShapeIds];
      }
      return editor;
    },
    run: (fn: () => void) => {
      fn();
      return editor;
    },
    getSelectedShapeIds: () => [...selectedShapeIds],
    snapshot: () =>
      Array.from(shapeMap.values()).map((shape) =>
        JSON.parse(JSON.stringify(shape)),
      ) as FakeShape[],
  };

  return editor;
}
