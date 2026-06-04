import { createContext, useContext, useState } from 'react'

const FilterContext = createContext(null)

export function FilterProvider({ children }) {
  const [bondDays, setBondDays] = useState(30)
  const [bondTenors, setBondTenors] = useState(['국고채3Y', 'CD91일', '콜금리'])

  const [exchangeDays, setExchangeDays] = useState(30)
  const [exchangeCurrency, setExchangeCurrency] = useState('USDKRW')

  const [commodityDays, setCommodityDays] = useState(30)
  const [commoditySymbol, setCommoditySymbol] = useState('GC=F')

  const [macroDays, setMacroDays] = useState(30)
  const [macroSymbol, setMacroSymbol] = useState('KOSPI')

  return (
    <FilterContext.Provider value={{
      bondDays, setBondDays,
      bondTenors, setBondTenors,
      exchangeDays, setExchangeDays,
      exchangeCurrency, setExchangeCurrency,
      commodityDays, setCommodityDays,
      commoditySymbol, setCommoditySymbol,
      macroDays, setMacroDays,
      macroSymbol, setMacroSymbol,
    }}>
      {children}
    </FilterContext.Provider>
  )
}

export function useFilters() {
  return useContext(FilterContext)
}
