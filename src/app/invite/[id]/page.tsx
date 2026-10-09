import { Invite } from "@/components/invite";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Invite id={(await params).id} />;
}
