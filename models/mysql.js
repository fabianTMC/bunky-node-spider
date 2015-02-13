var fs = require('fs');
var logger = require('../util/logging');

var memjs = require('memjs');
var memcache = memjs.Client.create();

var mysql = require('mysql');
var url = require('url');

// production or local?
if (typeof(process.env.CLEARDB_DATABASE_URL) != 'undefined') {
    mysqlUrl = url.parse(process.env.CLEARDB_DATABASE_URL);
}
else mysqlUrl = url.parse('mysql://bunky:bunky@localhost/bunky');

// break down the url into its components
mysqlProtocol = mysqlUrl.protocol.substr(0, mysqlUrl.protocol.length - 1); // Remove trailing ':'
mysqlUsername = mysqlUrl.auth.split(':')[0];
mysqlPassword = mysqlUrl.auth.split(':')[1];
mysqlHost = mysqlUrl.hostname;
mysqlPort = mysqlUrl.port;
mysqlDatabase = mysqlUrl.path.substring(1);

// strip the ?reconnect=true since it causes the connetion to fail
index = mysqlDatabase .indexOf('?');
if(index != -1){
    mysqlDatabase = mysqlDatabase .substring(0, index);
}

var pool  = mysql.createPool({
    host     : mysqlHost,
    user     : mysqlUsername,
    password : mysqlPassword,
    database: mysqlDatabase,
    connectionLimit: 6,
    waitForConnections: true
}); // NOTE: 8/10 connections since the developer database client will take 1 and backup will take 1

// check if a given cacheName is present in the cache
var check = function(cacheName, successCallback, failureCallback, finallyCallback) {
    //logger.log('RAN CHECK')
    // check if the query was already cached
    memcache.get(cacheName, function(err, val, flags) {
        if(err) {
            logger.log("Memcached error when trying to read "+cacheName+". Error = "+err.toString());
            failureCallback && failureCallback({"result": "error", "code": "E06", "message": err.toString()});
            finallyCallback && finallyCallback({"result": "error", "code": "E06", "message": err.toString()});
        } else {
            // check if we got a value
            if(val !== null) {
                //logger.log("HIT");
                successCallback && successCallback({"result": "success", "data": JSON.parse(val)});
                finallyCallback && finallyCallback({"result": "success", "data": JSON.parse(val)});
            } else {
                //logger.log('MISS');
                successCallback && successCallback({"result": "failure", "data": null});
                finallyCallback && finallyCallback({"result": "failure", "data": null});
            }
        }
    });
}

// remove an item from the cache
var uncache = function(cacheName, finallyCallback) {
    //logger.log('RAN UNCACHE');
    // check if the query was already cached
    memcache.delete(cacheName, function(err, success) {
        if(err) {
            logger.log("Memcached error when trying to delete "+cacheName+". Error = "+err.toString());
            finallyCallback && finallyCallback({"result": "error", "code": "E09", "message": err.toString()});
        } else {
            if(success) {
                // HIT and
                //logger.log("HIT REMOVE");
                finallyCallback && finallyCallback({"result": "success", "data": null});
            } else {
                // MISS
                //logger.log("MISS REMOVE");
                finallyCallback && finallyCallback({"result": "success", "data": null});
            }
        }
    });
}

// run a given query on the database
var queryRun = function(connection, query, successCallback, failureCallback, finallyCallback) {
    //logger.log("RUN QUERY: "+query);
    connection.query(query, function(err, rows) {
        // And done with the connection.
        connection.release();

        // Don't use the connection here, it has been returned to the pool.
        if(err) {
            logger.log("Error while trying to run query `"+query+"` = "+err.toString());
            failureCallback && failureCallback({"result": "error", "code": "E06", "message": err.toString()});
            finallyCallback && finallyCallback({"result": "error", "code": "E06", "message": err.toString()});
        } else {
            successCallback && successCallback({"result": "success", "data": rows});
            finallyCallback && finallyCallback({"result": "success", "data": rows});
        }
    });
}

// the post section
var post = function(cacheName, queryJSON, data, finallyCallback) {
    if(queryJSON.cache.post) {
        if(queryJSON.cache.post == "uncache") {
            // remove the data from the cache
            uncache(cacheName, function(result){
                // we only care about errors here
                //if(result.result == "error") logger.log('error');

                // post section complete
                finallyCallback && finallyCallback();
            });
        } else if(queryJSON.cache.post == "cache") {
            cache(cacheName, data, function(result){
                //logger.log("CACHE SUCCESS");
            }, function(result) {
                //logger.log("CACHE FAILURE");
            }, function(result) {
                // post section complete
                finallyCallback && finallyCallback();
            });
        } else {
            // there was no match found
            // post section complete
            finallyCallback && finallyCallback();
        }
    } else {
        // there was no post section
        finallyCallback && finallyCallback();
    }
}

// add an item to the cace
var cache = function(cacheName, data, successCallback, failureCallback, finallyCallback) {
    memcache.set(cacheName, JSON.stringify(data), function(err, val) {
        if(err) {
            logger.log("Memcached error when trying to write "+cacheName+". Error = "+err.toString());
            failureCallback && failureCallback({"result": "error", "code": "E07", "message": err.toString()});
            finallyCallback && finallyCallback({"result": "error", "code": "E07", "message": err.toString()});
        } else {
            if(val) {
                //logger.log("CACHE SUCCESS")
                successCallback && successCallback({"result": "success", "data": val});
                finallyCallback && finallyCallback({"result": "success", "data": val});
            } else {
                //logger.log("Memcached error when trying to read "+cacheName+". Error = False returned by set function.");
                failureCallback && failureCallback({"result": "error", "code": "E07", "message": "False returned by set function."});
                finallyCallback && finallyCallback({"result": "success", "data": val});
            }
        }
    });
}

module.exports = function() {
    var db = {};

    db.query = function(queryFile, values, successCallback, failureCallback) {
        var file = __dirname+"/queries/"+queryFile+".json";

        // check if the query file exists
        fs.open(file, "r", function(err, fd) {
            if(err) {
                logger.log("FILE OPEN ERROR: "+err.toString());
                // an error occurred while opening the file
                failureCallback && failureCallback({"result": "error", "code": "E00", "message": err.toString()}); 
            } else {
                fs.readFile(file, {encoding: 'utf-8'}, function(err, query) {
                    if(err) {
                        logger.log("FILE READ ERROR: "+err.toString());
                        // an error occurred while reading the file
                        failureCallback && failureCallback({"result": "error", "code": "E01", "message": err.toString()}); 
                    } else {
                        // check if we got a valid query json file
                        try {
                            queryJSON = JSON.parse(query);
                            query = queryJSON.query;

                            var error = false; // to track missing values

                            // lets replace any needed values
                            var variables = query.match(/(\$)[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/gi);

                            // check if we have any values passed
                            if(!values) {
                                values = {};
                            }

                            // only replace if something was found
                            if(variables) {
                                // add some magic variables
                                values['timestamped'] = parseInt(new Date().getTime()/1000);

                                for(var i = 0; i < variables.length; i++) {
                                    // check if we have the current variable
                                    if(typeof values[variables[i].substring(1)] != "undefined") {
                                        query = query.replace(variables[i], pool.escape(values[variables[i].substring(1)]));
                                    } else {
                                        //console.log("[DB ERROR] Missing value for mysql query "+queryFile+": "+variables[i]);
                                        error = "Missing value = "+variables[i].substring(1);
                                        break;
                                    }
                                }
                            }

                            if(error === false) {
                                // lets execute the query
                                pool.getConnection(function(err, connection) {
                                    if(err) {
                                        logger.log("POOL GET CONNECTION ERROR: "+err.toString());
                                    } else if(connection) {
                                        //console.log('got connection');
                                        if(queryJSON.cache) {
                                            // sanity check
                                            if(queryJSON.cache.variables && queryJSON.name) {
                                                // lets generate the cache name
                                                var cacheName = queryJSON.cache.variables.join(" ");

                                                // lets replace any needed values
                                                var variables = cacheName.match(/(\$)[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*/gi);
                                                var error = false;

                                                if(variables) {
                                                    // generate the cache name
                                                    for(var i = 0; i < variables.length; i++) {
                                                        // check if we have the current variable
                                                        if(typeof values[variables[i].substring(1)] != "undefined") {
                                                            cacheName = cacheName.replace(variables[i], pool.escape(values[variables[i].substring(1)]).replace(/^'(.*)'$/, '$1'));
                                                        } else {
                                                            //console.log("[DB ERROR] Missing value for cache name "+queryFile+": "+variables[i]);
                                                            error = "Missing value = "+variables[i].substring(1);
                                                            break;
                                                        }
                                                    }
                                                }

                                                if(!error) {
                                                    // convert all spaces in the name, add query name and convert to lowercase
                                                    cacheName = queryJSON.name+"_"+cacheName;
                                                    cacheName = cacheName.replace(/ /g, '_').toLowerCase();

                                                    var dataReturned = false;

                                                    // check if we have to do anything pre-query
                                                    if(queryJSON.cache.pre) {
                                                        if(queryJSON.cache.pre == "check") {
                                                            // check if the data is available in the cache
                                                            check(cacheName, function(result) {
                                                                // successful data retrieval
                                                                if(result.result == "success") {
                                                                    // the data was available in the cache so 
                                                                    successCallback && successCallback(result);

                                                                    // return the connection to the pool
                                                                    connection.release();
                                                                }
                                                            }, function(result) {
                                                                // there was an error reading the cache
                                                            }, function(result) {
                                                                // pre has been completed so lets do the querying
                                                                if(result.result == "success") {
                                                                    // the data was found in the cache so skip directly to the post section
                                                                    post(cacheName, queryJSON, result.data, function() {
                                                                        //logger.log("COMPLETE");
                                                                    });
                                                                } else if(result.result == "failure" || result.result == "error") {
                                                                    // the data was not found in the cache so lets query and then skip to the post section
                                                                    // OR there was an error reading from the cache

                                                                    // run the query
                                                                    queryRun(connection, query, function(result) {
                                                                        successCallback && successCallback(result);
                                                                    }, function(result) {
                                                                        failureCallback && failureCallback(result);
                                                                    }, function(result) {
                                                                        // check if the result was successful
                                                                        if(result.result == "success") {
                                                                            // skip to the post section since the result was successful
                                                                            post(cacheName, queryJSON, result.data, function() {
                                                                                //logger.log("COMPLETE");
                                                                            });
                                                                        }
                                                                    });
                                                                }
                                                            });
                                                        } else if(queryJSON.cache.pre == "uncache") {
                                                            // remove the data from the cache
                                                            uncache(cacheName, function(result){
                                                                // we only care about errors here
                                                                //if(result.result == "error") logger.log('error');

                                                                // run the query
                                                                queryRun(connection, query, function(result) {
                                                                    successCallback && successCallback(result);
                                                                }, function(result) {
                                                                    failureCallback && failureCallback(result);
                                                                }, function(result) {
                                                                    // check if the result was successful
                                                                    if(result.result == "success") {
                                                                        // skip to the post section since the result was successful
                                                                        post(cacheName, queryJSON, result.data, function() {
                                                                            //logger.log("COMPLETE");
                                                                        });
                                                                    }
                                                                });
                                                            });
                                                        } else {
                                                            // there was no valid command passed for pre
                                                            // run the query
                                                            queryRun(connection, query, function(result) {
                                                                successCallback && successCallback(result);
                                                            }, function(result) {
                                                                failureCallback && failureCallback(result);
                                                            }, function(result) {
                                                                // check if the result was successful
                                                                if(result.result == "success") {
                                                                    // skip to the post section since the result was successful
                                                                    post(cacheName, queryJSON, result.data, function() {
                                                                        //logger.log("COMPLETE");
                                                                    });
                                                                }
                                                            });
                                                        }
                                                    } else {
                                                        // there was no pre section
                                                        // run the query
                                                        queryRun(connection, query, function(result) {
                                                            successCallback && successCallback(result);
                                                        }, function(result) {
                                                            failureCallback && failureCallback(result);
                                                        }, function(result) {
                                                            // check if the result was successful
                                                            if(result.result == "success") {
                                                                // skip to the post section since the result was successful
                                                                post(cacheName, queryJSON, result.data, function() {
                                                                    //logger.log("COMPLETE");
                                                                });
                                                            }
                                                        });
                                                    }
                                                } else {
                                                    logger.log('ERROR: Could not find cache configuration variable: '+error);
                                                }
                                            } else {
                                                logger.log('ERROR: Could not find cache configuration for query + '+queryFile);
                                            }
                                        } else {
                                            // no cache required so just run the query

                                            queryRun(connection, query, function(result) {
                                                successCallback && successCallback(result);
                                            }, function(result) {
                                                failureCallback && failureCallback(result);
                                            });
                                        }
                                    } 
                                });
                            } else {
                                logger.log(error);
                                failureCallback && failureCallback({"result": "error", "code": "E05", "message": error}); 
                            }
                        } catch(err) {
                            logger.log('ERROR: Could not parse query JSON file. Error = '+err);
                            failureCallback && failureCallback({"result": "error", "code": "E02", "message": err+toString()}); 
                        };
                        
                    }
                });
            }
        });
    };

    db.timestamp = function() {
        // time in seconds since epoch
        return parseInt(new Date().getTime()/1000);
    };

    return db;
}
