import type { CanvasAdapter, CanvasFixture } from "@/lib/canvas-adapter";
import type { ExecuteCanvasPlanResult } from "@/lib/canvas-executor";
import {
  canvasSceneSchema,
  type CanvasPlan,
  type CanvasScene,
} from "@/lib/canvas-plan";

const DEFAULT_GEO_WIDTH = 220;
const DEFAULT_GEO_HEIGHT = 110;

type CanvasShape = CanvasScene["shapes"][number];

const cloneScene = (scene: CanvasScene): CanvasScene =>
  canvasSceneSchema.parse(JSON.parse(JSON.stringify(scene)));

const createShapeId = (prefix: string, nextIndex: () => number) =>
  `${prefix}:${nextIndex()}`;

const fixtureShapeToSceneShape = (
  fixtureShape: CanvasFixture["shapes"][number],
  nextId: () => number,
): CanvasShape => ({
  id: fixtureShape.id ?? createShapeId("shape", nextId),
  type: fixtureShape.type ?? "geo",
  text: fixtureShape.text,
  bounds: {
    x: fixtureShape.x,
    y: fixtureShape.y,
    w:
      fixtureShape.type === "text"
        ? fixtureShape.w ?? 180
        : fixtureShape.w ?? DEFAULT_GEO_WIDTH,
    h:
      fixtureShape.type === "text"
        ? fixtureShape.h ?? 48
        : fixtureShape.h ?? DEFAULT_GEO_HEIGHT,
  },
  style: {
    color: fixtureShape.color ?? (fixtureShape.type === "text" ? "black" : "blue"),
    dash: "solid",
    fill: fixtureShape.type === "text" ? null : "none",
  },
  isLocked: false,
});

const expandBounds = (
  bounds: NonNullable<CanvasShape["bounds"]>,
  padding: number,
) => ({
  x: bounds.x - padding,
  y: bounds.y - padding,
  w: bounds.w + padding * 2,
  h: bounds.h + padding * 2,
});

export function createFakeCanvasAdapter(
  initialFixture: CanvasFixture = { shapes: [] },
  options?: {
    imageData?: string;
  },
) {
  let nextGeneratedId = 1;
  const nextId = () => nextGeneratedId++;
  let persistedScene: CanvasScene | null = null;
  let imageData = options?.imageData ?? "data:image/png;base64,fake-canvas";

  let scene = cloneScene({
    shapes: initialFixture.shapes.map((shape) => fixtureShapeToSceneShape(shape, nextId)),
  });

  const applyPlan = async (
    plan: CanvasPlan,
  ): Promise<ExecuteCanvasPlanResult> => {
    const nextScene = cloneScene(scene);
    const changedShapeIds = new Set<string>();
    const aliases = new Map<string, string>();

    const findShape = (shapeRef: string) => {
      const resolvedId = aliases.get(shapeRef) ?? shapeRef;
      const shape = nextScene.shapes.find((entry) => entry.id === resolvedId);
      if (!shape) {
        throw new Error(`Canvas shape not found: ${shapeRef}`);
      }
      return shape;
    };

    for (const operation of plan.operations) {
      switch (operation.type) {
        case "annotate": {
          const target = findShape(operation.targetShapeRef);
          const bounds = target.bounds;
          if (!bounds) {
            throw new Error(`Canvas shape not found: ${operation.targetShapeRef}`);
          }

          nextScene.shapes.push({
            id: createShapeId("annotation", nextId),
            type: "text",
            text: operation.text,
            bounds: {
              x:
                operation.placement === "right"
                  ? bounds.x + bounds.w + 24
                  : operation.placement === "left"
                    ? Math.max(24, bounds.x - 204)
                    : bounds.x,
              y:
                operation.placement === "above"
                  ? Math.max(24, bounds.y - 44)
                  : operation.placement === "below"
                    ? bounds.y + bounds.h + 24
                    : bounds.y,
              w: 180,
              h: 40,
            },
            style: {
              color: operation.color ?? "black",
              dash: "solid",
              fill: null,
            },
            isLocked: false,
          });
          changedShapeIds.add(nextScene.shapes.at(-1)!.id);
          break;
        }
        case "emphasize": {
          const target = findShape(operation.targetShapeRef);
          const bounds = target.bounds;
          if (!bounds) {
            throw new Error(`Canvas shape not found: ${operation.targetShapeRef}`);
          }

          const region = operation.region
            ? {
                x: bounds.x + bounds.w * operation.region.x,
                y: bounds.y + bounds.h * operation.region.y,
                w: Math.max(16, bounds.w * operation.region.w),
                h: Math.max(16, bounds.h * operation.region.h),
              }
            : bounds;

          nextScene.shapes.push({
            id: createShapeId("emphasis", nextId),
            type: "geo",
            text: null,
            bounds:
              operation.style === "highlight"
                ? region
                : expandBounds(region, 20),
            style: {
              color:
                operation.color ??
                (operation.style === "highlight" ? "yellow" : "orange"),
              dash: operation.style === "highlight" ? "solid" : "dashed",
              fill: operation.style === "highlight" ? "solid" : "none",
            },
            isLocked: false,
          });
          changedShapeIds.add(nextScene.shapes.at(-1)!.id);
          break;
        }
        case "connect": {
          const from = findShape(operation.fromShapeRef);
          const to = findShape(operation.toShapeRef);
          const fromBounds = from.bounds;
          const toBounds = to.bounds;
          if (!fromBounds || !toBounds) {
            throw new Error("Canvas shape not found");
          }

          nextScene.shapes.push({
            id: createShapeId("arrow", nextId),
            type: "arrow",
            text: operation.label ?? null,
            bounds: {
              x: Math.min(fromBounds.x, toBounds.x),
              y: Math.min(fromBounds.y, toBounds.y),
              w: Math.max(1, Math.abs(toBounds.x - fromBounds.x)),
              h: Math.max(1, Math.abs(toBounds.y - fromBounds.y)),
            },
            style: {
              color: operation.color ?? "black",
              dash: "solid",
              fill: null,
            },
            isLocked: false,
          });
          changedShapeIds.add(nextScene.shapes.at(-1)!.id);
          break;
        }
        case "create_node": {
          const shapeId = createShapeId("node", nextId);
          aliases.set(operation.tempId, shapeId);
          nextScene.shapes.push({
            id: shapeId,
            type: "geo",
            text: operation.text,
            bounds: {
              x: operation.x,
              y: operation.y,
              w: operation.w ?? DEFAULT_GEO_WIDTH,
              h: operation.h ?? DEFAULT_GEO_HEIGHT,
            },
            style: {
              color: operation.color ?? "blue",
              dash: "solid",
              fill: "none",
            },
            isLocked: false,
          });
          changedShapeIds.add(shapeId);
          break;
        }
        case "replace_text": {
          const target = findShape(operation.targetShapeRef);
          target.text = operation.text;
          changedShapeIds.add(target.id);
          break;
        }
        case "move": {
          const target = findShape(operation.targetShapeRef);
          if (!target.bounds) {
            throw new Error(`Canvas shape not found: ${operation.targetShapeRef}`);
          }
          target.bounds = {
            ...target.bounds,
            x: operation.x,
            y: operation.y,
          };
          changedShapeIds.add(target.id);
          break;
        }
        case "delete": {
          const target = findShape(operation.targetShapeRef);
          nextScene.shapes = nextScene.shapes.filter((shape) => shape.id !== target.id);
          changedShapeIds.delete(target.id);
          break;
        }
      }
    }

    scene = cloneScene(nextScene);
    return {
      summary: plan.summary,
      appliedOperationCount: plan.operations.length,
      operationCount: plan.operations.length,
      changedShapeIds: Array.from(changedShapeIds),
      skippedOperations: [],
    };
  };

  const adapter: CanvasAdapter = {
    isReady: () => true,
    serializeScene: () => cloneScene(scene),
    captureImage: async () => {
      if (scene.shapes.length === 0) {
        throw new Error("Canvas is empty");
      }

      return imageData;
    },
    applyPlan,
    clearScene: async () => {
      scene = { shapes: [] };
    },
    seedFixture: async (fixture) => {
      const nextShapes = fixture.shapes.map((shape) =>
        fixtureShapeToSceneShape(shape, nextId),
      );
      scene = cloneScene({
        shapes:
          fixture.clearExisting === false
            ? [...scene.shapes, ...nextShapes]
            : nextShapes,
      });
    },
    loadPersistedScene: async () => {
      if (persistedScene) {
        scene = cloneScene(persistedScene);
      }
    },
    removePersistedScene: () => {
      persistedScene = null;
    },
    refresh: () => {},
  };

  return {
    adapter,
    snapshot: () => cloneScene(scene).shapes,
    setImageData: (nextImageData: string) => {
      imageData = nextImageData;
    },
    setPersistedScene: (nextScene: CanvasScene) => {
      persistedScene = cloneScene(nextScene);
    },
  };
}
