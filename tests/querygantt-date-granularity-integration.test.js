"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

const browserValues = new Map();
const browserStorage = {
    getItem: function (key) { return browserValues.has(key) ? browserValues.get(key) : null; },
    setItem: function (key, value) { browserValues.set(key, value); }
};

const loadService = function (name) {
    let result = null;
    const filename = path.join(__dirname, "../js/services/" + name + ".js");
    const source = fs.readFileSync(filename, "utf8");
    vm.runInNewContext(source, {
        Date: Date,
        Map: Map,
        Number: Number,
        Set: Set,
        console: { warn: function () {} },
        define: function (dependencies, factory) { result = factory(); },
        encodeURIComponent: encodeURIComponent,
        localStorage: browserStorage,
        isNaN: isNaN
    }, { filename: path.basename(filename) });
    return result;
};

const loadAmd = function (filename, dependencies, exposeModel) {
    let result = null;
    let readyCallback = null;
    let source = fs.readFileSync(filename, "utf8");

    if (exposeModel) {
        source = source.replace(/\n\}\);\s*$/, "\n    return { Model: Model };\n});\n");
    }
    else {
        source = "String.prototype.truncate = function () { return this.toString(); };\n" + source;
    }

    const document = {
        readyState: "loading",
        addEventListener: function (name, callback) {
            if (name === "DOMContentLoaded") {
                readyCallback = callback;
            }
        },
        head: {
            querySelectorAll: function () { return []; },
            appendChild: function () {}
        },
        body: {
            appendChild: function (element) {
                element.parentNode = this;
            },
            removeChild: function (element) {
                element.parentNode = null;
            }
        },
        querySelector: function () { return null; },
        createElement: function () {
            return {
                classList: { add: function () {}, remove: function () {} },
                setAttribute: function () {},
                querySelector: function () { return { addEventListener: function () {} }; },
                appendChild: function (element) { this.firstChild = element; },
                querySelectorAll: function () { return []; },
                innerHTML: "",
                style: {}
            };
        }
    };

    vm.runInNewContext(source, {
        Array: Array,
        Date: Date,
        Map: Map,
        Number: Number,
        Promise: Promise,
        Set: Set,
        console: { debug: function () {}, log: function () {}, warn: function () {} },
        define: function (names, factory) {
            result = factory.apply(null, names.map((name) => dependencies[name] || {}));
        },
        document: document,
        fetch: function () { throw new Error("Unexpected fetch"); },
        isNaN: isNaN
    }, { filename: path.basename(filename) });

    return {
        result: result,
        runReady: function () {
            if (readyCallback) {
                readyCallback();
            }
        }
    };
};

const dateGranularityService = loadService("date-granularity");
const backlogOrderService = loadService("backlog-order");
const browserSettingsService = loadService("browser-settings");
const fieldColumnsService = loadService("field-columns");
const timelineSplitService = loadService("timeline-split");
const timelineZoomService = loadService("timeline-zoom");

let timelineRegistration = null;
let timelineCaptures = [];
const timelineKnockout = Object.assign({}, knockout, {
    components: {
        register: function (name, registration) {
            if (name === "my-timeline") {
                timelineRegistration = registration;
            }
        }
    }
});

const DataSet = function (data) {
    this.data = data;
};
DataSet.prototype.forEach = function (callback) { this.data.forEach(callback); };
DataSet.prototype.getIds = function () { return this.data.map((item) => item.id); };
DataSet.prototype.update = function () {};

const TimelineStub = function (node, records, groups, options) {
    this.window = {
        start: new Date("2026-08-01T00:00:00.000Z"),
        end: new Date("2026-09-01T00:00:00.000Z")
    };
    this.setOptionsCalls = [];
    timelineCaptures.push({ node: node, records: records, groups: groups, options: options, instance: this });
};
TimelineStub.prototype.on = function () {};
TimelineStub.prototype.destroy = function () {};
TimelineStub.prototype.setOptions = function (options) { this.setOptionsCalls.push(options); };
TimelineStub.prototype.getWindow = function () {
    return { start: new Date(this.window.start), end: new Date(this.window.end) };
};
TimelineStub.prototype.setWindow = function (start, end) {
    if (arguments.length === 1) {
        end = start.end;
        start = start.start;
    }
    this.window = { start: new Date(start), end: new Date(end) };
};

const createTimelineElement = function (chartWidth) {
    const dropZone = {
        addEventListener: function () {},
        removeEventListener: function () {},
        classList: { add: function () {}, remove: function () {}, contains: function () { return false; } },
        style: {}
    };
    const splitter = {
        style: {},
        addEventListener: function () {},
        removeEventListener: function () {},
        setAttribute: function () {}
    };
    const chart = { clientWidth: chartWidth || 1200, querySelector: function () { return null; } };
    const root = {
        classList: { add: function () {}, remove: function () {} },
        querySelectorAll: function () { return []; },
        closest: function () { return null; },
        contains: function () { return true; },
        querySelector: function (selector) {
            if (selector === ".my-timeline__root-drop-zone") { return dropZone; }
            if (selector === ".my-timeline__splitter") { return splitter; }
            return chart;
        }
    };
    return { element: { firstChild: root, querySelector: function () {} }, chart: chart };
};

loadAmd(path.join(__dirname, "../js/components/timeline.js"), {
    knockout: timelineKnockout,
    "services/date-granularity": dateGranularityService,
    "services/field-columns": fieldColumnsService,
    "services/timeline-split": timelineSplitService,
    "services/timeline-zoom": timelineZoomService,
    "vis-timeline": { DataSet: DataSet, Timeline: TimelineStub },
    "vis-timeline-arrow": function () {}
}, false);

const makeItem = function (id, hour, minute) {
    return {
        id: id,
        parentId: null,
        parentTitle: "",
        project: "Project",
        areaPath: "Project",
        nodeName: "Project",
        remainingWork: 0,
        completedWork: 0,
        effort: 0,
        iterationPath: "Project",
        isCompleted: false,
        childCount: 0,
        childCompletedCount: 0,
        assignedTo: "",
        url: "https://example.test/_apis/wit/workItems/" + id,
        level: 1,
        path: String(id),
        parent: "",
        title: "Item " + id,
        type: "Task",
        state: "New",
        priority: 2,
        tags: [],
        dependencies: [],
        startDate: new Date(2026, 7, 21, hour, minute),
        targetDate: new Date(2026, 7, 21, hour, minute)
    };
};

const granularity = observable("day");
const timelineElement = createTimelineElement();
const timelineViewModel = timelineRegistration.viewModel.createViewModel({
    items: observable([makeItem(1, 1, 20), makeItem(2, 23, 50)]),
    states: observable([]),
    priorities: observable([]),
    types: observable([]),
    typesOther: observable([]),
    icons: observable({}),
    showFields: observable([]),
    dateGranularity: granularity,
    actions: {}
}, timelineElement);

timelineViewModel._onItemsChanged();
let capture = timelineCaptures[timelineCaptures.length - 1];
assert.strictEqual(capture.records.data[0].start.getTime(), capture.records.data[1].start.getTime(), "the built timeline should align same-day timestamps");
assert.strictEqual(capture.records.data[0].end.getTime(), capture.records.data[1].end.getTime(), "the built timeline should render equal full-day bars");
assert.strictEqual(capture.groups.data[0].duration, 1);
assert.strictEqual(typeof capture.options.snap, "function", "day mode should configure day snapping");
assert.strictEqual(capture.options.snap(new Date(2026, 7, 21, 18, 30)).getHours(), 0);
assert.strictEqual(capture.options.zoomMin, dateGranularityService.getZoomMin("day", 1200), "day mode should stop before vis-timeline switches to an hour axis");
timelineElement.chart.clientWidth = 1800;
timelineViewModel._resizeTimeline();
assert.strictEqual(capture.instance.setOptionsCalls[0].zoomMin, dateGranularityService.getZoomMin("day", 1800), "the day cap should follow host panel resizes");
assert.strictEqual(capture.options.verticalScroll, false, "work items should use the page's full-height scroll area");
assert.deepStrictEqual(JSON.parse(JSON.stringify(capture.options.orientation)), { axis: "top", item: "top" }, "only the floating top date axis should be rendered");

const customElement = createTimelineElement();
const customItem = makeItem(3, 8, 0);
customItem.fieldValues = { "Custom.Note": "<img src=x onerror='bad'>Safe text" };
const customTimeline = timelineRegistration.viewModel.createViewModel({
    items: observable([customItem]),
    states: observable([]),
    priorities: observable([{ name: "Should have", value: 2, color: "fbe74b" }]),
    types: observable([{ name: "Task", color: "f2cb1d", icon: { url: "task.svg" }, states: [{ name: "New", color: "cccccc" }] }]),
    typesOther: observable([]),
    icons: observable({ "task.svg": "<svg></svg>" }),
    showFields: observable(["field:Custom.Note", "duration"]),
    fieldDefinitions: observable([{ name: "Custom Note", value: "field:Custom.Note", referenceName: "Custom.Note", type: 0 }]),
    dateGranularity: observable("day"),
    actions: {}
}, customElement);
customTimeline._onItemsChanged();
const customCapture = timelineCaptures[timelineCaptures.length - 1];
const customGroup = customCapture.options.groupTemplate(customCapture.groups.data[0]);
assert.ok(customGroup.innerHTML.includes("&lt;img src=x onerror=&#39;bad&#39;&gt;Safe text"), "arbitrary field HTML must be rendered as escaped text");
assert.ok(customGroup.innerHTML.indexOf("my-timeline-group__content--field") < customGroup.innerHTML.indexOf("my-timeline-group__content--duration"),
    "timeline columns should follow the order selected in Column options");
customTimeline.dispose();

const insideElement = { style: {} };
const outsideElement = { style: {} };
capture.instance.itemSet = { items: {
    inside: { data: { start: new Date("2026-08-20T00:00:00.000Z"), end: new Date("2026-08-22T00:00:00.000Z") }, dom: { box: insideElement } },
    outside: { data: { start: new Date("2026-09-23T00:00:00.000Z"), end: new Date("2026-09-26T00:00:00.000Z") }, dom: { box: outsideElement } }
} };
timelineViewModel._syncRangeItemVisibility();
assert.strictEqual(insideElement.style.visibility, "", "a work item overlapping the visible date range should remain visible");
assert.strictEqual(outsideElement.style.visibility, "hidden", "a stale work item outside the visible date range should not remain pinned to an edge");
capture.instance.window = { start: new Date("2026-09-20T00:00:00.000Z"), end: new Date("2026-09-30T00:00:00.000Z") };
timelineViewModel._syncRangeItemVisibility();
assert.strictEqual(outsideElement.style.visibility, "", "the visibility guard should clear when the date range reaches the work item");

granularity("time");
timelineViewModel._onItemsChanged();
capture = timelineCaptures[timelineCaptures.length - 1];
assert.notStrictEqual(capture.records.data[0].start.getTime(), capture.records.data[1].start.getTime(), "time mode should retain timestamp offsets");
assert.strictEqual(Object.prototype.hasOwnProperty.call(capture.options, "snap"), false, "time mode should retain vis-timeline's existing snap behavior");
assert.strictEqual(Object.prototype.hasOwnProperty.call(capture.options, "zoomMin"), false, "time mode should allow the original hour/minute zoom");

let savedSettings = null;
let panelResult = null;
const settingsManager = {
    getValue: function () { return Promise.resolve(JSON.stringify({ orderMode: "backlog", customSetting: true })); },
    setValue: function (key, value, options) {
        savedSettings = { key: key, value: JSON.parse(value), options: options };
        return Promise.resolve();
    }
};
const configurationModule = loadAmd(path.join(__dirname, "../js/querygantt-configuration-app.js"), {
    module: { config: function () { return {}; } },
    knockout: knockout,
    sdk: {},
    "api/index": { CommonServiceIds: {} },
    "services/data": { getManager: function () { return Promise.resolve(settingsManager); } },
    "services/browser-settings": browserSettingsService,
    "services/date-granularity": dateGranularityService,
    "services/field-columns": fieldColumnsService
}, true).result;
const configurationModel = new configurationModule.Model({
    project: { id: "project-id" },
    fields: [],
    fieldsValue: ["dates", "duration"],
    dateGranularity: "day",
    extensionId: "publisher.extension",
    browserStorage: browserStorage,
    panel: { close: function (result) { panelResult = result; } }
});

let openedPanel = null;
let startupModel = null;
const pageService = { getProject: function () { return Promise.resolve({ id: "project-id", name: "Project" }); } };
const navigationService = { getQueryParams: function () { return Promise.resolve({}); } };
const layoutService = { openPanel: function (id, options) { openedPanel = { id: id, options: options }; } };
const commonServiceIds = {
    ProjectPageService: "project-page",
    HostNavigationService: "navigation",
    HostPageLayoutService: "layout"
};
const workItemTrackingApi = { WorkItemTrackingRestClient: function WorkItemTrackingRestClient() {} };
const updatedWorkItems = [];
const workItemClient = {
    updateWorkItem: function (patch, id, bypassRules, suppressNotifications) {
        updatedWorkItems.push({ patch: patch, id: id, bypassRules: bypassRules, suppressNotifications: suppressNotifications });
        return Promise.resolve();
    }
};
const appApi = {
    CommonServiceIds: commonServiceIds,
    getClient: function (clientType) {
        assert.strictEqual(clientType, workItemTrackingApi.WorkItemTrackingRestClient);
        return workItemClient;
    }
};
const sdk = {
    init: function () {},
    ready: function () { return Promise.resolve(); },
    getService: function (id) {
        if (id === commonServiceIds.ProjectPageService) { return Promise.resolve(pageService); }
        if (id === commonServiceIds.HostNavigationService) { return Promise.resolve(navigationService); }
        if (id === commonServiceIds.HostPageLayoutService) { return Promise.resolve(layoutService); }
        throw new Error("Unexpected service: " + id);
    },
    getConfiguration: function () { return { query: { id: "query-id", name: "Query" } }; },
    getExtensionContext: function () { return { id: "publisher.extension" }; },
    getUser: function () { return { displayName: "User" }; },
    notifyLoadSucceeded: function () {},
    register: function () {}
};
const startupSettingsManager = {
    getValue: function () { return Promise.resolve(JSON.stringify({ showFields: ["duration"], dateGranularity: "day" })); }
};
const appKnockout = Object.assign({}, knockout, {
    applyBindings: function (model) { startupModel = model; }
});
const appLoader = loadAmd(path.join(__dirname, "../js/querygantt-tab-app.js"), {
    module: { config: function () { return { priorities: [], fields: [] }; } },
    knockout: appKnockout,
    sdk: sdk,
    "api/index": appApi,
    "api/WorkItemTracking/index": workItemTrackingApi,
    "api/Work/index": {},
    "services/data": { getManager: function () { return Promise.resolve(startupSettingsManager); } },
    "services/backlog-order": backlogOrderService,
    "services/browser-settings": browserSettingsService,
    "services/date-granularity": dateGranularityService,
    "services/field-columns": fieldColumnsService,
    "services/timeline-split": timelineSplitService,
    "services/timeline-zoom": timelineZoomService
}, true);
appLoader.result.Model.prototype.init = function () { return Promise.resolve(); };

(async function () {
    await configurationModel.save();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(savedSettings)), {
        key: "gantt_project-id",
        value: {
            orderMode: "backlog",
            customSetting: true,
            showFields: ["dates", "duration"]
        },
        options: { scopeType: "User" }
    }, "configuration saves should merge instead of overwriting other settings");
    assert.strictEqual(browserSettingsService.read("publisher.extension", "project-id", "dateGranularity", null, browserStorage), "day");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(panelResult)), {
        fieldsValue: ["dates", "duration"],
        dateGranularity: "day"
    });

    appLoader.runReady();
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(startupModel, "the tab should initialize from persisted settings");
    assert.strictEqual(startupModel.dateGranularity(), "day", "the saved granularity should be restored");

    startupModel.openSettings();
    await Promise.resolve();
    assert.strictEqual(openedPanel.options.configuration.dateGranularity, "day", "the configuration panel should receive the current granularity");
    openedPanel.options.onClose({ fieldsValue: ["dates"], dateGranularity: "time" });
    assert.strictEqual(startupModel.dateGranularity(), "time", "closing the panel should update the live timeline setting");
    assert.strictEqual(browserSettingsService.read("publisher.extension", "project-id", "dateGranularity", null, browserStorage), "time", "the latest granularity should survive reload in this browser profile");

    const movedStart = new Date(2026, 7, 21, 0, 0, 0, 0);
    const movedEnd = new Date(2026, 7, 22, 0, 0, 0, 0);
    const expectedTarget = new Date(movedEnd.getTime());
    expectedTarget.setDate(expectedTarget.getDate() - 1);
    await startupModel.updateWit({ id: 101, start: movedStart, end: movedEnd, state: null });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(updatedWorkItems[0])), {
        patch: [{
            op: "replace",
            path: "/fields/Microsoft.VSTS.Scheduling.StartDate",
            value: movedStart.toISOString()
        }, {
            op: "replace",
            path: "/fields/Microsoft.VSTS.Scheduling.TargetDate",
            value: expectedTarget.toISOString()
        }],
        id: 101,
        bypassRules: false,
        suppressNotifications: false
    }, "a dragged full-day range should write its inclusive Target Date without an off-by-one day");

    await startupModel.updateWit({ id: 102, start: movedStart, end: movedStart, state: null });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(updatedWorkItems[1].patch)), [{
        op: "remove",
        path: "/fields/Microsoft.VSTS.Scheduling.StartDate"
    }, {
        op: "replace",
        path: "/fields/Microsoft.VSTS.Scheduling.TargetDate",
        value: movedStart.toISOString()
    }], "moving a target-only marker should keep it as a marker on the selected calendar day");

    console.log("querygantt date granularity integration tests passed");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
