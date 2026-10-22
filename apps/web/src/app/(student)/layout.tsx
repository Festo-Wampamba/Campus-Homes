import { requireWorkspace } from "@/lib/session";
import { StudentShell } from "@/components/student/student-shell";

import "./student.css";

export default async function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireWorkspace("student");
  return (
    <StudentShell user={session.user} access={session.access}>
      {children}
    </StudentShell>
  );
}
