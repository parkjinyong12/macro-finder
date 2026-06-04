import { useEffect, useCallback } from 'react'
import { useState } from 'react'
import { fetchBonds, fetchBondsLatest } from '../api/client'
import LineChart from '../components/charts/LineChart'
import StatusBar from '../components/StatusBar'
import { useFilters } from '../context/FilterContext'

const TENORS = ['CD91일', '콜금리', '국고채3Y', '회사채3Y']
const DAYS_OPTIONS = [
  { label: '1개월', value: 30 },
  { label: '3개월', value: 90 },
  { label: '6개월', value: 180 },
  { label: '1년', value: 365 },
  { label: '2년', value: 730 },
]

function buildChartData(rows) {
  const byDate = {}
  for (const r of rows) {
    const date = r.collected_at.slice(0, 10)
    if (!byDate[date]) byDate[date] = { date }
    byDate[date][r.tenor] = r.rate
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

export default function BondRates() {
  const { bondDays, setBondDays, bondTenors, setBondTenors } = useFilters()
  const [rows, setRows] = useState([])
  const [latest, setLatest] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    const [hist, lat] = await Promise.all([
      fetchBonds(bondDays),
      fetchBondsLatest(),
    ])
    setRows(hist)
    setLatest(lat)
    if (lat.length) setLastUpdated(lat[0].collected_at)
  }, [bondDays])

  useEffect(() => { load() }, [load])

  const chartData = buildChartData(rows)
  const chartLines = bondTenors.map(t => ({ key: t, label: t }))

  function toggleTenor(t) {
    setBondTenors(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    )
  }

  return (
    <div>
      <StatusBar title="국채 금리" lastUpdated={lastUpdated} jobName="bonds" onRefresh={load} />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          {TENORS.map(t => (
            <button
              key={t}
              onClick={() => toggleTenor(t)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                bondTenors.includes(t)
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1 sm:ml-auto">
          {DAYS_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setBondDays(value)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                bondDays === value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        {rows.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-600">데이터 없음</div>
        ) : (
          <LineChart data={chartData} lines={chartLines} />
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-300 mb-3">최신 수익률</p>
        {latest.length === 0 ? (
          <p className="text-gray-600 text-sm">데이터 없음</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="text-left pb-2 font-medium">만기</th>
                <th className="text-right pb-2 font-medium">금리 (%)</th>
                <th className="hidden sm:table-cell text-right pb-2 font-medium">수집 시각</th>
              </tr>
            </thead>
            <tbody>
              {latest.slice().sort((a, b) => a.tenor.localeCompare(b.tenor)).map(r => (
                <tr key={r.tenor} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2 text-gray-300">{r.tenor}</td>
                  <td className="py-2 text-right font-mono text-brand-400">{r.rate.toFixed(3)}</td>
                  <td className="hidden sm:table-cell py-2 text-right text-gray-500 text-xs">
                    {new Date(r.collected_at + 'Z').toLocaleString('ko-KR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
