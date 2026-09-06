import Link from "next/link";
import { UserPlus } from "lucide-react";

/** Account creation stays in Logto. After authentication the user explicitly
 * adds landlord access to the same CampusHomes identity. */
export function CreateAccountDialog() {
  return (
    <Link
      href="/sign-in?next=%2Flandlords%2Fenroll"
      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-coral-500 px-6 font-bold text-teal-900 transition duration-300 hover:bg-coral-600 hover:text-white active:scale-[0.98] sm:w-auto"
    >
      <UserPlus aria-hidden className="size-4" />
      Create or use one account
    </Link>
  );
}
