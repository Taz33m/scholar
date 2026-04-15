import Ajv from "ajv";
import addFormats from "ajv-formats";

import {
  TUTOR_RUNTIME_COURSE_BRAIN_SCHEMA,
  TUTOR_RUNTIME_STUDENT_STATE_SCHEMA,
} from "@/lib/tutor-runtime/generated-spec";
import type {
  PromptCourseBrain,
  PromptStudentState,
} from "@/lib/tutor-runtime/types";

export interface PromptValidationResult<T> {
  valid: boolean;
  data: T | null;
  errors: string[];
}

const ajv = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
  strict: false,
});

addFormats(ajv);

const validateCourseBrainSchema = ajv.compile<PromptCourseBrain>(
  TUTOR_RUNTIME_COURSE_BRAIN_SCHEMA as object,
);
const validateStudentStateSchema = ajv.compile<PromptStudentState>(
  TUTOR_RUNTIME_STUDENT_STATE_SCHEMA as object,
);

const formatErrors = (errors: typeof validateCourseBrainSchema.errors) =>
  (errors ?? []).map((error) => {
    const path = error.instancePath || "/";
    return `${path} ${error.message ?? "is invalid"}`.trim();
  });

export const validatePromptCourseBrain = (
  value: unknown,
): PromptValidationResult<PromptCourseBrain> => {
  const valid = validateCourseBrainSchema(value);
  return {
    valid,
    data: valid ? (value as PromptCourseBrain) : null,
    errors: valid ? [] : formatErrors(validateCourseBrainSchema.errors),
  };
};

export const validatePromptStudentState = (
  value: unknown,
): PromptValidationResult<PromptStudentState> => {
  const valid = validateStudentStateSchema(value);
  return {
    valid,
    data: valid ? (value as PromptStudentState) : null,
    errors: valid ? [] : formatErrors(validateStudentStateSchema.errors),
  };
};
