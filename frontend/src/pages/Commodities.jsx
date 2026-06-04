import { useEffect, useState, useCallback } from 'react'
import { fetchCommodities, fetchCommoditiesLatest } from '../api/client'
import LineChart from '../components/charts/LineChart'
import StatusBar from '../components/StatusBar'
import { useFilters } from '../context/FilterContext'

const SYMBOLS = [
  { symbol: 'GC=F', label: '금 (Gold)', unit: 'USD/oz', color: '#f59e0b' },
  { symbol: 'CL=F', label: 'WTI 원유', unit: 'USD/bbl', color: '#ef4444' },
  { symbol: 'HG=F', label: '구리 (Copper)', unit: 'USD/lb', color: '#f97316' },
  { symbol: 'SI=F', label: '은 (Silver)', unit: 'USD/oz', color: '#94a3b8' },
  { symbol: 'NG=F', label: '천연가스', unit: 'USD/MMBtu', color: '#3b82f6' },
]
const DAYS_OPTIONS = [
  { label: '1개월', value: 30 },
  { label: '3개월', value: 90 },
  { label: '6개월', value: 180 },
  { label: '1년', value: 365 },
  { label: '2년', value: 730 },
]

export default function Commodities() {
  const { commodityDays, setCommodityDays, commoditySymbol, setCommoditySymbol } = useFilters()
  const [rows, setRows] = useState([])
  const [latest, setLatest] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    const [hist, lat] = await Promise.all([
      fetchCommodities(commodityDays),
      fetchCommoditiesLatest(),
    ])
    setRows(hist)
    setLatest(lat)
    if (lat.length) setLastUpdated(lat[0].collected_at)
  }, [commodityDays])

  useEffect(() => { load() }, [load])

  const filtered = rows.filter(r => r.symbol === commoditySymbol)
  const meta = SYMBOLS.find(s => s.symbol === commoditySymbol)

  const byDate = {}
  for (const r of filtered) {
    const date = r.collected_at.slice(0, 10)
    if (!byDate[date]) byDate[date] = { date }
    byDate[date].price = r.price
  }
  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  const chartLines = [{ key: 'price', label: meta?.label, color: meta?.color }]
  const latestVal = latest.find(l => l.symbol === commoditySymbol)

  return (
    <div>
      <StatusBar title="상품 가격" lastUpdated={lastUpdated} jobName="commodities" onRefresh={load} />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          {SYMBOLS.map(s => (
            <button
              key={s.symbol}
              onClick={() => setCommoditySymbol(s.symbol)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                commoditySymbol === s.symbol
                  ? 'bg-brand-600 border-brand-600 text-white'
                  : 'border-gray-700 text-gray-400 hover:border-gray-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1 sm:ml-auto">
          {DAYS_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setCommodityDays(value)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                commodityDays === value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {latestVal && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
          <p className="text-xs text-gray-500 mb-1">{meta?.label} 현재가</p>
          <p className="text-3xl font-bold font-mono" style={{ color: meta?.color }}>
            {latestVal.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="text-sm text-gray-400 ml-2">{meta?.unit}</span>
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
        <p className="text-sm font-semibold text-gray-300 mb-3">최신 상품 가격</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-500 text-xs border-b border-gray-800">
              <th className="text-left pb-2">상품</th>
              <th className="text-right pb-2">가격</th>
              <th className="hidden sm:table-cell text-right pb-2">단위</th>
              <th className="hidden sm:table-cell text-right pb-2">수집 시각</th>
            </tr>
          </thead>
          <tbody>
            {latest.map(r => {
              const m = SYMBOLS.find(s => s.symbol === r.symbol)
              return (
                <tr key={r.symbol} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2 text-gray-300">{r.name}</td>
                  <td className="py-2 text-right font-mono" style={{ color: m?.color || '#f59e0b' }}>
                    {r.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="hidden sm:table-cell py-2 text-right text-gray-500 text-xs">{m?.unit || 'USD'}</td>
                  <td className="hidden sm:table-cell py-2 text-right text-gray-500 text-xs">
                    {new Date(r.collected_at + 'Z').toLocaleString('ko-KR')}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
