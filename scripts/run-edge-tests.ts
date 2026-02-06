import { load } from "https://deno.land/std@0.208.0/dotenv/mod.ts"
import { walk } from "https://deno.land/std@0.208.0/fs/walk.ts"
import { fromFileUrl, join } from "https://deno.land/std@0.208.0/path/mod.ts"

const rootDir = fromFileUrl(new URL("..", import.meta.url))
const envPath = join(rootDir, ".env")
const testsDir = join(rootDir, "supabase", "tests", "edge")

let fileEnv: Record<string, string> = {}
try {
  fileEnv = await load({ envPath })
} catch (error) {
  if (!(error instanceof Deno.errors.NotFound)) {
    throw error
  }
  console.warn("No .env file found; relying on existing environment variables.")
}

const currentEnv = Deno.env.toObject()
const mergedEnv = { ...fileEnv, ...currentEnv }

const requiredEnv = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]

function mask(value: string | undefined): string {
  if (!value) return "(missing)"
  if (value.length <= 8) return "***"
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

console.log("Edge tests environment:")
for (const key of requiredEnv) {
  console.log(`- ${key}: ${mask(mergedEnv[key])}`)
}

const testFiles: string[] = []
for await (const entry of walk(testsDir, { includeDirs: false, exts: [".ts"] })) {
  if (!entry.name.endsWith(".test.ts")) continue
  if (entry.path.includes(`${join("edge", "_shared")}`)) continue
  testFiles.push(entry.path.replace(`${rootDir}/`, ""))
}

console.log("Edge tests to run:")
if (testFiles.length === 0) {
  console.log("- (none)")
} else {
  for (const file of testFiles) {
    console.log(`- ${file}`)
  }
}

const command = new Deno.Command("deno", {
  args: ["test", "-A", testsDir],
  env: mergedEnv,
  stdout: "inherit",
  stderr: "inherit",
})

const { code } = await command.spawn().status
Deno.exit(code)
