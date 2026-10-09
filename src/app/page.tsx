import Link from "next/link";
import {
  Activity,
  ShieldCheck,
  Radio,
  TowerControl,
  ArrowUpRight,
} from "lucide-react";
import { Brand } from "@/components/brand";
export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      <header className="flex h-24 items-center justify-between">
        <Brand />
        <Link href="/login" className="btn secondary">
          Sign in <ArrowUpRight size={14} />
        </Link>
      </header>
      <section className="grid items-center gap-14 py-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">For the people keeping things running</p>
          <h1 className="mt-7 text-5xl leading-[1.1] font-semibold tracking-[-.06em] md:text-7xl">
            Know before
            <br />
            they <span className="text-[#6855d9]">notice.</span>
          </h1>
          <p className="muted mt-7 max-w-md text-sm leading-7">
            A clear pulse on your services. Catch downtime, bring your team
            together, and keep your users in the loop.
          </p>
          <Link href="/register" className="btn mt-8">
            Create your workspace <ArrowUpRight size={16} />
          </Link>
          <p className="muted mt-4 text-xs">
            Your monitors. Your team. One calm place.
          </p>
        </div>
        <div className="card shadow-xl shadow-purple-100">
          <div className="flex justify-between border-b border-gray-100 pb-5">
            <span className="text-sm font-semibold">
              A clearer view of reliability
            </span>
            <Activity className="text-[#6855d9]" size={20} />
          </div>
          {[
            "Watch your websites",
            "Respond with your team",
            "Share the latest updates",
          ].map((name, i) => (
            <div
              key={name}
              className="flex items-center gap-4 border-b border-gray-100 py-7"
            >
              <span className="rounded-xl bg-[#f0edff] p-3 text-[#6855d9]">
                {i === 0 ? (
                  <Radio />
                ) : i === 1 ? (
                  <TowerControl />
                ) : (
                  <ShieldCheck />
                )}
              </span>
              <div>
                <p className="text-sm font-semibold">{name}</p>
                <p className="muted mt-1 text-xs">
                  {
                    [
                      "HTTP checks and response-time history",
                      "Assigned incidents and a shared timeline",
                      "Public status pages that tell the story",
                    ][i]
                  }
                </p>
              </div>
            </div>
          ))}
          <p className="muted pt-5 text-xs">
            Built for focused teams. Ready for real workflows.
          </p>
        </div>
      </section>
      <footer className="muted border-t border-gray-200 py-8 text-xs">
        IssuePulse · Made for the work behind the uptime.
      </footer>
    </main>
  );
}
