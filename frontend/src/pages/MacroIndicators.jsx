import { useEffect, useState, useCallback } from 'react'
import {
  LineChart as RLineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { fetchMacro, fetchMacroLatest, fetchYieldCurve, fetchYieldCurveLatest } from '../api/client'
import LineChart from '../components/charts/LineChart'
import StatusBar from '../components/StatusBar'
import { useFilters } from '../context/FilterContext'

const SYMBOLS = [
  { symbol: 'KOSPI',        label: '코스피',        unit: 'pt',  color: '#3b82f6' },
  { symbol: 'SPX',          label: 'S&P 500',       unit: 'pt',  color: '#22c55e' },
  { symbol: 'NASDAQ',       label: '나스닥',         unit: 'pt',  color: '#8b5cf6' },
  { symbol: 'US10Y',        label: '미 10년 국채',  unit: '%',   color: '#f59e0b' },
  { symbol: 'DXY',          label: '달러 인덱스',    unit: 'pt',  color: '#10b981' },
  { symbol: 'USDJPY',       label: '달러/엔',        unit: '¥',   color: '#06b6d4' },
  { symbol: 'VIX',          label: 'VIX 공포지수',  unit: 'pt',  color: '#ef4444' },
  { symbol: 'RATE_COMPARE', label: '기준금리 비교', unit: '%',   color: '#8b5cf6' },
  { symbol: 'YIELD_CURVE',  label: '장단기 금리차', unit: '%p',  color: '#f59e0b' },
]

const DAYS_OPTIONS = [
  { label: '1개월', value: 30 },
  { label: '3개월', value: 90 },
  { label: '6개월', value: 180 },
  { label: '1년', value: 365 },
  { label: '2년', value: 730 },
]

// 기준금리처럼 결정 시점 데이터를 일별 Forward-fill로 변환
function forwardFillRates(rows, symbol) {
  const byDate = {}
  for (const r of rows.filter(r => r.symbol === symbol)) {
    byDate[r.collected_at.slice(0, 10)] = r.value
  }
  if (!Object.keys(byDate).length) return {}

  const dates = Object.keys(byDate).sort()
  const result = {}
  let last = null

  const startDate = new Date(dates[0])
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let d = new Date(startDate); d <= today; d.setDate(d.getDate() + 1)) {
    const ds = d.toISOString().slice(0, 10)
    if (byDate[ds] !== undefined) last = byDate[ds]
    if (last !== null) result[ds] = last
  }
  return result
}

function buildRateCompareData(fedFilled, krFilled, macroDays) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - macroDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const allDates = new Set([...Object.keys(fedFilled), ...Object.keys(krFilled)])
  return [...allDates]
    .filter(d => d >= cutoffStr)
    .sort()
    .map(date => {
      const fed = fedFilled[date] ?? null
      const kr = krFilled[date] ?? null
      return {
        date,
        FEDRATE: fed,
        KRRATE: kr,
        diff: fed !== null && kr !== null ? parseFloat((fed - kr).toFixed(3)) : null,
      }
    })
    .filter(d => d.FEDRATE !== null || d.KRRATE !== null)
}

export default function MacroIndicators() {
  const { macroDays, setMacroDays, macroSymbol, setMacroSymbol } = useFilters()
  const [rows, setRows] = useState([])
  const [rateRows, setRateRows] = useState([])  // FEDRATE + KRRATE 전체 2년치
  const [latest, setLatest] = useState([])
  const [lastUpdated, setLastUpdated] = useState(null)

  const isRateCompare = macroSymbol === 'RATE_COMPARE'
  const isYieldCurve  = macroSymbol === 'YIELD_CURVE'

  const [ycData, setYcData] = useState([])
  const [ycLatest, setYcLatest] = useState(null)

  const load = useCallback(async () => {
    if (isRateCompare) {
      const [rateData, lat] = await Promise.all([
        fetchMacro(730),
        fetchMacroLatest(),
      ])
      setRateRows(rateData)
      setLatest(lat)
      if (lat.length) setLastUpdated(lat[0].collected_at)
    } else if (isYieldCurve) {
      const [hist, latVal] = await Promise.all([
        fetchYieldCurve(730),
        fetchYieldCurveLatest(),
      ])
      setYcData(hist)
      setYcLatest(latVal)
      if (hist.length) setLastUpdated(hist[hist.length - 1].date)
    } else {
      const [hist, lat] = await Promise.all([
        fetchMacro(macroDays),
        fetchMacroLatest(),
      ])
      setRows(hist)
      setLatest(lat)
      if (lat.length) setLastUpdated(lat[0].collected_at)
    }
  }, [macroDays, isRateCompare, isYieldCurve])

  useEffect(() => { load() }, [load])

  // ── 기준금리 비교 모드 ───────────────────────────────────────────
  const fedFilled = isRateCompare ? forwardFillRates(rateRows, 'FEDRATE') : {}
  const krFilled  = isRateCompare ? forwardFillRates(rateRows, 'KRRATE')  : {}
  const rateCompareData = isRateCompare ? buildRateCompareData(fedFilled, krFilled, macroDays) : []

  const latestFed = latest.find(l => l.symbol === 'FEDRATE')
  const latestKr  = latest.find(l => l.symbol === 'KRRATE')
  const rateDiff  = latestFed && latestKr
    ? parseFloat((latestFed.value - latestKr.value).toFixed(3))
    : null

  // ── 단일 지표 모드 ───────────────────────────────────────────────
  const filtered = rows.filter(r => r.symbol === macroSymbol)
  const meta = SYMBOLS.find(s => s.symbol === macroSymbol)

  const byDate = {}
  for (const r of filtered) {
    const date = r.collected_at.slice(0, 10)
    if (!byDate[date]) byDate[date] = { date }
    byDate[date].value = r.value
  }
  const chartData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
  const chartLines = [{ key: 'value', label: meta?.label, color: meta?.color }]
  const latestVal = latest.find(l => l.symbol === macroSymbol)

  return (
    <div>
      <StatusBar title="주요 지표" lastUpdated={lastUpdated} jobName="macro" onRefresh={load} />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="flex gap-2 flex-wrap">
          {SYMBOLS.map(s => (
            <button
              key={s.symbol}
              onClick={() => setMacroSymbol(s.symbol)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                macroSymbol === s.symbol
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
              onClick={() => setMacroDays(value)}
              className={`px-2.5 py-1 rounded text-xs transition-colors ${
                macroDays === value ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── 기준금리 비교 뷰 ── */}
      {isRateCompare ? (
        <>
          {/* 현재값 카드 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {[
              { label: '미국 기준금리', val: latestFed?.value, color: '#8b5cf6', date: latestFed?.collected_at },
              { label: '한국 기준금리', val: latestKr?.value,  color: '#ec4899', date: latestKr?.collected_at },
              {
                label: '금리차 (미 - 한)',
                val: rateDiff,
                color: rateDiff != null ? (rateDiff >= 0 ? '#ef4444' : '#3b82f6') : '#6b7280',
                date: null,
              },
            ].map(({ label, val, color, date }) => (
              <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="text-xs text-gray-500 mb-1">{label}</p>
                <p className="text-2xl font-bold font-mono" style={{ color }}>
                  {val != null ? (val >= 0 ? '+' : '') + val.toFixed(2) : '—'}
                  <span className="text-sm text-gray-400 ml-1">%</span>
                </p>
                {date && (
                  <p className="text-xs text-gray-600 mt-1">
                    {new Date(date + 'Z').toLocaleDateString('ko-KR')}
                  </p>
                )}
              </div>
            ))}
          </div>

          {/* 두 금리 합친 차트 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">기준금리 추이</p>
            {rateCompareData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-gray-600">데이터 없음</div>
            ) : (
              <LineChart
                data={rateCompareData}
                lines={[
                  { key: 'FEDRATE', label: '미국 기준금리', color: '#8b5cf6' },
                  { key: 'KRRATE',  label: '한국 기준금리', color: '#ec4899' },
                ]}
              />
            )}
          </div>

          {/* 금리차 차트 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">금리차 (미국 - 한국, %p)</p>
            {rateCompareData.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-gray-600">데이터 없음</div>
            ) : (
              <RateDiffChart data={rateCompareData} />
            )}
          </div>

          {/* 결정 이력 테이블 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { symbol: 'FEDRATE', label: '미국 기준금리 결정 이력', color: '#8b5cf6' },
              { symbol: 'KRRATE',  label: '한국 기준금리 결정 이력', color: '#ec4899' },
            ].map(({ symbol, label, color }) => {
              const decisions = rateRows
                .filter(r => r.symbol === symbol)
                .sort((a, b) => b.collected_at.localeCompare(a.collected_at))
                .slice(0, 10)
              return (
                <div key={symbol} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-sm font-semibold text-gray-300 mb-3">{label}</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left pb-2">결정일</th>
                        <th className="text-right pb-2">금리 (%)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {decisions.map(r => (
                        <tr key={r.collected_at} className="border-b border-gray-800/40 last:border-0">
                          <td className="py-1.5 text-gray-400">{r.collected_at.slice(0, 10)}</td>
                          <td className="py-1.5 text-right font-mono" style={{ color }}>
                            {r.value.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}
          </div>
        </>
      ) : isYieldCurve ? (
        /* ── 장단기 금리차 뷰 ── */
        <YieldCurveView data={ycData} latest={ycLatest} macroDays={macroDays} />
      ) : (
        /* ── 단일 지표 뷰 ── */
        <>
          {latestVal && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
              <p className="text-xs text-gray-500 mb-1">{meta?.label} 현재값</p>
              <p className="text-3xl font-bold font-mono" style={{ color: meta?.color }}>
                {latestVal.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
            <p className="text-sm font-semibold text-gray-300 mb-3">최신 지표 현황</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 text-xs border-b border-gray-800">
                  <th className="text-left pb-2">지표</th>
                  <th className="text-right pb-2">값</th>
                  <th className="hidden sm:table-cell text-right pb-2">단위</th>
                  <th className="hidden sm:table-cell text-right pb-2">수집 시각</th>
                </tr>
              </thead>
              <tbody>
                {latest.map(r => {
                  const m = SYMBOLS.find(s => s.symbol === r.symbol)
                    ?? (r.symbol === 'FEDRATE' ? { color: '#8b5cf6', unit: '%' }
                      : r.symbol === 'KRRATE'  ? { color: '#ec4899', unit: '%' }
                      : null)
                  return (
                    <tr key={r.symbol} className="border-b border-gray-800/50 last:border-0">
                      <td className="py-2 text-gray-300">{r.name}</td>
                      <td className="py-2 text-right font-mono" style={{ color: m?.color || '#6b7280' }}>
                        {r.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="hidden sm:table-cell py-2 text-right text-gray-500 text-xs">{m?.unit || ''}</td>
                      <td className="hidden sm:table-cell py-2 text-right text-gray-500 text-xs">
                        {new Date(r.collected_at + 'Z').toLocaleString('ko-KR')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── 장단기 금리차 뷰 ──────────────────────────────────────────────────────────
function YieldCurveView({ data, latest, macroDays }) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - macroDays)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const filtered = data.filter(d => d.date >= cutoffStr)

  const spreadLines = [
    { key: 'us_spread', label: '미국 10Y-2Y', color: '#f59e0b' },
    { key: 'kr_10_2',   label: '한국 10Y-2Y', color: '#3b82f6' },
  ]
  const usDetailLines = [
    { key: 'us10y', label: '미 10년', color: '#f59e0b' },
    { key: 'us5y',  label: '미 5년',  color: '#10b981' },
    { key: 'us2y',  label: '미 2년',  color: '#ef4444' },
  ]
  const krDetailLines = [
    { key: 'kr10y', label: '국채 10년', color: '#3b82f6' },
    { key: 'kr2y',  label: '국채 2년',  color: '#ef4444' },
  ]

  const fmtSpread = (v) => v != null ? (v >= 0 ? '+' : '') + v.toFixed(3) + '%p' : '—'
  const spreadColor = (v, base) => v == null ? '#6b7280' : v >= 0 ? base : '#ef4444'

  return (
    <>
      {/* 현재값 카드 */}
      {latest && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {[
            {
              label: '미국 10Y-2Y',
              spread: latest.us?.spread,
              detail: `10년 ${latest.us?.us10y?.toFixed(3) ?? '—'}% · 5년 ${latest.us?.us5y?.toFixed(3) ?? '—'}% · 2년 ${latest.us?.us2y?.toFixed(3) ?? '—'}%`,
              color: '#f59e0b',
            },
            {
              label: '한국 10Y-2Y',
              spread: latest.kr?.spread_10_2,
              detail: `10년 ${latest.kr?.kr10y?.toFixed(3) ?? '—'}% · 2년 ${latest.kr?.kr2y?.toFixed(3) ?? '—'}%`,
              color: '#3b82f6',
            },
          ].map(({ label, spread, detail, color }) => (
            <div key={label} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className="text-2xl font-bold font-mono" style={{ color: spreadColor(spread, color) }}>
                {fmtSpread(spread)}
              </p>
              <p className="text-xs text-gray-600 mt-2 font-mono">{detail}</p>
            </div>
          ))}
        </div>
      )}

      {/* 스프레드 비교 차트 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4">
        <p className="text-sm font-semibold text-gray-300 mb-3">장단기 금리차 추이</p>
        {filtered.length === 0 ? (
          <div className="h-72 flex items-center justify-center text-gray-600">데이터 없음</div>
        ) : (
          <SpreadChart data={filtered} lines={spreadLines} />
        )}
      </div>

      {/* 미국/한국 개별 금리 추이 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {[
          { title: '미국 국채 수익률',  lines: usDetailLines },
          { title: '한국 국채 수익률',  lines: krDetailLines },
        ].map(({ title, lines }) => (
          <div key={title} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="text-sm font-semibold text-gray-300 mb-3">{title}</p>
            {filtered.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-gray-600">데이터 없음</div>
            ) : (
              <LineChart data={filtered} lines={lines} height={200} />
            )}
          </div>
        ))}
      </div>

      {/* 해석 안내 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-600 leading-relaxed">
        <span className="text-gray-500 font-medium">장단기 금리차란?</span>
        {' '}장기금리에서 단기금리를 뺀 값입니다.
        양수(+)이면 정상적인 우상향 수익률 곡선, 음수(-)이면 역전을 의미하며
        경기 침체의 선행 지표로 알려져 있습니다.
      </div>
    </>
  )
}

// 스프레드 차트 — 0 기준선 포함
function SpreadChart({ data, lines }) {
  return (
    <ResponsiveContainer width="100%" height={288}>
      <RLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} />
        <YAxis domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#d1d5db' }}
          formatter={(v, name) => [v != null ? v.toFixed(3) + '%p' : '—', name]}
        />
        <ReferenceLine y={0} stroke="#ef444466" strokeDasharray="4 2" label={{ value: '0', fill: '#6b7280', fontSize: 10 }} />
        {lines.map((l, i) => (
          <Line key={l.key} type="monotone" dataKey={l.key} name={l.label}
            stroke={l.color} dot={false} strokeWidth={2} activeDot={{ r: 4 }}
            connectNulls={false} />
        ))}
      </RLineChart>
    </ResponsiveContainer>
  )
}

// 금리차 전용 차트 (0 기준선 포함)
function RateDiffChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={210}>
      <RLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={{ stroke: '#374151' }} />
        <YAxis domain={['auto', 'auto']} tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} width={55} />
        <Tooltip
          contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
          labelStyle={{ color: '#d1d5db' }}
          formatter={(v) => v != null ? [v.toFixed(3) + '%p', '금리차 (미-한)'] : ['-', '금리차']}
        />
        <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 2" />
        <Line
          type="monotone"
          dataKey="diff"
          name="금리차 (미-한)"
          stroke="#f59e0b"
          dot={false}
          strokeWidth={2}
          activeDot={{ r: 4 }}
        />
      </RLineChart>
    </ResponsiveContainer>
  )
}
