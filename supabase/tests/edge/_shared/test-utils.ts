import { parse } from "https://deno.land/std@0.208.0/toml/mod.ts"

export type TestPhoneEntry = {
  phone: string
  otp: string
}

const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

const configPath = new URL("../../../config.toml", import.meta.url)
let cachedTestOtps: Record<string, string> | null = null

function getEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`${name} is required for edge tests`)
  }
  return value
}

function getSupabaseUrl(): string {
  return getEnv("SUPABASE_URL")
}

function getSupabaseAnonKey(): string {
  return getEnv("SUPABASE_ANON_KEY")
}

function normalizePhoneKey(key: string): string {
  if (key.startsWith("+")) {
    return key
  }
  return `+${key}`
}

function safeParseJson(text: string) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function getTestOtpMap(): Promise<Record<string, string>> {
  if (cachedTestOtps) {
    return cachedTestOtps
  }

  const text = await Deno.readTextFile(configPath)
  const config = parse(text) as Record<string, unknown>
  const auth = config.auth as Record<string, unknown> | undefined
  const sms = auth?.sms as Record<string, unknown> | undefined
  const testOtp = sms?.test_otp as Record<string, unknown> | undefined

  if (!testOtp || Object.keys(testOtp).length === 0) {
    throw new Error("No [auth.sms.test_otp] entries found in supabase/config.toml")
  }

  const normalized: Record<string, string> = {}
  for (const [key, value] of Object.entries(testOtp)) {
    normalized[normalizePhoneKey(String(key))] = String(value)
  }

  cachedTestOtps = normalized
  return normalized
}

export async function getTestPhoneEntries(count: number): Promise<TestPhoneEntry[]> {
  const testOtps = await getTestOtpMap()
  const entries = Object.entries(testOtps)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([phone, otp]) => ({ phone, otp }))

  if (entries.length < count) {
    throw new Error(
      `Not enough test phones in config.toml. Required ${count}, found ${entries.length}`
    )
  }

  return entries.slice(0, count)
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const text = await response.text()
  const data = text ? safeParseJson(text) : null
  return { response, text, data }
}

export async function startVerification(phone: string) {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  return fetchJson(`${supabaseUrl}/functions/v1/verification-start`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ phone_number: phone }),
  })
}

export async function verifyPhone(phone: string, otp: string) {
  const supabaseUrl = getSupabaseUrl()
  const supabaseAnonKey = getSupabaseAnonKey()
  return fetchJson(`${supabaseUrl}/functions/v1/verification-verify`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      phone_number: phone,
      verification_code: otp,
    }),
  })
}

export async function deleteUserByPhone(phone: string) {
  if (!serviceRoleKey) {
    console.warn("SUPABASE_SERVICE_ROLE_KEY not set; skipping user cleanup")
    return
  }

  const supabaseUrl = getSupabaseUrl()
  const listResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  })

  const listText = await listResponse.text()
  if (!listResponse.ok) {
    if (listResponse.status === 401 || listResponse.status === 403) {
      console.warn(
        `Skipping user cleanup due to admin API auth failure: ${listResponse.status} - ${listText}`
      )
      return
    }
    if (listResponse.status >= 500) {
      console.warn(
        `Skipping user cleanup due to admin API server error: ${listResponse.status} - ${listText}`
      )
      return
    }
    throw new Error(`Failed to list users: ${listResponse.status} - ${listText}`)
  }

  type GoTrueUser = { id: string; phone?: string | null }
  const users = safeParseJson(listText) as { users?: GoTrueUser[] } | null
  const normalizedPhone = phone.replace("+", "")
  const user = users?.users?.find((u) => u.phone === normalizedPhone)

  if (!user) {
    return
  }

  const deleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
  })

  const deleteText = await deleteResponse.text()
  if (!deleteResponse.ok) {
    if (deleteResponse.status === 401 || deleteResponse.status === 403) {
      console.warn(
        `Skipping user deletion due to admin API auth failure: ${deleteResponse.status} - ${deleteText}`
      )
      return
    }
    if (deleteResponse.status >= 500) {
      console.warn(
        `Skipping user deletion due to admin API server error: ${deleteResponse.status} - ${deleteText}`
      )
      return
    }
    throw new Error(`Failed to delete user ${user.id}: ${deleteResponse.status} - ${deleteText}`)
  }
}

export async function withUserCleanup(phones: string[], run: () => Promise<void>) {
  for (const phone of phones) {
    await deleteUserByPhone(phone)
  }

  try {
    await run()
  } finally {
    for (const phone of phones) {
      await deleteUserByPhone(phone)
    }
  }
}
