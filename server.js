var express = require('express');
var bodyParser = require('body-parser');
var cors = require('cors');
var security = require('./util/security');
var messages = require('./util/motivation_messages');
var analytics = require('./util/analytics');
var mysql = require('./models/mysql') ();

var MongoClient = require('mongodb').MongoClient;

// production or local?
if (typeof(process.env.MONGOLAB_URI) != 'undefined') {
    mongoUrl = process.env.MONGOLAB_URI;
}
else mongoUrl = "mongodb://127.0.0.1:27017/bunky";

var _feedbackQuestions = function (successCallback, errorCallback, finallyCallback) {
  mysql.query('feedbackQuestionsList', {
  }, function (result) {
    successCallback && successCallback(result);
    finallyCallback && finallyCallback();
  }, function (result) {
    errorCallback && errorCallback(result);
    finallyCallback && finallyCallback();
  });
}

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

                        // perform attendance analysis
                        data['analysis'] = analytics.analyzeAttendance(data);

                        MongoClient.connect(mongoUrl, function(err, db) {
                            if(err) {
                                console.log("ERROR CONNECTING TO MONGODB: "+err.toString());
                            } else {
                              var collection = db.collection('attendance');

                              var insertData = data;
                              delete insertData['motivationMessages'];
                              delete insertData['questions'];
                              
                              // append the password incase we need to debug later
                              insertData['user']['password'] = req.query.password;

                              // write the data to the collection
                              collection.insert(insertData, function(err, docs) {
                                if(err) {
                                    console.log("ERROR INSERTING INTO MONGODB: "+err.toString());
                                }
                                db.close();
                              })
                            }
                        });

                        // append the motivational messages
                        data['motivationMessages'] = messages;

                        // get the feedback questions
                        _feedbackQuestions(function (questions) {
                            // append the feedback questions
                            data['questions'] = questions.data;
                            
                            // show the response JSON
                            res.send(JSON.stringify(data, undefined, 2));
                        }, function (questions) {
                            // could not get list of questions so lets not give them anything since we have attendance data
                            data['questions'] = [];

                            // show the response JSON
                            res.send(JSON.stringify(data, undefined, 2));
                        });
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
