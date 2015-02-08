var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var security = require('./security');

var app = express();
// for handling post data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

// are we testing? if so we will be returning cached data
var testing = false;

// enable cors for all express routes
app.use(cors());

app.get('/christ_university', function(req, res) {
    // check if the request is an authenticated one
    security.authenticate(req, res, function(req, res, result) {
        // check if we have the needed variables for this request
        security.checkAll(req, res, [req.query.username, req.query.password], function(req, res) {
            if(!testing) {
                // all the data needed so far exists
                var spider = require('./spiders/christ_university');

                spider.login(req.query.username, req.query.password, function(data) {
                    // success
                    if(data.result == "success") {
                        // the login was successful
                        
                        // show the response JSON
                        res.send(JSON.stringify(data, undefined, 2));
                    } else {
                        // this cannot happen
                        console.log("ERROR 1: "+JSON.stringify(data));

                        res.status(500); // internal server error
                        res.send({"result": "error", "message": "An internal server error has occurred."});
                    }
                }, function(data){
                    // login failure

                    if(data.result && data.result == "failure") {
                        res.send(JSON.stringify(data, undefined, 2));
                    } else if(data.error && data.error == true) {
                        // a server eror has occurred
                        console.log("ERROR 2: "+JSON.stringify(data));

                        res.status(500); // internal server error
                        res.send({"result": "error", "message": "An internal server error has occurred."});
                    } else {
                        // this cannot happen
                        console.log("ERROR 3: "+JSON.stringify(data));

                        res.status(500); // internal server error
                        res.send({"result": "error", "message": "An internal server error has occurred."});
                    }
                });
            } else {
                // we are currently testing so return cached data
                var fs = require('fs');
                fs.readFile('./responses/christ_university.json', function(err, buf) {
                  res.send(buf.toString());
                });

            }
        });
    });
});

var port = process.env.PORT || 8081;
app.listen(port);

console.log('Magic happening on '+port);
