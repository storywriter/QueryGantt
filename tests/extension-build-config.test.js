const assert = require("assert");
const envFile = require("../grunt/lib/env-file");
const extensionBuildConfig = require("../grunt/lib/extension-build-config");
const extensionManifest = require("../grunt/lib/extension-manifest");
const overview = require("../grunt/lib/overview");

const parsed = envFile.parse([
    "# comment",
    "PLAIN=value",
    "QUOTED=\"value with spaces and # hash\"",
    "MULTILINE=\"first\\nsecond\"",
    "EMPTY=",
    "export EXPORTED=yes # comment"
].join("\n"));

assert.deepStrictEqual(parsed, {
    PLAIN: "value",
    QUOTED: "value with spaces and # hash",
    MULTILINE: "first\nsecond",
    EMPTY: "",
    EXPORTED: "yes"
}, "environment files should support comments, quotes, escapes, empty values, and export syntax");
assert.throws(() => envFile.parse("DUPLICATE=one\nDUPLICATE=two"), /Duplicate environment variable/);
assert.throws(() => envFile.parse("INVALID"), /Invalid environment file entry/);

const validValues = {
    EXTENSION_PUBLISHER: "example-publisher",
    EXTENSION_MARKETPLACE_ID: "querygantt-internal",
    EXTENSION_VERSION: "1.5.2.7",
    EXTENSION_NAME: "Internal Name",
    EXTENSION_DESCRIPTION: "Internal description",
    EXTENSION_PUBLIC: "false",
    EXTENSION_SUPPORT_URI: "",
    EXTENSION_REPOSITORY_URI: "https://git.example.test/internal/querygantt",
    EXTENSION_FEATURE_NAME: "Internal Feature",
    EXTENSION_TAB_TITLE: "Internal Tab Title",
    EXTENSION_TAB_NAME: "Internal Tab",
    EXTENSION_OVERVIEW_NOTICE: "Internal notice",
    EXTENSION_OVERVIEW_SUPPORT_TEXT: ""
};
const normalizedConfig = extensionBuildConfig.create(validValues, "test.env");

assert.strictEqual(normalizedConfig.assetId, "querygantt", "asset identity must remain backward compatible");
assert.strictEqual(normalizedConfig.marketplaceId, "querygantt-internal");
assert.strictEqual(normalizedConfig.manifestOptions.public, false);
assert.strictEqual(normalizedConfig.manifestOptions.repositoryUri, validValues.EXTENSION_REPOSITORY_URI);
assert.throws(
    () => extensionBuildConfig.create(Object.assign({}, validValues, { EXTENSION_NAME: "" }), "test.env"),
    /EXTENSION_NAME is required/
);
assert.throws(
    () => extensionBuildConfig.create(Object.assign({}, validValues, { EXTENSION_NAME: "YOUR_EXTENSION_NAME" }), "test.env"),
    /still contains a placeholder/
);
assert.throws(
    () => extensionBuildConfig.create(Object.assign({}, validValues, { EXTENSION_PUBLIC: "sometimes" }), "test.env"),
    /EXTENSION_PUBLIC must be true or false/
);
assert.throws(
    () => extensionBuildConfig.create(Object.assign({}, validValues, { EXTENSION_REPOSITORY_URI: "http://git.example.test/querygantt" }), "test.env"),
    /EXTENSION_REPOSITORY_URI must be an HTTPS URL/
);
assert.throws(
    () => extensionBuildConfig.create(Object.assign({}, validValues, { EXTENSION_SUPPORT_URI: "file:///support" }), "test.env"),
    /EXTENSION_SUPPORT_URI must be blank, an HTTPS URL, or a mailto URI/
);
assert.strictEqual(
    extensionBuildConfig.create(Object.assign({}, validValues, { EXTENSION_SUPPORT_URI: "mailto:support@example.test" })).manifestOptions.supportUri,
    "mailto:support@example.test"
);

const sourceManifest = JSON.stringify({
    id: "querygantt-internal",
    name: "Query Gantt",
    description: "Public description",
    public: true,
    links: {
        support: {
            uri: "mailto:public@example.test"
        }
    },
    repository: {
        type: "git",
        uri: "https://github.com/info-emait/QueryGantt"
    },
    contributions: [{
        type: "ms.vss-web.feature",
        properties: {
            name: "Query Gantt"
        }
    }, {
        type: "ms.vss-web.tab",
        properties: {
            title: "Query Gantt Tab",
            name: "Gantt"
        }
    }]
}, null, 4) + "\n";

assert.strictEqual(
    extensionManifest.transform(sourceManifest),
    sourceManifest,
    "the standard build must preserve the manifest after token replacement"
);

const publicManifest = JSON.parse(extensionManifest.transform(sourceManifest, {
    name: "Public Name",
    description: "Public build",
    public: true,
    supportUri: "https://support.example.test/querygantt",
    repositoryUri: "https://github.com/example/querygantt",
    featureName: "Public Feature",
    tabTitle: "Public Tab Title",
    tabName: "Public Tab"
}));

assert.strictEqual(publicManifest.name, "Public Name");
assert.strictEqual(publicManifest.description, "Public build");
assert.strictEqual(publicManifest.public, true);
assert.strictEqual(publicManifest.links.support.uri, "https://support.example.test/querygantt");
assert.deepStrictEqual(publicManifest.repository, {
    type: "git",
    uri: "https://github.com/example/querygantt"
});
assert.strictEqual(publicManifest.contributions[0].properties.name, "Public Feature");
assert.strictEqual(publicManifest.contributions[1].properties.title, "Public Tab Title");
assert.strictEqual(publicManifest.contributions[1].properties.name, "Public Tab");

const internalManifest = JSON.parse(extensionManifest.transform(sourceManifest, {
    name: "Internal Name",
    description: "Internal build",
    public: false,
    supportUri: "",
    repositoryUri: "https://git.example.test/internal/querygantt",
    featureName: "Internal Feature",
    tabTitle: "Internal Tab Title",
    tabName: "Internal Tab"
}));

assert.strictEqual(internalManifest.public, false);
assert.strictEqual(internalManifest.links, undefined, "blank support URI should remove the support link and empty links object");
assert.strictEqual(internalManifest.repository.uri, "https://git.example.test/internal/querygantt");

const sourceOverview = [
    "![Logo](img/logo.png)",
    "",
    "# About",
    "Public information.",
    "",
    "# Support",
    "Public support.",
    ""
].join("\n");

assert.strictEqual(overview.transform(sourceOverview), sourceOverview, "the standard build must preserve Overview.md");

const internalOverview = overview.transform(sourceOverview, {
    notice: "> **Internal build:** For authorized users only.",
    supportText: ""
});
assert.ok(internalOverview.includes("> **Internal build:** For authorized users only."));
assert.ok(!internalOverview.includes("# Support"), "blank support text should remove the support section");

const publicOverview = overview.transform(sourceOverview, {
    notice: "",
    supportText: "Use the public issue tracker."
});
assert.ok(publicOverview.includes("# Support\nUse the public issue tracker."));
assert.ok(!publicOverview.includes("Public support."));

console.log("extension build config tests passed");
