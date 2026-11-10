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

On a backlog-reorder error, choose **Analyze Parent links** to read the named
work items and their current Parent chains. Analysis is read-only and starts
only on request; it never edits links, ranks, or work items. Confirmed findings
identify both ends of same-category links, reversed category links, and cycles.
Unknown categories, other projects, unreadable items, and time/item limits are
reported as incomplete checks rather than proof of a valid hierarchy. Skipped
higher backlog levels alone are not classified as invalid.

The message component owns the diagnostic state and loads current team category
metadata independently of the reorder implementation. The feature can therefore
be reviewed separately from backlog drag-and-drop. It expands current fields
and relations without a field selector, using the REST enum name `all`. Lookup
failures show the HTTP status and original server detail. Successful reads show
paths and links to the actual work item's project; an empty path section is hidden.

Labels use the Azure DevOps user's page culture from
`SDK.getPageContext().globalization.culture`, read after `SDK.ready()`.
Japanese (`ja` and `ja-*`) selects Japanese; other or unavailable cultures fall
back to English. Browser language does not override this setting. Reopen the
tab after changing the Azure DevOps language. IDs, process type names, and
original server errors retain their original values.

`npm test` includes the pinned SDK's actual URL serializer and synthetic REST
responses, both languages, partial failures, cycles, cancellation, and bounds.
`npm run test:browser` exercises the actual message component with host and
browser languages deliberately different. These checks do not replace a VSIX
smoke test in Azure DevOps.
