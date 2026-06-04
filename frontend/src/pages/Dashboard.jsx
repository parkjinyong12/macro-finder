import { useEffect, useState } from 'react'
import { fetchBondsLatest, fetchExchangeLatest, fetchCommoditiesLatest, fetchSchedulerStatus } from '../api/client'
import { Link } from 'react-router-dom'

function SummaryCard({ title, value, unit, sub, to, color = 'brand' }) {
  const colorMap = {
    brand: 'border-brand-500',
    green: 'border-emerald-500',
    yellow: 'border-amber-500',
    red: 'border-rose-500',
  }
  return (
    <Link to={to} className={`bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-5 block border-l-4 ${colorMap[color]} transition-colors`}>
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-100">
        {value != null ? value : '—'}
        {value != null && <span className="text-sm text-gray-400 ml-1">{unit}</span>}
      </p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </Link>
  )
}

function StatusRow({ jobs, status }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <p className="text-sm font-semibold text-gray-300 mb-3">배치 수집 현황</p>
      <div className="grid grid-cols-2 gap-2">
        {jobs.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="text-gray-400">{label}</span>
            <span className="text-gray-500">
              {status?.[key]
                ? new Date(status[key] + 'Z').toLocaleString('ko-KR')
                : '미수집'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const JOBS = [
  { key: 'bonds', label: '국채 금리' },
  { key: 'exchange', label: '환율' },
  { key: 'commodities', label: '상품 가격' },
  { key: 'news', label: '기술 트렌드' },
]

export default function Dashboard() {
  const [bonds, setBonds] = useState([])
  const [exchange, setExchange] = useState([])
  const [commodities, setCommodities] = useState([])
  const [status, setStatus] = useState(null)

  useEffect(() => {
    fetchBondsLatest().then(setBonds).catch(() => {})
    fetchExchangeLatest().then(setExchange).catch(() => {})
    fetchCommoditiesLatest().then(setCommodities).catch(() => {})
    fetchSchedulerStatus().then(setStatus).catch(() => {})
  }, [])

  const bond10Y = bonds.find(b => b.tenor === '국고채3Y')
  const usdkrw = exchange.find(e => e.currency === 'USDKRW')
  const gold = commodities.find(c => c.symbol === 'GC=F')
  const oil = commodities.find(c => c.symbol === 'CL=F')

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-100 mb-6">대시보드</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <SummaryCard
          title="국고채 3년 금리"
          value={bond10Y?.rate?.toFixed(2)}
          unit="%"
          sub={bond10Y ? new Date(bond10Y.collected_at + 'Z').toLocaleString('ko-KR') : ''}
          to="/bonds"
          color="brand"
        />
        <SummaryCard
          title="USD/KRW"
          value={usdkrw?.rate?.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}
          unit="원"
          sub={usdkrw ? new Date(usdkrw.collected_at + 'Z').toLocaleString('ko-KR') : ''}
          to="/exchange"
          color="green"
        />
        <SummaryCard
          title="금 (GC=F)"
          value={gold?.price?.toLocaleString('en-US', { maximumFractionDigits: 1 })}
          unit="USD/oz"
          sub={gold ? new Date(gold.collected_at + 'Z').toLocaleString('ko-KR') : ''}
          to="/commodities"
          color="yellow"
        />
        <SummaryCard
          title="WTI 원유 (CL=F)"
          value={oil?.price?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
          unit="USD/bbl"
          sub={oil ? new Date(oil.collected_at + 'Z').toLocaleString('ko-KR') : ''}
          to="/commodities"
          color="red"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <p className="text-sm font-semibold text-gray-300 mb-3">최신 국채 금리</p>
          {bonds.length === 0 ? (
            <p className="text-gray-600 text-sm">데이터 없음</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left pb-2">만기</th>
                  <th className="text-right pb-2">금리 (%)</th>
                </tr>
              </thead>
              <tbody>
                {bonds.slice().sort((a, b) => a.tenor.localeCompare(b.tenor)).map(b => (
                  <tr key={b.tenor} className="border-b border-gray-800/50 last:border-0">
                    <td className="py-1.5 text-gray-300">{b.tenor}</td>
                    <td className="py-1.5 text-right text-brand-400 font-mono">{b.rate.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <StatusRow jobs={JOBS} status={status} />
      </div>
    </div>
  )
}
