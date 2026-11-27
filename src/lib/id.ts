import { nanoid } from 'nanoid'

/** Generate a stable short ID */
export function createId(): string {
  return nanoid(12)
}

/** Current ISO timestamp */
export function nowISO(): string {
  return new Date().toISOString()
}
