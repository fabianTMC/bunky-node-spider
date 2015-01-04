var logger = require('./logging');

var security = {};

// the default error response function for when the request is not authenticated
var notAuthenticatedCallback = function(req, res, result) {
	res.status(401); // unauthorized
	res.send(result);
}

// check the authentication details for a request
var securityCheck = function(appID, appSecret, finallyCallback) {
	if(appID.toLowerCase() == "ws0092xi" && appSecret.toLowerCase() == "cfaa7027d10dc5166eda569ff3177426") {
		finallyCallback && finallyCallback(true);
	} else {
		finallyCallback && finallyCallback(false);
	}
}


// check if the data sent is valid
security.authenticate = function(req, res, successCallback, failureCallback) {
	logger.log("SANITY CHECK");

	// which is the function to call when the request fails to authenticate?
	// NOTE: if you are changing this, please handle the failureCallback arguments appropriately
	failureCallback = failureCallback || notAuthenticatedCallback;

	// convert all authetication data in a get request to an object
	if(req.query && req.query.auth) {
		req.query.auth = JSON.parse(req.query.auth);
	}

	// the or is for post || get requests
	if((req.body && typeof req.body == 'object' && req.body.auth) || (req.query && typeof req.query == 'object' && req.query.auth)) {
		// check if the security parameters are present
		if((req.body.auth && req.body.auth.appID && req.body.auth.appSecret) || (req.query.auth && req.query.auth.appID && req.query.auth.appSecret)) {
			// this is POST
			if(req.body && req.body.auth) {
				// the security data is present so lets authenticate it
				securityCheck(req.body.auth.appID, req.body.auth.appSecret, function(result){
					// check if the request is a valid one
					if(result) {
						successCallback && successCallback(req, res, {"result": "success", data: true});
					} else {
						failureCallback && failureCallback(req, res, {"result": "error", "code": "ERR03", "message": "Request not authenticated."});
					}
				});
			} else if(req.query && req.query.auth) {
				// this is GET
				securityCheck(req.query.auth.appID, req.query.auth.appSecret, function(result){
					// check if the request is a valid one
					if(result) {
						successCallback && successCallback(req, res, {"result": "success", data: true});
					} else {
						failureCallback && failureCallback(req, res, {"result": "error", "code": "ERR03", "message": "Request not authenticated."});
					}
				});
			}
		} else {
			failureCallback && failureCallback(req, res, {"result": "error", "code": "ERR02", "message": "Missing authentication data."});
		}
	} else {
		failureCallback && failureCallback(req, res, {"result": "error", "code": "ERR01", "message": "Missing data in request."});
	}
}

// get the ip from a node request
security.getIP = function(req, res, callback) {
	// get the ip address of the user
    var ipAddr = req.headers["x-forwarded-for"];
    if (ipAddr){
        // this will reflect on heroku.
        // NOTE: the LAST ip address will ALWAYS be the real client IP
        var list = ipAddr.split(",");
        ipAddr = list[list.length-1];
    } else {
        // this will reflect on localhost
        ipAddr = req.connection.remoteAddress;
    }

    callback && callback(req, res, ipAddr);
}
// check if all the values are legit
security.checkAll = function(req, res, data, successCallback, failureCallback) {
	var flag = true;
	
	// loop through the array of passed values
	for(var i = 0; i < data.length; i++) {
		if(!data[i] || data[i].length == 0) {
			flag = false;

			// since something was not found or of zero length, it is a failure
			failureCallback && failureCallback(req, res);
			break;
		}
	}

	// were all the passed values legit?
	if(flag) {
		successCallback && successCallback(req, res);
	}
}

module.exports = security;