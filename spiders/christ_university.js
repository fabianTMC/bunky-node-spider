var request = require('request');
var cheerio = require('cheerio');
var validUrl = require('valid-url');

var mysql = require('../models/mysql')();
var logger = require('../util/logging');

var request = request.defaults();

// production urls
var _urls = {
	"loginUrl": 'http://111.93.136.228/KnowledgePro/StudentLoginAction.do',
	"attendanceUrl": 'http://111.93.136.228/KnowledgePro/studentWiseAttendanceSummary.do?method=getIndividualStudentWiseSubjectAndActivityAttendanceSummary',
	"absentUrl": 'http://111.93.136.228/KnowledgePro/studentWiseAttendanceSummary.do?method=getStudentAbscentWithCocularLeave'
};

// development urls
var d_urls = {
	"loginUrl": 'http://localhost/fabian/temp/login_final.html',
	"attendanceUrl": 'http://localhost/fabian/temp/attendance_empty.html',
	"absentUrl": 'http://localhost/fabian/temp/bunked_final.html'
}

function userAgent() {
	var userAgents = require('../user_agents');

	return userAgents.random();
}

var _feedbackQuestions = function(successCallback, errorCallback, finallyCallback) {
	mysql.query("feedbackQuestionsList", {}, function(result){
		successCallback && successCallback(result);
		finallyCallback && finallyCallback();
	}, function(result){
		errorCallback && errorCallback(result);
		finallyCallback && finallyCallback();
	});
}

/* process the data returned by the login and attendance grabber */
var _getData = function(body, jar, successCB, failureCB) {
	var $ = cheerio.load(body);
	
	var flagI = null;
	var flagTotal = null;
	var flagTotalPercent = null;
	var breakerText = 'The leave attendance will be considered only if aggregate % is above 75% at the end of semester';

	// data containers
	var attendance = [];
	var subjects = [];
	var response = {};

	// how to map the subjects object names
	var subjectObjMap = ["name", "type", "conducted", "present", "absent", "percentage"];

	// find all the tables
	$('table').each(function (i, ele) {
		  // find all td in the current table
		  $(this).find('td').each(function (i, ele) {
			// check if we are at the start of the attendance data tables
			if ($(this).text().replace(/\s\s+/g, ' ').trim() == 'Sl No' || $(this).text().replace(/\s\s+/g, ' ').trim() == 'Sl.No') {
				flagI = i;
			}
			
			// check if we have found the start of the attendance table. if so, stop this loop since we know where to look
			if (flagI != null) {
				return false;
			}
		});
		  
		  // check if we have found the attendance table in the page
		  if (flagI != null) {
		  	var first = false;
		  	var last = false;

			// find all the attendance data elements
			$(this).find('td').each(function (i, ele) {
				var eleText = $(this).text().replace(/\s\s+/g, ' ').trim();

			  // have we reached the start point yet?
			  if (i < flagI) {
			  	return true;
			  }
			  
			  // do we have the total number of hours?
			  if(flagTotal != null && flagTotal+1 == i) {
			  	attendance.push(eleText.split(" "));
			  }
			  
			  // do we have the total percentage?
			  if(flagTotalPercent != null && flagTotalPercent+1 == i) {
			  	attendance.push(eleText.split(" "));
			  }
			  
			  // have we reached the end point yet?
			  if (eleText.toLowerCase() == breakerText.toLowerCase()) {
			  	return false;
			  }
			  
			  // have we found the end of the data?
			  if (eleText.toLowerCase() == 'total') {
			  	attendance.push(eleText);
			  	flagTotal = i;
			  	last = true;
			  }
			  
			  // have we found the total percentage?
			  if (eleText.toLowerCase() == 'total percentage') {
			  	attendance.push(eleText);
			  	flagTotalPercent = i;
			  }
			  
			  // check if it is an attendance type or attendance data array
			  if (parseInt(eleText) != eleText) { 
				// check if we have encountered the first sl.no and not reached the total (the end of the data)
				if(first && !last) {
				  // lets check if this holds our magical attendance potatoes
				  var temp = eleText.split(' ');
				  
				  /* NOTE: If this code breaks, you might have to edit somewhere around here for simple structure changes.  */
				  // check what the first word is
				  if(temp[0].toLowerCase() == 'theory' || temp[0].toLowerCase() == 'practical') {
					// check if we have attendance data as well
					if(temp.length > 2) {
					  // push attendance data for the current subject
					  for(var ii = 0; ii < temp.length; ii++) {
					  	attendance.push(temp[ii]);
					  }
					  
					  // push the current subject data to the main subjects array
					  subjects.push(attendance);
					  attendance = [];
					}
				} else if(temp[0].toLowerCase() == 'extra') {
					// check if we have attendance data as well
					if(temp.length > 2) {
						// check if we have the word Curricular
						if(temp[1].toLowerCase() == 'curricular') {
							// lets flatten this into one element
							temp[0] = temp[0] + " " + temp[1];
							temp.splice(1,1);
						}

					  //console.log(temp);
					  
					  // push attendance data for the current subject
					  for(var ii = 0; ii < temp.length; ii++) {
					  	attendance.push(temp[ii]);
					  }
					  
					  // push the current subject data to the main subjects array
					  subjects.push(attendance);
					  attendance = [];
					}
				} else {
					// this should be the subject name but lets remove float values (the attendance percentage)
					if(parseFloat(eleText) != eleText) {
					  	// only subject names will qualify. it will be empty for some forms of extra curricular
					  	attendance.push(eleText);
					  }
					}
				}
			} else {
				// we have encountered a sl.no
				first = true;
			}
		});

			/* NOTE: 
			* attendance now contains all total data 
			* subjects now contains all subject data
			*/
			
			// build the basic details
			response["result"] = "success";
			response["message"] = "";
			
			response["attendance"] = {};
			
			// total data
			response["attendance"]['conducted'] = attendance[1][0];
			response["attendance"]['present'] = attendance[1][1];
			response["attendance"]['absent'] = attendance[1][2];
			response["attendance"]['percentage'] = attendance[3][0];

			response['questions'] = [];

			// get the feedback questions
			_feedbackQuestions(function(questions) {
				response['questions'] = questions.data;
			}, function(questions) {
				// could not get list of questions so lets not give them anything since we have attendance data
			}, function(){
				// finally function 
				// get subject data
				response["attendance"]["subjects"] = [];
				
				// subject data object generation
				for(var ii = 0; ii < subjects.length; ii++) {
				  // change the current array into an object
				  var subjectObj = {};
				  
				  for(var jj = 0; jj < subjects[ii].length; jj++) {
				  	subjectObj[subjectObjMap[jj]] = subjects[ii][jj];
				  }
				  response["attendance"]["subjects"].push(subjectObj);
				}

				if(response["attendance"]["percentage"] < 100) {
					// get the list of all the bunked hours
					_bunked(response, jar, successCB, failureCB);
				} else {
					response["attendance"]["bunked"] = [];
					successCB && successCB(response);
				}
			});
			
		  // stop looking for all the td elements since we already found some
		  return false;
		} else {
			response["result"] = "success";
			response["message"] = "";

			// get the feedback questions
			_feedbackQuestions(function(questions) {
				response['questions'] = questions.data;
			}, function(questions) {
				// could not get list of questions so lets not give them anything since we have attendance data
			}, function(){
				failureCB && failureCB(response);
			});
		}
	});
}

/* get the list of all the bunked hours along with the subject code name map */
var _bunked = function(response, jar, successCB, failreCB) {
	var r = request.post({url: _urls.absentUrl, jar: jar, headers: {'User-Agent': userAgent()}}, function (err, httpResponse, body) {
		if (err) {
			failureCB && failureCB({"error": true, "data": err});
		} else {
        	// lets get the user's name
        	var $ = cheerio.load(body);

        	var foundDate = null;
        	var foundBreaker = null;
        	var breakerText = 'Periods Marked In Green Are Cocurricular Leave';
        	var subjectCodeNameMap = {};
        	var days = {};

        	$('body').find('table').each(function (i, ele) {
        		$(this).find('td').each(function (j, ele) {
        			var eleText = $(this).text().replace(/\s\s+/g, ' ').trim();
			    // have we found any bunked hours?
			    if (foundDate == null) {
			    	if (eleText.toLowerCase() == 'date') {
			    		foundDate = j;
			    	}
			    }
			    // have we found the total data

			    if (foundBreaker == null) {
			    	if (eleText.toLowerCase() == breakerText.toLowerCase()) {
			    		foundBreaker = j;
			        // since we found this, lets stop the loop
			        return false;
			    }
			}
		});
			  // check if we found the bunked days in the current table
			  if (foundDate != null) {
			  	var dayBunked = [
			  	];
			  	var start = false;

			    // lets go to the start point
			    $(this).find('td').each(function (j, ele) {
			      // continue the loop until we find the start
			      if (j < foundDate) {
			        // continue the loop
			        return true;
			    }

			      // check if we found the start of the total data
			      if (j == foundBreaker) {
			        // stop the loop
			        return false;
			    }

			    var eleText = $(this).text().replace(/\s\s+/g, ' ').trim();
			      // empty stings have no relevance here 
			      if (eleText != '') {
			        // check if this is a date
			        if (eleText.split('/').length == 3) {
			        	if (!start) {
			        		start = true;
			        		dayBunked.push(eleText);
			        	} else {
			        		days[dayBunked[0]] = dayBunked;

						// remove the total hours bunked
						days[dayBunked[0]].splice(days[dayBunked[0]].length-1,1);

						// remove the day and date
						days[dayBunked[0]].splice(0,2);

						// clear the array and push the current date
						dayBunked = [];
						dayBunked.push(eleText);
					}
				} else {
			          // check if we can start detecting bunks
			          if (start) {
			          	dayBunked.push(eleText);
			          }
			      }
			  }
			});
days[dayBunked[0]] = dayBunked;

			    // remove the total hours bunked
			    days[dayBunked[0]].splice(days[dayBunked[0]].length-1,1);

				// remove the day and date
				days[dayBunked[0]].splice(0,2);

				// clear the array and push the current date
				dayBunked = [];

			    // stop the table loop
			    return false;
			}
		});

for(var date in days) {
	if(days.hasOwnProperty(date)) {
			  // loop over the current array. 
			  for(var j = 0; j < days[date].length-1; j++) {
			  	if(!subjectCodeNameMap[days[date][j]]) {
			      // we are targeting the last instance since it is what will have the subject name and code
			      var last = ""; 
			      var code = "("+days[date][j]+")";
			      $('td:contains("'+code+'")').filter(function() { 
			      	last = $(this).text().trim().replace(/\s+/g, ' ');
			      });

			      // split the text based on the code
			      subjectCodeNameMap[days[date][j]] = last.split(code)[0];
			  }
			}
		}
	}

	response["attendance"]["bunked"] = days;
	response["bunkedSubjects"] = subjectCodeNameMap;

	successCB && successCB(response);
}
});
}

/* login and get the attendance data */
var _login = function(username, password, successCB, failureCB) {
	var j = request.jar();

    // process login
    var r = request.post({url: _urls.loginUrl, jar: j, headers: {'User-Agent': userAgent()}}, function (err, httpResponse, body) {
    	if (err) {
    		failureCB && failureCB({"error": true, "data": err});
    	} else {
            	// lets get the user's name
            	var $ = cheerio.load(body);
            	var foundName = false;
            	var foundEmail = false;
            	var foundProfile = false;
            	var name = null;
            	var picture = null;

            	$('body').find('td').each(function (i, ele) {
            		var eleText = $(this).text().replace(/\s\s+/g, ' ').trim();

                	// have we found the profile marker
                	if(eleText.toLowerCase() == 'profile') {
                		foundProfile = true;
                		return true;
                	}

                	// have we found the data start marker?
                	if(eleText.toLowerCase() == "name:") {
                		foundName = true;
                		return true;
                	}

                	// have we found the data end marker?
                	if(eleText.toLowerCase() == "email id:") {
                		foundEmail = true;
                		return true;
                	}

                	// have we found the users picture?
                	if(foundProfile && !foundName && picture == null) {
					    // the picture is the first img after the profile marker
					    picture = $(this).find('img').first().attr('src');

					    // check if the picture is relative or absolute
					    if(!validUrl.isUri(picture)){
					    	// picture is relative so lets change it into the absolute path
					    	var split = _urls.loginUrl.split("/");
					    	split.pop();
					    	split.push(picture);
					    	// reform the url
					    	picture = split.join("/");
					    }
					}

                	// have we found the name?
                	if(foundName && !foundEmail) {
                		// convert the name to title case
                		//name = eleText.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
                		name = eleText;
                		return false;
                	}
                });

                // get the attendance
                var r = request.post({url: _urls.attendanceUrl, jar: j, headers: {'User-Agent': userAgent()}}, function (err, httpResponse, body) {
                	if (err) {
                		failureCB && failureCB({"error": true, "data": err});
                	} else {
                		var $ = cheerio.load(body);

                        // check if the login was successful
                        if($('.news:contains("'+username+'")').filter(function() { 
                        	return $(this).text().trim().replace(/\s+/g, ' ') === "Welcome "+username+", Sign Out"; 
                        }).length == 1) {
							// find attendance data
							_getData(body, j, function(response) {
								// append the user's details
								response['user'] = {
									"name": name,
									"picture": picture,
									"username": username,
									"college": "Christ University"
								};

								// got data successfully
								successCB && successCB(response);
							}, function(response){
								// logindid not get data successfully
								failureCB && failureCB({"result": "failure", "message": "Could not fetch attendance data."});
							});
						} else {
                            // login was unsuccessful
                            failureCB && failureCB({"result": "failure", "message": "You have entered the wrong login details."});
                        }
                    }
                });
}
});

        // to the request, append the form login details
        var form = r.form();
        form.append('userName', username);
        form.append('password', password);

        // append other form details
        form.append('method', 'studentLoginAction');
        form.append('formName', 'loginform');
        form.append('pageType', '1');
        form.append('serverDownMessage', '');
    };

    var spider = {
    	"urls": _urls,
    	"login": _login
    };

    module.exports = spider;