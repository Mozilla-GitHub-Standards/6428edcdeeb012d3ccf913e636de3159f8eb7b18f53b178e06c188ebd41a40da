/**
 *
 *
 * pdf.js bot server
 *
 * Copyright (c) 2011 Mozilla Foundation
 * Please see LICENSE file for license information.
 *
 *
 **/
 
// Libs
var request = require('request'),
    spawn = require('child_process').spawn,
    path = require('path'),
    fs = require('fs'),
    globals = JSON.parse( fs.readFileSync('globals.json').toString() );

// Constants
var GITHUB_CREDENTIALS = process.env.GITHUB_CREDENTIALS; // Github credentials, format 'user:password123'    

if (!GITHUB_CREDENTIALS) {
  console.log('Environment variable GITHUB_CREDENTIALS not configured');
  console.log('Example: GITHUB_CREDENTIALS=yourname:password123\n');
  process.exit();
}

//
// Get all (open) pull requests for repo
//
request.get('https://github.com/api/v2/json/pulls/'+globals.main_repo+'/open', function(error, response, body) {
  var pulls = JSON.parse(body).pulls;
  console.log('[bot.js] found '+pulls.length+' open pull requests')
  pulls.forEach(function(pullBrief){
    
    //
    // Get pull request details (incl comments)
    //
    request.get('https://github.com/api/v2/json/pulls/'+globals.main_repo+'/'+pullBrief.number, function(error, response, body) {
      
      //
      // Pull details
      //
      var pull = JSON.parse(body).pull,
          sha = pull.head.sha, // sha1 of most recent commit
          pullUrl = pull.head.repository.url, // url of repo to be pulled in
          comments = pull.discussion;

      var hasBotCommand = false,
          targetDir = globals.pulls_path+'/tests/'+sha,
          gitProcess, t1;

      // 
      // Scan comments for bot command
      // 
      comments.forEach(function(comment){
        var bodyMatches = comment.body ? comment.body.match(new RegExp(globals.botname)) : false;
        if (comment.type === 'IssueComment' && bodyMatches) {
          hasBotCommand = true;
        }
      });

      if (hasBotCommand) {
        
        //
        // Has bot command
        //        
        console.log('[bot.js] pull #'+pull.number+': found bot command');        
        if (!path.existsSync(targetDir)) { // have we run/started the test already?
          console.log('[bot.js] target directory clear. spawning script...');          
          t1 = new Date();

          // Notify start of tests
          request.post({
            url:'https://'+GITHUB_CREDENTIALS+'@github.com/api/v2/json/issues/comment/'+globals.main_repo+'/'+pullBrief.number,
            json:{comment:'Starting tests... Results will be reported as a comment here.'}
          });
          
          //
          // Fetch git repo, checkout sha1, run tests
          //
          var refUrl = 'git://github.com/'+globals.ref_repo+'.git';
          gitProcess = spawn('./fetch-repo-run-tests', [pullUrl, refUrl, sha, globals.pulls_path]);
          gitProcess.on('exit', function(code){
            var t2 = new Date(),
                timeInMins = ((t2-t1)/(1000*60)).toFixed(2);

            //
            // All tests done!
            //                        
            if (!path.existsSync(targetDir+'/test/eq.log')) {              
              
              //
              // Tests passed
              //              
              console.log('[bot.js] all tests passed. took '+timeInMins+' mins');
                            
              // Notify end of tests
              request.post({
                url:'https://'+GITHUB_CREDENTIALS+'@github.com/api/v2/json/issues/comment/'+globals.main_repo+'/'+pullBrief.number,
                json:{comment:'All tests passed. Test time: '+timeInMins+' mins'}
              });
            }
            else {

              //
              // Tests did NOT pass
              //
              console.log('[bot.js] tests DID NOT pass. took '+timeInMins+' mins');
              
              // Notify end of tests
              request.post({
                url:'https://'+GITHUB_CREDENTIALS+'@github.com/api/v2/json/issues/comment/'+globals.main_repo+'/'+pullBrief.number,
                json:{comment:'Tests **DID NOT** pass. Test time: '+timeInMins+' mins'}
              });
            } // if !passed tests
            
          });        
        }
        else {
          console.log('[bot.js] pull #'+pull.number+': target directory already exists');
        } // if !path exists
        
      } // if hasBotCommand

    }); // GET pull details
  }); // forEach pull
}); //GET pulls
