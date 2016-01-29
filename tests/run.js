var fs = require("fs");
var path = require("path");
var rimraf = require("rimraf");
var typedoc = require("typedoc");
var plugin = require("../lib/plugin");
var dircompare = require('dir-compare');
var util = require("util");

var testCasesDir = "tests/cases/";
var fixturesDir = "tests/fixtures/";
var referenceBaselineDir = "tests/baselines/reference/";
var localBaselineDir = "tests/baselines/local/";


function setupCases() {

    // setup cases
    var files = fs.readdirSync(testCasesDir);
    for (var i = 0, l = files.length; i < l; i++) {

        var filename = files[i];
        // filter out anything but *.json
        if (/\.json/.test(filename)) {
            setupCase(filename);
        }
    }
}

function setupCase(filename) {

    var baseName = path.basename(filename, ".json");

    // clean up output directory
    rimraf(localBaselineDir + baseName, function (err) {
        if (err) return done(err);

        // load case
        var testCase = JSON.parse(fs.readFileSync(testCasesDir + filename, 'utf8'));
        // then run test
        run(baseName, testCase, function () {
            compareToBaseline(baseName);
        });
    });
}


function run(name, testCase, cb) {

    var app = new typedoc.Application();

    // apply plugin
    plugin(app, typedoc, cb);

    app.bootstrapWithOptions(testCase.options);

    var src = app.expandInputFiles(testCase.files);
    var project = app.convert(src);
    app.generateDocs(project, testCase.out);
}

// This function includes example code from https://www.npmjs.com/package/dir-compare
function compareToBaseline(name) {

    var referenceDir = referenceBaselineDir + name;
    var localDir = localBaselineDir + name;

    var results = dircompare.compareSync(referenceDir, localDir, { compareSize: true, skipSymlinks: true, excludeFilter: ".DS_Store" });
    if(!results.same) {
        var message = "Case '" + name + "' failed. The following is a summary of differences:\n";

        results.diffSet.forEach(function (entry) {
            var state = {
                'left' : '->',
                'right' : '<-',
                'distinct' : '<>'
            }[entry.state];

            if(entry.state != 'equal') {
                message += util.format('    %s(%s)%s%s(%s)', (entry.name1 || ""), entry.type1, state, (entry.name2 || ""), entry.type2) + "\n";
            }
        });

        throw new Error(message);
    }
}

function readFile(filePath) {

    var isJsonFile = path.extname(filePath) == ".json";

    if(!fs.existsSync(filePath)) {
        return isJsonFile ? {} : "";
    }

    var text = fs.readFileSync(filePath, "utf8");
    return isJsonFile ? JSON.parse(text) : text;
}

setupCases();