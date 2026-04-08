type SearchParamValue = string | string[] | undefined;

export type StudentRouteSearchParams = Promise<Record<string, SearchParamValue>>;

function readSingleSearchParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeDay(value: string | undefined) {
  if (!value) {
    return null;
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function readStudentFilterParams(searchParams: StudentRouteSearchParams) {
  const params = await searchParams;

  return {
    courseId: readSingleSearchParam(params.courseId) ?? null,
    day: normalizeDay(readSingleSearchParam(params.day)),
  };
}
