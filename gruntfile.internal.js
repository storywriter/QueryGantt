module.exports = function (grunt) {
    var packageConfig = grunt.file.readJSON("package.json");
    var publisher = grunt.option("publisher");
    var extensionId = grunt.option("extension-id");
    var extensionVersion = grunt.option("extension-version");
    var assetId = "querygantt";

    if (!publisher || !extensionId || !extensionVersion) {
        grunt.fail.fatal("publisher, extension-id, and extension-version are required");
    }

    if (extensionId !== "querygantt-internal") {
        grunt.fail.fatal("extension-id must be 'querygantt-internal' for this internal Marketplace identity");
    }

    if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(extensionVersion)) {
        grunt.fail.fatal("extension-version must contain three or four numeric components");
    }

    packageConfig.author = publisher;
    packageConfig.name = assetId;
    packageConfig.version = extensionVersion;

    grunt.initConfig({
        package: packageConfig,
        extensionMarketplaceId: extensionId,
        configuration: "<CONFIGURATION>"
    });

    grunt.loadTasks("grunt");
};
