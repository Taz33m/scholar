import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireStudentContext } from "@/lib/student-access/context";
import { listStudentCourses } from "@/lib/student-access/repository";
import { StudentHomeClient } from "./student-home-client";

export default async function StudentHomePage() {
  const supabase = await createSupabaseServerClient();
  
  try {
    const context = await requireStudentContext(supabase);
    const courses = await listStudentCourses(supabase);
    
    return (
      <StudentHomeClient 
        initialCourses={courses} 
        user={context.appUser} 
      />
    );
  } catch (error) {
    console.error("Student access error:", error);
    redirect("/login?error=no-access");
  }
}
