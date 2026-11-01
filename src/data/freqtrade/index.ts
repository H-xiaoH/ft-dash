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
export { FreqtradeApiClient } from './client'
