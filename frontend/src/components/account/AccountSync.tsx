"use client";
// Keeps a signed-in rider's account up to date: checks the session once, pushes local changes every 15 s and when the
// tab is hidden. Renders nothing. Mounted once in the root layout.
import { useEffect } from "react";
import { syncNow, useAccount, verifySession } from "@/lib/account";

export function AccountSync() {
  const account = useAccount();
  const signedIn = !!account;

  useEffect(() => {
    void verifySession();
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    const push = () => void syncNow().catch(() => {});
    const onHide = () => {
      if (document.visibilityState === "hidden") void syncNow(true).catch(() => {});
    };
    const timer = window.setInterval(push, 15_000);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [signedIn]);

  return null;
}
