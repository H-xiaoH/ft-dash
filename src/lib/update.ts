export async function checkForUpdate(registration: { update: () => Promise<unknown> }) {
  try {
    await registration.update()
  } catch {
    // A failed update check should not interrupt startup.
  }
}
