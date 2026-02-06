import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts"
import {
  delay,
  getTestPhoneEntries,
  startVerification,
  verifyPhone,
  withUserCleanup,
} from "./_shared/test-utils.ts"

Deno.test("verification-verify succeeds with valid test phone and OTP", async () => {
  const entries = await getTestPhoneEntries(2)
  const entry = entries[0]

  await withUserCleanup([entry.phone], async () => {
    const start = await startVerification(entry.phone)
    if (!start.response.ok) {
      throw new Error(`Start verification failed: ${start.text}`)
    }

    await delay(1000)

    const verify = await verifyPhone(entry.phone, entry.otp)
    if (!verify.response.ok) {
      throw new Error(`Verification failed: ${verify.text}`)
    }

    const body = verify.data as Record<string, unknown>
    assertExists(body?.message)
    assertExists(body?.session)
    assertExists(body?.user)
    assertExists((body.user as Record<string, unknown>)?.profile)

    const profile = (body.user as Record<string, unknown>).profile as Record<string, unknown>
    assertEquals("email" in profile, true)
    assertEquals("first_name" in profile, true)
    assertEquals("last_name" in profile, true)
    assertEquals("phone" in profile, true)
    assertEquals("correspondence_address" in profile, true)
  })
})

Deno.test("verification-verify returns error for wrong OTP", async () => {
  const entries = await getTestPhoneEntries(2)
  const entry = entries[1]

  await withUserCleanup([entry.phone], async () => {
    const start = await startVerification(entry.phone)
    if (!start.response.ok) {
      throw new Error(`Start verification failed: ${start.text}`)
    }

    await delay(1000)

    const verify = await verifyPhone(entry.phone, "000000")
    assertEquals(verify.response.status, 400)
    const data = verify.data as Record<string, unknown>
    assertExists(data?.error)
  })
})

Deno.test("verification-verify returns error for invalid phone", async () => {
  await withUserCleanup([], async () => {
    const invalidPhone = "invalid-phone"
    const verify = await verifyPhone(invalidPhone, "123456")
    assertEquals(verify.response.status, 400)
    const data = verify.data as Record<string, unknown>
    assertExists(data?.error)
  })
})