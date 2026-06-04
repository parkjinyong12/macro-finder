import { useEffect, useState, useCallback } from 'react'
import { fetchPredictions, runPredictions } from '../api/client'

const DIRECTION_STYLE = {
  '상승': { color: '#ef4444', icon: '↑', bg: 'bg-red-900/30 border-red-800' },
  '하락': { color: '#3b82f6', icon: '↓', bg: 'bg-blue-900/30 border-blue-800' },
  '보합': { color: '#6b7280', icon: '→', bg: 'bg-gray-800/50 border-gray-700' },
}

export default function Predictions() {
  const [predictions, setPredictions] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchPredictions()
      setPredictions(data)
      if (data.length) setLastUpdated(data[0].created_at)
    } catch (e) {
      setError('예측 데이터를 불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleRun = async () => {
    setRunning(true)
    try {
      await runPredictions()
      // Poll for results after ~5s
      setTimeout(() => {
        load()
        setRunning(false)
      }, 6000)
    } catch {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-100">매크로 방향 예측</h1>
          {lastUpdated && (
            <p className="text-xs text-gray-500 mt-1">
              분석 시각: {new Date(lastUpdated + 'Z').toLocaleString('ko-KR')}
            </p>
          )}
        </div>
        <button
          onClick={handleRun}
          disabled={running}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          {running ? '분석 중...' : 'AI 재분석'}
        </button>
      </div>

      {running && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-4 text-center text-gray-500 text-sm">
          Claude AI가 매크로 지표를 분석하고 있습니다. 잠시만 기다려 주세요...
        </div>
      )}

      {loading && !running && (
        <div className="text-center text-gray-600 py-20">로딩 중...</div>
      )}

      {error && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-5 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!loading && !error && predictions.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-10 text-center">
          <p className="text-gray-500 text-sm mb-4">아직 예측 데이터가 없습니다.</p>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2 rounded-lg text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-colors"
          >
            첫 번째 AI 분석 시작
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {predictions.map(p => {
          const style = DIRECTION_STYLE[p.direction] || DIRECTION_STYLE['보합']
          return (
            <div
              key={p.symbol}
              className={`border rounded-xl p-5 ${style.bg}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-500">{p.symbol}</p>
                  <p className="text-base font-semibold text-gray-200">{p.name}</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-bold" style={{ color: style.color }}>
                  <span className="text-lg">{style.icon}</span>
                  <span>{p.direction}</span>
                </div>
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">{p.explanation}</p>
            </div>
          )
        })}
      </div>

      {predictions.length > 0 && (
        <div className="mt-6 bg-gray-900 border border-gray-800 rounded-xl p-4 text-xs text-gray-600">
          본 예측은 Claude AI가 현재 매크로 지표들의 방향성을 바탕으로 생성한 분석입니다.
          투자 결정의 참고 자료로만 활용하시기 바랍니다.
        </div>
      )}
    </div>
  )
}
