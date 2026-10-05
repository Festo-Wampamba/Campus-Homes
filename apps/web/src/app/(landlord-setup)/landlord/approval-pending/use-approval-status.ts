"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError, api } from "@/lib/api";
import { isFinal, pollDelay, type ApprovalStatus } from "./approval-status";

// ponytail: short polling, not push — Soketi isn't provisioned. Swap for a
// realtime subscription once it is; the page only reads { status }.
export function useApprovalStatus(initial: ApprovalStatus) {
  const [status, setStatus] = useState(initial);
  const [hasTrouble, setHasTrouble] = useState(false);
  const failures = useRef(0);
  const router = useRouter();

  useEffect(() => {
    if (isFinal(status)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(check, pollDelay(failures.current));
    }

    async function check() {
      // Hidden tabs stop polling; visibilitychange/focus restarts it.
      if (document.visibilityState === "hidden") return;
      try {
        const profile = await api<{ kycStatus: ApprovalStatus }>("/landlords/me");
        if (cancelled) return;
        failures.current = 0;
        setHasTrouble(false);
        setStatus(profile.kycStatus);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/sign-in?next=%2Flandlord%2Fapproval-pending");
          return;
        }
        failures.current += 1;
        setHasTrouble(true);
      }
      schedule();
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void check();
    }

    schedule();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [status, router]);

  return { status, hasTrouble };
}
