import { readFile } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
const envRaw = await readFile(envPath, "utf8");

for (const line of envRaw.split(/\r?\n/)) {
  const trimmed = line.trim();

  if (!trimmed || trimmed.startsWith("#")) {
    continue;
  }

  const separatorIndex = trimmed.indexOf("=");

  if (separatorIndex === -1) {
    continue;
  }

  const key = trimmed.slice(0, separatorIndex);
  const value = trimmed.slice(separatorIndex + 1);

  if (!process.env[key]) {
    process.env[key] = value;
  }
}

const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SECRET_KEY?.trim();
const supabaseUrl = process.env.SUPABASE_URL?.trim();

if (!supabaseUrl || !serviceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const demoDataPath = path.join(process.cwd(), "lib", "student-access", "demo-data.json");
const demoData = JSON.parse(await readFile(demoDataPath, "utf8"));
const betaCourse = demoData.courses[0];
const activeExam = betaCourse?.activeExam;

if (!betaCourse || !activeExam) {
  throw new Error("demo-data.json must include one seeded course with one active exam.");
}

const DEFAULT_PROFESSOR = {
  displayName: "Business Ethics and Law Staff",
  email: "bel-beta@applescholar.com",
};

const LEGACY_COURSE_TITLES = [
  "Marketing Principles",
  "Molecular Biology",
  "Operating Systems",
];

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function ensureAuthUser(email, displayName) {
  const listedUsers = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (listedUsers.error) {
    throw listedUsers.error;
  }

  const existingUser = listedUsers.data.users.find(
    (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
  );

  if (existingUser) {
    return existingUser;
  }

  const createdUser = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      name: displayName,
    },
  });

  if (createdUser.error) {
    throw createdUser.error;
  }

  return createdUser.data.user;
}

async function upsertAppUser(user, role, displayName) {
  const upsert = await supabase
    .from("app_users")
    .upsert(
      {
        display_name: displayName,
        email: user.email,
        id: user.id,
        role,
      },
      { onConflict: "id" },
    )
    .select("id, email, role")
    .single();

  if (upsert.error) {
    throw upsert.error;
  }

  return upsert.data;
}

async function cleanupLegacyCourses(studentUserId) {
  const legacyCoursesResult = await supabase
    .from("courses")
    .select("id, title")
    .in("title", LEGACY_COURSE_TITLES);

  if (legacyCoursesResult.error) {
    throw legacyCoursesResult.error;
  }

  const legacyCourseIds = (legacyCoursesResult.data ?? []).map((course) => course.id);

  if (legacyCourseIds.length > 0) {
    const deleteLegacyEvidence = await supabase
      .from("student_session_learning_evidence")
      .delete()
      .in("course_id", legacyCourseIds);

    if (deleteLegacyEvidence.error && deleteLegacyEvidence.error.code !== "42P01") {
      throw deleteLegacyEvidence.error;
    }

    const deleteLegacyObjectives = await supabase
      .from("student_session_objectives")
      .delete()
      .in("course_id", legacyCourseIds);

    if (deleteLegacyObjectives.error && deleteLegacyObjectives.error.code !== "42P01") {
      throw deleteLegacyObjectives.error;
    }

    const deleteLegacyConceptProgress = await supabase
      .from("student_concept_progress")
      .delete()
      .in("course_id", legacyCourseIds);

    if (
      deleteLegacyConceptProgress.error &&
      deleteLegacyConceptProgress.error.code !== "42P01"
    ) {
      throw deleteLegacyConceptProgress.error;
    }

    const deleteLegacySessions = await supabase
      .from("student_session_summaries")
      .delete()
      .in("course_id", legacyCourseIds);

    if (deleteLegacySessions.error) {
      throw deleteLegacySessions.error;
    }

    const deleteLegacyEnrollments = await supabase
      .from("course_enrollments")
      .delete()
      .in("course_id", legacyCourseIds);

    if (deleteLegacyEnrollments.error) {
      throw deleteLegacyEnrollments.error;
    }

    const deleteLegacyCourses = await supabase
      .from("courses")
      .delete()
      .in("id", legacyCourseIds);

    if (deleteLegacyCourses.error) {
      throw deleteLegacyCourses.error;
    }
  }

  const deleteStudentEvidence = await supabase
    .from("student_session_learning_evidence")
    .delete()
    .eq("student_user_id", studentUserId);

  if (deleteStudentEvidence.error && deleteStudentEvidence.error.code !== "42P01") {
    throw deleteStudentEvidence.error;
  }

  const deleteStudentObjectives = await supabase
    .from("student_session_objectives")
    .delete()
    .eq("student_user_id", studentUserId);

  if (deleteStudentObjectives.error && deleteStudentObjectives.error.code !== "42P01") {
    throw deleteStudentObjectives.error;
  }

  const deleteStudentConceptProgress = await supabase
    .from("student_concept_progress")
    .delete()
    .eq("student_user_id", studentUserId);

  if (
    deleteStudentConceptProgress.error &&
    deleteStudentConceptProgress.error.code !== "42P01"
  ) {
    throw deleteStudentConceptProgress.error;
  }

  const deleteStudentSessions = await supabase
    .from("student_session_summaries")
    .delete()
    .eq("student_user_id", studentUserId);

  if (deleteStudentSessions.error) {
    throw deleteStudentSessions.error;
  }
}

async function main() {
  const studentAuthUser = await ensureAuthUser(
    demoData.student.email,
    demoData.student.displayName,
  );
  const professorAuthUser = await ensureAuthUser(
    DEFAULT_PROFESSOR.email,
    DEFAULT_PROFESSOR.displayName,
  );

  const studentUser = await upsertAppUser(
    studentAuthUser,
    "student",
    demoData.student.displayName,
  );
  const professorUser = await upsertAppUser(
    professorAuthUser,
    "professor",
    DEFAULT_PROFESSOR.displayName,
  );

  await cleanupLegacyCourses(studentUser.id);

  const courseUpsert = await supabase
    .from("courses")
    .upsert(
      {
        color_token: betaCourse.colorToken,
        course_code: betaCourse.courseCode,
        description: betaCourse.description,
        meeting_pattern: betaCourse.meetingPattern,
        professor_user_id: professorUser.id,
        slug: betaCourse.slug,
        term_label: betaCourse.termLabel,
        time_zone: betaCourse.timeZone,
        title: betaCourse.title,
        is_active: true,
      },
      { onConflict: "slug" },
    )
    .select("id, slug, title")
    .single();

  if (courseUpsert.error) {
    throw courseUpsert.error;
  }

  const course = courseUpsert.data;

  const enrollmentUpsert = await supabase
    .from("course_enrollments")
    .upsert(
      {
        activated_at: new Date().toISOString(),
        course_id: course.id,
        status: "active",
        student_email: demoData.student.email,
        student_user_id: studentUser.id,
      },
      { onConflict: "course_id,student_email" },
    )
    .select("id")
    .single();

  if (enrollmentUpsert.error) {
    throw enrollmentUpsert.error;
  }

  const examUpsert = await supabase
    .from("course_exams")
    .upsert(
      {
        course_id: course.id,
        exam_kind: activeExam.examKind,
        focus_topics: activeExam.focusTopics,
        scheduled_for: activeExam.scheduledFor,
        scope_summary: activeExam.scopeSummary,
        slug: activeExam.slug,
        status: "active",
        title: activeExam.title,
      },
      { onConflict: "course_id,slug" },
    )
    .select("id, slug, title")
    .single();

  if (examUpsert.error) {
    throw examUpsert.error;
  }

  const deleteOnboarding = await supabase
    .from("student_course_onboarding")
    .delete()
    .eq("student_user_id", studentUser.id)
    .eq("course_id", course.id);

  if (deleteOnboarding.error) {
    throw deleteOnboarding.error;
  }

  console.log(
    JSON.stringify(
      {
        activeEnrollment: demoData.student.email,
        courseId: course.id,
        courseSlug: course.slug,
        examId: examUpsert.data.id,
        examSlug: examUpsert.data.slug,
        professorUserId: professorUser.id,
        studentUserId: studentUser.id,
        studentSessionsDeleted: true,
      },
      null,
      2,
    ),
  );
}

await main();
