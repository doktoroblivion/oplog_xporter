'use strict'

var app = require('./oplog_app.js');
var util = require('util');

var args = [];

if ( typeof process.env.OPLOG_ARGS != "undefined" ) {
    var ii = 0;

    const oplog_args = process.env.OPLOG_ARGS.split(" ");

    for (var item in oplog_args) {
        args[ii++] = item
    }
} else {
    for (var ii = 0; process.argv[ii+1] !== undefined; ii++) {
        args[ii] = process.argv[ii+1];
    }
}

// Convenience function to sort envvars or other JSON
function sortObject(obj) {
    return Object.keys(obj).sort().reduce((a, v) => {
        a[v] = obj[v];
        return a;
    }, {});
}

let envvars = process.env;
let sorted_envvars = sortObject(envvars);

console.log("-------------------------------------------------------------------------------------------");
console.log("Mongo oplog started: " + new Date());
console.log("-------------------------------------------------------------------------------------------\n\n");
console.log("Running with following argument structure");
console.log(util.inspect(args, {showHidden: false, depth: null}));
// TODO: SORT THIS ->   console.log(util.inspect(process.env, {showHidden: false, depth: null}));
console.log(sorted_envvars);
console.log("-------------------------------------------------------------------------------------------\n\n");

console.log("Operation logging started...\n");

//
// Stub
//
var err = app.appMain(args);

if (err) {
    switch (err) {
        case 1: 
            console.log("ERROR: Incorrect number of parameters provided.");
            break;
        case 2: 
            console.log("ERROR: The json file was not found: %s", process.argv[2]);
            break;
        case 3: 
            console.log("ERROR: An exception occurred reading json file: %s", process.argv[2]);
            break;
        case 8: 
        case 11: 
            console.log("ERROR: Bad parameter provided, source configuration type not found in %s", process.env.JSON_FILE);
            break;
        case 12: 
            console.log("ERROR: Configuration not supported yet.");
            break;
        case 13: 
        case 27: 
            console.log("ERROR: An error occurred, you may have to turn on debug, DEBUG=* node <app_name> etc...");
            break;
        default: 
            console.log("WARNING: An unknown error has occurred, errcode: %s", err);
            break;
    }
    app.help();
    process.exit(err);
}
