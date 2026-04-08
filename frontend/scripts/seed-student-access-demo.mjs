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
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function buildSessionTimestamps(relativeDaysAgo, hour, minute) {
  const startedAt = new Date();
  startedAt.setHours(hour, minute, 0, 0);
  startedAt.setDate(startedAt.getDate() - relativeDaysAgo);
  const endedAt = new Date(startedAt);
  endedAt.setMinutes(endedAt.getMinutes() + 48);

  return {
    endedAt: endedAt.toISOString(),
    lastActivityAt: endedAt.toISOString(),
    startedAt: startedAt.toISOString(),
  };
}

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

async function main() {
  const studentAuthUser = await ensureAuthUser(
    demoData.student.email,
    demoData.student.displayName,
  );

  const studentUpsert = await supabase
    .from("app_users")
    .upsert(
      {
        display_name: demoData.student.displayName,
        email: demoData.student.email,
        id: studentAuthUser.id,
        role: "student",
      },
      { onConflict: "id" },
    )
    .select("id")
    .single();

  if (studentUpsert.error) {
    throw studentUpsert.error;
  }

  const seededCourseIds = [];
  const courseIdByDemoId = new Map();
  const professorIdByEmail = new Map();

  for (const course of demoData.courses) {
    let professorUserId = professorIdByEmail.get(course.instructorEmail);

    if (!professorUserId) {
      const professorAuthUser = await ensureAuthUser(
        course.instructorEmail,
        course.instructorName,
      );
      const professorUpsert = await supabase
        .from("app_users")
        .upsert(
          {
            display_name: course.instructorName,
            email: course.instructorEmail,
            id: professorAuthUser.id,
            role: "professor",
          },
          { onConflict: "id" },
        )
        .select("id")
        .single();

      if (professorUpsert.error) {
        throw professorUpsert.error;
      }

      professorUserId = professorAuthUser.id;
      professorIdByEmail.set(course.instructorEmail, professorUserId);
    }

    const existingCourse = await supabase
      .from("courses")
      .select("id")
      .eq("title", course.title)
      .eq("professor_user_id", professorUserId)
      .maybeSingle();

    if (existingCourse.error) {
      throw existingCourse.error;
    }

    const courseId = existingCourse.data?.id ?? course.id;
    const courseUpsert = await supabase
      .from("courses")
      .upsert(
        {
          color_token: course.colorToken,
          id: courseId,
          is_active: true,
          professor_user_id: professorUserId,
          title: course.title,
        },
        { onConflict: "id" },
      )
      .select("id")
      .single();

    if (courseUpsert.error) {
      throw courseUpsert.error;
    }

    const enrollmentUpsert = await supabase
      .from("course_enrollments")
      .upsert(
        {
          activated_at: new Date().toISOString(),
          course_id: courseId,
          status: "active",
          student_email: demoData.student.email,
          student_user_id: studentAuthUser.id,
        },
        { onConflict: "course_id,student_email" },
      )
      .select("id")
      .single();

    if (enrollmentUpsert.error) {
      throw enrollmentUpsert.error;
    }

    courseIdByDemoId.set(course.id, courseId);
    seededCourseIds.push(courseId);
  }

  for (const [index, session] of demoData.sessions.entries()) {
    const courseId = courseIdByDemoId.get(session.courseId);

    if (!courseId) {
      throw new Error(`Missing seeded course for demo session ${session.externalSessionId}`);
    }

    const timestamps = buildSessionTimestamps(session.relativeDaysAgo, 10 + (index % 3), 0);
    const sessionUpsert = await supabase
      .from("student_session_summaries")
      .upsert(
        {
          artifact_count: session.artifactCount,
          course_id: courseId,
          ended_at: timestamps.endedAt,
          event_count: session.eventCount,
          external_session_id: session.externalSessionId,
          last_activity_at: timestamps.lastActivityAt,
          started_at: timestamps.startedAt,
          status: "ended",
          student_user_id: studentAuthUser.id,
          summary: session.summary,
          title: session.title,
        },
        { onConflict: "external_session_id" },
      );

    if (sessionUpsert.error) {
      throw sessionUpsert.error;
    }
  }

  console.log(
    JSON.stringify(
      {
        courseIds: seededCourseIds,
        enrollmentEmail: demoData.student.email,
        seededSessions: demoData.sessions.length,
        studentUserId: studentAuthUser.id,
      },
      null,
      2,
    ),
  );
}

await main();
