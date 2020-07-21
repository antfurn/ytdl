'use strict';

const express = require('express');
const { body,validationResult } = require('express-validator');
const stringifyObject = require('stringify-object');
const path = require('path','sep')
const fs = require('fs');
const youtubedl = require('youtube-dl');

// Create a local in memory database (loki)
var loki = require( 'lokijs' );
var inMemDB = new loki( 'ytdl/downloads_db.json', {
  autoload: true,
  autoloadCallback: loadHandler,
  autosave: true,
  autosaveInterval: 1000,
} );

// Constants
const PORT = 9980;
const HOST = '0.0.0.0';

// App
const app = express();

// Parse URL-encoded bodies (as sent by HTML forms)
app.use(express.urlencoded());

// Parse JSON bodies (as sent by API clients)
app.use(express.json());

// Setup/preload in mem db (loki)
var dlsDB = null; // The in memory downloads database collection
// Get the downloads collection ready (Loki)
function loadHandler() {
  dlsDB = inMemDB.getCollection('downloads_db');
  if (null == dlsDB) {
    dlsDB = inMemDB.addCollection('downloads_db', { autoupdate: true });
    console.log("DB collection 'downloads_db', not loaded - Empty one created.");
  }
}

app.get('/', (req, res) => {
  let txthtml = "";
  txthtml += '<html>';
  txthtml += '<head>Remote youtube-dl tool:</head>';
  txthtml += '<body>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl">Submit form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/history">Download history...</a>';
  txthtml += '</body></html>';

  res.send(txthtml);
});

app.get('/ytdl', (req, res) => {
  res.send(' \
  <form action="/ytdl/" method="post"> \
  <label>Enter URL to download:  </label><br /> \
  <input type="text" name="video_url" style="width: 400px;" value=""> \
  <br /><input type="submit" value="GO"> \
  </form> \
  <br /><a href="/ytdl/status">Download status...</a> \
  <br /> \
  <br /><a href="/ytdl/history">Download history...</a> \
  <br /> \
  <br /> \
  <form action="/ytdl/update" method="post"> \
  <label>Update youtube-dl:  </label><input type="submit" value="Update!"> \
  </form>');
});

app.get('/ytdl/status', (req, res) => {

  let txthtml = "";
  let rowhtml = "";
  txthtml += '<html>';
  txthtml += '<head> <meta http-equiv="refresh" content="2"> </head>';
  txthtml += '<body>This page auto refresh every 2 seconds<br />';
  txthtml += '<br /><a href="/ytdl">Back to form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/history">Download History...</a>';
  txthtml += '<br />';
  txthtml += '<table border="1"><tr>';
  txthtml += '<th>Channel:</th><th>Title:</th><th>Video %</th><th>Audio %</th>';
  txthtml += '</tr><tr>';

  let inprogressdls = dlsDB.find({ 'm_status' : { '$nin' : ['complete','failed'] }}).reverse();
  if ( inprogressdls === null | inprogressdls.length === 0 ){
    rowhtml = "<td>All done :-)</td>"
  } else {
    for ( var i in inprogressdls ) {
      rowhtml += "<td>"+ inprogressdls[i].uploader +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].title +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].v_percent +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].a_percent +"</td>"
      //rowhtml += "<td>"+ inprogressdls[i].m_status +"</td>"
      rowhtml += "</tr><tr>";
    }
  }

  txthtml += rowhtml;
  txthtml += '</tr></table>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl">Back to form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/history">Download History...</a>';
  txthtml += '</body></html>';

  res.send(txthtml);
});

app.get('/ytdl/history', (req, res) => {

  let txthtml = "";
  let rowhtml = "";
  let frowhtml = "";
  txthtml += '<html>';
  txthtml += '<head></head>';
  txthtml += '<body>';
  txthtml += '<br /><a href="/ytdl">Back to form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
  txthtml += '<table border="1"><tr>';
  txthtml += '<th>Channel:</th><th>Title:</th><th>File name:</th><th>Size</th>';
  txthtml += '</tr><tr>';

  let completedls = dlsDB.find({ 'm_status' : { '$in' : ['complete'] }}).reverse();
  if ( completedls === null | completedls.length === 0 ){
    rowhtml = "<td>Empty :-(</td><td>so unused and unloved</td><td>:'(</td><td>0MB</td>"
  } else {
    completedls.solokijs 
    for ( var i in completedls ) {
      rowhtml += "<td>"+ completedls[i].uploader +"</td>"
      rowhtml += "<td>"+ completedls[i].title +"</td>"
      rowhtml += "<td>"+ completedls[i].filename +"</td>"
      rowhtml += "<td>"+ ((completedls[i].v_size+completedls[i].a_size)/(1024*1024)).toFixed(2) +"MB</td>"
      //rowhtml += "<td>"+ inprogressdls[i].m_status +"</td>"
      rowhtml += "</tr><tr>";
    }
  }

  txthtml += rowhtml;
  txthtml += '</tr></table>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl">Back to form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
  txthtml += '<br />';
  txthtml += '<br />';
  txthtml += '<br />The below downloads failed :\'(';
  txthtml += '<table border="1"><tr>';
  txthtml += '<th>Channel:</th><th>Title:</th><th>Requested URL:</th><th>Status</th>';
  txthtml += '</tr><tr>';
  
  let faileddls = dlsDB.find({ 'm_status' : { '$in' : ['failed'] }}).reverse();
  if ( faileddls === null | faileddls.length === 0 ){
    rowhtml = "<td>Empty :-(</td><td>so unused and unloved</td><td>:'(</td><td>0MB</td>"
  } else {
    for ( var i in faileddls ) {
      frowhtml += "<td>"+ faileddls[i].uploader +"</td>"
      frowhtml += "<td>"+ faileddls[i].title +"</td>"
      frowhtml += "<td>"+ faileddls[i].req_url +"</td>"
      frowhtml += "<td>"+ faileddls[i].m_status +"</td>"
      frowhtml += "</tr><tr>";
      frowhtml += "<td colspan=4>"+ faileddls[i].failed_msg +"</td>"
      frowhtml += "</td></tr><tr>";
    }
  }
  txthtml += frowhtml;
  txthtml += '</tr></table>';
  txthtml += '</body></html>';

  res.send(txthtml);
});

app.post('/ytdl/update', (req, res) => {

  const downloader = require('youtube-dl/lib/downloader');

  let ytdl_apath = youtubedl.getYtdlBinary();
  console.log( "youtube-dl apath: " + ytdl_apath );
  let ytdl_path = ytdl_apath.substring(0, ytdl_apath.lastIndexOf("/"));
  if ( ytdl_path.length < 1) { 
    ytdl_path = ytdl_apath.substring(0, ytdl_apath.lastIndexOf("\\"));
  }
  console.log( "youtube-dl  path: " + ytdl_path );


  //downloader(youtubedl.getYtdlBinary(), function error(err, done) {
  downloader(ytdl_path, function error(err, done) {
    'use strict'
    if (err) throw err
   
    console.log(done)
    res.send('Updated to: ' + done + '<br /><a href="/ytdl">Back to form...</a>' );
  })
});

app.post('/ytdl', [
  body('video_url').isURL()
], (req, res) => {

    // Extract the validation errors from a request.
    const errors = validationResult(req);


    if (!errors.isEmpty()) {
      const err = stringifyObject(errors.array(), {
        indent: '  ',
        singleQuotes: false
      }); 
      return res.status(422).send("Error: Not a valid URL.<br />" + err + "<br /><a href='/ytdl'>Try again...</a>");
    }

    // Data from form is valid.
    let dling = "dling: " + req.body.video_url;
    const ytdl_folder = "ytdl";

    if (!fs.existsSync(ytdl_folder)){
      fs.mkdirSync(ytdl_folder);
    }

    // Optional arguments passed to youtube-dl.
    const options = ['-o','ytdl/%(uploader)s/%(title)s-%(id)s.%(ext)s', '--restrict-filenames', '-f','bestvideo+bestaudio'];
    const voptions = ['-o','ytdl/%(uploader)s/%(title)s-%(id)s.f%(format_id)s.%(ext)s', '--restrict-filenames', '-f','bestvideo'];
    const aoptions = ['-o','ytdl/%(uploader)s/%(title)s-%(id)s.f%(format_id)s.%(ext)s', '--restrict-filenames','-f','bestaudio'];
    //, '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]'];//, '-f bestvideo+bestaudio']; //'--username=user', '--password=hunter2'

    let vidd = {};
    vidd.req_url = req.body.video_url;
    vidd.v_pos = 0;
    vidd.v_percent = 0;
    vidd.v_status = "waiting";
    vidd.a_size = -1;
    vidd.a_pos = 0;
    vidd.a_percent = 0;
    vidd.a_status = "waiting";
    vidd.m_status = "waiting";
    var db_doc_id = dlsDB.insert( vidd ).$loki;

    var video = youtubedl(
      req.body.video_url,
      // Optional arguments passed to youtube-dl.
      voptions
    );
    
    var vsize = 0
    var uploader_folder = ""
    video.on('info', function (vinfo) {
      'use strict'
      vsize = vinfo.size;

      // sort out folder
      const path_split = vinfo._filename.split(path.sep);
      uploader_folder = path.join(path_split[0],path_split[1]);
      if (!fs.existsSync(uploader_folder)){
        console.log('Creating folder: ' + uploader_folder);
        fs.mkdirSync(uploader_folder);
      }
    
      console.log('Got video info: ' + vinfo.title + "<br />info._filename: " + vinfo._filename);
      // Create json obj of the video meta data we want
      let vidd = dlsDB.get(db_doc_id);
      vidd.vid_id = vinfo.id;
      vidd.title = vinfo.title;
      vidd.uploader = vinfo.uploader;
      vidd.thumbnail = vinfo.thumbnail;
      vidd.description = vinfo.description;
      vidd._filename = vinfo._filename;
      vidd.filename = path_split[2];
      vidd.v_format_id = vinfo.format_id;
      vidd.v_size = vinfo.size;

      
      //var file = path.join(__dirname, info._filename)
      video.pipe(fs.createWriteStream(vinfo._filename));

      let txthtml = "";
      txthtml += '<html>';
      txthtml += '<head>Starting download of:' + vinfo.title + '</head>';
      txthtml += '<body>info._filename: ' + vinfo._filename;
      txthtml += '<br />';
      txthtml += '<br /><a href="/ytdl">Back to submit form...</a>';
      txthtml += '<br />';
      txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
      txthtml += '<br />';
      txthtml += '<br /><a href="/ytdl/history">Download history...</a>';
      txthtml += '</body></html>';

      res.send(txthtml);
    });
    
    var vpos = 0
    video.on('data', function data (vchunk) {
      'use strict'
      vpos += vchunk.length;
    
      // `size` should not be 0 here.
      if (vsize) {
        var percent = ((vpos / vsize) * 100).toFixed(2);
        let vidd = dlsDB.get(db_doc_id);
        if ( Math.floor(percent/10.0)-Math.floor(vidd.v_percent/10.0) > 0 ) console.log(' '+percent+'%');
        vidd.v_status = "downloading";
        vidd.v_percent = percent;
        vidd.v_pos = vpos;
      }
    });

    video.on('error', (e) => {
      let vidd = dlsDB.get(db_doc_id);
      vidd.v_status = "error";
      vidd.failed_msg = e;
      vidd.m_status = "failed";

      console.log('\nVideo Failed with error: ',e);
    })
    
    video.on('end', function end () {
      'use strict'
      let vidd = dlsDB.get(db_doc_id);
      // Make sure it go to 100%
      if (vidd.v_percent < 100.0) {
        vidd.v_status = "too_short";
        vidd.m_status = "failed";
        vidd.failed_msg = 'Errr, video download only ' + vidd.v_percent + '%  Try it again?';
        console.log('\nError: Video only download: ' + vidd.v_percent + '%');

        if ( vidd.v_percent < 1 ){
          console.log('Trying alternate method:');
          vidd.v_status = "direct method";
          vidd.a_status = "progess not reported";
          vidd.m_status = "waiting";
          //Rename part file:
          fs.rename(vidd._filename,''+vidd._filename+'.broken-'+vidd.v_percent, function() {
  
            youtubedl.exec(vidd.req_url, ['-f bestvideo+bestaudio'], { cwd: uploader_folder }, function(err, output) {
              if (err) throw err
              
              let vidd = dlsDB.get(db_doc_id);
              vidd.v_status = "complete";
              vidd.a_status = "complete";
              vidd.m_status = "complete";
              vidd.failed_msg = 'Had to use the direct download option.';
            
              console.log(output.join('\n'))
            })
          });
        }
        return;
      }
      // else
      console.log('\nVideo Done');
      vidd.v_status = "complete";
        
      console.log('\nStart Audio');
      var audio = youtubedl(
        req.body.video_url,
        // Optional arguments passed to youtube-dl.
        aoptions
      );
        
      var asize = 0
      audio.on('info', function (ainfo) {
        'use strict'
        asize = ainfo.size;

        let vidd = dlsDB.get(db_doc_id);
        vidd.a_format_id = ainfo.format_id;
        vidd.a_size = ainfo.size;
        vidd.a_pos = 0;
        vidd.a_percent = 0;
        vidd.a_status = "starting";
      
        console.log('Got audio info: ' + ainfo.title + "<br />info._filename: " + ainfo._filename);
        //res.send("Starting download of: " + info.title + "<br />info._filename: " + info._filename);
        //var file = path.join(__dirname, info._filename)
        audio.pipe(fs.createWriteStream(ainfo._filename));
      });

      audio.on('error', (e) => {
        let vidd = dlsDB.get(db_doc_id);
        vidd.a_status = "error";
        vidd.failed_msg = e;
        vidd.m_status = "failed";
  
        console.log('\nAudio Failed with error: ',e);
      })
      
      var apos = 0
      audio.on('data', function data (achunk) {
        'use strict'
        apos += achunk.length;
      
        // `size` should not be 0 here.
        if (asize) {
          var percent = ((apos / asize) * 100).toFixed(2);
          let vidd = dlsDB.get(db_doc_id);
          if ( Math.floor(percent/10.0)-Math.floor(vidd.a_percent/10.0) > 0 ) console.log(' '+percent+'%');
          vidd.a_status = "downloading";
          vidd.a_percent = percent;
          vidd.a_pos = apos;
        }
      });
      
      audio.on('end', function end () {
        'use strict'
        let vidd = dlsDB.get(db_doc_id);
        // Make sure it go to 100%
        if (vidd.a_percent < 100.0) {
          vidd.a_status = "too_short";
          vidd.m_status = "failed";
          vidd.failed_msg = 'Errr, audio download only ' + vidd.a_percent + '%  Try it again?';
          console.log('\Audio only download: ' + vidd.a_percent + '%');
          return;
        }
        // else
        console.log('\nAudio Done');
        vidd.a_status = "complete";
        vidd.m_status = "started";

        console.log('\nStart merge');
        youtubedl.exec(req.body.video_url, options, {}, function(err, output) {
          if (err) {
            console.log(output.join('\n') + "\n Merged Failed !!!");
            let vidd = dlsDB.get(db_doc_id);
            vidd.m_status = "failed";
            vidd.failed_msg = err;
            inMemDB.saveDatabase(); // Force a DB save

            throw err
          } else {
            //res.send("Finished download ");
            console.log(output.join('\n') + "\n Download Complete!");
            let vidd = dlsDB.get(db_doc_id);
            vidd.m_status = "complete";
            inMemDB.saveDatabase(); // Force a DB save

            // Sort out permissions
            var chmodr = require('chmodr');
            console.log('chmod-ing folder: ' + uploader_folder);
            chmodr(uploader_folder, 0o775, function (err) {
              if (err) { throw err; }
              console.log("\n Fixed Permissions");
            }); 
          }
        });
        
      });
    });


    

/*
    let filename = "test.mp4";
    youtubedl.getInfo(req.body.video_url, options, function (err, info) {
      if (err) throw err


      dling +='<br />id:'+ info.id;
      dling +='<br />title:'+ info.title;
      dling +='<br />uploader:'+ info.uploader;
      dling +='<br />thumbnail:'+ info.thumbnail;
      dling +='<br />description:'+ info.description;
      dling +='<br />filename:'+ info._filename;
      dling +='<br />format id:'+ info.format_id;
        res.send(dling);
      filename = info._filename;

      youtubedl.exec(req.body.video_url, options, {}, function(err, output) {
        if (err) throw err
       
        console.log(output.join('Complete!\n'));
      })
*/


      // let url = "" + req.body.video_url;
      // const video = youtubedl(url, // options
      //   // Optional arguments passed to youtube-dl.
      //   //['--format=18'],
      //   ['-f bestvideo+bestaudio'],
      //   // Additional options can be given for calling `child_process.execFile()`.
      //   //{ cwd: __dirname }
      // )

      // // Will be called when the download starts.
      // video.on('info', function (info) {
      //   console.log('Download started')
      //   console.log('filename: ' + info._filename)
      //   console.log('size: ' + info.size)

      //   res.send(dling + ", size: " + info.size);
      // })

      // video.pipe(fs.createWriteStream(filename))
    //});
  
});

app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);




function exitHandler( options, err ) {
  console.log( "exitHandler:: options: ", options );

  inMemDB.saveDatabase(); // Force a DB save

  if ( err ) {
    console.log( 'Caught Exception:', err.stack )
    process.exit();
  }
  if ( options.exit ) {
    console.log( "ytdl - Closing Down !" );
  }
}
//do something when app is closing
process.on( 'exit', exitHandler.bind( null, {
  exit: true,
  source: 'exit'
} ) );

//catches ctrl+c event
process.on( 'SIGINT', exitHandler.bind( null, {
  source: 'SIGINT'
} ) );
process.on( 'SIGTERM', exitHandler.bind( null, {
  exit: true,
  source: 'SIGTERM'
} ) );
//catches uncaught exceptions
process.on( 'uncaughtException', exitHandler.bind( null, {
  exit: true,
  source: 'uncaughtException'
} ) );
//generated on Windows when the console window is closed
process.on( 'SIGHUP', exitHandler.bind( null, {
  exit: true,
  source: 'SIGHUP'
} ) );
// delivered on Windows when <Ctrl>+<Break> is pressed
process.on( 'SIGBREAK', exitHandler.bind( null, {
  exit: true,
  source: 'SIGBREAK'
} ) );