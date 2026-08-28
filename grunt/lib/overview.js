function replaceSupportSection(content, supportText) {
    var lines = content.replace(/\r\n/g, "\n").split("\n");
    var start = lines.indexOf("# Support");
    var end;
    var replacement = [];

    if (supportText) {
        replacement = ["# Support", supportText, ""];
    }

    if (start < 0) {
        if (replacement.length > 0) {
            while (lines.length > 0 && !lines[lines.length - 1]) {
                lines.pop();
            }
            lines.push("");
            Array.prototype.push.apply(lines, replacement);
        }

        return lines.join("\n");
    }

    end = start + 1;
    while (end < lines.length && !/^# /.test(lines[end])) {
        end += 1;
    }

    lines.splice.apply(lines, [start, end - start].concat(replacement));
    return lines.join("\n");
}

function addNotice(content, notice) {
    var firstLineEnd;

    if (!notice || content.indexOf(notice) >= 0) {
        return content;
    }

    firstLineEnd = content.indexOf("\n");
    if (firstLineEnd < 0) {
        return content + "\n\n" + notice + "\n";
    }

    return content.slice(0, firstLineEnd + 1)
        + "\n" + notice + "\n"
        + content.slice(firstLineEnd + 1);
}

function transform(content, options) {
    if (!options) {
        return content;
    }

    content = replaceSupportSection(content, options.supportText || "");
    content = addNotice(content, options.notice || "");

    return content.replace(/\n*$/, "\n");
}

module.exports = {
    transform: transform
};
