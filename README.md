# How to enable build?
If you see build errors, claiming that it is not possible to run command line `grunt.ps1` because of the execution policy, it is necessary to run the following powershell script and to restart Visual Studio Code:

```ps
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

# Tests

Run `npm test` for the Node regression suites. Changes to timeline layout also
require `npm run test:browser`, which uses headless Google Chrome with a temporary
profile and synthetic work items. Install Chrome before running this command.
To use Playwright's own Chromium instead, run `npx playwright install chromium`
and set `QUERYGANTT_BROWSER_CHANNEL=chromium` when running the browser tests.

The browser suite checks the real timeline and source LESS across multiple
one-second resize polls, including hidden-tab startup, out-of-range child items,
page scrolling, collapse/expand, and narrower host widths.

# Parent-link analysis

The error card offers on-demand, read-only Parent-link analysis with Japanese
and English labels selected from the Azure DevOps page culture. It reports
checked paths, incompatible links, incomplete reads, and original HTTP errors.

See [Parent-link analysis](docs/parent-link-analysis.md) for behavior, limits,
and verification. This feature is proposed independently in
[PR #45](https://github.com/info-emait/QueryGantt/pull/45); the backlog-reordering
implementation remains in [PR #33](https://github.com/info-emait/QueryGantt/pull/33).
