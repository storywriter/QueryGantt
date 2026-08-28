function decodeDoubleQuoted(value) {
    return value.replace(/\\([nrt"\\])/g, function (match, character) {
        switch (character) {
            case "n":
                return "\n";
            case "r":
                return "\r";
            case "t":
                return "\t";
            default:
                return character;
        }
    });
}

function parseValue(value, lineNumber) {
    var quote;
    var inlineComment;

    value = value.trim();
    quote = value.charAt(0);

    if (quote === "\"" || quote === "'") {
        if (value.length < 2 || value.charAt(value.length - 1) !== quote) {
            throw new Error("Unterminated quoted value in environment file at line " + lineNumber);
        }

        value = value.slice(1, -1);
        return quote === "\"" ? decodeDoubleQuoted(value) : value;
    }

    inlineComment = value.search(/\s+#/);
    if (inlineComment >= 0) {
        value = value.slice(0, inlineComment);
    }

    return value.trim();
}

function parse(content) {
    var values = {};

    content.replace(/^\uFEFF/, "").split(/\r?\n/).forEach(function (sourceLine, index) {
        var line = sourceLine.trim();
        var separator;
        var name;

        if (!line || line.charAt(0) === "#") {
            return;
        }

        if (line.indexOf("export ") === 0) {
            line = line.slice(7).trim();
        }

        separator = line.indexOf("=");
        if (separator <= 0) {
            throw new Error("Invalid environment file entry at line " + (index + 1));
        }

        name = line.slice(0, separator).trim();
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error("Invalid environment variable name at line " + (index + 1));
        }

        if (Object.prototype.hasOwnProperty.call(values, name)) {
            throw new Error("Duplicate environment variable " + name + " at line " + (index + 1));
        }

        values[name] = parseValue(line.slice(separator + 1), index + 1);
    });

    return values;
}

module.exports = {
    parse: parse
};
