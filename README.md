# csv-reader-fast

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/bigD90girth/csv-reader-fast/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/bigD90girth/csv-reader-fast/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` returns exactly csv-reader's `{columns, rows, errors}` for every `{text, header}`, under its broken-row policy (BOM, stray CRs, unterminated quotes, quote junk, short and long rows, multi-line quoted fields). On the practice set it matches the reference byte for byte and runs about 6.5x faster on CPU time.

The reference walks the text one character at a time and builds every field a character at a time. This one jumps instead: an unquoted field is one slice between the next comma and the next line feed (a stray CR inside it is the only thing that falls back to a slow scan), a quoted field is one slice between its quotes (only a line break or a doubled quote inside it needs a transform), and line numbers come from counting the breaks in the slices it already took.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`) and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=kk8gvjx9&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
