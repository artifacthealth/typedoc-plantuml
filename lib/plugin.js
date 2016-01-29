var encoder = require("plantuml-encoder");
var plantuml = require("node-plantuml");
var path = require("path");
var fs = require("fs");

function plugin (app, td, cb) {

    var umlExpression = /<uml(?:\s+alt\s*=\s*['"](.+)['"]\s*)?>([\s\S]*?)<\/uml>/gi,
        encodedUmlExpression = /"http:\/\/www.plantuml.com\/plantuml\/img\/([^"]*)"/g,
        outputDirectory;

    // setup options
    app.on(td.Application.EVENT_COLLECT_PARAMETERS, function (parser) {
        parser.addParameter({
            name: 'umlLocation',
            help: 'local|remote',
            defaultValue: 'local'
        });
    });

    // on resolve replace uml blocks with image link to encoded uml data
    app.converter.on(td.converter.Converter.EVENT_RESOLVE_BEGIN, function (context) {

        var project = context.project;

        // go though all the comments
        for (var key in project.reflections) {
            var reflection = project.reflections[key];

            if(reflection.comment) {
                var text = reflection.comment.text,
                    match,
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
                            segments.push("](http://www.plantuml.com/plantuml/img/");
                            segments.push(encoder.encode(match[2]));
                            segments.push(")");
                        }

                        index = match.index + match[0].length;
                    }

                    // write modified comment back
                    if(segments.length > 0) {
                        segments.push(text.substring(index, text.length));
                        reflection.comment.text = segments.join("");
                    }
                }
            }
        }
    });

    // get the output directory
    app.renderer.on(td.output.Renderer.EVENT_BEGIN, function(event) {

        outputDirectory = path.join(event.outputDirectory, "assets/images/");
    });

    // the uml image number
    var num = 0;

    // on render replace the external urls with local ones
    app.renderer.on(td.output.Renderer.EVENT_END_PAGE, function(page) {

        if(app.options.umlLocation == "remote") return;

        var contents = page.contents,
            index = 0,
            match,
            segments = [],
            started = 0;

        if(contents) {
            while ((match = encodedUmlExpression.exec(contents)) != null) {

                segments.push(contents.substring(index, match.index));

                // setup plantuml encoder and decoder
                var decode = plantuml.decode(match[1]);
                var gen = plantuml.generate({format: 'png'});

                // get image filename
                var filename = "uml" + (++num) + ".png";
                var imagePath = path.join(outputDirectory, filename);

                // decode and save png to assets directory
                started++;

                decode.out.pipe(gen.in);
                gen.out.pipe(fs.createWriteStream(imagePath));
                gen.out.on('finish', function() {
                    started--;
                    if(started == 0 && match == null && cb) {
                        cb();
                    }
                });

                // get relative path filename
                var currentDirectory = path.dirname(page.filename);
                var relativePath = path.relative(currentDirectory, imagePath);

                // replace external path in content with path to image to assets directory
                segments.push("\"" + relativePath + "\"");

                index = match.index + match[0].length;
            }

            // write modified contents back to page
            if(segments.length > 0) {
                segments.push(contents.substring(index, contents.length));
                page.contents = segments.join("");
            }
        }
    });
}

module.exports = plugin;