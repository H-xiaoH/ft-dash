/** Main shell breakpoint; keep CSS min-width: 720px queries in sync. Table density is separate. */
export const WIDE_LAYOUT_QUERY = '(min-width: 720px)'
export const isWideLayout = () => window.matchMedia(WIDE_LAYOUT_QUERY).matches
