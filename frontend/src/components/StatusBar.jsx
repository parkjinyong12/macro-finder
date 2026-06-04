import { useState } from 'react'
import { runJob } from '../api/client'

export default function StatusBar({ title, lastUpdated, jobName, onRefresh }) {
  const [loading, setLoading] = useState(false)

  async function handleRefresh() {
    if (!jobName) return
    setLoading(true)
    try {
      await runJob(jobName)
      onRefresh?.()
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex items-start sm:items-center justify-between mb-6 gap-2">
      <h2 className="text-xl font-bold text-gray-100">{title}</h2>
      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-3">
        {lastUpdated && (
          <span className="text-[10px] sm:text-xs text-gray-500">
            {new Date(lastUpdated + 'Z').toLocaleString('ko-KR')}
          </span>
        )}
        {jobName && (
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {loading ? '수집 중…' : '지금 수집'}
          </button>
        )}
      </div>
    </div>
  )
}
