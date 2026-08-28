module.exports = function (grunt) {
    var envFile = require("./grunt/lib/env-file");
    var extensionBuildConfig = require("./grunt/lib/extension-build-config");
    var packageConfig = grunt.file.readJSON("package.json");
    var envPath = grunt.option("build-env") || ".env";
    var values;
    var buildConfig;

    if (!grunt.file.exists(envPath)) {
        grunt.fail.fatal("Environment file not found: " + envPath);
    }

    try {
        values = envFile.parse(grunt.file.read(envPath));
        buildConfig = extensionBuildConfig.create(values, envPath);
    } catch (error) {
        grunt.fail.fatal(error.message);
    }

    packageConfig.author = buildConfig.author;
    packageConfig.name = buildConfig.assetId;
    packageConfig.version = buildConfig.version;

    grunt.initConfig({
        package: packageConfig,
        extensionMarketplaceId: buildConfig.marketplaceId,
        extensionManifestOptions: buildConfig.manifestOptions,
        extensionOverviewOptions: buildConfig.overviewOptions,
        configuration: "<CONFIGURATION>"
    });

    grunt.loadTasks("grunt");
};
