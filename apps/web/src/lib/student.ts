import type { StudentProfile } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getStudentProfile(): Promise<StudentProfile | null> {
  return apiServer<StudentProfile>("/students/me");
}
