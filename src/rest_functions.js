'use strict'

//const MongoOplog = require('../mongo-oplog-1.1.0/index.js');
const createDebug = require('debug');
const http = require('http');
const util = require('util');
const dbgHelp = createDebug('rest-functions');



//
// REST GET functions
//

//
// ex.  $ curl -k --request GET -H "Accept: application/json" -H "Content-Type: application/json" 'http://localhost:8088/help'
//
function help(req, res) {
    dbgHelp("A request for help");
    dbgHelp("  URL is: " + req.url);
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write("\nHelp\n");
    res.write("\nThe following calls are supported:\n\n");
    res.write("/debug   - change the debug filter to use      - type: PUT - example: /debug?DEBUG=*\n");
    res.write("/filter  - change the collection filter to use - type: PUT - example: /filter?serviceInstance\n");
    res.write("/ns      - change the namespaces to use        - type: PUT - example /ns?testDB\n");
    res.write("/help    - this help                           - type: GET\n");
    res.write("/start   - start the oplog                     - type: GET\n");
    res.write("/status  - get status of oplog process         - type: GET\n");
    res.write("/stop    - stop the oplog                      - type: GET\n");
    res.end()
}

//
// REST PUT functions
//
// HTTP  $ curl -k --request PUT -H "Accept: application/json" -H "Content-Type: application/json" 'http://localhost:8088/<path>'
// HTTPS  $ curl -vk --request PUT -H "Accept: application/json" -H "Content-Type: application/json" -H "Authorization: JWT <token here>" 'https://localhost:8180/<path>'
//

//
// path: debug?DEBUG=*
//
function dbgfilter(req, res, mainProcessEnvs) {
    dbgHelp("Request received to change DEBUG filter");
    dbgHelp("  URL is: " + req.url);
    dbgHelp("  CURRENT VALUE is: " + util.inspect(mainProcessEnvs, {showHidden: false, depth: null}));
    var op=req.url.split("?");
    dbgHelp("op: " + op[1]);
    var debug_filter = op[1].split('=');
    dbgHelp("filter: " + debug_filter[1]);
    process.env.DEBUG = debug_filter[1];
    createDebug.enable(debug_filter[1]);
    //createDebug.enable("\'" + debug_filter + "\'");
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write("Request received to change collection FILTER to: " + debug_filter + "\n");
    res.write("New filter " + debug_filter + " expression updated successfully!\n");
    res.end()
}

//
// path: ns?names=testDB,local'
//
function filter(req, res) {
    dbgHelp("Request received to change collection FILTER");
    dbgHelp("  URL is: " + req.url);
    var op=req.url.split("?");
    dbgHelp("op: " + op[1]);
    var oplog_filter=op[1];
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.write("Request received to change collection FILTER to: "+oplog_filter+"\n");
    res.write("New filter "+oplog_filter+" expression updated successfully!\n");
    res.end()
    return oplog_filter;
}

//
// path: filter?namespace=testDB&expr=local'
//
function namespace(req, res) {
    dbgHelp("Request received to change oplog NAMESPACE");
    dbgHelp("  URL is: " + req.url);
    var _t=req.url.split("?");
    dbgHelp("op: " + _t[1]);
    //var _t = op[1].split('=');
    dbgHelp("names: " + _t[1]);

    //if (_t[0] == "names") {
    //    _t.splice(0, 1);
    //    //var _n = JSON.stringify("["+_t[0].split(',')+"]");
        var _n = _t[1].split(',');
        dbgHelp("Returning: " + util.inspect(_n, {showHidden: false, depth: null}));
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.write("Request received to change oplog NAMESPACE, changing to: " + _n + "\n");
        res.write("Operational namespaces " + _n + " updated successfully!\n");
        res.end()
        return _n;
//  } else {
//      res.writeHead(200, {'Content-Type': 'text/plain'});
//      res.write("Malformed request, could not find names key (e.g. ns?names=testDB,local)");
//      res.end()
//      return null;
//  }
}

module.exports = {
    help: help,
    dbgfilter: dbgfilter,
    filter: filter,
    namespace: namespace
};
