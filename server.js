var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');

var app = express();
// for handling post data
app.use(bodyParser());

// enable cors for all express routes
app.use(cors());

app.get('/', function(req, res) {
	var spider = require('./spiders/christ_university');

    spider.login(req.query.username, req.query.password, function(data) {
            // success
            if(data.result == "success") {
                // the login was successful
                console.log("SUCCESSFUL LOGIN");
				
				// show the response JSON
				res.send(JSON.stringify(data, undefined, 2));
            } else {
				// this cannot happen
                res.send(JSON.stringify(data, undefined, 2));
                console.log("ERROR: "+JSON.stringify(data));
			}
        }, function(data){
            // login failure
            if(data.result == "failure") {
                res.send(JSON.stringify(data, undefined, 2));
            } else {
                // this cannot happen
                res.send(JSON.stringify(data, undefined, 2));
                console.log("ERROR: "+JSON.stringify(data));
            }
        });
});

var port = process.env.PORT || 8081;
app.listen(port);

console.log('Magic happening on '+port);
