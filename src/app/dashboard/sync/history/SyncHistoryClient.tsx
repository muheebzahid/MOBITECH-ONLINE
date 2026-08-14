'use client'

import { useQuery } from '@tanstack/react-query'
import { getSyncHistory } from '@/lib/admin/actions'

export default function SyncHistoryClient({ initialJobs }: { initialJobs: any[] }) {
  const { data: jobs = initialJobs } = useQuery({
    queryKey: ['sync-history'],
    queryFn: () => getSyncHistory(),
    initialData: initialJobs,
    staleTime: 15 * 1000,
  })

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6 text-slate-100">
      <div className="flex items-center justify-between border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">🔄 Update Live Sync History</h1>
          <p className="text-sm text-slate-400 mt-1">Audit log of all cloud synchronization jobs</p>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-950/80 text-xs font-semibold text-slate-400 uppercase border-b border-slate-800">
            <tr>
              <th className="px-6 py-4">Job ID</th>
              <th className="px-6 py-4">Executed At</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Total Records</th>
              <th className="px-6 py-4">Error / Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {(!jobs || jobs.length === 0) ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                  No sync jobs recorded yet.
                </td>
              </tr>
            ) : (
              jobs.map((j: any) => (
                <tr key={j.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs text-blue-400 font-semibold">{j.id}</td>
                  <td className="px-6 py-4 text-slate-300">
                    {new Date(j.executed_at || j.created_at).toLocaleString('en-AE')}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${j.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}`}>
                      {j.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-200">{j.total_records || 0}</td>
                  <td className="px-6 py-4 text-xs text-slate-400 max-w-md truncate">
                    {j.error_summary || 'Clean completion'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
