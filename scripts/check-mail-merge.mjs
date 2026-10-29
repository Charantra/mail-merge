/**
 * Guards the mail merge core: template language, data parsing, filter and sort, merge
 * errors, and the .eml / zip outputs. Runs the shipped modules in mail-merge/core.
 * Run: npm run check:mailmerge
 */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadTs } from './load-ts.mjs'

const core = loadTs(join(dirname(fileURLToPath(import.meta.url)), '..', 'mail-merge', 'core', 'index'))
const { parseTemplate, render, parseDelimited, toDataset, arrange, duplicateRows, guessEmailColumn, compile, mergeRecords, ready, buildEml, zip, escapeHtml, readWorkbook, toXlsx, messageRows } = core

const row = { 'First Name': 'asha', 'Last Name': 'Rao', Company: 'Northbridge', Sector: 'Fintech', Stage: 'Series A', Ticket: '2500000', 'Last Met': '2026-08-14', Empty: '' }
const run = (src, extra = {}) => {
  const t = parseTemplate(src)
  assert.deepEqual(t.errors, [], `template errors for ${src}: ${JSON.stringify(t.errors)}`)
  return render(t, { row, record: 3, sequence: 2, now: new Date(2026, 9, 28), ...extra })
}

// Fields: case, spacing, underscores and brackets do not matter.
assert.equal(run('Hi {{first name}} {{ Last_Name }} at {{[Company]}}').text, 'Hi asha Rao at Northbridge')
// Formatting
assert.equal(run('{{First Name | title}}').text, 'Asha')
assert.equal(run('{{Company | upper}}').text, 'NORTHBRIDGE')
assert.equal(run('{{Ticket | currency:USD}}').text, '$2,500,000')
assert.equal(run('{{Ticket | number:0:en-IN}}').text, '25,00,000')
assert.equal(run('{{Last Met | date:"D MMM YYYY"}}').text, '14 Aug 2026')
assert.equal(run('{{Missing | default:"there"}}').text, 'there')
assert.equal(run('{{Empty | default:"Sir or Madam"}}').text, 'Sir or Madam')
assert.deepEqual(run('{{Empty}}').blank, ['Empty'], 'blank without default is reported')
assert.deepEqual(run('{{Empty | default:"x"}}').blank, [], 'blank with default is not reported')
// Specials and fill-in
assert.equal(run('{{@record}}/{{@sequence}} {{@date | date:"DD/MM/YYYY"}}').text, '3/2 28/10/2026')
assert.equal(run('{{@date}}').text, '28 October 2026')
assert.equal(run('{{fill:Week}}', { fills: { Week: '3 Nov' } }).text, '3 Nov')
assert.deepEqual(parseTemplate('{{fill:Week}} {{ask:Week}}').fills, ['Week'])
// If / else if / else, operators, and/or, wildcards, numbers
assert.equal(run('{{#if Sector = "Fintech"}}F{{else}}O{{/if}}').text, 'F')
assert.equal(run('{{#if Sector = SaaS}}S{{else if Stage contains series}}A{{else}}O{{/if}}').text, 'A')
assert.equal(run('{{#if Ticket >= 1000000 and [First Name] is not empty}}big{{/if}}').text, 'big')
assert.equal(run('{{#if Ticket > 9000000 or Company = North*}}yes{{/if}}').text, 'yes')
assert.equal(run('{{#if Ticket > 900}}num{{/if}}').text, 'num', '2500000 > 900 numerically, not as text')
assert.equal(run('{{#if Empty}}x{{else}}blank{{/if}}').text, 'blank')
assert.equal(run('{{#if Sector <> "Fintech"}}a{{else}}b{{/if}}').text, 'b')
assert.equal(run('{{#if Sector = Fintech}}{{#if Stage = "Seed"}}1{{else}}2{{/if}}{{/if}}').text, '2', 'nested if')
// HTML escaping applies to merged values only
assert.equal(render(parseTemplate('<b>{{X}}</b>'), { row: { X: '<script>' }, record: 1, sequence: 1, escape: escapeHtml }).text, '<b>&lt;script&gt;</b>')
// Template errors
for (const bad of ['{{#if A}}x', '{{/if}}', '{{else}}', 'Hi {{Name', '{{Name | shout}}', '{{@nope}}', '{{#if}}x{{/if}}']) {
  assert.ok(parseTemplate(bad).errors.length > 0, `expected an error for ${bad}`)
}

// CSV: quotes, embedded commas and newlines, BOM, delimiter detection
const csv = parseDelimited('﻿Name,Email,Note\r\n"Rao, Asha",a@x.com,"line1\nline2 ""q"""\r\n')
assert.deepEqual(csv, [['Name', 'Email', 'Note'], ['Rao, Asha', 'a@x.com', 'line1\nline2 "q"']])
assert.deepEqual(parseDelimited('a\tb\n1\t2'), [['a', 'b'], ['1', '2']])
assert.deepEqual(parseDelimited('a;b\n1;2'), [['a', 'b'], ['1', '2']])
// Dataset: blank rows dropped, duplicate and blank headers named, no-header mode
const ds = toDataset([['Email', 'Email', ''], ['a@x.com', 'b@x.com', 'z'], ['', '', ''], ['c@x.com', '', '']])
assert.deepEqual(ds.headers, ['Email', 'Email (2)', 'Column C'])
assert.equal(ds.rows.length, 2)
assert.deepEqual(toDataset([['x', 'y']], false).headers, ['A', 'B'])
assert.equal(guessEmailColumn({ headers: ['Name', 'Contact'], rows: [{ Name: 'A', Contact: 'a@x.com' }] }), 'Contact')
// Excel round trip
const wb = readWorkbook(toXlsx([{ Name: 'A', Email: 'a@x.com' }]))
assert.deepEqual(wb.matrix(wb.sheets[0]), [['Name', 'Email'], ['A', 'a@x.com']])

// Filter (Word's And/Or rows) and sort
const rows = [
  { Name: 'C', Sector: 'SaaS', Ticket: '10', Email: 'c@x.com' },
  { Name: 'A', Sector: 'Fintech', Ticket: '200', Email: 'a@x.com' },
  { Name: 'B', Sector: 'Fintech', Ticket: '30', Email: 'A@x.com' },
]
assert.deepEqual(arrange(rows, [{ join: 'and', field: 'Sector', op: 'eq', value: 'fintech' }], []), [1, 2])
assert.deepEqual(arrange(rows, [{ join: 'and', field: 'Sector', op: 'eq', value: 'fintech' }, { join: 'or', field: 'Name', op: 'eq', value: 'C' }], []), [0, 1, 2])
assert.deepEqual(arrange(rows, [], [{ field: 'Ticket', dir: 'desc' }]), [1, 2, 0], 'numeric sort')
assert.deepEqual([...duplicateRows(rows, 'Email')], [2], 'duplicates ignore case')

// Merge: sequence skips duplicates, errors block, warnings do not
const mrows = [
  { Name: 'Asha', Email: 'asha@x.com', File: 'deck.pdf' },
  { Name: '', Email: 'meera@x.com', File: '' },
  { Name: 'Bad', Email: 'nope', File: '' },
  { Name: 'Asha again', Email: 'ASHA@x.com', File: '' },
  { Name: 'Missing file', Email: 'f@x.com', File: 'other.pdf' },
]
const settings = { toColumn: 'Email', cc: '', bcc: '', subject: 'Hi {{Name}}', body: 'Dear {{Name}},\n#{{@sequence}}', format: 'text', attachmentColumn: 'File', fills: {}, skipDuplicates: true }
const compiled = compile(settings, ['Name', 'Email', 'File'])
assert.deepEqual(compiled.errors, [])
const out = mergeRecords(mrows, [0, 1, 2, 3, 4], settings, compiled, { availableFiles: ['Deck.PDF'] })
assert.deepEqual(out.map(m => m.sequence), [1, 2, 3, 0, 4])
assert.ok(out[3].skipped, 'second asha@ is skipped')
assert.ok(out[1].issues.some(i => i.level === 'warning'), 'blank name is a warning')
assert.ok(out[2].issues.some(i => i.level === 'error'), 'invalid address is an error')
assert.ok(out[4].issues.some(i => /other\.pdf/.test(i.message)), 'missing attachment is an error')
assert.deepEqual(ready(out).map(m => m.record), [1, 2])
assert.ok(compile({ ...settings, body: '{{Nope}}' }, ['Name', 'Email']).unknownFields.includes('Nope'))
assert.ok(compile({ ...settings, subject: '' }, ['Name']).errors.includes('Subject is empty'))

// .eml: encoded subject, draft flag, attachment part
const eml = buildEml({ ...out[0], subject: 'Héllo Asha' }, { from: 'Me <me@x.com>', attachments: [{ name: 'deck.pdf', type: 'application/pdf', bytes: new Uint8Array([1, 2, 3]) }] })
assert.match(eml, /^From: Me <me@x\.com>\r\n/)
assert.match(eml, /Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/)
assert.match(eml, /X-Unsent: 1/)
assert.match(eml, /Content-Disposition: attachment; filename="deck\.pdf"/)
assert.match(eml, /AQID/, 'attachment bytes base64')
const bodyB64 = /charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n\r\n/.exec(eml)[1]
assert.equal(Buffer.from(bodyB64.replace(/\r\n/g, ''), 'base64').toString('utf8'), 'Dear Asha,\r\n#1')

// zip: signatures and entry count
const z = zip([{ name: 'a.eml', data: 'hello' }, { name: 'b.eml', data: 'world' }])
const view = new DataView(z.buffer)
assert.equal(view.getUint32(0, true), 0x04034b50)
assert.equal(view.getUint32(z.length - 22, true), 0x06054b50)
assert.equal(view.getUint16(z.length - 12, true), 2)
assert.equal(view.getUint32(14, true), 0x3610a686, 'crc32 of "hello"')

assert.equal(messageRows(ready(out))[0].To, 'asha@x.com')
console.log('check:mailmerge ok')
