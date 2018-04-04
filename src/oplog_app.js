'use strict'

var debMain = require('debug')('main');
var debHttp = require('debug')('http');
var debStOpLog = require('debug')('startOplog');
var debStOpLogDet = require('debug')('startOplog-details');
var debConnTar = require('debug')('connTarget');
var debStEvents = require('debug')('setupEvents');
var fs = require('fs');
var http = require('http');
var https = require('https');
var jwt = require('jsonwebtoken');
var MongoOplog = require('../../mongo-oplog-2.1.0/src/index.js');
var mongo = require('mongodb');
var querystring = require('querystring');
var util = require('util');

var rest = require('./rest_functions.js');
var format = util.format;
var MongoClient = mongo.MongoClient;

const state = { EXITING: "exiting",
                RUNNING: "running",
                STARTING: "starting",
                STOPPED: "stopped"
              };

const SERVER = 0,
      MONGO = 1;



function help() {
    var retval = "\nHelp" +
                 "\n\tnode " + process.argv[1] + " <json_file> <source> <target>\n" +
                 "\nwhere:\n" +
                 "\tjson_file - path and filename to the startup json\n" +
                 "\tsource - the source environment key to use within the startup json file\n" +
                 "\ttarget - the target environment key to use within the startup json file\n\n";
    return retval;
}

function startOplog(user_vars, source_idx, ns_idx, source_type, target_type, cb) {

    var ips_str,
        opts = [],
        retObj = [],
        source_conn;

    if ( typeof retObj !== 'undefined' ) {
        if ( typeof retObj[MONGO] == 'undefined' ) {
            if ( typeof user_vars !== 'undefined' && 
                 typeof source_idx !== 'undefined' && source_idx >= 0 &&
                 typeof ns_idx !== 'undefined' && ns_idx >= 0 &&
                 typeof source_type !== 'undefined' &&
                 typeof target_type !== 'undefined' ) {

                try {
                    if ( typeof user_vars == 'string' ) {
                        JSON.parse( user_vars );  // A test to ensure JSON is passed in
                    }

                    connectTarget(user_vars, ns_idx, target_type, function(t_db) {
                        retObj[MONGO] = t_db;

                        if ( typeof user_vars.source[source_idx].url.ssl == 'undefined' ) {
                            opts.ns = user_vars.source[source_idx].namespaces[ns_idx].name + 
                                   "." + user_vars.source[source_idx].namespaces[ns_idx].filter;
                    
                            source_conn = format(user_vars.source[source_idx].url.form, 
                                                 user_vars.source[source_idx].url.ips[0], 
                                                 user_vars.source[source_idx].url.port,
                                                 user_vars.target[source_idx].db,
                                                 user_vars.source[source_idx].url.rs_name);
                    
                        } else if (typeof user_vars.source[source_idx].url.ssl !== 'undefined' &&
                                   typeof user_vars.source[source_idx].url.rs_name !== 'undefined' &&
                                   typeof user_vars.source[source_idx].url.auth_name !== 'undefined') {
                     
                            if (typeof user_vars.source[source_idx].url.ssl.sslCA !== 'undefined') {
                                 var ca = fs.readFileSync(user_vars.source[source_idx].url.ssl.sslCA);
                                 opts.sslCA = ca;
                            }
                            if (typeof user_vars.source[source_idx].url.ssl.sslCert !== 'undefined') {
                                 var cert = fs.readFileSync(user_vars.source[source_idx].url.ssl.sslCert);
                                 opts.sslCert = cert;
                            }
                            if (typeof user_vars.source[source_idx].url.ssl.sslKey !== 'undefined') {
                                 var key = fs.readFileSync(user_vars.source[source_idx].url.ssl.sslKey);
                                 opts.sslKey = key;
                            }
                            opts.ns = user_vars.source[source_idx].namespaces[ns_idx].name + 
                                      "." + user_vars.source[source_idx].namespaces[ns_idx].filter;
                    
                            for (var ii in user_vars.source[source_idx].url.ips) {
                                if (typeof ips_str == 'undefined') {
                                    ips_str = user_vars.source[source_idx].url.ips[ii] + ":" + user_vars.source[source_idx].url.port + ",";
                                } else {
                                    ips_str += user_vars.source[source_idx].url.ips[ii] + ":" + user_vars.source[source_idx].url.port + ",";
                                }
                            }
                            ips_str = ips_str.slice(0, -1);
                            source_conn = format(user_vars.source[source_idx].url.form,
                                                 encodeURIComponent(user_vars.source[source_idx].url.auth_name), 
                                                 ips_str,
                                                 user_vars.source[source_idx].db,      // this should be 'local' for the oplog
                                                 user_vars.source[source_idx].url.auth_type,
                                                 user_vars.source[source_idx].url.rs_name);
                        } else {
                            console.log("ERROR: Configuration not supported yet");
                            console.log(help());
                            process.exit(12);
                        }
                    
                        //
                        // Async
                        //
                        debStOpLog( "%s] vvvvvvv- Async Starts -vvvvvvv", ns_idx);
                        (async() => {
                    
                            debStOpLog( "%s] Oplog DB: %s, Oplog ns: %s, filter: %s", 
                                        ns_idx, 
                                        user_vars.source[source_idx].db,
                                        user_vars.source[source_idx].namespaces[ns_idx].name,
                                        user_vars.source[source_idx].namespaces[ns_idx].filter );
                    
                            //
                            // The oplog usually connects to the source 'local' database!
                            //
                            debStOpLog( "  %s] Connecting to source Mongo oplog: %s", ns_idx, source_conn );
                            debStOpLogDet( "  %s] Source Mongo opts: %s",
                                           ns_idx, util.inspect(opts, {showHidden: false, depth: null}) );

                            retObj[SERVER] = MongoOplog(source_conn, opts);
                            
                            debStOpLog( "%s] Oplog Connected to source mongo", ns_idx );
                                    
                            retObj[SERVER].on('op', async(data) => {
                                debStOpLog(ns_idx + "] ------- Op -------");
                                debStOpLogDet(ns_idx + "] Op object: " + util.inspect(data, {showHidden: false, depth: null}));
                                debStOpLog(ns_idx + "] ------- Op -------");
                            });
                        
                            retObj[SERVER].on('update', async(data) => {
                                debStOpLog(ns_idx + "] ------- Update -------");
                                debStOpLogDet(ns_idx + "] Update object: " + util.inspect(data, {showHidden: false, depth: null}));
                                if ( typeof retObj[MONGO] !== 'undefined' ) {
                                    const _ns = data.ns.split(".");
                                    const _col = retObj[MONGO].collection(_ns[1]);
                                    _col.update(data.o2, data.o, function (err) {
                                        if (err) {
                                            debStOpLog("%s] Update ERROR: %s", ns_idx, err);
                                        } else {
                                            console.log("{ op: \"Update\", db: \"%s\", json: \"%s\" }", data.ns, util.inspect(data.o, {showHidden: false, depth: null}));
                                        }
                                    });
                                } else {
                                    debStOpLog( "%s] Update ERROR: target mongo connections is undefined!", ns_idx );
                                };
                                debStOpLog( "%s] ------- Update -------", ns_idx );
                            });
                        
                            retObj[SERVER].on('insert', async(data) => {
                                debStOpLog( "%s] ------- Insert -------", ns_idx);
                                debStOpLogDet( "%s] Insert object: %s", ns_idx, util.inspect(data, {showHidden: false, depth: null}) );
                                if ( typeof retObj[MONGO] !== 'undefined' ) {
                                    const _ns = data.ns.split(".");
                                    const _col = retObj[MONGO].collection(_ns[1]);
                                    _col.insert(data.o, function (err) {
                                        if (err) {
                                            debStOpLog( "%s] Insert ERROR: ", ns_idx, err);
                                        } else {
                                            console.log("{ op: \"Insert\", db: \"%s\", json: \"%s\" }", data.ns, util.inspect(data.o, {showHidden: false, depth: null}));
                                        }
                                    });
                                } else {
                                    debStOpLog( "%s] Insert ERROR: target mongo connections is undefined!", ns_idx );
                                };
                                debStOpLog( "%s] ------- Insert -------", ns_idx );
                            });
                        
                            retObj[SERVER].on('delete', async(data) => {
                                debStOpLog( "%s] ------- Delete -------", ns_idx);
                                debStOpLogDet( "%s] Delete object: %s", ns_idx, util.inspect(data, {showHidden: false, depth: null}) );
                                if ( typeof retObj[MONGO] !== 'undefined' ) {
                                    const _ns = data.ns.split(".");
                                    const _col = retObj[MONGO].collection(_ns[1]);
                                    _col.remove(data.o, function (err) {
                                        if (err) {
                                            debStOpLog( "%s] Remove ERROR: ", ns_idx, err );
                                        } else {
                                            console.log("{ op: \"Remove\", db: \"%s\", json: \"%s\" }", data.ns, util.inspect(data.o, {showHidden: false, depth: null}));
                                        }
                                    });
                                } else {
                                    debStOpLog( "%s] Delete ERROR: target mongo connections is undefined!", ns_idx );
                                };
                                debStOpLog( "%s] ------- Delete -------", ns_idx );
                            });
                        
                            retObj[SERVER].on('error', data => {
                                debStOpLog( "%s] ------- Error -------", ns_idx );
                                if ( typeof data == "undefined" ) {
                                    debStOpLogDet( "%s] NO Error object data" );
                                } else {
                                    debStOpLogDet( "%s] Error object: %s", 
                                                   ns_idx, 
                                                   util.inspect(data, {showHidden: false, depth: null}) );
                                    process.emit('exit');
                                }
                                debStOpLog( "%s] ------- Error -------", ns_idx );
                            });
                        
                            retObj[SERVER].on('end', data => {
                                debStOpLog( "%s] ------- End -------", ns_idx );
                                if ( typeof data == "undefined" ) {
                                    debStOpLogDet( "%s] NO End object data" );
                                } else {
                                    debStOpLogDet( "%s] End object: %s",
                                                   ns_idx, 
                                                   util.inspect(data, {showHidden: false, depth: null}) );
                                }
                                debStOpLog( "%s] ------- End -------", ns_idx );
                            });
                            
                            retObj[SERVER].tail().then(stream => {
                                debStOpLog( "%s] ------- Tailing started -------", ns_idx );
                            }).catch(err => console.error(err))
                    
                        })();
//                      debStOpLog("%s] retObj[%s]: %s", ns_idx, SERVER, util.inspect(retObj, {showHidden: false, depth: null}));
                        debStOpLog( "%s] ^^^^^^^- Async Ends -^^^^^^^", ns_idx);

                        cb(0, source_idx, ns_idx, retObj);
                    });
                } catch ( excp ) {
                    debStOpLog("BAD JSON for user variables provided - %s", excp);
                    cb(7, source_idx, ns_idx, retObj);
                }
            } else {
                debStOpLog("Missing or bad parameters provided, exiting...");
                cb(8, source_idx, ns_idx, retObj);
            }
        } else {
            debStOpLog("Target Mongo DB is already CONNECTED for index: " + ns_idx + ", retObj[mongo]: " + retObj[MONGO]);
        }

    } else {
        debStOpLog("Bad retObj, exiting...");
        cb(9, source_idx, ns_idx, retObj);
    }
}

function connectTarget(user_vars, idx, target_type, callback) {

    var conn,
        found = false,
        ips_str,
        opts = [];

    debConnTar("Entered connectTarget (async), idx: " + idx);

    if ( typeof user_vars !== 'undefined' && 
         typeof idx !== 'undefined' && idx >= 0 &&
         typeof target_type !== 'undefined' ) {

        try {
            if ( typeof user_vars == 'string' ) {
                JSON.parse( user_vars );  // A test to ensure JSON is passed in
            }
   
            debConnTar("Checking: %s ", util.inspect(user_vars.target, {showHidden: false, depth: null}));
            for (var t_idx in user_vars.target) {
                debConnTar("Checking: %s in %s", target_type, user_vars.target[t_idx].type);

                if (user_vars.target[t_idx].type == target_type) {
                    debConnTar("Found requested TARGET configuration type: " + target_type);
                    found = true;
        
                    debConnTar(idx + "] Connecting to TARGET: " + user_vars.target[t_idx].type + 
                          ", for namespace: " + user_vars.target[t_idx].namespaces[idx].name);
        
                
                    if (typeof user_vars.target[t_idx].url.ssl == 'undefined') {
                        debConnTar(idx + "] Non-SSL connection type");
                        conn = format(user_vars.target[t_idx].url.form, 
                                      user_vars.target[t_idx].url.ips[0], 
                                      user_vars.target[t_idx].url.port,
                                      user_vars.target[t_idx].namespaces[idx].name,
                                      user_vars.target[t_idx].url.rs_name);
        
                    } else if (user_vars.target[t_idx].url.auth_type == 'basic') {
                        debConnTar(idx + "] SSL Connection type: " + user_vars.target[t_idx].url.ssl);
                        if (typeof user_vars.target[t_idx].url.auth_name !== 'undefined' &&
                            typeof user_vars.target[t_idx].url.auth_pass !== 'undefined') {
                
                            for (var ii in user_vars.target[t_idx].url.ips) {
                                if (typeof ips_str == 'undefined') {
                                    ips_str = user_vars.target[t_idx].url.ips[ii] + ":" + user_vars.target[t_idx].url.port + ",";
                                } else {
                                    ips_str += user_vars.target[t_idx].url.ips[ii] + ":" + user_vars.target[t_idx].url.port + ",";
                                }
                            }
                            ips_str = ips_str.slice(0, -1);
                            // mongodb://%s:%s@%s/%s?ssl=true\u0026authSource=%s
                            conn = format(user_vars.target[t_idx].url.form,
                                          user_vars.target[t_idx].url.auth_name, 
                                          user_vars.target[t_idx].url.auth_pass, 
                                          ips_str,
                                          user_vars.target[t_idx].namespaces[idx].name,
                                          user_vars.target[t_idx].url.auth_name);
                        } else {
                            debConnTar("WARNING: auth_name and auth_pass NOT set, may not be able to connect to target!");
                        }
                       
                    } else if (typeof user_vars.target[t_idx].url.ssl !== 'undefined' &&
                               typeof user_vars.target[t_idx].url.rs_name !== 'undefined' &&
                               typeof user_vars.target[t_idx].url.auth_name !== 'undefined') {
                        debConnTar(idx + "] SSL Connection type: " + user_vars.target[t_idx].url.ssl);
             
                        if (typeof user_vars.target[t_idx].url.ssl.sslCA !== 'undefined') {
                            var ca = fs.readFileSync(user_vars.target[t_idx].url.ssl.sslCA);
                            opts.sslCA = ca;
                        } else {
                            debConnTar("WARNING: sslCA NOT set, may not be able to connect to target!");
                        }
                        if (typeof user_vars.target[t_idx].url.ssl.sslCert !== 'undefined') {
                            var cert = fs.readFileSync(user_vars.target[t_idx].url.ssl.sslCert);
                            opts.sslCert = cert;
                        } else {
                            debConnTar("WARNING: sslCert NOT set, may not be able to connect to target!");
                        }
                        if (typeof user_vars.target[t_idx].url.ssl.sslKey !== 'undefined') {
                            var key = fs.readFileSync(user_vars.target[t_idx].url.ssl.sslKey);
                            opts.sslKey = key;
                        } else {
                            debConnTar("WARNING: sslKey NOT set, may not be able to connect to target!");
                        }
                
                        for (var ii in user_vars.target[t_idx].url.ips) {
                            if (typeof ips_str == 'undefined') {
                                ips_str = user_vars.target[t_idx].url.ips[ii] + ":" + user_vars.target[t_idx].url.port + ",";
                            } else {
                                ips_str += user_vars.target[t_idx].url.ips[ii] + ":" + user_vars.target[t_idx].url.port + ",";
                            }
                        }
                        ips_str = ips_str.slice(0, -1);
                        conn = format(user_vars.target[t_idx].url.form,
                                      encodeURIComponent(user_vars.target[t_idx].url.auth_name), 
                                      ips_str,
                                      user_vars.target[t_idx].namespaces[idx].name,
                                      user_vars.target[t_idx].url.auth_type,
                                      user_vars.target[t_idx].url.rs_name);
                    } else {
                        debConnTar("ERROR: Configuration not supported yet");
                        return(12);
                    }
                
                    debConnTar("  " + idx + "] Connecting to target Mongo: %s", conn);
                    
                    try {
                        //
                        // Mongo Client connection
                        //
                        MongoClient.connect(conn, opts, function(err, db) {
                            if (err) {
                                debConnTar("  " + idx + "] Mongo Error: %s", err);
                                callback("  " + idx + "] Mongo Error: %s", err);
                            } else {
                                debConnTar("  " + idx + "] Connection to target Mongo established")
                                var _db = db;
                                callback(_db);
                            }
                        });
                    } catch (excp) {
                        console.error("MongoClient connection failed, " + excp);
                        process.exit(13);
                    }
                }
            }
            if (!found) {
                console.log("No entry " + target_type + " found in JSON, exiting...");
                console.error("ERROR: Bad parameter provided");
                return(11);
            }
  
        } catch ( excp ) {
            debConnTar("A bad JSON user variables were provided - %s", excp);
            return(17);
        }
    } else {
        debConnTar("An undefined object was provided on the call, exiting...");
        return(19);
    }
    debConnTar("Exited connectTarget (async)");
    return(0);
}

//
// Setup a simple REST i/f
//
function setupHttp(user_vars) {
    var r_server;
    if (user_vars.server.type == "http") {
        debHttp("Setting up HTTP server");
        r_server = http.createServer(function (req, res) {
            console.log("          { op: \"http\", req: \"%s\" }", req.url);
            debHttp("{ op: \"http\", req: \"%s\" }", req.url);
        }).listen(user_vars.server.port);
    } else if (user_vars.server.type == "https") {
        debHttp("Setting up HTTPS server");
        var opts = [];
        if (typeof user_vars.server.ssl.sslCA !== 'undefined') {
             var ca = fs.readFileSync(user_vars.server.ssl.sslCA);
             opts.ca = ca;
        }
        if (typeof user_vars.server.ssl.sslCert !== 'undefined') {
             var cert = fs.readFileSync(user_vars.server.ssl.sslCert);
             opts.cert = cert;
        }
        if (typeof user_vars.server.ssl.sslKey !== 'undefined') {
             var key = fs.readFileSync(user_vars.server.ssl.sslKey);
             opts.key = key;
        }
        r_server = https.createServer(opts, function (req, res) {
            console.log("          { op: \"https\", req: \"%s\" }", req.url);
            debHttp("{ op: \"https\", req: \"%s\" }", req.url);
        }).listen(user_vars.server.port);
    } else {
        console.error("ERROR: Invalid REST server configuration");
        return(40);
    }
    
    r_server.on('request', function (req, res) {
        var token = req.headers.authorization.replace(/^JWT\s/, '');
        if (!token) {
            res.writeHead(401, {'Content-Type': 'text/plain', auth: false});
            res.write("No token provided\n");
            res.end();
        } else {
            debHttp("Verify JWT - %s", token);
            jwt.verify( token, user_vars.server.jwt.secret, "HS512", function(err, decoded) {
                if (err) {
                    debHttp("Verify JWT error: %s ", err);
                    res.writeHead(401, {'Content-Type': 'text/plain', auth: false});
                    res.write("Failed to authenticate token\n");
                    res.end();
                } else if (req.method == 'GET') { // GET Only
                    debHttp("Verify JWT GET");
                    if (req.url == '/help') {
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        rest.help(req, res);
                        res.end();
                    } else if (req.url == '/status') {
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        res.write("Application status is: " + user_vars.status + "\n");
                        res.end();
                    } else if (req.url == '/config') {
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        res.write(util.inspect(user_vars, {showHidden: false, depth: null}));
                        res.write("\n\n");
                        res.end();
                    } else {
                        res.writeHead(404, {'Content-Type': 'text/plain'});
                        res.write(req.url + ' is an unknown GET request\n');
                        res.end();
                    }
                } else if (req.method == 'PUT') { // PUT Only
                    debHttp("Verify JWT PUT");
                    if (req.url == '/stop') {
                        user_vars.status = state.STOPPED;
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        res.write('Request received to STOP\n');
                        res.end();
                    } else if (req.url == '/start') {
                        user_vars.status = state.RUNNING;
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        res.write('Request received to START\n');
                        res.end();
                    } else if (req.url == '/exit') {
                        res.writeHead(200, {'Content-Type': 'text/plain'});
                        res.write('Request received to EXIT\n');
                        res.write('Service shutting down...\n');
                        res.end();
                        stopHttp(user_vars, r_server);
                    } else if (req.url.startsWith('/debug')) {
                        var retval = rest.dbgfilter(req, res, process.env);
                    } else if (req.url.startsWith('/filter')) {
                        var retval = rest.filter(req, res);
                        debHttp("  retval: " + util.inspect(retval, {showHidden: false, depth: null}));
                        if (retval instanceof Object) {
                            user_vars.source.filter = retval;
                            process.emit('filterUpdate');
                        }
                    } else if (req.url.startsWith('/ns')) {
                        var retval = rest.namespace(req, res);
                        debHttp("  retval: " + util.inspect(retval, {showHidden: false, depth: null}));
                        if (retval instanceof Object) {
                            user_vars.source.namespaces = retval;
                            process.emit('namespaceUpdate');
                        }
                    } else {
                        res.writeHead(404, {'Content-Type': 'text/plain'});
                        res.write(req.url + ' is an unknown PUT request\n');
                        res.end();
                    }
                } else {
                    debHttp("Verify JWT Unknown");
                    console.log("{ op: \"http\", req: \"unknown request\" }");
                    res.writeHead(400, {'Content-Type': 'text/plain'});
                    res.write(req.url + ' is an unknown request\n');
                    res.end();
                }
            });
        }
    });
    return r_server;
};

//
// Teardown simple REST i/f
//
function stopHttp(user_vars, r_server) {
    debHttp("The HTTP/S server is closing");
    r_server.close(() => {
        user_vars.status = state.EXITING;
        setTimeout( function() {
            console.log('Service shutting down requested, exiting...\n');
            console.log("-------------------------------------------------------------------------------------------");
            console.log("Mongo oplog stopped: " + new Date()); 
            console.log("-------------------------------------------------------------------------------------------\n\n");
            process.exit(21);
        }, 6000);
    });
}

// ------------------------------------------------------
// Start the Main App
//
function appMain(args) {

    var found = false,
        json_data,
        json_file,
        source_type,
        target_type;

    var r_server,
        user_vars;
    
    if (args.length == 4) {
        json_file = args[1];
        source_type = args[2];
        target_type = args[3];
        debMain("INFO: parameters provided via command line");
    } else {
        debMain("ERROR: Incorrect number of parameters provided");
        return(1);
    }
    
    debMain("Reading in user variables from: %s", json_file);
    try {
        json_data = fs.readFileSync(json_file, 'utf8', function (err) {
            if (err) {
                debMain("ERROR: A problem reading the json file occurred: %s", json_file);
                return(2);
            }
        });
    } catch(excp) {
        debMain("EXCP: %s", excp);
        return(3);
    }
    
    try {
        user_vars = JSON.parse(json_data);
    } catch(excp) {
        debMain("EXCP: %s", excp);
        return(4);
    }

    user_vars.status = state.STARTING;
    user_vars.status = state.RUNNING;

    r_server = setupHttp(user_vars);
    debMain("Setting up system event handlers");
    setupSystemEvents(user_vars, r_server);

    debMain("user_vars: %s", util.inspect(user_vars, {showHidden: false, depth: null}));
    
    for (var s_idx in user_vars.source) {
        if (user_vars.source[s_idx].type == source_type) {
            debMain("Found SOURCE configuration type: " + source_type);
            found = true;
            for (var ns_idx in user_vars.source[s_idx].namespaces) {
                debMain( "%s] Connecting to SOURCE: %s, for namespace: %s", 
                         ns_idx, 
                         user_vars.source[s_idx].type,
                         user_vars.source[s_idx].namespaces[ns_idx].name );

                var connect_objs = []; // operational objects, 0 - oplog server, 1 - mongo
                startOplog(user_vars, s_idx, ns_idx, source_type, target_type, function(retval, _s_idx, _ns_idx, _objs) {
                    if (retval != 0) {
                        return retval;
                    } else {
                        debMain(" %s] Setting up oplog event handlers", _ns_idx );
                        setupOplogEvents(user_vars, r_server, _s_idx, _ns_idx, source_type, target_type, _objs);
                    }
                });
            }
        }
    }
    if (!found) {
        debMain("No entry " + source_type + " found in " + json_file + ", exiting...");
        debMain("ERROR: Bad parameter provided, source configuration type not found in %s", json_file);
        return(8);
    }
};
        
//
// Setup process events
//
function setupOplogEvents(user_vars, r_server, s_idx, ns_idx, source_type, target_type, connect_objs) {
    debStEvents("Entering setupEvents");

    process.on( "namespaceUpdate", function() {
        debStEvents("namespaceUpdate: called, restarting source_oplog");
        //source_oplog.emit('end');
        //startOplog(user_vars, s_idx, ns_idx, source_type, target_type, connect_objs);
        //if (retval != 0) {
        //    return retval;
        //}
        startOplog(user_vars, s_idx, ns_idx, source_type, target_type, function(retval, _s_idx, _ns_idx, _objs) {
            if (retval != 0) {
                return retval;
            }
        });
    
        // TODO: make sure DBs are closed upon exit
        //connectTarget(user_vars);
    });
        
    process.on( "filterUpdate", function() {
        debStEvents("filterUpdate: called, restarting source_oplog");
        //source_oplog.emit('end');
        //startOplog(user_vars, s_idx, ns_idx, source_type, target_type, connect_objs);
        //if (retval != 0) {
        //    return retval;
        //}
        startOplog(user_vars, s_idx, ns_idx, source_type, target_type, function(retval, _s_idx, _ns_idx, _objs) {
            if (retval != 0) {
                return retval;
            }
        });
    });
};
            
function setupSystemEvents(user_vars, r_server) {
    process.on( "uncaughtException", function(err) {
        debStEvents("Excp: " + util.inspect(err, {showHidden: false, depth: null}));
    });
            
    process.on( "SIGINT", function() {
        debStEvents("Caught an interrupt signal, shutting down the HTTP/S server");
        stopHttp(user_vars, r_server);
    });
            
    process.on( "SIGTERM", function() {
        debStEvents("Caught an interrupt signal, shutting down the HTTP/S server");
        stopHttp(user_vars, r_server);
    });
    debStEvents("Exiting setupEvents");
};

//
// Exports
//
module.exports = {
    appMain: appMain,
    connectTarget: connectTarget,
    help: help,
    setupHttp: setupHttp,
    setupOplogEvents: setupOplogEvents,
    setupSystemEvents: setupSystemEvents,
    stopHttp: stopHttp,
    startOplog: startOplog
};
