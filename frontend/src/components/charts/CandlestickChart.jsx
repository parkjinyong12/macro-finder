import {
  ComposedChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'

const CandleShape = (props) => {
  const { x, y, width, height, payload } = props
  if (!payload || height <= 0) return null

  const { open, high, low, close } = payload
  if (high == null || low == null || open == null) return null

  const range = high - low
  const scale = range > 0 ? height / range : 0

  const openPx  = y + (high - open)  * scale
  const closePx = y + (high - close) * scale
  const isUp = close >= open
  const color = isUp ? '#22c55e' : '#ef4444'

  const bodyTop    = Math.min(openPx, closePx)
  const bodyHeight = Math.max(1, Math.abs(closePx - openPx))
  const centerX    = x + width / 2
  const candleW    = Math.max(3, width - 2)

  return (
    <g>
      <line x1={centerX} y1={y} x2={centerX} y2={y + height} stroke={color} strokeWidth={1} />
      <rect
        x={centerX - candleW / 2}
        y={bodyTop}
        width={candleW}
        height={bodyHeight}
        fill={color}
      />
    </g>
  )
}

const CandleTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  const d = payload[0]?.payload
  if (!d) return null

  const isUp = d.close >= d.open
  const color = isUp ? '#22c55e' : '#ef4444'
  const fmt = (v) => v != null ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'

  return (
    <div style={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: '8px 12px', fontSize: 12, lineHeight: 1.8 }}>
      <p style={{ color: '#d1d5db', marginBottom: 2, fontWeight: 600 }}>{label}</p>
      <p style={{ color, fontWeight: 700 }}>종가 {fmt(d.close)}</p>
      <p style={{ color: '#9ca3af' }}>시가 {fmt(d.open)}</p>
      <p style={{ color: '#9ca3af' }}>고가 {fmt(d.high)}</p>
      <p style={{ color: '#9ca3af' }}>저가 {fmt(d.low)}</p>
    </div>
  )
}

export default function CandlestickChart({ data, xKey = 'date', height = 320 }) {
  const transformed = data.map(d => ({
    ...d,
    _range: d.high != null && d.low != null ? [d.low, d.high] : [d.value, d.value],
    close: d.value,
  }))

  const prices = data.flatMap(d => [d.low, d.high].filter(v => v != null))
  const minP = prices.length ? Math.min(...prices) : 0
  const maxP = prices.length ? Math.max(...prices) : 100
  const pad  = (maxP - minP) * 0.05

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={transformed} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: '#374151' }}
        />
        <YAxis
          domain={[minP - pad, maxP + pad]}
          tick={{ fill: '#9ca3af', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={60}
        />
        <Tooltip content={<CandleTooltip />} />
        <Bar
          dataKey="_range"
          shape={<CandleShape />}
          isAnimationActive={false}
          maxBarSize={20}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
