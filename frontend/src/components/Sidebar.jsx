import { NavLink } from 'react-router-dom'

const NAV = [
  { to: '/',            label: '대시보드',    short: '홈',    icon: '📊' },
  { to: '/bonds',       label: '국채 금리',   short: '국채',  icon: '📈' },
  { to: '/exchange',    label: '환율',        short: '환율',  icon: '💱' },
  { to: '/commodities', label: '상품 가격',   short: '상품',  icon: '🪙' },
  { to: '/macro',       label: '주요 지표',   short: '지표',  icon: '🌐' },
  { to: '/predictions', label: '방향 예측',   short: '예측',  icon: '🤖' },
  { to: '/tech',        label: '기술 트렌드', short: '트렌드', icon: '🔬' },
]

export function BottomNav() {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 z-50 safe-bottom">
      <div className="flex">
        {NAV.map(({ to, short, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 py-2 flex-1 transition-colors ${
                isActive ? 'text-brand-400' : 'text-gray-500'
              }`
            }
          >
            <span className="text-lg leading-none">{icon}</span>
            <span className="text-[9px] leading-none mt-0.5 whitespace-nowrap">{short}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export default function Sidebar() {
  return (
    <aside className="hidden md:flex w-56 bg-gray-900 border-r border-gray-800 flex-col h-screen sticky top-0">
      <div className="px-5 py-6 border-b border-gray-800">
        <h1 className="text-lg font-bold text-brand-500 tracking-wide">Macro Finder</h1>
        <p className="text-xs text-gray-500 mt-0.5">매크로 경제 대시보드</p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-brand-600 text-white'
                  : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
              }`
            }
          >
            <span className="text-base">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-800 text-xs text-gray-600">
        v1.0.0
      </div>
    </aside>
  )
}
