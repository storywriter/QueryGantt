"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const browserValues = new Map();
const browserStorage = {
    getItem: function (key) { return browserValues.has(key) ? browserValues.get(key) : null; },
    setItem: function (key, value) { browserValues.set(key, value); }
};

const observable = function (initial) {
    const result = function (value) {
        if (arguments.length) {
            initial = value;
            return result;
        }
        return initial;
    };
    result.__observable = true;
    result.extend = function () { return result; };
    result.peek = function () { return initial; };
    result.subscribe = function () { return { dispose: function () {} }; };
    result.dispose = function () {};
    return result;
};

const knockout = {
    observable: observable,
    observableArray: observable,
    isObservable: function (value) { return Boolean(value && value.__observable); },
    isObservableArray: function (value) { return Boolean(value && value.__observable); },
    computed: function () { return observable(null); },
    computedContext: { isInitial: function () { return false; } },
    components: { register: function () {} },
    applyBindings: function () {}
};

const classList = function () {
    const values = new Set();
    return {
        add: function () { Array.from(arguments).forEach((value) => values.add(value)); },
        remove: function () { Array.from(arguments).forEach((value) => values.delete(value)); },
        contains: function (value) { return values.has(value); }
    };
};

const makeDocument = function () {
    const document = {
        readyState: "loading",
        _ready: null,
        addEventListener: function (name, callback) {
            if (name === "DOMContentLoaded") { this._ready = callback; }
        },
        removeEventListener: function () {},
        querySelector: function () { return null; },
        head: { querySelectorAll: function () { return []; }, appendChild: function () {} },
        body: {
            appendChild: function (element) { element.parentNode = this; },
            removeChild: function (element) { element.parentNode = null; }
        },
        createElement: function () {
            return {
                classList: classList(),
                style: {},
                innerHTML: "",
                firstChild: null,
                parentNode: null,
                setAttribute: function () {},
                removeAttribute: function () {},
                appendChild: function (element) { this.firstChild = element; },
                querySelector: function () { return null; },
                querySelectorAll: function () { return []; }
            };
        }
    };
    return document;
};

const loadService = function (name) {
    let result = null;
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../js/services/" + name + ".js"), "utf8"), {
        Date: Date,
        Map: Map,
        Number: Number,
        Set: Set,
        console: { warn: function () {} },
        define: function (dependencies, factory) { result = factory(); },
        encodeURIComponent: encodeURIComponent,
        isNaN: isNaN,
        localStorage: browserStorage
    }, { filename: name + ".js" });
    return result;
};

const loadAmd = function (filename, dependencies, exposeModel) {
    let result = null;
    let source = fs.readFileSync(filename, "utf8");
    if (exposeModel) {
        source = source.replace(/\n\}\);\s*$/, "\n    return { Model: Model };\n});\n");
    }
    else {
        source = "String.prototype.truncate = function () { return this.toString(); };\n" + source;
    }

    const document = makeDocument();
    vm.runInNewContext(source, {
        Array: Array,
        Date: Date,
        Map: Map,
        Number: Number,
        Promise: Promise,
        Set: Set,
        console: { debug: function () {}, log: function () {}, warn: function () {} },
        define: function (names, factory) { result = factory.apply(null, names.map((name) => dependencies[name] || {})); },
        document: document,
        fetch: function () { throw new Error("Unexpected fetch"); },
        isNaN: isNaN,
        localStorage: browserStorage
    }, { filename: path.basename(filename) });

    return {
        result: result,
        runReady: function () { if (document._ready) { document._ready(); } }
    };
};

const plain = function (value) { return JSON.parse(JSON.stringify(value)); };
const zoomService = loadService("timeline-zoom");
const dateGranularityService = loadService("date-granularity");
const backlogOrderService = loadService("backlog-order");
const browserSettingsService = loadService("browser-settings");

let timelineRegistration = null;
const timelineKnockout = Object.assign({}, knockout, {
    components: { register: function (name, registration) { if (name === "my-timeline") { timelineRegistration = registration; } } }
});

const DataSet = function (data) { this.data = data; };
DataSet.prototype.forEach = function (callback) { this.data.forEach(callback); };
DataSet.prototype.get = function (id) { return this.data.find((item) => item.id === id) || null; };
DataSet.prototype.getIds = function () { return this.data.map((item) => item.id); };
DataSet.prototype.update = function () {};

let latestTimeline = null;
const TimelineStub = function (node, records, groups, options) {
    // vis-timeline briefly exposes a provisional default window before its
    // asynchronous initial fit completes.
    this.window = { start: new Date("2026-08-20T00:00:00.000Z"), end: new Date("2026-08-26T00:00:00.000Z") };
    this.fitWindow = { start: new Date("2026-07-01T00:00:00.000Z"), end: new Date("2026-10-01T00:00:00.000Z") };
    this.handlers = {};
    this.options = options;
    this.selection = [];
    latestTimeline = this;
};
TimelineStub.prototype.getWindow = function () { return { start: new Date(this.window.start), end: new Date(this.window.end) }; };
TimelineStub.prototype.setWindow = function (start, end) {
    if (arguments.length === 1) { end = start.end; start = start.start; }
    this.window = { start: new Date(start), end: new Date(end) };
};
TimelineStub.prototype.fit = function () { this.window = this.fitWindow; };
TimelineStub.prototype.zoomIn = function () {};
TimelineStub.prototype.zoomOut = function () {};
TimelineStub.prototype.focus = function () {};
TimelineStub.prototype.getSelection = function () { return this.selection; };
TimelineStub.prototype.setSelection = function (value) { this.selection = value; };
TimelineStub.prototype.on = function (name, callback) { this.handlers[name] = callback; };
TimelineStub.prototype.off = function (name, callback) { if (this.handlers[name] === callback) { delete this.handlers[name]; } };
TimelineStub.prototype.emit = function (name, value) { this.handlers[name](value); };
TimelineStub.prototype.destroy = function () {};

const createTimelineElement = function () {
    const dropZone = { classList: classList(), style: {} };
    const chart = { clientWidth: 1000, querySelector: function () { return null; } };
    const root = {
        classList: classList(),
        closest: function () { return null; },
        contains: function () { return true; },
        querySelectorAll: function () { return []; },
        querySelector: function (selector) { return selector === ".my-timeline__root-drop-zone" ? dropZone : chart; }
    };
    return { element: { firstChild: root, querySelector: function () { return null; } }, chart: chart };
};

loadAmd(path.join(__dirname, "../js/components/timeline.js"), {
    knockout: timelineKnockout,
    "services/date-granularity": dateGranularityService,
    "services/timeline-zoom": zoomService,
    "vis-timeline": { DataSet: DataSet, Timeline: TimelineStub },
    "vis-timeline-arrow": function () {}
}, false);

const item = {
    id: 1, originalId: 1, parentId: null, parentTitle: "", project: "Project", areaPath: "Project",
    nodeName: "Project", remainingWork: 0, completedWork: 0, effort: 0, iterationPath: "Project",
    isCompleted: false, childCount: 0, childCompletedCount: 0, assignedTo: "",
    url: "https://example.test/_apis/wit/workItems/1", level: 1, path: "1", parent: "",
    title: "Item 1", type: "Task", state: "New", priority: 2, tags: [], dependencies: [],
    startDate: new Date("2026-07-01T00:00:00.000Z"), targetDate: new Date("2026-10-01T00:00:00.000Z")
};
const changes = [];
const timelineElement = createTimelineElement();
const timelineViewModel = timelineRegistration.viewModel.createViewModel({
    items: observable([item]), states: observable([]), priorities: observable([]), types: observable([]),
    typesOther: observable([]), icons: observable({}), showFields: observable([]),
    zoomView: observable({ preset: "custom", start: "2026-08-18T00:00:00.000Z", end: "2026-08-25T00:00:00.000Z" }),
    callbacks: { zoomChanged: function (view) { changes.push(view); } }, actions: {}
}, timelineElement);

timelineViewModel._onItemsChanged();
assert.strictEqual(typeof(latestTimeline.options.onInitialDrawComplete), "function");
latestTimeline.window = latestTimeline.fitWindow;
latestTimeline.options.onInitialDrawComplete();
assert.strictEqual(latestTimeline.window.start.toISOString(), "2026-08-18T00:00:00.000Z");
assert.strictEqual(latestTimeline.options.verticalScroll, false, "the timeline should grow with all rows instead of using a fixed inner viewport");
assert.strictEqual(Object.prototype.hasOwnProperty.call(latestTimeline.options, "maxHeight"), false);
assert.deepStrictEqual(plain(latestTimeline.options.orientation), { axis: "top", item: "top" }, "the redundant bottom axis should be removed");

latestTimeline.emit("rangechanged", latestTimeline.getWindow());
assert.strictEqual(changes.length, 0, "restoring a saved range should not immediately rewrite it");

const fittedDuration = new Date("2026-10-01T00:00:00.000Z") - new Date("2026-07-01T00:00:00.000Z");
timelineViewModel.setZoomPreset("200");
assert.strictEqual(latestTimeline.window.end - latestTimeline.window.start, fittedDuration / 2, "200% should show half of the fitted range");
latestTimeline.emit("rangechanged", latestTimeline.getWindow());
assert.strictEqual(changes[0].preset, "200");

const arbitrary = { start: new Date("2026-09-01T00:00:00.000Z"), end: new Date("2026-09-04T00:00:00.000Z") };
latestTimeline.emit("rangechanged", arbitrary);
assert.strictEqual(changes[1].preset, "custom", "free wheel or pinch zoom should be recorded as Custom");

timelineViewModel.setZoomPreset("100");
latestTimeline.emit("rangechanged", latestTimeline.getWindow());
assert.strictEqual(changes[2].preset, "100");
assert.deepStrictEqual(plain(zoomService.serializeView(changes[2])), { preset: "100" });

const extensionWrites = [];
const manager = {
    getValue: function () { return Promise.resolve(JSON.stringify({ showFields: ["duration"], orderMode: "query" })); },
    setValue: function (key, value) { extensionWrites.push({ key, value }); return Promise.resolve(); }
};
const appModule = loadAmd(path.join(__dirname, "../js/querygantt-tab-app.js"), {
    module: { config: function () { return { priorities: [], fields: [] }; } },
    knockout: knockout,
    sdk: {},
    "services/backlog-order": backlogOrderService,
    "services/browser-settings": browserSettingsService,
    "services/date-granularity": dateGranularityService,
    "services/timeline-zoom": zoomService
}, true).result;
const appModel = new appModule.Model({
    version: "1", priorities: [], fields: [], project: { id: "project-id", name: "Project" },
    query: { id: "query-a", name: "Query A" }, manager: manager, settingsKey: "gantt_project-id",
    extensionId: "publisher.internal", browserStorage: browserStorage, zoomView: { preset: "100" }
});

let selectedPreset = null;
appModel._timeline_setZoomPresetAction(function (preset) { selectedPreset = preset; });
appModel.zoomPreset("100");
appModel.applyZoomPreset(appModel, { target: { value: "300" } });
assert.strictEqual(selectedPreset, "300", "the change event's selected value should be used even before Knockout updates its value binding");
assert.strictEqual(appModel.zoomPreset(), "300");

(async function () {
    assert.strictEqual(await timelineViewModel.exportImage(function (node) { return Promise.resolve(node === timelineElement.chart); }), true, "PNG export should receive the naturally expanded full timeline");
    await assert.rejects(timelineViewModel.exportImage(function () { return Promise.reject(new Error("intentional export failure")); }), /intentional export failure/);

    await appModel.zoomChanged({ preset: "custom", start: "2026-08-20T00:00:00.000Z", end: "2026-08-23T00:00:00.000Z" });
    assert.deepStrictEqual(plain(browserSettingsService.read("publisher.internal", "project-id", "zoomView", "query-a", browserStorage)), {
        preset: "custom", start: "2026-08-20T00:00:00.000Z", end: "2026-08-23T00:00:00.000Z"
    });
    assert.strictEqual(extensionWrites.length, 0, "personal zoom should not be written to shared Azure Extension Data");

    await appModel.zoomChanged({ preset: "400", start: "2026-08-20T00:00:00.000Z", end: "2026-08-21T00:00:00.000Z" });
    assert.deepStrictEqual(plain(browserSettingsService.read("publisher.internal", "project-id", "zoomView", "query-a", browserStorage)), { preset: "400" });

    browserSettingsService.write("publisher.extension", "project-id", "dateGranularity", null, "day", browserStorage);
    browserSettingsService.write("publisher.extension", "project-id", "zoomView", "query-a", {
        preset: "custom", start: "2026-08-10T00:00:00.000Z", end: "2026-08-17T00:00:00.000Z"
    }, browserStorage);

    let startupModel = null;
    const commonServiceIds = { ProjectPageService: "project", HostNavigationService: "navigation" };
    const startupSdk = {
        init: function () {}, ready: function () { return Promise.resolve(); },
        getService: function (id) {
            if (id === "project") { return Promise.resolve({ getProject: function () { return Promise.resolve({ id: "project-id", name: "Project" }); } }); }
            if (id === "navigation") { return Promise.resolve({ getQueryParams: function () { return Promise.resolve({ showFields: "dates" }); } }); }
            throw new Error("Unexpected service");
        },
        getConfiguration: function () { return { query: { id: "query-a", name: "Query A" } }; },
        getExtensionContext: function () { return { id: "publisher.extension" }; },
        getUser: function () { return { displayName: "User" }; },
        getTeamContext: function () { return { id: "team-id", name: "Team" }; },
        notifyLoadSucceeded: function () {}, register: function () {}
    };
    const startupKnockout = Object.assign({}, knockout, { applyBindings: function (model) { startupModel = model; } });
    const startupLoader = loadAmd(path.join(__dirname, "../js/querygantt-tab-app.js"), {
        module: { config: function () { return { priorities: [], fields: [] }; } }, knockout: startupKnockout, sdk: startupSdk,
        "api/index": { CommonServiceIds: commonServiceIds }, "api/WorkItemTracking/index": {}, "api/Work/index": {},
        "services/data": { getManager: function () { return Promise.resolve(manager); } },
        "services/backlog-order": backlogOrderService, "services/browser-settings": browserSettingsService,
        "services/date-granularity": dateGranularityService, "services/timeline-zoom": zoomService
    }, true);
    startupLoader.result.Model.prototype.init = function () { return Promise.resolve(); };
    startupLoader.runReady();
    await new Promise((resolve) => setImmediate(resolve));

    assert.ok(startupModel);
    assert.deepStrictEqual(plain(startupModel.showFields()), ["duration"], "saved visible columns should win over the stale query parameter written by a previous view");
    assert.strictEqual(startupModel.dateGranularity(), "day");
    assert.strictEqual(startupModel.zoomPreset(), "custom");
    assert.strictEqual(startupModel.zoomView().start.toISOString(), "2026-08-10T00:00:00.000Z");

    const html = fs.readFileSync(path.join(__dirname, "../html/querygantt-tab.html"), "utf8");
    assert.ok(html.includes("<span>Sort:</span>"));
    ["Custom", "100%", "200%", "300%", "400%"].forEach((label) => assert.ok(html.includes(">" + label + "</option>")));
    assert.strictEqual(html.includes(">500%</option>"), false, "the zoom selector should stop at 400%");

    console.log("querygantt zoom integration tests passed");
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
