# Integration notes for PRs #31, #33, #35, #37, and #39

This branch combines the following pull requests so their interactions can be reviewed and tested in one place:

- [#31: Keep timeline headers visible while scrolling long schedules](https://github.com/info-emait/QueryGantt/pull/31)
- [#33: Add team backlog ordering and drag reordering](https://github.com/info-emait/QueryGantt/pull/33)
- [#35: Add configurable timeline date granularity](https://github.com/info-emait/QueryGantt/pull/35)
- [#37: Persist timeline zoom and add zoom presets](https://github.com/info-emait/QueryGantt/pull/37)
- [#39: Always open timeline work items in a new tab](https://github.com/info-emait/QueryGantt/pull/39)

Branch: [storywriter/QueryGantt:internal/integrated-querygantt](https://github.com/storywriter/QueryGantt/tree/internal/integrated-querygantt)

This is an integration and reference branch, not a replacement for reviewing and merging the four focused pull requests individually. The individual PR branches remain the authoritative isolated changes.

## Integration basis and order

The branch starts from `info-emait/QueryGantt@54f4cdb` (`v1.5.2`). The PR changes were replayed in PR-number order:

| Pull request | Initial source commit(s) | Current focused PR tip | Initial commit(s) on this branch |
| --- | --- | --- | --- |
| #31 | `b7fa674`, `31d0de5` | `9bd0f8c` | `7959d4e`, `f1758f0` |
| #33 | `31389d5` | `9c8705e` | `3b9ccfb` |
| #35 | `04f9775` | `19265b0` | `0622e6e` |
| #37 | `c15a451` | `7046627` | `1924028` |
| #39 | `a1377d4` | `a1377d4` | `cc55b1c` |

The commit IDs differ because the changes were replayed onto one branch and integration conflicts were resolved there.

Two additional stabilization commits were initially added on the combined branch:

- `bcda4dc` serializes and merges settings updates so backlog order, date granularity, and zoom settings do not overwrite one another. It also adds combined-behavior tests.
- `b2c95d9` prevents duplicate initial query/backlog loads caused by eager Knockout computed evaluation and adds startup and day-drag boundary tests. This startup fix is also carried by each focused PR branch so any PR can be tested independently.

`a1f33ff` adds the production-feedback hardening described below. `962ad5d` additionally keeps the Day zoom cap correct when Azure DevOps resizes the extension host. The relevant parts are also carried by their focused PR branches rather than requiring this integration branch to be merged.

The first internally installed package exposed the following integration gaps, all of which are addressed at the current tips: fixed-height row scrolling, a redundant bottom axis, non-responsive native drag handles, completed items missing from the backlog response, inactive zoom/granularity controls, stale per-user preferences, and the `Order` label. This branch is therefore useful as a combined regression reference; it does not replace the focused review scope of the individual PRs.

A second production pass on 2026-08-24 found four follow-up gaps. Commits `21f6e8a`, `41bb788`, `195c410`, and `fd824a3` respectively add direction-aware page/timeline scrolling, apply successful backlog moves locally without a full query reload while batching expand/collapse redraws, hide stale bars outside the visible date window, and cap the selector at 400% while migrating an already saved 500% preference. Each change is also present in the focused PR tip listed above.

A third production pass found intermittent Azure reorder rejections, two adjacent hit regions for one logical insertion boundary, and expand/collapse buttons that changed the entire tree at once. Commit `da22964` validates the proposed parent category and the current team's Area Paths before calling Azure (including the neighboring anchor IDs), exposes Azure's rejection detail when the server still refuses a request, canonicalizes an `after`/`before` row boundary to one blue line, and changes the hierarchy controls by exactly one visible level per click. The focused implementation is retained and extended by `9c8705e` on PR #33; the other feature PRs are intentionally unchanged because these corrections belong entirely to backlog ordering.

A fourth production pass on 2026-08-25 is addressed by `cc55b1c`. Backlog discovery no longer blocks the first query render; a remembered Backlog order shows `Loading…`, can recover from a transient `Unavailable` state without a page reload, and retries one stale `TF400486` operation after refreshing only the backlog index. Concrete work-item types now disambiguate invalid same-category and skipped-level parents, while valid Task-to-another-User-Story moves remain supported. Child destinations highlight the title in light green, `1 day` provides a width-aware daily zoom target, and timeline work-item titles use safe native new-tab navigation. Focused equivalents are `9c8705e` on PR #33, `7046627` on PR #37, and the independent PR #39; PRs #31 and #35 are intentionally unchanged.

A Windows build pass on 2026-08-27 exposed a test-only line-ending dependency in the child-drop LESS assertion. The integration test now normalizes CRLF and CR input before checking the exact selector structure. The equivalent correction belongs to PR #33 because that is the only focused PR containing the child-drop styling and regression test; PRs #31, #35, and #37 do not contain the affected assertion.

A fifth production pass on 2026-08-27 found two host-state regressions. Commit `58bac16` serializes visible-column query-string writes and skips `HostNavigationService.setQueryParams` when `showFields` is already unchanged; this prevents Azure DevOps from repeatedly reloading the extension iframe in response to a no-op initial Knockout notification. Commit `0d921c5` updates the existing vis-timeline group/item DataSets after an accepted Backlog move when the rendered IDs and dependency graph are unchanged, instead of destroying and recreating the timeline. It preserves each node's expanded/collapsed state, descendant visibility, the current date window, and page scroll position. The URL guard is carried by PRs #31, #33, #35, and #37 because it protects every independently installable feature branch; the in-place hierarchy update belongs only to PR #33.

## Integration decisions

- Let the Azure DevOps page scroll the naturally expanded Work Item rows. Only the top date axis is rendered; a read-only fixed mirror keeps it below the sticky filter after its original position scrolls away. PNG export renders the already expanded timeline without changing the user's scroll state.
- Keep vertical wheel and dominant vertical background-drag input on the page scroll container. Native horizontal trackpad input, Shift + wheel, and dominant horizontal background drags pan the date range.
- Use pointer-driven backlog drag handling so vis-timeline's gesture handling cannot swallow native drag events. Query items omitted from the Backlog API, including completed items, are associated with their process-specific Order field and remain eligible for reorder operations.
- Before a reorder write, require the proposed parent to be in the immediately higher backlog category (or root), and require the moved item, target, and neighboring reorder anchors to belong to the current team's configured Area Paths. An item with an invalid current parent can still be moved to root or a valid parent to repair the hierarchy.
- Treat the lower half of one sibling row and the upper half of the next sibling row as one insertion boundary, rendered as one blue line. Expand and collapse buttons reveal or hide one visible hierarchy level per click, matching Azure Boards.
- After Azure accepts a backlog move, update the cloned backlog index, query path, parent metadata, and child counts locally instead of calling `refresh()`. Invalid or rejected moves leave local state unchanged. Expand/collapse sends one DataSet batch rather than one redraw per Work Item.
- For a successful move that keeps the same Work Item and dependency IDs, retain the live vis-timeline instance and update its ordered DataSets in place. Carry forward each group's `showNested` state, recompute descendant visibility from the new parent graph, and restore page scroll after the batch update.
- If Azure returns stale-snapshot error `TF400486`, rebuild only the current team's backlog index and retry the exact operation once. Do not retry deterministic process-hierarchy violations, and preserve Azure's final error text when the retry still fails.
- Render WIQL results before slow Backlog and icon requests finish. Mark the Backlog selector as loading during discovery and activate the persisted Backlog order as soon as its index arrives, without re-running the query.
- Reconcile rendered item DOM with the current visible date window after initial draw and range changes so stale out-of-window bars cannot remain pinned at an edge.
- Keep visible columns and backlog sort mode in Azure Extension Data as before. Keep timeline granularity and zoom in browser-local storage, scoped by extension, project, and (for zoom) query, so public/internal installations and different queries do not overwrite each other.
- Define zoom presets as data-relative magnifications: `100%` fits all data, while `200%` through `400%` show progressively smaller windows. `1 day` derives a window from the drawable timeline width so each day receives a minor-axis label. Arbitrary wheel/pinch/button zoom is stored as `Custom`.
- In `Day` granularity, set and resize a width-aware `zoomMin` so vis-timeline cannot switch to an hour/minute axis. `Hours and minutes` retains the original unrestricted behavior.
- Open timeline work-item titles through native `target="_blank"` anchors with `noopener noreferrer`; stop propagation to vis-timeline without cancelling browser navigation.
- Observe backlog order, date granularity, and zoom together when constructing or updating the timeline.
- Treat Azure host query parameters as external navigation state: serialize updates, preserve unrelated parameters, and avoid writing an unchanged `showFields` value because even a no-op host write may reload the iframe.

If the focused PRs are merged separately, the suggested feature order is #31, #33, #35, then #37. PR #39 is independent and can be merged separately. Integration-only adjustments should then be reviewed and adapted to the resulting upstream state. This branch should not be merged wholesale without that review, especially if `main` has moved beyond `v1.5.2`.

## Validation

Last rerun on 2026-08-27:

- `npm test`: all 9 Node test suites passed.
- The timeline interaction suite also passed while its LESS input was forced to Windows CRLF line endings.
- Date-granularity unit and integration suites passed under both `America/New_York` and `Asia/Tokyo` time zones.
- `npx grunt app-build:Debug`: passed, including JSHint for 37 files.
- `npx grunt app-build:Release`: passed, including JSHint for 37 files, CSS minification, and JavaScript minification.
- Browser checks against the actual Release-built component and bundled vis-timeline 8.5.0: all 22 automated integrated checks passed with zero runtime errors.
- Real component/DataSet checks observed 48 → 2 → 1 visible rows on two collapse actions and 1 → 2 → 48 rows on two expand actions.
- Real pointer input across both sides of the same sibling boundary retained exactly one marker (`before` the next row) and produced the expected reorder operation.
- PR #31's focused branch independently passed its 2 Node suites and Debug build (JSHint for 33 files).
- PR #33's focused branch independently passed its 4 Node suites and Debug build (JSHint for 34 files).
- PR #35's focused branch independently passed its 4 Node suites, the date tests under `America/New_York`, and Debug build (JSHint for 35 files).
- PR #37's focused branch independently passed its 4 Node suites and Debug build (JSHint for 35 files).
- PR #39's focused branch independently passed its navigation regression suite and Debug build (JSHint for 33 files).
- Real wheel and pointer input verified that vertical wheel moved only the page by 421 px, vertical drag moved only the page by 160 px, and horizontal wheel/drag changed the date labels without changing page scroll position.
- Real pointer input was used to verify completed-item sibling reordering and immediate local row movement without a reload. Automated integration coverage also verifies cross-level Parent reassignment, API-failure rollback, stale-range hiding/reappearance, saved-500%-to-400% migration, and single-batch expand/collapse.
- Startup integration coverage verifies that two concurrent notifications for one visible-column value produce exactly one host write, while an already matching URL produces none and retains unrelated parameters.
- Timeline interaction coverage simulates reordering a collapsed User Story whose Task is hidden. The same timeline instance remains active, the User Story stays collapsed, its Task stays hidden, the new order is applied, and the original page scroll is restored even when the DataSet update perturbs it.

The combined checks cover natural and directional page scrolling, the floating top-only axis, completed-item pointer drag, process-aware containment and team Area Path prevalidation, valid Task cross-parent moves, one stale-snapshot retry, a single logical sibling boundary, distinct child highlighting, one-level tree expansion/collapse, collapsed-tree and page-scroll preservation across local reorder/reparent state, no-op host-navigation suppression, non-blocking Backlog discovery, percentage and daily zoom behavior, day/time axis limits, visible-range clipping, safe new-tab navigation, browser-local persistence, visible-column persistence precedence, startup duplicate-load prevention, and naturally expanded PNG export.

## Remaining live-environment check

The previous packages were exercised in a real Azure DevOps organization and produced the production feedback above. The two fifth-pass commits have automated, Release-build, and local-browser coverage, but have not yet been reinstalled there. Before publication, another live smoke test should confirm that opening the Gantt tab performs no repeated iframe reload, that a collapsed hierarchy stays collapsed and keeps its page position after a valid reorder, valid same-parent and cross-parent writes for active and completed Work Items, local rejection and repair routes for invalid process hierarchies, successful recovery from a genuinely stale `TF400486` snapshot, daily zoom with the organization's real field columns, new-tab navigation in the Azure host, and the earlier scrolling, clipping, expansion, and persistence corrections.
