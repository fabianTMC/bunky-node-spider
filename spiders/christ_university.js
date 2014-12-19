var request = require('request');
var cheerio = require('cheerio');
var request = request.defaults()

// production urls
var _urls = {
	"loginUrl": 'http://111.93.136.228/KnowledgePro/StudentLoginAction.do',
	"attendanceUrl": 'http://111.93.136.228/KnowledgePro/studentWiseAttendanceSummary.do?method=getIndividualStudentWiseSubjectAndActivityAttendanceSummary',
	"logoutUrl": 'http://111.93.136.228/KnowledgePro/StudentLoginAction.do?method=studentLogoutAction'
};

// development urls
var d_urls = {
	"loginUrl": 'http://localhost/fabian/temp/attendance.html',
	"attendanceUrl": 'http://localhost/fabian/temp/attendance.html'
}

/* process the data returned by the login and attendance grabber */
var _getData = function(body, successCB, failureCB) {
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
			response["resultMessage"] = "";
			
			response["attendance"] = {};
			
			// total data
			response["attendance"]['conducted'] = attendance[1][0];
			response["attendance"]['present'] = attendance[1][1];
			response["attendance"]['absent'] = attendance[1][2];
			response["attendance"]['percentage'] = attendance[3][0];
			
			// subject data 
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
			
			 successCB && successCB(response);
			
		  // stop looking for all the td elements since we already found some
		  return false;
		} else {
			response["result"] = "success";
			response["resultMessage"] = "";
			
			failureCB && failureCB(response);
		}
	});
}

/* login and get the attendance data */
var _login = function(username, password, successCB, failureCB) {
    var j = request.jar();

    // process login
        var r = request.post({url: _urls.loginUrl, jar: j, headers: []}, function (err, httpResponse, body) {
            if (err) {
                failureCB && failureCB({"error": true, "data": err});
            } else {
            	// lets get the user's name
            	var $ = cheerio.load(body);
            	var foundName = false;
            	var foundEmail = false;
            	var name = null;

                $('body').find('td').each(function (i, ele) {
                	var eleText = $(this).text().replace(/\s\s+/g, ' ').trim();
                	// have we found the start marker?
                	if(eleText.toLowerCase() == "name:") {
                		foundName = true;
                		return true;
                	}

                	// have we found the end marker?
                	if(eleText.toLowerCase() == "email id:") {
                		foundEmail = true;
                		return true;
                	}

                	// have we found the name?
                	if(foundName && !foundEmail) {
                		// convert the name to title case
                		name = eleText.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
                		return false;
                	}
                });

                // get the attendance
                var r = request.post({url: _urls.attendanceUrl, jar: j}, function (err, httpResponse, body) {
                    if (err) {
                        failureCB && failureCB({"error": true, "data": err});
                    } else {
                        var $ = cheerio.load(body);

                        // check if the login was successful
                        if($('.news:contains("'+username+'")').filter(function() { 
                            return $(this).text().trim().replace(/\s+/g, ' ') === "Welcome "+username+", Sign Out"; 
                        }).length == 1) {
							// find attendance data
							_getData(body, function(response) {
								// append the user's details
								response['user'] = {
									"name": name,
									"username": username,
									"college": "Christ University"
								};

								// got data successfully
								successCB && successCB(response);
							}, function(response){
								// logindid not get data successfully
								failureCB && failureCB({"result": "failure", "resultMessage": "Could not fetch attendance data."});
							});
                        } else {
                            // login was unsuccessful
                            failureCB && failureCB({"result": "failure", "resultMessage": "You have entered the wrong login details."});
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