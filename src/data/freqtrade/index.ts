export {
  ApiError,
  WS_AUTH_UNSUPPORTED_STATUS,
  describeError,
  type ApiErrorKind,
  type ApiErrorOptions,
} from './errors'
export {
  DEFAULT_REQUEST_TIMEOUT_MS,
  FreqtradeTransport,
  absoluteBaseUrl,
  normalizeBaseUrl,
  websocketUrl,
  type Credentials,
  type RequestOptions,
} from './transport'
export {
  FreqtradeApiClient,
  REFERENCE_API_VERSION,
  REFERENCE_CONTRACT,
  REFERENCE_FREQTRADE_VERSION_SERIES,
  type CompatibilityResult,
  type CompatibilityStatus,
} from './client'
