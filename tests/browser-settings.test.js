"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let service = null;
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/services/browser-settings.js"), "utf8"), {
    console: { warn: function () {} },
    define: function (dependencies, factory) { service = factory(); },
    encodeURIComponent: encodeURIComponent
});

const values = new Map();
const storage = {
    getItem: function (key) { return values.has(key) ? values.get(key) : null; },
    setItem: function (key, value) { values.set(key, value); }
};

assert.strictEqual(service.write("publisher.internal", "project-a", "dateGranularity", null, "day", storage), true);
assert.strictEqual(service.read("publisher.internal", "project-a", "dateGranularity", null, storage), "day");
assert.strictEqual(service.read("publisher.public", "project-a", "dateGranularity", null, storage), null, "different extension builds must not share preferences");

assert.strictEqual(service.write("publisher.internal", "project-a", "timelineListWidth", null, 480, storage), true);
assert.strictEqual(service.read("publisher.internal", "project-a", "timelineListWidth", null, storage), 480);
assert.strictEqual(service.read("publisher.internal", "project-b", "timelineListWidth", null, storage), null, "layout preferences must be scoped per project");

const view = { preset: "custom", start: "2026-08-21T00:00:00.000Z", end: "2026-08-28T00:00:00.000Z" };
service.write("publisher.internal", "project-a", "zoomView", "query-a", view, storage);
assert.deepStrictEqual(JSON.parse(JSON.stringify(service.read("publisher.internal", "project-a", "zoomView", "query-a", storage))), view);
assert.strictEqual(service.read("publisher.internal", "project-a", "zoomView", "query-b", storage), null, "zoom windows must be scoped per query");

values.set(service.getKey("publisher.internal", "project-a", "zoomView", "broken"), "not-json");
assert.strictEqual(service.read("publisher.internal", "project-a", "zoomView", "broken", storage), null, "malformed browser data should fail safely");
assert.strictEqual(service.write("publisher.internal", "project-a", "zoomView", "query-a", view, {}), false, "disabled storage should not break the extension");

console.log("browser settings tests passed");
