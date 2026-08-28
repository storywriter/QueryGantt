var REQUIRED = [
    "EXTENSION_PUBLISHER",
    "EXTENSION_MARKETPLACE_ID",
    "EXTENSION_VERSION",
    "EXTENSION_NAME",
    "EXTENSION_DESCRIPTION",
    "EXTENSION_PUBLIC",
    "EXTENSION_REPOSITORY_URI",
    "EXTENSION_FEATURE_NAME",
    "EXTENSION_TAB_TITLE",
    "EXTENSION_TAB_NAME"
];

function create(values, envPath) {
    var publicValue;

    envPath = envPath || "environment file";

    REQUIRED.forEach(function (name) {
        if (!values[name]) {
            throw new Error(name + " is required in " + envPath);
        }
    });

    Object.keys(values).forEach(function (name) {
        if (/YOUR_[A-Z0-9_]+/.test(values[name])) {
            throw new Error(name + " still contains a placeholder in " + envPath);
        }
    });

    if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(values.EXTENSION_VERSION)) {
        throw new Error("EXTENSION_VERSION must contain three or four numeric components");
    }

    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(values.EXTENSION_PUBLISHER)) {
        throw new Error("EXTENSION_PUBLISHER contains unsupported characters");
    }

    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(values.EXTENSION_MARKETPLACE_ID)) {
        throw new Error("EXTENSION_MARKETPLACE_ID contains unsupported characters");
    }

    publicValue = values.EXTENSION_PUBLIC.toLowerCase();
    if (publicValue !== "true" && publicValue !== "false") {
        throw new Error("EXTENSION_PUBLIC must be true or false");
    }

    if (!/^https:\/\/\S+$/i.test(values.EXTENSION_REPOSITORY_URI)) {
        throw new Error("EXTENSION_REPOSITORY_URI must be an HTTPS URL");
    }

    if (values.EXTENSION_SUPPORT_URI
            && !/^(https:\/\/|mailto:)\S+$/i.test(values.EXTENSION_SUPPORT_URI)) {
        throw new Error("EXTENSION_SUPPORT_URI must be blank, an HTTPS URL, or a mailto URI");
    }

    return {
        author: values.EXTENSION_PUBLISHER,
        assetId: "querygantt",
        version: values.EXTENSION_VERSION,
        marketplaceId: values.EXTENSION_MARKETPLACE_ID,
        manifestOptions: {
            name: values.EXTENSION_NAME,
            description: values.EXTENSION_DESCRIPTION,
            public: publicValue === "true",
            supportUri: values.EXTENSION_SUPPORT_URI || "",
            repositoryUri: values.EXTENSION_REPOSITORY_URI,
            featureName: values.EXTENSION_FEATURE_NAME,
            tabTitle: values.EXTENSION_TAB_TITLE,
            tabName: values.EXTENSION_TAB_NAME
        },
        overviewOptions: {
            notice: values.EXTENSION_OVERVIEW_NOTICE || "",
            supportText: values.EXTENSION_OVERVIEW_SUPPORT_TEXT || ""
        }
    };
}

module.exports = {
    create: create
};
