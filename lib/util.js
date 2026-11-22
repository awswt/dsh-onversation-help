import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') return path.resolve(fromEnv.trim())
  return path.join(os.homedir(), '.dsh')
}

export function expandHome(value) {
  if (typeof value !== 'string') return value
  if (value === '~') return os.homedir()
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(os.homedir(), value.slice(2))
  return value
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

export function mask(value, visible = 4) {
  const text = String(value ?? '')
  if (text.length <= visible * 2) return '*'.repeat(Math.max(2, text.length))
  return `${text.slice(0, visible)}…${text.slice(-visible)}`
}

export function nowIso() {
  return new Date().toISOString()
}

export async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true })
}

export async function readJson(file, fallback = undefined) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return fallback
  }
}

export async function writeJsonAtomic(file, value) {
  await ensureDir(path.dirname(file))
  const temp = `${file}.tmp-${process.pid}-${Date.now().toString(36)}`
  await fs.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  await fs.rename(temp, file)
}

export function truncate(text, maxChars) {
  const source = String(text ?? '')
  if (source.length <= maxChars) return { text: source, truncated: false }
  const cut = source.lastIndexOf('\n', maxChars)
  const end = cut > maxChars * 0.6 ? cut : maxChars
  return {
    text: `${source.slice(0, end)}\n\n[truncated at ${maxChars} characters]`,
    truncated: true,
  }
}

export function safeJoin(root, relative) {
  const base = path.resolve(root)
  const target = path.resolve(base, relative)
  const normalizedBase = process.platform === 'win32' ? base.toLowerCase() : base
  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target
  const prefix = normalizedBase.endsWith(path.sep) ? normalizedBase : `${normalizedBase}${path.sep}`
  return normalizedTarget === normalizedBase || normalizedTarget.startsWith(prefix) ? target : undefined
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function isExpired(expiresAt, now = Date.now()) {
  const value = typeof expiresAt === 'string' ? Date.parse(expiresAt) : Number(expiresAt)
  return !Number.isFinite(value) || value <= now
}
