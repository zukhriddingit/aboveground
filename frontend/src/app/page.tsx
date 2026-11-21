// Placeholder. Member 4 owns this file and replaces it with the real T-Verse page
// (TVerseMap + Stories + Fix the T + HUD). Member 2's map test bench is at /map-dev.
import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">AboveGround</h1>
      <p className="max-w-md text-slate-400">
        The live 3D MBTA world. This page is waiting for the main integration.
      </p>
      <Link href="/map-dev" className="rounded-full border border-white/15 px-5 py-2 text-sm hover:bg-white/10">
        Open the 3D map test bench
      </Link>
    </main>
  );
}
