import { normalizeRecordForChecksum, FIELD_TYPES } from './normalizeRecordForChecksum'

console.log('--- NUMERIC NORMALIZATION TESTS ---')
// Mocking a table that has a numeric field 'amount' and an integer field 'qty'
FIELD_TYPES['test_numeric'] = { amount: 'numeric', qty: 'integer' }

const t1 = normalizeRecordForChecksum('test_numeric', { amount: 1 })
const t2 = normalizeRecordForChecksum('test_numeric', { amount: 1.0 })
const t3 = normalizeRecordForChecksum('test_numeric', { amount: 1.00 })
const t4 = normalizeRecordForChecksum('test_numeric', { amount: "1.00" })
console.log('1, 1.0, 1.00, "1.00" identical?', t1 === t2 && t2 === t3 && t3 === t4, t1)

console.log('Very large integer:', normalizeRecordForChecksum('test_numeric', { qty: "900719925474099267" }))
console.log('High-precision decimal:', normalizeRecordForChecksum('test_numeric', { amount: "0.123456789012345678" }))
console.log('Negative zero:', normalizeRecordForChecksum('test_numeric', { amount: "-0.00" }))

console.log('\n--- IDENTIFIER NORMALIZATION TESTS ---')
FIELD_TYPES['test_ident'] = { imei: 'text', invoice_no: 'text' }
console.log('IMEI string:', normalizeRecordForChecksum('test_ident', { imei: "001.0500" })) // Must not strip trailing zeroes!
console.log('Invoice number:', normalizeRecordForChecksum('test_ident', { invoice_no: "INV-00123" }))

console.log('\n--- DATE/TIMESTAMP NORMALIZATION TESTS ---')
FIELD_TYPES['test_date'] = { d_date: 'date', d_tz: 'timestamptz', d_notz: 'timestamp' }
console.log('Date-only:', normalizeRecordForChecksum('test_date', { d_date: "2026-08-06T14:30:00Z" }))
console.log('Timestamptz (Z):', normalizeRecordForChecksum('test_date', { d_tz: "2026-08-06T10:00:00Z" }))
console.log('Timestamptz (+04:00):', normalizeRecordForChecksum('test_date', { d_tz: "2026-08-06T14:00:00+04:00" }))
console.log('Timestamp (No TZ):', normalizeRecordForChecksum('test_date', { d_notz: "2026-08-06T10:00:00Z" }))

console.log('\n--- NULL VS EMPTY STRING TESTS ---')
const n1 = normalizeRecordForChecksum('test_ident', { imei: null })
const n2 = normalizeRecordForChecksum('test_ident', { imei: "" })
console.log('Null vs empty string identical?', n1 === n2, n1)

