import { useEffect, useState, useCallback } from 'react'
import { fetchExchange, fetchExchangeLatest } from '../api/client'
import LineChart from '../components/charts/LineChart'
import StatusBar from '../components/StatusBar'
import { useFilters } from '../context/FilterContext'

const CURRENCIES = ['USDKRW', 'EURKRW', 'JPYKRW', 'CNYKRW']
const LABELS = { USDKRW: 'USD/KRW', EURKRW: 'EUR/KRW', JPYKRW: 'JPY/KRW (×100)', CNYKRW: 'CNY/KRW' }
const DAYS_OPTIONS = [
  { label: '1개월', value: 30 },
  { label: '3개월', value: 90 },
  { label: '6개월', value: 180 },
  { label: '1년', value: 365 },
  { label: '2년', value: 730 },
]

function buildChartData(rows, active) {
  const byDate = {}
  for (const r of rows) {
    const date = r.collected_at.slice(0, 10)
    if (!byDate[date]) byDate[date] = { date }
    byDate[date][r.currency] = r.currency === 'JPYKRW' ? r.rate * 100 : r.rate
  }
  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

export default function ExchangeRates() {
  const { exchangeDays, setExchangeDays, exchangeCurrency, setExchangeCurrency } = useFilters()
  const [rows, setRows] = useState([])
  const [latest, setLatest] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    const [hist, lat] = await Promise.all([
      fetchExchange(exchangeDays),
      fetchExchangeLatest(),
    ])
    setRows(hist)
    setLatest(lat)
    if (lat.length) setLastUpdated(lat[0].collected_at)
  }, [exchangeDays])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => r.currency === exchangeCurrency)
  const chartData = buildChartData(filtered, exchangeCurrency)
  const chartLines = [{ key: exchangeCurrency, label: LABELS[exchangeCurrency] }]
  const latestVal = latest.find(l => l.currency === exchangeCurrency)

  return (
    <div>
      <StatusBar title="환율" lastUpdated={lastUpdated} jobName="exchange" onRefresh={load} />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          {CURRENCIES.map(c => (
            <button
              key={c}
              onClick={() => setExchangeCurrency(c)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                exchangeCurrency === c
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {LABELS[c]}
            </button>
          ))}
        </div>
        <div className="flex gap-1 sm:ml-auto">
          {DAYS_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setExchangeDays(value)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                exchangeDays === value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {latestVal && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <p className="text-xs text-gray-500 mb-1">{LABELS[exchangeCurrency]} 현재가</p>
          <p className="text-3xl font-bold text-brand-400 font-mono">
            {latestVal.rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-sm text-gray-400 ml-2">원</span>
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {new Date(latestVal.collected_at + 'Z').toLocaleString('ko-KR')}
          </p>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        {filtered.length === 0 ? (
          <div className="h-80 flex items-center justify-center text-gray-600">데이터 없음</div>
        ) : (
          <LineChart data={chartData} lines={chartLines} />
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <p className="text-sm font-semibold text-gray-300 mb-3">최신 환율</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left pb-2">통화</th>
              <th className="text-right pb-2">환율 (원)</th>
              <th className="hidden sm:table-cell text-right pb-2">수집 시각</th>
            </tr>
          </thead>
          <tbody>
            {latest.map(r => (
              <tr key={r.currency} className="border-b border-gray-800/50 last:border-0">
                <td className="py-2 text-gray-300">{LABELS[r.currency] || r.currency}</td>
                <td className="py-2 text-right font-mono text-emerald-400">
                  {r.rate.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="hidden sm:table-cell py-2 text-right text-gray-500 text-xs">
                  {new Date(r.collected_at + 'Z').toLocaleString('ko-KR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
