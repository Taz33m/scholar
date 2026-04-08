const UPLOADED_FILE_DB_NAME = "geminilearn-uploaded-files";
const UPLOADED_FILE_STORE_NAME = "files";

const openUploadedFileDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = window.indexedDB.open(UPLOADED_FILE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(UPLOADED_FILE_STORE_NAME)) {
        database.createObjectStore(UPLOADED_FILE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open uploaded file storage."));
  });

const withUploadedFileStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T> | T,
) => {
  const database = await openUploadedFileDb();

  try {
    const transaction = database.transaction(UPLOADED_FILE_STORE_NAME, mode);
    const store = transaction.objectStore(UPLOADED_FILE_STORE_NAME);
    const result = await callback(store);

    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(
          transaction.error ?? new Error("Uploaded file transaction failed."),
        );
      transaction.onabort = () =>
        reject(
          transaction.error ?? new Error("Uploaded file transaction aborted."),
        );
    });

    return result;
  } finally {
    database.close();
  }
};

export const buildUploadedFileStorageKey = (
  sessionId: string,
  artifactId: string,
) => `uploaded-file:${sessionId}:${artifactId}`;

export const persistUploadedFileBlob = async (
  storageKey: string,
  blob: Blob,
) => {
  await withUploadedFileStore("readwrite", (store) => {
    store.put(blob, storageKey);
  });
};

export const readUploadedFileBlob = async (
  storageKey: string,
): Promise<Blob | null> => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  try {
    return await withUploadedFileStore("readonly", (store) => {
      return new Promise<Blob | null>((resolve, reject) => {
        const request = store.get(storageKey);
        request.onsuccess = () => {
          resolve((request.result as Blob | undefined) ?? null);
        };
        request.onerror = () => {
          reject(
            request.error ?? new Error("Failed to read uploaded file blob."),
          );
        };
      });
    });
  } catch {
    return null;
  }
};

export const removeUploadedFileBlob = async (storageKey: string) => {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return;
  }

  try {
    await withUploadedFileStore("readwrite", (store) => {
      store.delete(storageKey);
    });
  } catch {
    // Ignore cleanup failures.
  }
};
