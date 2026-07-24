import type { StudentProfileWithParticulars } from "@campushomes/shared";

import { apiServer } from "@/lib/server-api";

export function getStudentProfile(): Promise<StudentProfileWithParticulars | null> {
  return apiServer<StudentProfileWithParticulars>("/students/me");
}
