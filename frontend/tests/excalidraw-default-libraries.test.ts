import { describe, expect, it, vi } from "vitest";

vi.mock("@excalidraw/excalidraw", () => ({
  restoreLibraryItems: (libraryItems: unknown) =>
    Array.isArray(libraryItems)
      ? libraryItems.map((elements, index) => ({
          id: `restored-${index + 1}`,
          status: "published" as const,
          created: 0,
          elements,
        }))
      : [],
}));

import {
  parseBundledExcalidrawLibrary,
  type BundledExcalidrawLibraryDefinition,
} from "@/lib/excalidraw-default-libraries";

const TEST_LIBRARY_DEFINITION: BundledExcalidrawLibraryDefinition = {
  slug: "test-library",
  name: "Test Library",
  path: "/excalidraw-libraries/test-library.excalidrawlib",
  sourceUrl: "https://example.com/test-library.excalidrawlib",
  itemNames: ["Example shape"],
};

const RAW_LIBRARY = JSON.stringify({
  type: "excalidrawlib",
  version: 1,
  library: [
    [
      {
        id: "shape-1",
        type: "rectangle",
        x: 32,
        y: 48,
        width: 120,
        height: 72,
        angle: 0,
        strokeColor: "#000000",
        backgroundColor: "transparent",
        fillStyle: "hachure",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 1,
        opacity: 100,
        groupIds: [],
        strokeSharpness: "sharp",
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElementIds: null,
      },
    ],
  ],
});

describe("parseBundledExcalidrawLibrary", () => {
  it("normalizes library items with stable ids and names", () => {
    const items = parseBundledExcalidrawLibrary(
      TEST_LIBRARY_DEFINITION,
      RAW_LIBRARY,
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: "test-library-1",
      name: "Example shape",
      status: "published",
    });
  });

  it("rejects invalid library files", () => {
    expect(() =>
      parseBundledExcalidrawLibrary(
        TEST_LIBRARY_DEFINITION,
        JSON.stringify({ type: "not-a-library", library: [] }),
      ),
    ).toThrow(/Invalid Excalidraw library file/);
  });
});
