import { useEffect, useState, useCallback } from 'react'
import {
  LineChart as RLineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  fetchRealEstateSummary,
  fetchRealEstateTrend,
  fetchRealEstateRegions,
  triggerRealEstateCrawl,
} from '../api/client'

const REGION_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6',
]

const MONTHS_OPTIONS = [
  { label: '6개월', value: 6 },
  { label: '12개월', value: 12 },
  { label: '24개월', value: 24 },
]

const PRESET_GROUPS = [
  {
    label: '강남 3구',
    codes: ['11650', '11680', '11710'],
  },
  {
    label: '마·용·성',
    codes: ['11440', '11170', '11200'],
  },
  {
    label: '노·도·강',
    codes: ['11350', '11320', '11305'],
  },
]

function fmtPrice(v) {
  if (v == null) return '—'
  if (v >= 10000) return `${(v / 10000).toFixed(1)}억`
  return `${Math.round(v).toLocaleString()}만`
}

function fmtYm(ym) {
  if (!ym || ym.length < 6) return ym
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`
}

export default function RealEstate() {
  const [regions, setRegions] = useState([])
  const [summary, setSummary] = useState(null)
  const [selectedCodes, setSelectedCodes] = useState(['11650', '11680', '11710'])
  const [trendData, setTrendData] = useState(null)
  const [months, setMonths] = useState(12)
  const [crawling, setCrawling] = useState(false)
  const [tab, setTab] = useState('trend') // 'trend' | 'summary'

  const loadRegions = useCallback(async () => {
    try {
      const data = await fetchRealEstateRegions()
      setRegions(data)
    } catch {}
  }, [])

  const loadSummary = useCallback(async () => {
    try {
      const data = await fetchRealEstateSummary()
      setSummary(data)
    } catch {}
  }, [])

  const loadTrend = useCallback(async () => {
    if (!selectedCodes.length) return
    try {
      const data = await fetchRealEstateTrend(selectedCodes, months)
      setTrendData(data)
    } catch {}
  }, [selectedCodes, months])

  useEffect(() => {
    loadRegions()
    loadSummary()
  }, [loadRegions, loadSummary])

  useEffect(() => {
    loadTrend()
  }, [loadTrend])

  const toggleCode = (code) => {
    setSelectedCodes(prev =>
      prev.includes(code)
        ? prev.filter(c => c !== code)
        : prev.length < 5 ? [...prev, code] : prev
    )
  }

  const applyPreset = (codes) => setSelectedCodes(codes)

  const handleCrawl = async () => {
    setCrawling(true)
    try {
      await triggerRealEstateCrawl()
      setTimeout(() => {
        loadRegions()
        loadSummary()
        loadTrend()
        setCrawling(false)
      }, 3000)
    } catch {
      setCrawling(false)
    }
  }

  // 추세 차트 데이터 구성
  const trendChartData = trendData
    ? trendData.months.map(m => {
        const row = { ym: fmtYm(m.deal_ym) }
        for (const code of selectedCodes) {
          row[code] = m[code]?.avg_price ?? null
        }
        return row
      })
    : []

  const tradeChartData = trendData
    ? trendData.months.map(m => {
        const row = { ym: fmtYm(m.deal_ym) }
        for (const code of selectedCodes) {
          row[code] = m[code]?.trade_count ?? null
        }
        return row
      })
    : []

  const regionName = (code) =>
    regions.find(r => r.code === code)?.name ?? code

  const noData = !trendChartData.length

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-100">부동산 시세</h2>
          <p className="text-xs text-gray-500 mt-0.5">국토교통부 아파트 매매 실거래가 통계</p>
        </div>
        <div className="flex items-center gap-2">
          {['trend', 'summary'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                tab === t ? 'bg-brand-600 text-white' : 'text-gray-400 border border-gray-700 hover:border-gray-500'
              }`}
            >
              {t === 'trend' ? '지역 추세' : '월별 현황'}
            </button>
          ))}
          <button
            onClick={handleCrawl}
            disabled={crawling}
            className="px-3 py-1.5 rounded text-xs font-medium border border-gray-700 text-gray-400 hover:border-gray-500 disabled:opacity-40 transition-colors"
          >
            {crawling ? '수집중...' : '데이터 수집'}
          </button>
        </div>
      </div>

      {tab === 'trend' ? (
        <>
          {/* 지역 선택 컨트롤 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-gray-400">지역 선택 (최대 5개)</p>
              <div className="flex gap-1">
                {MONTHS_OPTIONS.map(({ label, value }) => (
                  <button
                    key={value}
                    onClick={() => setMonths(value)}
                    className={`px-2.5 py-1 rounded text-xs transition-colors ${
                      months === value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* 프리셋 */}
            <div className="flex gap-2 mb-3 flex-wrap">
              {PRESET_GROUPS.map(g => (
                <button
                  key={g.label}
                  onClick={() => applyPreset(g.codes)}
                  className="px-2.5 py-1 rounded-full text-xs border border-gray-700 text-gray-400 hover:border-brand-500 hover:text-brand-400 transition-colors"
                >
                  {g.label}
                </button>
              ))}
            </div>

            {/* 지역 목록 */}
            {regions.length === 0 ? (
              <p className="text-xs text-gray-600">
                데이터가 없습니다. 상단 <span className="text-gray-500">[데이터 수집]</span> 버튼을 눌러 수집을 시작하세요.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {regions.map(r => {
                  const active = selectedCodes.includes(r.code)
                  const colorIdx = selectedCodes.indexOf(r.code)
                  return (
                    <button
                      key={r.code}
                      onClick={() => toggleCode(r.code)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        active
                          ? 'text-white border-transparent'
                          : 'border-gray-700 text-gray-500 hover:border-gray-500'
                      }`}
                      style={active ? { backgroundColor: REGION_COLORS[colorIdx] } : {}}
                    >
                      {r.name}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* 평균가 추세 차트 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <p className="text-sm font-semibold text-gray-300 mb-4">월별 평균 거래가 (만원)</p>
            {noData ? (
              <EmptyState />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <RLineChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="ym" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} />
                  <YAxis
                    tickFormatter={v => fmtPrice(v)}
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    width={70}
                  />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#d1d5db', fontSize: 12 }}
                    formatter={(v, name) => [fmtPrice(v), regionName(name)]}
                  />
                  <Legend formatter={code => regionName(code)} wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  {selectedCodes.map((code, i) => (
                    <Line
                      key={code}
                      type="monotone"
                      dataKey={code}
                      name={code}
                      stroke={REGION_COLORS[i]}
                      dot={false}
                      strokeWidth={2}
                      activeDot={{ r: 4 }}
                      connectNulls={false}
                    />
                  ))}
                </RLineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 거래량 차트 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <p className="text-sm font-semibold text-gray-300 mb-4">월별 거래량 (건)</p>
            {noData ? (
              <EmptyState height={200} />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={tradeChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="ym" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} />
                  <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} width={45} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                    labelStyle={{ color: '#d1d5db', fontSize: 12 }}
                    formatter={(v, name) => [`${v}건`, regionName(name)]}
                  />
                  <Legend formatter={code => regionName(code)} wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
                  {selectedCodes.map((code, i) => (
                    <Bar key={code} dataKey={code} name={code} fill={REGION_COLORS[i]} opacity={0.8} radius={[2, 2, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 선택 지역 최신값 카드 */}
          {trendData && trendData.months.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {selectedCodes.map((code, i) => {
                const last = [...trendData.months].reverse().find(m => m[code])
                const prev = last ? [...trendData.months].reverse().slice(1).find(m => m[code]) : null
                const curr = last?.[code]
                const prevVal = prev?.[code]
                const change = curr && prevVal ? ((curr.avg_price - prevVal.avg_price) / prevVal.avg_price * 100) : null
                return (
                  <div key={code} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: REGION_COLORS[i] }} />
                      <p className="text-xs text-gray-400 truncate">{regionName(code)}</p>
                    </div>
                    <p className="text-base font-bold font-mono text-gray-100">
                      {fmtPrice(curr?.avg_price)}
                    </p>
                    {change != null && (
                      <p className={`text-xs font-mono mt-0.5 ${change >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(1)}%
                      </p>
                    )}
                    {last && (
                      <p className="text-[10px] text-gray-600 mt-1">{fmtYm(last.deal_ym)} 기준</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        /* 월별 현황 탭 */
        <SummaryTab summary={summary} />
      )}
    </div>
  )
}

function SummaryTab({ summary }) {
  if (!summary || !summary.regions.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
        <p className="text-gray-600 text-sm">데이터가 없습니다.</p>
        <p className="text-gray-700 text-xs mt-1">상단 [데이터 수집] 버튼을 눌러 수집을 시작하세요.</p>
      </div>
    )
  }

  const { deal_ym, regions } = summary
  const top10 = regions.slice(0, 15)

  return (
    <>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-sm text-gray-400 font-medium">{fmtYm(deal_ym)} 기준</span>
        <span className="text-xs text-gray-600">전체 {regions.length}개 지역</span>
      </div>

      {/* 상위 지역 바 차트 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <p className="text-sm font-semibold text-gray-300 mb-4">평균 거래가 상위 지역 (만원)</p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={top10.map(r => ({ name: r.region_name, avg: r.avg_price, max: r.max_price }))}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={v => fmtPrice(v)}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: '#374151' }}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
              formatter={(v, name) => [fmtPrice(v), name === 'avg' ? '평균가' : '최고가']}
            />
            <Bar dataKey="avg" name="avg" fill="#3b82f6" radius={[0, 3, 3, 0]} opacity={0.85} />
            <Bar dataKey="max" name="max" fill="#f59e0b" radius={[0, 3, 3, 0]} opacity={0.5} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 테이블 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <p className="text-sm font-semibold text-gray-300 mb-3">전체 지역 목록</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-500 text-xs border-b border-gray-800">
                <th className="text-left pb-2 pr-3">지역</th>
                <th className="text-right pb-2 pr-3">평균 거래가</th>
                <th className="text-right pb-2 pr-3 hidden sm:table-cell">최고가</th>
                <th className="text-right pb-2 pr-3 hidden sm:table-cell">최저가</th>
                <th className="text-right pb-2 hidden sm:table-cell">거래량</th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r, i) => (
                <tr key={r.region_code} className="border-b border-gray-800/50 last:border-0">
                  <td className="py-2 pr-3 text-gray-300 flex items-center gap-2">
                    <span className="text-xs text-gray-600 font-mono w-4">{i + 1}</span>
                    {r.region_name}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-blue-400 font-medium">
                    {fmtPrice(r.avg_price)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-gray-400 hidden sm:table-cell">
                    {fmtPrice(r.max_price)}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-gray-500 hidden sm:table-cell">
                    {fmtPrice(r.min_price)}
                  </td>
                  <td className="py-2 text-right text-gray-400 hidden sm:table-cell">
                    {r.trade_count}건
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function EmptyState({ height = 280 }) {
  return (
    <div style={{ height }} className="flex flex-col items-center justify-center gap-2">
      <p className="text-gray-600 text-sm">데이터가 없습니다</p>
      <p className="text-gray-700 text-xs">상단 [데이터 수집] 버튼을 눌러 수집을 시작하세요</p>
    </div>
  )
}
