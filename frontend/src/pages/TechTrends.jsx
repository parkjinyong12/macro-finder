import { useEffect, useState, useCallback, useRef } from 'react'
import { fetchNewsSources, runJob } from '../api/client'

async function fetchGrouped(source) {
  const params = new URLSearchParams({ limit: '200' })
  if (source) params.set('source', source)
  const res = await fetch(`/api/news/grouped?${params}`)
  return res.json()
}

function fmt(dateStr) {
  if (!dateStr) return ''
  return new Date(dateStr + 'Z').toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })
}

// ── Overview: 테마별 헤드라인 다이제스트 ─────────────────────────────────────

function HeadlineRow({ item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-800/50 transition-colors group"
    >
      <span className="text-[11px] text-gray-600 mt-0.5 shrink-0 w-10 text-right tabular-nums">
        {fmt(item.published_at)}
      </span>
      <span className="text-sm text-gray-300 leading-snug line-clamp-1 flex-1 group-hover:text-gray-100">
        {item.title_ko || item.title}
      </span>
      <span className="text-[10px] text-gray-600 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded mt-0.5 whitespace-nowrap">
        {item.source}
      </span>
    </a>
  )
}

function ThemeDigest({ theme, items, onFocus }) {
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, 3)
  const extra = items.length - 3

  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900/60 border-b border-gray-800">
        <button
          onClick={() => onFocus(theme)}
          className="text-sm font-semibold text-brand-300 hover:text-brand-200 transition-colors text-left"
        >
          {theme}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">{items.length}건</span>
          {extra > 0 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
            >
              {expanded ? '접기 ▲' : `+${extra}건 ▼`}
            </button>
          )}
          <button
            onClick={() => onFocus(theme)}
            className="text-[11px] text-gray-500 hover:text-brand-400 transition-colors font-medium"
          >
            읽기 →
          </button>
        </div>
      </div>
      <div className="divide-y divide-gray-800/30">
        {shown.map(item => <HeadlineRow key={item.id} item={item} />)}
      </div>
    </div>
  )
}

// ── Reader: 기사 상세 + 목록 내비게이션 ──────────────────────────────────────

function ArticleCard({ item }) {
  if (!item) return null
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 md:p-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs bg-brand-900 border border-brand-700 text-brand-300 px-2.5 py-1 rounded-full font-medium">
          {item.source}
        </span>
        {item.published_at && (
          <span className="text-xs text-gray-500">
            {new Date(item.published_at + 'Z').toLocaleDateString('ko-KR', {
              year: 'numeric', month: 'long', day: 'numeric',
            })}
          </span>
        )}
      </div>

      <h2 className="text-lg md:text-xl font-bold text-gray-100 leading-snug mb-3">
        {item.title_ko || item.title}
      </h2>

      {item.title_ko && (
        <p className="text-sm text-gray-500 leading-relaxed mb-5 border-l-2 border-gray-700 pl-3 italic">
          {item.title}
        </p>
      )}

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-700 hover:bg-brand-600 text-white text-sm rounded-lg transition-colors font-medium"
      >
        원문 보기 →
      </a>
    </div>
  )
}

function ReaderPanel({ theme, items, onBack }) {
  const [idx, setIdx] = useState(0)
  const listRef = useRef(null)

  // 키보드 방향키 내비게이션
  useEffect(() => {
    const handler = (e) => {
      if (['ArrowRight', 'ArrowDown', 'j'].includes(e.key)) {
        e.preventDefault()
        setIdx(i => Math.min(i + 1, items.length - 1))
      }
      if (['ArrowLeft', 'ArrowUp', 'k'].includes(e.key)) {
        e.preventDefault()
        setIdx(i => Math.max(i - 1, 0))
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [items.length])

  // 목록에서 선택된 항목 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${idx}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [idx])

  const selected = items[idx]

  return (
    <div>
      {/* 상단 내비게이션 바 */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button
          onClick={onBack}
          className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
        >
          ← 전체
        </button>
        <span className="text-gray-700">·</span>
        <span className="text-brand-300 font-semibold text-sm">{theme}</span>
        <span className="text-xs text-gray-600 flex-1">{items.length}건</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setIdx(i => Math.max(i - 1, 0))}
            disabled={idx === 0}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-25 rounded-lg transition-colors"
          >
            ← 이전
          </button>
          <span className="text-xs text-gray-600 tabular-nums px-1">{idx + 1} / {items.length}</span>
          <button
            onClick={() => setIdx(i => Math.min(i + 1, items.length - 1))}
            disabled={idx === items.length - 1}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 disabled:opacity-25 rounded-lg transition-colors"
          >
            다음 →
          </button>
        </div>
      </div>

      {/* 본문 + 목록 (데스크탑: 좌우, 모바일: 상하) */}
      <div className="flex flex-col md:grid md:grid-cols-[1fr_300px] gap-4 md:items-start">
        {/* 기사 카드 */}
        <ArticleCard item={selected} />

        {/* 목록 사이드바 */}
        <div
          ref={listRef}
          className="border border-gray-800 rounded-xl overflow-hidden md:max-h-[70vh] md:overflow-y-auto"
        >
          <div className="px-4 py-2 border-b border-gray-800 text-[11px] text-gray-500 font-medium bg-gray-900/50 sticky top-0">
            목록 · 방향키로 이동
          </div>
          {items.map((item, i) => (
            <button
              key={item.id}
              data-idx={i}
              onClick={() => setIdx(i)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-800/40 last:border-0 transition-colors flex gap-2 items-start ${
                i === idx
                  ? 'bg-brand-900/50 border-l-2 border-l-brand-500'
                  : 'hover:bg-gray-800/40'
              }`}
            >
              <span className="text-[10px] text-gray-600 shrink-0 mt-0.5 w-8 text-right tabular-nums">
                {fmt(item.published_at)}
              </span>
              <span className={`text-xs leading-snug line-clamp-2 ${i === idx ? 'text-brand-200' : 'text-gray-400'}`}>
                {item.title_ko || item.title}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────────────────────────────

export default function TechTrends() {
  const [grouped, setGrouped] = useState([])
  const [sources, setSources] = useState([])
  const [activeSource, setActiveSource] = useState(null)
  const [focusTheme, setFocusTheme] = useState(null)
  const [loading, setLoading] = useState(false)
  const [collecting, setCollecting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [grp, srcs] = await Promise.all([
        fetchGrouped(activeSource),
        fetchNewsSources(),
      ])
      setGrouped(grp)
      setSources(srcs)
    } finally {
      setLoading(false)
    }
  }, [activeSource])

  useEffect(() => { load() }, [load])

  async function handleCollect() {
    setCollecting(true)
    try {
      await runJob('news')
      await load()
    } finally {
      setCollecting(false)
    }
  }

  const allItems = grouped.flatMap(g => g.items)
  const focusGroup = grouped.find(g => g.theme === focusTheme)

  function handleFocus(theme) {
    setFocusTheme(theme)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-100">기술 트렌드</h2>
          {!loading && allItems.length > 0 && (
            <span className="text-xs text-gray-600">{allItems.length}건</span>
          )}
        </div>
        <button
          onClick={handleCollect}
          disabled={collecting}
          className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
        >
          {collecting ? '수집 중…' : '지금 수집'}
        </button>
      </div>

      {/* 소스 필터 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => { setActiveSource(null); setFocusTheme(null) }}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            activeSource === null
              ? 'bg-brand-600 border-brand-600 text-white'
              : 'border-gray-700 text-gray-400 hover:border-gray-500'
          }`}
        >
          전체
        </button>
        {sources.map(src => (
          <button
            key={src}
            onClick={() => { setActiveSource(src); setFocusTheme(null) }}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              activeSource === src
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-gray-700 text-gray-400 hover:border-gray-500'
            }`}
          >
            {src}
          </button>
        ))}
      </div>

      {/* 콘텐츠 */}
      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-600">로딩 중…</div>
      ) : allItems.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-600 text-center">
          <div>
            <p className="mb-2">뉴스 없음</p>
            <p className="text-xs">"지금 수집" 버튼으로 데이터를 가져오세요</p>
          </div>
        </div>
      ) : focusTheme && focusGroup ? (
        <ReaderPanel
          key={focusTheme}
          theme={focusTheme}
          items={focusGroup.items}
          onBack={() => setFocusTheme(null)}
        />
      ) : (
        <div className="space-y-3">
          {grouped.map(g => (
            <ThemeDigest
              key={g.theme}
              theme={g.theme}
              items={g.items}
              onFocus={handleFocus}
            />
          ))}
        </div>
      )}
    </div>
  )
}
