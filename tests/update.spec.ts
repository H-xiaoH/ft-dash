import { describe, expect, it, vi } from 'vitest'
import { checkForUpdate } from '@/lib/update'

describe('checkForUpdate', () => {
  it('checks the registered worker once', async () => {
    const update = vi.fn(async () => {})
    await checkForUpdate({ update })
    expect(update).toHaveBeenCalledTimes(1)
  })

  it('keeps startup usable if the check fails', async () => {
    const update = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(checkForUpdate({ update })).resolves.toBeUndefined()
  })
})
