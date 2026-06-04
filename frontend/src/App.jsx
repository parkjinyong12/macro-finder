import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar, { BottomNav } from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import BondRates from './pages/BondRates'
import ExchangeRates from './pages/ExchangeRates'
import Commodities from './pages/Commodities'
import MacroIndicators from './pages/MacroIndicators'
import Predictions from './pages/Predictions'
import TechTrends from './pages/TechTrends'
import { FilterProvider } from './context/FilterContext'

export default function App() {
  return (
    <FilterProvider>
      <BrowserRouter>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 p-4 md:p-6 overflow-y-auto pb-20 md:pb-6">
            <div className="max-w-6xl mx-auto">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/bonds" element={<BondRates />} />
                <Route path="/exchange" element={<ExchangeRates />} />
                <Route path="/commodities" element={<Commodities />} />
                <Route path="/macro" element={<MacroIndicators />} />
                <Route path="/predictions" element={<Predictions />} />
                <Route path="/tech" element={<TechTrends />} />
              </Routes>
            </div>
          </main>
        </div>
        <BottomNav />
      </BrowserRouter>
    </FilterProvider>
  )
}
