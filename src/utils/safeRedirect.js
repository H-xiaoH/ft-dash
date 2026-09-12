/**
 * Guards the post-login redirect against off-site destinations.
 *
 * The target arrives as a query parameter (`/login?redirect=...`), so it is
 * attacker-controllable: without this check a crafted link could bounce a
 * freshly authenticated user somewhere else, or produce a protocol-relative
 * `//host` URL once handed to the router/history API.
 *
 * Returns a safe in-app path, or null when the value cannot be trusted.
 */
export function safeRedirectPath(value) {
  if (typeof value !== 'string' || !value) return null
  // Must be an absolute in-app path: starts with exactly one "/".
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // Reject backslash variants that some browsers normalise to "//".
  if (value.startsWith('/\\')) return null
  return value
}
