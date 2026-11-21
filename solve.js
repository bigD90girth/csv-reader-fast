// A faster drop-in for csv-reader 1.0.0: run(input) returns exactly
// csv-reader's {columns, rows, errors} for {text, header}, read once left
// to right under the same broken-row policy.
//
// The reference walks the text one character at a time and builds every
// field a character at a time. This one jumps instead: an unquoted field
// is one slice between the next comma and the next line feed (a stray CR
// inside it is the only thing that falls back to a slow scan), a quoted
// field is one slice between its quotes (only a line break or a doubled
// quote inside it needs a transform), and line numbers come from
// counting the breaks in the slices it already took. Nothing is kept
// from one call to the next.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows
  // it takes (null: the header). Every error of the record carries these.
  let recordLine = 1;
  let recordRow = null;

  function strayCr() {
    errors.push({ code: "stray_cr", line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from pos onto `value`, up to the next comma
  // or line break. Only used when the fast slice found a stray CR in the
  // field, or for what follows a closing quote, or after a quote that
  // never closes. Returns [value, ended, added]: added counts the
  // characters kept past `value` (a dropped CR adds none).
  function readUnquotedSlow(value, start) {
    let added = 0;
    let p = start;
    while (p < len) {
      const c = text.charCodeAt(p);
      if (c === 44) {
        pos = p + 1;
        return [value, COMMA, added];
      }
      if (c === 10) {
        line += 1;
        pos = p + 1;
        return [value, LINE_BREAK, added];
      }
      if (c === 13) {
        if (text.charCodeAt(p + 1) === 10) {
          line += 1;
          pos = p + 2;
          return [value, LINE_BREAK, added];
        }
        strayCr();
        p += 1;
        continue;
      }
      // A run of plain characters, taken as one slice.
      let end = p + 1;
      while (end < len) {
        const d = text.charCodeAt(end);
        if (d === 44 || d === 10 || d === 13) break;
        end += 1;
      }
      value += text.slice(p, end);
      added += end - p;
      p = end;
    }
    pos = len;
    return [value, END, added];
  }

  // The quoted field whose opening quote is at pos. Sets the module
  // variables qValue and qEnded, and moves pos and line past it.
  let qValue = "";
  let qEnded = END;
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = "";
    let search = pos + 1;
    while (true) {
      const q = text.indexOf('"', search);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the
        // text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: "unterminated_quote", line: recordLine, row: recordRow });
        const r = readUnquotedSlow('"', open + 1);
        qValue = r[0];
        qEnded = r[1];
        return;
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the search goes on.
        value += quotedSegment(search, q);
        value += '"';
        search = q + 2;
        continue;
      }
      value += quotedSegment(search, q);
      pos = q + 1;
      if (pos >= len) {
        qValue = value;
        qEnded = END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        qValue = value;
        qEnded = COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        qValue = value;
        qEnded = LINE_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        qValue = value;
        qEnded = LINE_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to
      // the next comma or line break.
      const r = readUnquotedSlow(value, pos);
      if (r[2] > 0) errors.push({ code: "quote_junk", line: recordLine, row: recordRow });
      qValue = r[0];
      qEnded = r[1];
      return;
    }
  }

  // A stretch of a quoted field, [a, b): each CRLF or lone CR inside it
  // is one LF in the value, and each such break moves the line on.
  function quotedSegment(a, b) {
    if (a === b) return "";
    const s = text.slice(a, b);
    const cr = s.indexOf("\r");
    if (cr === -1) {
      const lf = s.indexOf("\n");
      if (lf === -1) return s;
      let n = 0;
      let i = lf;
      while (i !== -1) {
        n += 1;
        i = s.indexOf("\n", i + 1);
      }
      line += n;
      return s;
    }
    const t = s.replace(/\r\n?/g, "\n");
    let n = 0;
    let i = t.indexOf("\n");
    while (i !== -1) {
      n += 1;
      i = t.indexOf("\n", i + 1);
    }
    line += n;
    return t;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let firstQuoted = false;
    let first = true;
    do {
      const quoted = text.charCodeAt(pos) === 34;
      if (first) {
        firstQuoted = quoted;
        first = false;
      }
      if (quoted) {
        readQuoted();
        fields.push(qValue);
        ended = qEnded;
        continue;
      }
      // Unquoted field: the slice to the nearer of the next comma and
      // the next line feed. A CR in it (other than the CRLF half of its
      // ending break, or a stray one) goes to the slow reader.
      const comma = text.indexOf(",", pos);
      const lf = text.indexOf("\n", pos);
      let end;
      let atComma = false;
      if (comma === -1) end = lf === -1 ? len : lf;
      else if (lf === -1) {
        end = comma;
        atComma = true;
      } else if (comma < lf) {
        end = comma;
        atComma = true;
      } else {
        end = lf;
      }
      let value = text.slice(pos, end);
      if (!atComma && end !== len && end > pos && text.charCodeAt(end - 1) === 13) {
        // A CR just before the line feed is the CRLF half of the
        // break, not part of the value.
        value = value.slice(0, -1);
      }
      if (value.indexOf("\r") !== -1) {
        const r = readUnquotedSlow("", pos);
        fields.push(r[0]);
        ended = r[1];
        continue;
      }
      if (end === len) {
        fields.push(value);
        pos = len;
        ended = END;
        continue;
      }
      if (atComma) {
        fields.push(value);
        pos = end + 1;
        ended = COMMA;
        continue;
      }
      fields.push(value);
      pos = end + 1;
      line += 1;
      ended = LINE_BREAK;
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === "" && !firstQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: "short_row", line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push("");
    } else if (fields.length > width) {
      errors.push({ code: "long_row", line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? columns ?? [] : null, rows, errors };
}
