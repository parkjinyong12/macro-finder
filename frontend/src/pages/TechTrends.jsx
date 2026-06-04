import { useEffect, useState, useCallback } from 'react'
import { fetchNewsSources, runJob } from '../api/client'

async function fetchGrouped(source) {
  const params = new URLSearchParams({ limit: '150' })
  if (source) params.set('source', source)
  const res = await fetch(`/api/news/grouped?${params}`)
  return res.json()
}

function NewsCard({ item }) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-gray-900 border border-gray-800 hover:border-gray-600 rounded-xl p-4 transition-colors"
    >
      <p className="text-sm font-medium text-gray-100 leading-snug mb-1 line-clamp-2">
        {item.title_ko || item.title}
      </p>
      {item.title_ko && (
        <p className="text-xs text-gray-500 leading-snug mb-2 line-clamp-1">{item.title}</p>
      )}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span className="bg-gray-800 px-2 py-0.5 rounded-full">{item.source}</span>
        <span>
          {item.published_at
            ? new Date(item.published_at + 'Z').toLocaleDateString('ko-KR')
            : '날짜 없음'}
        </span>
      </div>
    </a>
  )
}

function ThemeSection({ theme, items }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 mb-3 w-full text-left group"
      >
        <span className="text-sm font-semibold text-brand-100 bg-brand-900 border border-brand-600 px-3 py-1 rounded-full">
          {theme}
        </span>
        <span className="text-xs text-gray-600 group-hover:text-gray-400">
          {items.length}건
        </span>
        <span className="ml-auto text-gray-600 text-xs">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {items.map(item => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function TechTrends() {
  const [grouped, setGrouped] = useState([])
  const [sources, setSources] = useState([])
  const [activeSource, setActiveSource] = useState(null)
  const [viewMode, setViewMode] = useState('theme') // 'theme' | 'list'
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-100">기술 트렌드</h2>
        <div className="flex items-center gap-2">
          {/* 뷰 모드 토글 */}
          <div className="flex rounded-lg overflow-hidden border border-gray-700 text-xs">
            <button
              onClick={() => setViewMode('theme')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'theme'
                  ? 'bg-gray-700 text-gray-100'
                  : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              테마별
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 transition-colors ${
                viewMode === 'list'
                  ? 'bg-gray-700 text-gray-100'
                  : 'bg-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              전체
            </button>
          </div>
          <button
            onClick={handleCollect}
            disabled={collecting}
            className="px-3 py-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors disabled:opacity-50"
          >
            {collecting ? '수집 중…' : '지금 수집'}
          </button>
        </div>
      </div>

      {/* 소스 필터 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setActiveSource(null)}
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
            onClick={() => setActiveSource(src)}
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

      {loading ? (
        <div className="flex items-center justify-center h-64 text-gray-600">로딩 중…</div>
      ) : allItems.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-gray-600">
          <div className="text-center">
            <p className="mb-2">뉴스 없음</p>
            <p className="text-xs">"지금 수집" 버튼으로 데이터를 가져오세요</p>
          </div>
        </div>
      ) : viewMode === 'theme' ? (
        <div>
          {grouped.map(g => (
            <ThemeSection key={g.theme} theme={g.theme} items={g.items} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {allItems.map(item => (
            <NewsCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  )
}
