"use client";
// The Account block at the top of the rider profile: sign up (a random username, already filled in, plus a password),
// log in, rename, log out. Matte MBTA wayfinding look (lib/ui).
import { useEffect, useState } from "react";
import { Dices, LogIn, LogOut, Pencil, UserPlus } from "lucide-react";
import { logIn, logOut, renameAccount, signUp, suggestUsername, useAccount } from "@/lib/account";
import { DEFAULT_RIDER_NAME, setRiderProfile, useRiderProfile } from "@/lib/riderProfile";
import { BUTTON, BUTTON_PRIMARY, FOCUS, LABEL } from "@/lib/ui";

type Mode = "idle" | "signup" | "login" | "rename";
const INPUT = `h-9 w-full min-w-0 rounded-lg border border-white/12 bg-white/[0.05] px-2.5 text-[14px] font-medium text-white placeholder:text-zinc-500 ${FOCUS}`;
const cleanUsername = (v: string) => v.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 20);

export function AccountSection() {
  const account = useAccount();
  const profile = useRiderProfile();
  const [mode, setMode] = useState<Mode>("idle");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "signup" || username) return;
    let live = true;
    void suggestUsername().then((u) => live && setUsername(u));
    return () => {
      live = false;
    };
  }, [mode, username]);

  const open = (next: Mode) => {
    setMode(next);
    setError(null);
    setPassword("");
    setUsername(next === "rename" ? account?.username ?? "" : "");
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (mode === "signup") {
      void run(async () => {
        // A brand-new rider takes the username as their display name; a renamed one keeps theirs.
        if (profile.name.trim() === DEFAULT_RIDER_NAME) setRiderProfile({ name: username });
        await signUp(username, password);
      });
    } else if (mode === "login") {
      void run(() => logIn(username, password));
    } else if (mode === "rename") {
      void run(async () => {
        const old = account?.username;
        const next = await renameAccount(username);
        if (old && profile.name.trim() === old) setRiderProfile({ name: next });
      });
    }
  };

  if (mode === "idle") {
    return account ? (
      <section className="space-y-2.5 border-b border-white/12 px-3.5 py-3" aria-label="Account">
        <p className={LABEL}>Account</p>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-white">@{account.username}</span>
          <button type="button" onClick={() => open("rename")} className={`${BUTTON} ${FOCUS} h-8 px-2.5 text-xs`}>
            <Pencil className="size-3.5" />
            Change
          </button>
          <button type="button" disabled={busy} onClick={() => void run(logOut)} className={`${BUTTON} ${FOCUS} h-8 px-2.5 text-xs`}>
            <LogOut className="size-3.5" />
            Log out
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">Your XP, hats, name and avatar are saved to this account.</p>
      </section>
    ) : (
      <section className="space-y-2.5 border-b border-white/12 px-3.5 py-3" aria-label="Account">
        <p className={LABEL}>Account</p>
        <p className="text-[12px] text-zinc-300">Sign up to keep your XP, hats and avatar on any device. It takes one tap.</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => open("signup")} className={`${BUTTON_PRIMARY} ${FOCUS} h-9 flex-1 px-3 text-sm`}>
            <UserPlus className="size-4" />
            Sign up
          </button>
          <button type="button" onClick={() => open("login")} className={`${BUTTON} ${FOCUS} h-9 flex-1 px-3 text-sm`}>
            <LogIn className="size-4" />
            Log in
          </button>
        </div>
      </section>
    );
  }

  const title = mode === "signup" ? "Create your account" : mode === "login" ? "Log in" : "Change username";
  return (
    <form onSubmit={submit} className="space-y-2.5 border-b border-white/12 px-3.5 py-3" aria-label={title}>
      <p className={LABEL}>{title}</p>
      <div>
        <label htmlFor="account-username" className="text-[11px] text-zinc-400">Username</label>
        <div className="mt-1 flex gap-1.5">
          <input id="account-username" value={username} onChange={(e) => setUsername(cleanUsername(e.target.value))}
            autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={20}
            placeholder={mode === "signup" ? "Picking one for you…" : "Your username"} className={INPUT} />
          {mode === "signup" && (
            <button type="button" aria-label="Suggest another username" title="Suggest another username"
              onClick={() => void suggestUsername().then(setUsername)} className={`${BUTTON} ${FOCUS} size-9 shrink-0`}>
              <Dices className="size-4" />
            </button>
          )}
        </div>
      </div>
      {mode !== "rename" && (
        <div>
          <label htmlFor="account-password" className="text-[11px] text-zinc-400">Password</label>
          <input id="account-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={4} maxLength={200}
            placeholder={mode === "signup" ? "At least 4 characters" : "Your password"} className={`${INPUT} mt-1`} />
        </div>
      )}
      {error && <p role="alert" className="text-[12px] text-[#ff8a80]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={busy || username.length < 3 || (mode !== "rename" && password.length < 4)}
          className={`${BUTTON_PRIMARY} ${FOCUS} h-9 flex-1 px-3 text-sm`}>
          {busy ? "One sec…" : mode === "signup" ? "Create account" : mode === "login" ? "Log in" : "Save"}
        </button>
        <button type="button" onClick={() => open("idle")} className={`${BUTTON} ${FOCUS} h-9 px-3 text-sm`}>Cancel</button>
      </div>
      {mode === "signup" && <p className="text-[11px] text-zinc-500">No email needed. Your current XP, hats and name come with you.</p>}
      {mode === "login" && (
        <p className="text-[11px] text-zinc-500">
          No account?{" "}
          <button type="button" onClick={() => open("signup")} className={`text-zinc-300 underline underline-offset-2 hover:text-white ${FOCUS}`}>Sign up</button>
        </p>
      )}
    </form>
  );
}
