function transform(content, options) {
    var manifest;
    var feature;
    var tab;

    if (!options) {
        return content;
    }

    manifest = JSON.parse(content);
    manifest.name = options.name;
    manifest.description = options.description;
    manifest.public = options.public;

    if (options.supportUri) {
        manifest.links = manifest.links || {};
        manifest.links.support = manifest.links.support || {};
        manifest.links.support.uri = options.supportUri;
    } else if (manifest.links && manifest.links.support) {
        delete manifest.links.support;

        if (Object.keys(manifest.links).length === 0) {
            delete manifest.links;
        }
    }

    if (options.repositoryUri) {
        manifest.repository = manifest.repository || {};
        manifest.repository.uri = options.repositoryUri;
    }

    feature = manifest.contributions.find(function (contribution) {
        return contribution.type === "ms.vss-web.feature";
    });
    tab = manifest.contributions.find(function (contribution) {
        return contribution.type === "ms.vss-web.tab";
    });

    if (!feature || !tab) {
        throw new Error("Extension manifest is missing the Query Gantt feature or tab contribution");
    }

    feature.properties.name = options.featureName;
    tab.properties.title = options.tabTitle;
    tab.properties.name = options.tabName;

    return JSON.stringify(manifest, null, 4) + "\n";
}

module.exports = {
    transform: transform
};
