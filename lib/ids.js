/**
 * A short, stable id for a row on the record.
 *
 * Its own module because three unrelated things need it — legal filings, the
 * lists the archive watches, and the archive's own rows — and importing
 * lib/archive.js into lib/legal.js only to borrow one function would drag the
 * diff into the browser bundle behind it.
 *
 * Not a UUID: this is a roleplay company's record, the lists are capped in the
 * hundreds, and a timestamp plus six random characters will not collide inside
 * one of them.
 */
export function entryId() {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}
