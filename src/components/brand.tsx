import Link from "next/link";
import { Activity } from "lucide-react";
export function Brand() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-lg font-bold tracking-tight"
    >
      <span className="rounded-lg bg-[#6855d9] p-1.5 text-white">
        <Activity size={19} />
      </span>
      issuepulse<span className="text-[#6855d9]">.</span>
    </Link>
  );
}
