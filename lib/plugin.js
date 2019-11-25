var plantuml = require("node-plantuml");
var path = require("path");
var fs = require("fs");
var pako = require("pako");
var encode64 = require("./encode64");

function plugin (pluginHost, cb) {

    var umlExpression = /<uml(?:\s+alt\s*=\s*['"](.+)['"]\s*)?>([\s\S]*?)<\/uml>/gi,
        encodedUmlExpression = /<img src="http:\/\/www\.plantuml\.com\/plantuml\/(?:img|png|svg)\/([^"]*)"(?: alt="(.*)")?>/g,
        outputDirectory,
        server = "http://www.plantuml.com/plantuml/",
        format,
        location,
        addClassDiagramPosition;

    var app = pluginHost.application;

    // setup options
    app.options.addDeclaration({
        name: 'umlLocation',
        help: 'local|remote',
        defaultValue: 'local'
    });

    app.options.addDeclaration({
        name: 'umlFormat',
        help: 'png|svg',
        defaultValue: 'png'
    });

    app.options.addDeclaration({
        name: 'umlAddClassDiagram',
        help: 'above|below',
        defaultValue: null
    });

    // on resolve replace uml blocks with image link to encoded uml data
    app.converter.on("resolveEnd", function (context) {

        // ensure valid format
        format = app.options.getValue("umlFormat");
        if (format) {
            format = format.toLowerCase();
        }
        if (format != "png" && format != "svg") {
            format = "png";
        }

        // ensure valid location
        location = app.options.getValue("umlLocation");
        if (location) {
            location = location.toLowerCase();
        }
        if (location != "local" && location != "remote") {
            location = "local";
        }

        // check if class diagrams should be generated
        addClassDiagramPosition = app.options.getValue("umlAddClassDiagram");
        if (addClassDiagramPosition) {
            addClassDiagramPosition = addClassDiagramPosition.toLowerCase();

            if (addClassDiagramPosition != "above" && addClassDiagramPosition != "below") {
                addClassDiagramPosition = "below";
            }
        }

        var project = context.project;

        // go through all the comments
        for (var key in project.reflections) {
            var reflection = project.reflections[key];

            if(reflection.comment) {
                // add UML tag for class diagram only for classes and interfaces
                if (addClassDiagramPosition && (reflection.kind == 128 || reflection.kind == 256)) {
                    addClassDiagramToComment(reflection);
                }
    
                // convert UML tags to PlantUML image links
                reflection.comment.shortText = processText(reflection.comment.shortText);
                reflection.comment.text = processText(reflection.comment.text);
            }
        }
    });

    /**
     * Returns the names of all interfaces the given class implements.
     * This also includes interfaces the base classes of the class are implementing.
     * @param {Reflection} reflection The class whoes interfaces are requested.
     * @returns {string[]} The names of all interfaces the class implements.
     */
    function getAllInterfaceNamesForClass(reflection) {
        var names = [];

        if (reflection.implementedTypes) {
            for (var i = 0; i < reflection.implementedTypes.length; ++i) {
                names.push(reflection.implementedTypes[i].name);
            }
        }

        return names;
    }

    /**
     * Returns the names of the interfaces the given class implements.
     * This excludes interfaces the base classes are implementing.
     * @param {Reflection} reflection The class whoes interfaces are requested.
     * @returns {string[]} The names of the interfaces the class implements.
     */
    function getInterfaceNamesForClass(reflection) {
        var names = [];

        // build list of all implemented interfaces
        names = getAllInterfaceNamesForClass(reflection);

        if (reflection.extendedTypes) {
            // remove names of interfaces the base classes are implementing
            for (var i = 0; i < reflection.extendedTypes.length; ++i) {
                var baseClass = reflection.extendedTypes[i].reflection;
                var baseClassImplements = getAllInterfaceNamesForClass(baseClass);

                for (var j = 0; j < baseClassImplements.length; ++j) {
                    if (names.indexOf(baseClassImplements[j]) != -1) {
                        names.splice(j, 1);

                        if (names.length == 0) {
                            return [];
                        }
                    }
                }
            }
        }

        return names;
    }

    /**
     * Creates a UML-tag with a class diagram in the comment of the reflection.
     * @param {Reflection} reflection The reflection whoes comment is extended.
     */
    function addClassDiagramToComment(reflection) {
        var umlLines = ["<uml>"];

        // add class/interface
        if (reflection.kind == 128) {
            umlLines.push("class " + reflection.name);
        } else if (reflection.kind == 256) {
            umlLines.push("interface " + reflection.name);
        }

        // add extended base classes and interfaces
        if (reflection.extendedTypes) {
            for (var i = 0; i < reflection.extendedTypes.length; ++i) {
                var extendedType = reflection.extendedTypes[i];

                if (extendedType.reflection) {
                    if (extendedType.reflection.kind == 128) {
                        umlLines.push("class " + extendedType.name);
                    } else if (extendedType.reflection.kind == 256) {
                        umlLines.push("interface " + extendedType.name);
                    }
                }

                umlLines.push(extendedType.name + " <|-- " + reflection.name);
            }
        }

        // add implemented interfaces
        if (reflection.kind == 128) {
            var interfaceNames = getInterfaceNamesForClass(reflection);

            for (var i = 0; i < interfaceNames.length; ++i) {
                umlLines.push("interface " + interfaceNames[i]);
                umlLines.push(interfaceNames[i] + " <|.. " + reflection.name);
            }
        }

        umlLines.push("</uml>");

        // Where to put the UML tag?
        if (addClassDiagramPosition == "above") {
            // the two spaces are necessary to generate a line break in markdown
            reflection.comment.shortText = umlLines.join("\n") + "  \n" + reflection.comment.shortText;
        } else {
            reflection.comment.text = reflection.comment.text + "\n" + umlLines.join("\n");
        }
    }

    /**
     * Replaces UML-tags in a comment with Markdown image links.
     * @param {string} text The text of the comment to process.
     * @returns {string} The processed text of the comment.
     */
    function processText(text) {
        var match,
            index = 0,
            segments = [];

        // if we have comment body text look for uml blocks
        if(text) {
            while ((match = umlExpression.exec(text)) != null) {

                segments.push(text.substring(index, match.index));

                // replace the uml block with a link to plantuml.com with the encoded uml data
                if (match[2]) {
                    segments.push("![");
                    if (match[1]) {
                        // alternate text
                        segments.push(match[1]);
                    }
                    segments.push("](" + server + format + "/");
                    segments.push(encode(match[2]));
                    segments.push(")");
                }

                index = match.index + match[0].length;
            }

            // write modified comment back
            if(segments.length > 0) {
                segments.push(text.substring(index, text.length));
                return segments.join("");
            }
        }

        return text;
    }

    function encode(text) {

        return encode64.encode(pako.deflate(text, { level: 9, to: 'string' }));
    }

    // get the output directory
    app.renderer.on("beginRender", function(event) {

        outputDirectory = path.join(event.outputDirectory, "assets/images/");
    });

    // append style to main.css
    app.renderer.on("endRender", function(event) {

        var filename = path.join(event.outputDirectory, "assets/css/main.css");
        var data = fs.readFileSync(filename, "utf8") + "\n.uml { max-width: 100%; }\n";
        fs.writeFileSync(filename, data, "utf8");
    });

    // on render replace the external urls with local ones
    app.renderer.on("endPage", function(page) {

        // rewrite the image links to: 1) generate local images, 2) transform to <object> tag for svg, 3) add css class
        var contents = page.contents,
            index = 0,
            match,
            segments = [],
            started = 0;

        if (contents) {
            while ((match = encodedUmlExpression.exec(contents)) != null) {

                segments.push(contents.substring(index, match.index));

                // get the image source
                var src = match[1],
                    alt = match[2];

                // decode image and write to disk if using local images
                if (location == "local") {
                    // keep track of how many images are still being written to disk
                    started++;
                    src = writeLocalImage(page.filename, src, function () {
                        started--;
                        if (started == 0 && match == null && cb) {
                            cb();
                        }
                    });
                }
                else {
                    // this is the case where we have a remote file, so we don't need to write out the image but
                    // we need to add the server back into the image source since it was removed by the regex
                    src = server + format + "/" + src;
                }

                // re-write image tag
                if (format == "png") {
                    segments.push("<img class=\"uml\" src=");
                    // replace external path in content with path to image to assets directory
                    segments.push("\"" + src + "\"");
                    if (alt) {
                        segments.push(" alt=\"" + alt + "\"");
                    }
                    segments.push(">");
                }
                else {
                    segments.push("<object type=\"image/svg+xml\" class=\"uml\" data=\"");
                    segments.push(src);
                    segments.push("\">");
                    if (alt) {
                        segments.push(alt);
                    }
                    segments.push("</object>");
                }

                index = match.index + match[0].length;
            }

            // write modified contents back to page
            if (segments.length > 0) {
                segments.push(contents.substring(index, contents.length));
                page.contents = segments.join("");
            }
        }

        // if local images were not generated then call the callback now if we have one
        if(location == "remote" && cb) {
            setTimeout(cb, 0);
        }
    });

    // the uml image number
    var num = 0;

    function writeLocalImage(pageFilename, src, cb) {

        // setup plantuml encoder and decoder
        var decode = plantuml.decode(src);
        var gen = plantuml.generate({format: format});

        // get image filename
        var filename = "uml" + (++num) + "." + format;
        var imagePath = path.join(outputDirectory, filename);

        // decode and save png to assets directory
        decode.out.pipe(gen.in);
        gen.out.pipe(fs.createWriteStream(imagePath));
        gen.out.on('finish', cb);

        // get relative path filename
        var currentDirectory = path.dirname(pageFilename);
        // return the relative path
        return path.relative(currentDirectory, imagePath);
    }
}

module.exports = plugin;
