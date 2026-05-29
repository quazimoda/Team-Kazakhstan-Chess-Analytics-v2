import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getSyncJobs } from "@/server/queries";

export default async function AdminPage() {
  const jobs = await getSyncJobs();
  const latest = jobs.data[0] ?? null;
  return (
    <>
      <PageHeader eyebrow="MVP admin" title="Admin" description="Manual sync controls and sync-job visibility. In MVP, admin access is protected by ADMIN_SECRET on API calls." />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <p className="text-sm text-slate-400">Last sync status</p>
          <div className="mt-3 flex items-center gap-3"><Badge tone={latest?.status === "success" ? "green" : "gold"}>{latest?.status ?? "none"}</Badge><span className="text-sm text-slate-300">{formatDateTime(latest?.finishedAt ?? latest?.createdAt)}</span></div>
          <div className="mt-6 space-y-3">
            <button className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20">Sync Matches</button>
            <button className="w-full rounded-2xl border border-yellow-300/30 px-4 py-3 font-semibold text-yellow-100">Recalculate</button>
          </div>
          <p className="mt-5 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-100">MVP warning: API admin writes are protected with ADMIN_SECRET. Add authenticated roles before production.</p>
        </Card>
        <Card className="lg:col-span-2 overflow-x-auto">
          <h3 className="text-xl font-semibold text-white">Recent sync jobs</h3>
          <table className="mt-4 w-full min-w-[620px] text-left text-sm">
            <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">Type</th><th>Status</th><th>Message</th><th>Created</th><th>Finished</th></tr></thead>
            <tbody>{jobs.data.map((job) => <tr key={job.id} className="border-b border-white/5 text-slate-200 last:border-0"><td className="py-4">{job.type}</td><td><Badge tone={job.status === "success" ? "green" : job.status === "failed" ? "red" : "gold"}>{job.status}</Badge></td><td>{job.message ?? "—"}</td><td>{formatDateTime(job.createdAt)}</td><td>{formatDateTime(job.finishedAt)}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
