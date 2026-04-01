import { restoreLibraryItems } from "@excalidraw/excalidraw";

import type { LibraryItem } from "@excalidraw/excalidraw/types";

export interface BundledExcalidrawLibraryDefinition {
  slug: string;
  name: string;
  path: string;
  sourceUrl: string;
  itemNames?: readonly string[];
}

interface RawExcalidrawLibraryFile {
  type?: string;
  version?: number;
  library?: unknown;
}

const BUNDLED_EXCALIDRAW_LIBRARY_CREATED_AT = Date.parse(
  "2026-03-31T00:00:00.000Z",
);

export const BUNDLED_EXCALIDRAW_LIBRARIES: readonly BundledExcalidrawLibraryDefinition[] =
  [
    {
      slug: "charts",
      name: "Charts",
      path: "/excalidraw-libraries/charts.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/g-script/charts.excalidrawlib",
    },
    {
      slug: "graphs",
      name: "Graphs",
      path: "/excalidraw-libraries/graphs.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/jakubpawlina/graphs.excalidrawlib",
    },
    {
      slug: "mathematical-symbols",
      name: "Mathematical Symbols",
      path: "/excalidraw-libraries/mathematical-symbols.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/jjadup/mathematical-symbols.excalidrawlib",
    },
    {
      slug: "math-teacher-library",
      name: "Math Teacher Library",
      path: "/excalidraw-libraries/math-teacher-library.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/https-github-com-ytrkptl/math-teacher-library.excalidrawlib",
    },
    {
      slug: "montessori-basic-grammar-symbols",
      name: "Montessori Basic Grammar Symbols",
      path: "/excalidraw-libraries/montessori-basic-grammar-symbols.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/alluvion/montessori-basic-grammar-symbols.excalidrawlib",
    },
    {
      slug: "organic-chemistry-basics",
      name: "Organic Chemistry Basics",
      path: "/excalidraw-libraries/organic-chemistry-basics.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/thrsz/organic-chemistry-basics.excalidrawlib",
    },
    {
      slug: "software-architecture",
      name: "Software Architecture",
      path: "/excalidraw-libraries/software-architecture.excalidrawlib",
      sourceUrl:
        "https://github.com/excalidraw/excalidraw-libraries/tree/main/libraries/youritjang/software-architecture.excalidrawlib",
    },
  ] as const;

let bundledLibraryItemsPromise: Promise<LibraryItem[]> | null = null;
let bundledLibraryBlobsPromise: Promise<
  Array<{
    definition: BundledExcalidrawLibraryDefinition;
    blob: Blob;
  }>
> | null = null;

export function parseBundledExcalidrawLibrary(
  definition: BundledExcalidrawLibraryDefinition,
  rawText: string,
): LibraryItem[] {
  const parsed = JSON.parse(rawText) as RawExcalidrawLibraryFile;
  if (parsed.type !== "excalidrawlib" || !Array.isArray(parsed.library)) {
    throw new Error(`Invalid Excalidraw library file for "${definition.slug}"`);
  }

  return restoreLibraryItems(
    parsed.library as Parameters<typeof restoreLibraryItems>[0],
    "published",
  ).map((item, index) => ({
    ...item,
    id: `${definition.slug}-${index + 1}`,
    name:
      definition.itemNames?.[index] ?? item.name ?? `${definition.name} ${index + 1}`,
    status: "published",
    created: item.created || BUNDLED_EXCALIDRAW_LIBRARY_CREATED_AT,
  }));
}

async function fetchBundledExcalidrawLibrary(
  definition: BundledExcalidrawLibraryDefinition,
): Promise<LibraryItem[]> {
  const response = await fetch(definition.path, {
    cache: "force-cache",
  });
  if (!response.ok) {
    throw new Error(
      `Unable to load ${definition.slug} library (${response.status})`,
    );
  }

  const rawText = await response.text();
  return parseBundledExcalidrawLibrary(definition, rawText);
}

export async function loadBundledExcalidrawLibraryItems(): Promise<LibraryItem[]> {
  if (typeof window === "undefined") {
    return [];
  }

  if (!bundledLibraryItemsPromise) {
    bundledLibraryItemsPromise = Promise.all(
      BUNDLED_EXCALIDRAW_LIBRARIES.map(fetchBundledExcalidrawLibrary),
    )
      .then((libraryGroups) => libraryGroups.flat())
      .catch((error) => {
        bundledLibraryItemsPromise = null;
        if (process.env.NODE_ENV !== "production") {
          console.warn("Failed to load bundled Excalidraw libraries.", error);
        }
        return [];
      });
  }

  return bundledLibraryItemsPromise;
}

export async function loadBundledExcalidrawLibraryBlobs(): Promise<
  Array<{
    definition: BundledExcalidrawLibraryDefinition;
    blob: Blob;
  }>
> {
  if (typeof window === "undefined") {
    return [];
  }

  if (!bundledLibraryBlobsPromise) {
    bundledLibraryBlobsPromise = Promise.all(
      BUNDLED_EXCALIDRAW_LIBRARIES.map(async (definition) => {
        const response = await fetch(definition.path, {
          cache: "force-cache",
        });
        if (!response.ok) {
          throw new Error(
            `Unable to load ${definition.slug} library (${response.status})`,
          );
        }

        return {
          definition,
          blob: await response.blob(),
        };
      }),
    ).catch((error) => {
      bundledLibraryBlobsPromise = null;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "Failed to load bundled Excalidraw library blobs.",
          error,
        );
      }
      return [];
    });
  }

  return bundledLibraryBlobsPromise;
}
