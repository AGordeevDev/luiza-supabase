import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts"
import { getTestPhoneEntries, startVerification, withUserCleanup } from "./_shared/test-utils.ts"

Deno.test("verification-start sends OTP for test phone", async () => {
  const entries = await getTestPhoneEntries(3)
  const entry = entries[2]
  console.log("entry", entry)
  await withUserCleanup([entry.phone], async () => {
    const start = await startVerification(entry.phone)
    if (!start.response.ok) {
      throw new Error(`Start verification failed: ${start.text}`)
    }

    const data = start.data as Record<string, unknown>
    assertEquals(data?.message, "Verification code sent successfully")
    assertEquals(data?.phone_number, entry.phone)
  })
})

Deno.test("verification-start returns error for invalid phone", async () => {
  await withUserCleanup([], async () => {
    const start = await startVerification("invalid-phone")
    assertEquals(start.response.status, 400)
    const data = start.data as Record<string, unknown>
    assertExists(data?.error)
  })
})
