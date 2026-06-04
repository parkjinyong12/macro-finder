import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const fetchBonds = (days = 30, tenor = null) =>
  api.get('/bonds', { params: { days, ...(tenor && { tenor }) } }).then(r => r.data)

export const fetchBondsLatest = () =>
  api.get('/bonds/latest').then(r => r.data)

export const fetchExchange = (days = 30, currency = null) =>
  api.get('/exchange', { params: { days, ...(currency && { currency }) } }).then(r => r.data)

export const fetchExchangeLatest = () =>
  api.get('/exchange/latest').then(r => r.data)

export const fetchCommodities = (days = 30, symbol = null) =>
  api.get('/commodities', { params: { days, ...(symbol && { symbol }) } }).then(r => r.data)

export const fetchCommoditiesLatest = () =>
  api.get('/commodities/latest').then(r => r.data)

export const fetchNews = (limit = 50, source = null) =>
  api.get('/news', { params: { limit, ...(source && { source }) } }).then(r => r.data)

export const fetchNewsSources = () =>
  api.get('/news/sources').then(r => r.data)

export const fetchYieldCurve = (days = 365) =>
  api.get('/yield-curve', { params: { days } }).then(r => r.data)

export const fetchYieldCurveLatest = () =>
  api.get('/yield-curve/latest').then(r => r.data)

export const fetchMacro = (days = 30, symbol = null) =>
  api.get('/macro', { params: { days, ...(symbol && { symbol }) } }).then(r => r.data)

export const fetchMacroLatest = () =>
  api.get('/macro/latest').then(r => r.data)

export const fetchPredictions = () =>
  api.get('/predictions').then(r => r.data)

export const runPredictions = () =>
  api.post('/predictions/run').then(r => r.data)

export const fetchSchedulerStatus = () =>
  api.get('/scheduler/status').then(r => r.data)

export const runJob = (jobName) =>
  api.post(`/scheduler/run/${jobName}`).then(r => r.data)
