# Integration notes for PRs #31, #33, #35, and #37

This branch combines the following pull requests so their interactions can be reviewed and tested in one place:

- [#31: Keep timeline headers visible while scrolling long schedules](https://github.com/info-emait/QueryGantt/pull/31)
- [#33: Add team backlog ordering and drag reordering](https://github.com/info-emait/QueryGantt/pull/33)
- [#35: Add configurable timeline date granularity](https://github.com/info-emait/QueryGantt/pull/35)
- [#37: Persist timeline zoom and add zoom presets](https://github.com/info-emait/QueryGantt/pull/37)

Branch: [storywriter/QueryGantt:internal/integrated-querygantt](https://github.com/storywriter/QueryGantt/tree/internal/integrated-querygantt)

This is an integration and reference branch, not a replacement for reviewing and merging the four focused pull requests individually. The individual PR branches remain the authoritative isolated changes.

## Integration basis and order

The branch starts from `info-emait/QueryGantt@54f4cdb` (`v1.5.2`). The PR changes were replayed in PR-number order:

| Pull request | Source commit(s) | Commit(s) on this branch |
| --- | --- | --- |
| #31 | `b7fa674`, `31d0de5` | `7959d4e`, `f1758f0` |
| #33 | `31389d5` | `3b9ccfb` |
| #35 | `04f9775` | `0622e6e` |
| #37 | `c15a451` | `1924028` |

The commit IDs differ because the changes were replayed onto one branch and integration conflicts were resolved there.

Two additional stabilization commits apply only to the combined branch:

- `bcda4dc` serializes and merges settings updates so backlog order, date granularity, and zoom settings do not overwrite one another. It also adds combined-behavior tests.
- `b2c95d9` prevents duplicate initial query/backlog loads caused by eager Knockout computed evaluation and adds startup and day-drag boundary tests.

## Integration decisions

- Keep vis-timeline's internal vertical scrolling and bounded height from #31. PNG export temporarily expands the chart and restores both height and scroll position on success or failure.
- Keep backlog drag/drop behavior from #33 while rendering only the timeline chart, not its surrounding controls, in PNG exports.
- Store backlog order, date granularity, and zoom in the existing shared settings object. Every partial update reads, merges, and serializes the complete object before saving it.
- Observe backlog order, date granularity, and zoom together when constructing or updating the timeline.

If the four PRs are merged separately, the suggested order is #31, #33, #35, then #37. The two integration-only commits above should then be reviewed and adapted to the resulting upstream state. This branch should not be merged wholesale without that review, especially if `main` has moved beyond `v1.5.2`.

## Validation

Last rerun on 2026-08-21:

- `npm test`: all 7 Node test suites passed.
- `TZ=America/New_York node tests/date-granularity.test.js`: passed.
- `TZ=America/New_York node tests/querygantt-date-granularity-integration.test.js`: passed.
- `npx grunt app-build:Debug`: passed, including JSHint for 36 files.
- `npx grunt app-build:Release`: passed, including JSHint for 36 files.
- Browser checks against the actual Release-built component and bundled vis-timeline/dom-to-image libraries: 31 checks passed (10 header/PNG, 8 backlog ordering, 6 date granularity, and 7 zoom).

The combined checks cover settings coexistence, per-query zoom restoration, inclusive target dates for day-granularity drag updates, milestone updates, startup duplicate-load prevention, and PNG height/scroll restoration after both success and failure.

## Remaining live-environment check

The browser checks exercise the Release build with the bundled vis-timeline 8.5.0 and dom-to-image 2.6.0, but they do not authenticate to a real Azure DevOps organization. Before publication, a live smoke test should still confirm team-context discovery, backlog loading and reorder writes, and rendering inside the Azure DevOps host iframe and active theme.
