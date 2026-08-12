import { createHash } from 'crypto'
import { normalizeRecordForChecksum } from './normalizeRecordForChecksum'

export function calculateRecordChecksum(tableName: string, record: any): string {
  const normalizedString = normalizeRecordForChecksum(tableName, record)
  return createHash('sha256').update(normalizedString).digest('hex')
}
