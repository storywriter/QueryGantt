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

| Pull request | Initial source commit(s) | Current focused PR tip | Initial commit(s) on this branch |
| --- | --- | --- | --- |
| #31 | `b7fa674`, `31d0de5` | `b5ead69` | `7959d4e`, `f1758f0` |
| #33 | `31389d5` | `be68baf` | `3b9ccfb` |
| #35 | `04f9775` | `8f84573` | `0622e6e` |
| #37 | `c15a451` | `0a9280d` | `1924028` |

The commit IDs differ because the changes were replayed onto one branch and integration conflicts were resolved there.

Two additional stabilization commits were initially added on the combined branch:

- `bcda4dc` serializes and merges settings updates so backlog order, date granularity, and zoom settings do not overwrite one another. It also adds combined-behavior tests.
- `b2c95d9` prevents duplicate initial query/backlog loads caused by eager Knockout computed evaluation and adds startup and day-drag boundary tests. This startup fix is also carried by each focused PR branch so any PR can be tested independently.

`a1f33ff` adds the production-feedback hardening described below. `962ad5d` additionally keeps the Day zoom cap correct when Azure DevOps resizes the extension host. The relevant parts are also carried by their focused PR branches rather than requiring this integration branch to be merged.

The first internally installed package exposed the following integration gaps, all of which are addressed at the current tips: fixed-height row scrolling, a redundant bottom axis, non-responsive native drag handles, completed items missing from the backlog response, inactive zoom/granularity controls, stale per-user preferences, and the `Order` label. This branch is therefore useful as a combined regression reference; it does not replace the focused review scope of the individual PRs.

A second production pass on 2026-08-24 found four follow-up gaps. Commits `21f6e8a`, `41bb788`, `195c410`, and `fd824a3` respectively add direction-aware page/timeline scrolling, apply successful backlog moves locally without a full query reload while batching expand/collapse redraws, hide stale bars outside the visible date window, and cap the selector at 400% while migrating an already saved 500% preference. Each change is also present in the focused PR tip listed above.

## Integration decisions

- Let the Azure DevOps page scroll the naturally expanded Work Item rows. Only the top date axis is rendered; a read-only fixed mirror keeps it below the sticky filter after its original position scrolls away. PNG export renders the already expanded timeline without changing the user's scroll state.
- Keep vertical wheel and dominant vertical background-drag input on the page scroll container. Native horizontal trackpad input, Shift + wheel, and dominant horizontal background drags pan the date range.
- Use pointer-driven backlog drag handling so vis-timeline's gesture handling cannot swallow native drag events. Query items omitted from the Backlog API, including completed items, are associated with their process-specific Order field and remain eligible for reorder operations.
- After Azure accepts a backlog move, update the cloned backlog index, query path, parent metadata, and child counts locally instead of calling `refresh()`. Invalid or rejected moves leave local state unchanged. Expand/collapse sends one DataSet batch rather than one redraw per Work Item.
- Reconcile rendered item DOM with the current visible date window after initial draw and range changes so stale out-of-window bars cannot remain pinned at an edge.
- Keep visible columns and backlog sort mode in Azure Extension Data as before. Keep timeline granularity and zoom in browser-local storage, scoped by extension, project, and (for zoom) query, so public/internal installations and different queries do not overwrite each other.
- Define zoom presets as data-relative magnifications: `100%` fits all data, while `200%` through `400%` show progressively smaller windows. Arbitrary wheel/pinch/button zoom is stored as `Custom`.
- In `Day` granularity, set and resize a width-aware `zoomMin` so vis-timeline cannot switch to an hour/minute axis. `Hours and minutes` retains the original unrestricted behavior.
- Observe backlog order, date granularity, and zoom together when constructing or updating the timeline.

If the four PRs are merged separately, the suggested order is #31, #33, #35, then #37. The two integration-only commits above should then be reviewed and adapted to the resulting upstream state. This branch should not be merged wholesale without that review, especially if `main` has moved beyond `v1.5.2`.

## Validation

Last rerun on 2026-08-24:

- `npm test`: all 9 Node test suites passed.
- Date-granularity unit and integration suites passed under both `America/New_York` and `Asia/Tokyo` time zones.
- `npx grunt app-build:Debug`: passed, including JSHint for 37 files.
- `npx grunt app-build:Release`: passed, including JSHint for 37 files, CSS minification, and JavaScript minification.
- The parameterized internal Release build also passed with a non-production review publisher/version, proving that the same integrated source follows the private-build path without relying on public extension placeholders.
- Browser checks against the actual Release-built component and bundled vis-timeline 8.5.0: all 15 integrated checks passed with zero runtime errors.
- Real wheel and pointer input verified that vertical wheel moved only the page by 421 px, vertical drag moved only the page by 160 px, and horizontal wheel/drag changed the date labels without changing page scroll position.
- Real pointer input was used to verify completed-item sibling reordering and immediate local row movement without a reload. Automated integration coverage also verifies cross-level Parent reassignment, API-failure rollback, stale-range hiding/reappearance, saved-500%-to-400% migration, and single-batch expand/collapse.

The combined checks cover natural and directional page scrolling, the floating top-only axis, completed-item pointer drag, reload-free local reorder/reparent state, percentage zoom behavior, day/time axis limits, visible-range clipping, browser-local persistence, visible-column persistence precedence, startup duplicate-load prevention, and naturally expanded PNG export.

## Remaining live-environment check

The previous packages were exercised in a real Azure DevOps organization and produced the two rounds of production feedback above. The latest 2026-08-24 corrections have automated and local-browser coverage, but have not yet been reinstalled there. Before publication, another live smoke test should confirm directional scrolling inside the Azure DevOps host iframe, no edge-pinned out-of-range bars, reload-free reorder/reparent writes for active and completed Work Items, expand-all responsiveness, and browser-local restoration after navigation/reload.
