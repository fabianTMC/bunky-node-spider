function compareArrays(array, array2) {
    // if the other array is a falsy value, return
    if (!array)
        return false;

    // compare lengths - can save a lot of time 
    if (array2.length != array.length)
        return false;

    for (var i = 0, l=array2.length; i < l; i++) {
        // Check if we have nested arrays
        if (array2[i] instanceof Array && array[i] instanceof Array) {
            // recurse into the nested arrays
            if (!array2[i].equals(array[i]))
                return false;       
        }           
        else if (array2[i] != array[i]) { 
            // Warning - two different object instances will never be equal: {x:20} != {x:20}
            return false;   
        }           
    }       
    return true;
}   

function sumHours(array) {
  if(!array) {
    return 0;
  } else {
    var sum = 0;
    
    for (var i = 0, l=array.length; i < l; i++) {
      if(array[i] == 1) {
        sum++;
      }
    }
    
    return sum;
  }
}

var months = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec'
];

function _analyzeAttendance(attendance) {
  var p = attendance.attendance.bunked;
  var totalBunks = attendance.attendance.absent;

  var saturdayHours = 4;
  var hoursPerDay = 6;

  var matrix = [0,0,0,0,0,0];
  var _pattern = [1,0,0,0,0,0];
  var _pattern2 = [1,1,0,0,0,0];
  var _patternLast2 = [0,0,0,0,1,1];
  var _wholeDayPattern = [1,1,1,1,1,1];

  var bunkCount = {};
  var lateHours = 0;
  var partyHours = 0;
  var bunkedDays = 0;

  var response = {};

  for (var key in p) {
    if (p.hasOwnProperty(key)) {
      
      var split = key.split('/');
      
      if (split.length == 3) {
        split[1] = months[parseInt(split[1])];
        var date = split.join('/');
        // loop through the list of all hours
        for (var i in p[key]) {
          var hour = p[key][i];
          
          // -------------------------------
          // set the bunked status
          // -------------------------------
          if(hour.status == "bunked") {
            if(bunkCount[attendance.bunkedSubjects[hour.class]]) {
            bunkCount[attendance.bunkedSubjects[hour.class]]++;
            } else {
              bunkCount[attendance.bunkedSubjects[hour.class]] = 1;
            }
            matrix[i] = 1;
          }
        }
        
          pattern = _pattern;
          pattern2 = _pattern2;
          patternLast2 = _patternLast2;
          wholeDayPattern = _wholeDayPattern;
        
        if(compareArrays(matrix, pattern) || compareArrays(matrix, pattern2)) {
          //console.log("You woke up late on or were stuck in traffic on "+key);
          lateHours += sumHours(matrix);
        }
        
        if(compareArrays(matrix, patternLast2)) {
          //console.log("You went out with your friends or had some work on "+key);
          partyHours += sumHours(matrix);
        }
        
        if(compareArrays(matrix, wholeDayPattern)) {
          //console.log("You bunked the whole day on "+key);
          bunkedDays++;
        }
        
        
        matrix = [0,0,0,0,0,0];
      }
    }
  }

  response['lateHours'] = (lateHours/attendance.attendance.conducted*100).toFixed(2);
  response['partyHours'] = (partyHours/attendance.attendance.conducted*100).toFixed(2);
  response['wholeDays'] = (bunkedDays*hoursPerDay/attendance.attendance.conducted*100).toFixed(2);

  // console.log("You lost "+(lateHours/attendance.attendance.conducted*100).toFixed(2)+"% attendance coming late for "+lateHours+" hours");
  // console.log("You lost "+(partyHours/attendance.attendance.conducted*100).toFixed(2)+"% attendance leaving "+partyHours+" hours after lunch.");
  // console.log("You lost "+(bunkedDays*hoursPerDay/attendance.attendance.conducted*100).toFixed(2)+"% attendance bunking "+bunkedDays+" whole days.");

  response['subjects'] = {};

  for (var key in bunkCount) {
    if (bunkCount.hasOwnProperty(key)) {
      //console.log("You lost "+(bunkCount[key]/attendance.attendance.absent*100).toFixed(2)+"% attendance bunking "+bunkCount[key]+" hours in "+key);
      response['subjects'][key] = (bunkCount[key]/(attendance.attendance.conducted)*100).toFixed(2);
    }
  }

  return response;
}

module.exports = {analyzeAttendance: _analyzeAttendance};