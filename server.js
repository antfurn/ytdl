'use strict';

const express = require('express');
const { body,validationResult } = require('express-validator');
const stringifyObject = require('stringify-object');
const path = require('path','sep')
const fs = require('fs');
const youtubedl = require('youtube-dl');
const exec = require('child_process');

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
  <br /><input type="checkbox" id="cbpip720" name="pip720" value="yes"> \
  <label for="cbpip720"> Create 720p version for PIP?</label> \
  <br /><input type="checkbox" id="cdaudioOnly" name="audioOnly" value="yes"> \
  <label for="cdaudioOnly"> Download audio only.</label> \
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
  let timeIs = Date.now();
  let dspTime = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
  txthtml += 'UTC: ' + dspTime;
  txthtml += '<br /><a href="/ytdl">Back to form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/history">Download History...</a>';
  txthtml += '<br />';
  txthtml += '<table border="1"><tr>';
  txthtml += '<th>id:</th><th>Channel:</th><th>Title:</th><th>Video %</th><th>Audio %</th><th>Time sec</th>';
  txthtml += '</tr><tr>';

  let inprogressdls = dlsDB.find({ 'm_status' : { '$nin' : ['complete','failed'] }}).reverse();
  if ( inprogressdls === null | inprogressdls.length === 0 ){
    rowhtml = "<td>All done :-)</td>"
  } else {
    for ( var i in inprogressdls ) {
      rowhtml += "<td>"+ inprogressdls[i].$loki +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].uploader +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].title +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].v_percent +"</td>"
      rowhtml += "<td>"+ inprogressdls[i].a_percent +"</td>"
      rowhtml += "<td>"+ Math.floor((timeIs - inprogressdls[i].epoch.start) / 1000) +"</td>"
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

app.post('/download', function(req, res){
  console.log('\nDownload req: ' + JSON.stringify(req.body));

  // check to make sure something selected
  if ( req.body.id ) {
    const file = `${__dirname}/` + req.body.id;  
    console.log('\nStart Download: ' + file);

    res.download(file); // Set disposition and send it.
  } else {    
    return res.status(422).send("Error: Nothing selected to download.<br /><br /><a href='/ytdl/history'>Try again...</a>");
  }
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
  txthtml += '<form action="/download" method="post">';
  txthtml += '<table border="1"><tr>';
  txthtml += '<th>When:</th><th>Download</th><th>Channel:</th><th>Title:</th><th>File name:</th><th>Size</th>';
  txthtml += '</tr><tr>';

  let completedls = dlsDB.find({ 'm_status' : { '$in' : ['complete'] }}).reverse();
  if ( completedls === null | completedls.length === 0 ){
    rowhtml = "<td>Empty :-(</td><td>so unused and unloved</td><td>:'(</td><td>0MB</td>"
  } else {
    completedls.solokijs 
    for ( var i in completedls ) {
      //console.log('Data dump: ' + JSON.stringify(completedls[i], null, 4) );
      if ( typeof completedls[i].epoch !== 'undefined' && completedls[i].epoch ) {
        let when = new Date(completedls[i].epoch.end).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        rowhtml += "<td>"+ when +"</td>"
      } else {
        rowhtml += "<td>n/a</td>"
      }
      rowhtml += '<td><input type="radio" id="a'+i+'" name="id" value="'+ completedls[i]._filename +'">'
      rowhtml += '<label for="a'+i+'">'+ i +'</label>'
      rowhtml += '<input type="submit" value="DL"></td>'
      rowhtml += "<td>"+ completedls[i].uploader +"</td>"
      rowhtml += "<td>"+ completedls[i].title +"</td>"
      rowhtml += '<td>'+ completedls[i].filename +'</td>'
      rowhtml += "<td>"+ ((completedls[i].v_size+completedls[i].a_size)/(1024*1024)).toFixed(2) +"MB</td>"
      //rowhtml += "<td>"+ inprogressdls[i].m_status +"</td>"
      rowhtml += "</tr><tr>";
    }
  }

  txthtml += rowhtml;
  txthtml += '</tr></table></form>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl">Back to form...</a>';
  txthtml += '<br />';
  txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
  txthtml += '<br />';
  txthtml += '<br />';
  txthtml += '<br />The below downloads failed :\'(';
  txthtml += '<table border="1"><tr>';
  txthtml += '<th>When:</th><th>Channel:</th><th>Title:</th><th>Requested URL:</th><th>Status</th><th>id</th>';
  txthtml += '</tr><tr>';
  
  let faileddls = dlsDB.find({ 'm_status' : { '$in' : ['failed','waiting','started'] }}).reverse();
  if ( faileddls === null | faileddls.length === 0 ){
    rowhtml = "<td>Empty :-(</td><td>so unused and unloved</td><td>:'(</td><td>0MB</td>"
  } else {
    for ( var i in faileddls ) {
      //console.log('Data dump: ' + JSON.stringify(faileddls[i], null, 4) );
      if ( typeof faileddls[i].epoch !== 'undefined' && faileddls[i].epoch ) {
        let when = "oops!"
        if ( typeof faileddls[i].epoch.end !== 'undefined' ) {
          when = new Date(faileddls[i].epoch.end).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        } else if ( typeof faileddls[i].epoch.start !== 'undefined' ) {
          when = new Date(faileddls[i].epoch.start).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        } else {
          when = new Date(faileddls[i].epoch.requested).toISOString().replace(/T/, ' ').replace(/\..+/, '')          
        }
        frowhtml += "<td>"+ when +"</td>"
      } else {
        frowhtml += "<td>n/a</td>"
      }
      frowhtml += "<td>"+ faileddls[i].uploader +"</td>"
      frowhtml += "<td>"+ faileddls[i].title +"</td>"
      frowhtml += "<td>"+ faileddls[i].req_url +"</td>"
      frowhtml += "<td>"+ faileddls[i].m_status +"</td>"
      frowhtml += "<td>"+ faileddls[i].$loki +"</td>"
      frowhtml += "</tr><tr>";
      frowhtml += "<td colspan=6>"+ JSON.stringify(faileddls[i].failed_msg, null, 2) +"</td>"
      frowhtml += "</td></tr><tr>";
    }
  }
  txthtml += frowhtml;
  txthtml += '</tr></table>';
  txthtml += '<br /><form action="/ytdl/remove" method="post">';
  txthtml += '<label>Enter ID to delete:  </label>';
  txthtml += '<input type="text" name="delete_id" style="width: 50px;" value="">';
  txthtml += '<br /><input type="submit" value="Delete entry [!NOT UNDOABLE!]">';
  txthtml += '</form>';
  txthtml += '</body></html>';

  res.send(txthtml);
});

app.post('/ytdl/remove', [
  body('delete_id').isHexadecimal()
], (req, res) => {
  // Extract the validation errors from a request.
  const errors = validationResult(req);


  if (!errors.isEmpty()) {
    const err = stringifyObject(errors.array(), {
      indent: '  ',
      singleQuotes: false
    }); 
    return res.status(422).send("Error: Not a ID.<br />" + err + "<br /><a href='/ytdl/history'>Try again...</a>");
  }

  let doomed_id = req.body.delete_id;
  let vidd = dlsDB.get(doomed_id);

  if ( ! vidd ) {
    return res.status(422).send("Error: Couldn't find that ID: " + doomed_id + "<br /><br /><a href='/ytdl/history'>Try again...</a>");
  }
  console.log('Data dump: ' + JSON.stringify(vidd, null, 4) );
  dlsDB.remove(vidd);

  console.log('Deleted: ' + doomed_id + ', from the download DB.')
  res.send('Deleted: ' + doomed_id + '<br /><a href="/ytdl">Back to form...</a>' );
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
    //let dling = "dling: " + req.body.video_url;
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
    vidd.req_pip720 = req.body.pip720;
    vidd.req_audioOnly = req.body.audioOnly;
    vidd.epoch = {};
    vidd.epoch.requested = Date.now();
    vidd.v_pos = 0;
    vidd.v_percent = 0;
    vidd.v_status = "waiting";
    vidd.a_size = -1;
    vidd.a_pos = 0;
    vidd.a_percent = 0;
    vidd.a_status = "waiting";
    vidd.m_status = "waiting";
    var db_doc_id = dlsDB.insert( vidd ).$loki;

    // Branch off if this is audio only
    if ( vidd.req_audioOnly ) {
      dlAudioOnly(req,res,db_doc_id);
      return;
    }

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
      vidd.epoch.start = Date.now();
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
      txthtml += 'Creating 720p PIP version: ';
      if (! vidd.req_pip720 ) {
        txthtml += 'No';
      } else {
        txthtml += vidd.req_pip720; }
      txthtml += '<br />';
      txthtml += 'Dowloading audio only: ';
      if (! vidd.req_audioOnly ) {
        txthtml += 'No';
      } else {
        txthtml += vidd.req_audioOnly; }
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
      vidd.epoch.end = Date.now();

      console.log('\nVideo Failed with error: ',e);
    })
    
    video.on('end', function end () {
      'use strict'
      let vidd = dlsDB.get(db_doc_id);
      // Make sure it go to 100%
      if (vidd.v_percent < 100.0) {
        vidd.v_status = "too_short";
        vidd.m_status = "failed";
        vidd.epoch.end = Date.now();
        vidd.failed_msg = 'Errr, video download only ' + vidd.v_percent + '%  Try it again?';
        console.log('\nError: Video only download: ' + vidd.v_percent + '%');

        fs.rename(vidd._filename, '' + vidd._filename + '.broken', function () {
          if (vidd.v_percent < 1) {
            console.log('Trying alternate method:');
            vidd.v_status = "started";
            vidd.a_status = "started";
            vidd.v_percent = "direct method";
            vidd.a_percent = "progess not reported";
            vidd.m_status = "waiting";
            //Rename part file:

            youtubedl.exec(vidd.req_url, ['-f bestvideo+bestaudio'], { cwd: uploader_folder }, function (err, output) {
              let vidd = dlsDB.get(db_doc_id);
              if (err) {
                vidd.v_status = "failed";
                vidd.a_status = "failed";
                vidd.m_status = "failed";
                vidd.epoch.end = Date.now();
                vidd.failed_msg = 'Errr, Direct download also failed:\n' + err + '\n\n' + output.join('\n');
                //throw err
              }
              console.log(output.join('\n'))

              vidd.v_status = "complete";
              vidd.a_status = "complete";
              vidd.m_status = "complete";
              vidd.epoch.end = Date.now();
              vidd.failed_msg = 'Had to use the direct download option.';            
              inMemDB.saveDatabase(); // Force a DB save

              // Sort out permissions
              fixPermissions(uploader_folder); 
            })
          }
        });
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
        vidd.epoch.end = Date.now();
  
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
          vidd.epoch.end = Date.now();
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
            vidd.epoch.end = Date.now();
            vidd.failed_msg = err;
            inMemDB.saveDatabase(); // Force a DB save

            throw err
          } else {
            //res.send("Finished download ");
            console.log(output.join('\n') + "\n Download Complete!");
            let vidd = dlsDB.get(db_doc_id);
            vidd.m_status = "complete";
            vidd.epoch.end = Date.now();
            inMemDB.saveDatabase(); // Force a DB save

            // Sort out permissions
            fixPermissions(uploader_folder); 
          }
        });
        
      });
    });  
});

function dlAudioOnly (req, res, db_doc_id)  {
  let vidd = dlsDB.get(db_doc_id);
  vidd.v_status = "n/a";
/*
Audio formats
id	quality	codec	examples
258	386k	m4a	youtube-dl -F NMANRHz4UAY
256	195k	m4a	youtube-dl -F NMANRHz4UAY
251	160k	Opus	youtube-dl -F S8Zt6cB_NPU
140	128k	m4a	youtube-dl -F S8Zt6cB_NPU
250	70k	Opus	youtube-dl -F S8Zt6cB_NPU
249	50k	Opus	youtube-dl -F S8Zt6cB_NPU
*/
  //const aoptions = ['-o','ytdl/%(uploader)s/%(title)s.%(ext)s', '--restrict-filenames','-F','S8Zt6cB_NPU'];
  
  const options = ['-o','ytdl/%(uploader)s/%(title)s.%(ext)s', '--restrict-filenames', '--extract-audio', '--audio-format', 'mp3'];  
  const aoptions = ['-o','ytdl/%(uploader)s/%(title)s.%(ext)s', '--restrict-filenames', '--dump-json', '--audio-format', 'mp3' ];

  console.log('\nStart Audio Only');

  // let txthtml = "";
  // txthtml += '<html>';
  // txthtml += '<head>Starting Audio only download of:' + ainfo.title + '</head>';
  // txthtml += '<body>info._filename: ' + ainfo._filename;
  // txthtml += '<br />';
  // txthtml += '<br />';
  // txthtml += '<br /><a href="/ytdl">Back to submit form...</a>';
  // txthtml += '<br />';
  // txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
  // txthtml += '<br />';
  // txthtml += '<br /><a href="/ytdl/history">Download history...</a>';
  // txthtml += '</body></html>';

  // res.send(txthtml);
  // youtubedl.exec(req.body.video_url, aoptions, {}, function(err, output) {
  //   if (err) {
  //     console.log(output.join('\n') + "\n Download Failed !!!");
  //     let vidd = dlsDB.get(db_doc_id);
  //     vidd.m_status = "failed";
  //     vidd.epoch.end = Date.now();
  //     vidd.failed_msg = err;
  //     inMemDB.saveDatabase(); // Force a DB save

  //     throw err
  //   } else {
  //     //res.send("Finished download ");
  //     console.log(output.join('\n') + "\n Audio Complete!");
  //     let vidd = dlsDB.get(db_doc_id);
  //     vidd.a_status = "complete";
  //     vidd.m_status = "complete";
  //     vidd.epoch.end = Date.now();
  //     inMemDB.saveDatabase(); // Force a DB save

  //     // Sort out permissions
  //     fixPermissions(uploader_folder); 
  //   }


  var audio = youtubedl(
    req.body.video_url,
    // Optional arguments passed to youtube-dl.
    aoptions
  );
    
  var asize = 0
  var uploader_folder = ""
  audio.on('info', function (ainfo) {
    'use strict'
    asize = ainfo.size;
    
    // sort out folder
    const path_split = ainfo._filename.split(path.sep);
    uploader_folder = path.join(path_split[0],path_split[1]);
    if (!fs.existsSync(uploader_folder)){
      console.log('Creating folder: ' + uploader_folder);
      fs.mkdirSync(uploader_folder);
    }
  
    // Create json obj of the video meta data we want
    let vidd = dlsDB.get(db_doc_id);
    vidd.epoch.start = Date.now();
    vidd.vid_id = ainfo.id;
    vidd.title = ainfo.title;
    vidd.uploader = ainfo.uploader;
    vidd.thumbnail = ainfo.thumbnail;
    vidd.description = ainfo.description;
    vidd._filename = ainfo._filename;
    vidd.filename = path_split[2];
    vidd.v_format_id = "";
    vidd.v_size = -1;

    vidd.a_format_id = ainfo.format_id;
    vidd.a_size = ainfo.size;
    vidd.a_pos = 0;
    vidd.a_percent = 0;
    vidd.a_status = "starting";
  
    console.log('Got audio info: ' + ainfo.title + "<br />info._filename: " + ainfo._filename);
    
    
    let txthtml = "";
    txthtml += '<html>';
    txthtml += '<head>Starting Audio only download of:' + ainfo.title + '</head>';
    txthtml += '<body>info._filename: ' + ainfo._filename;
    txthtml += '<br />';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl">Back to submit form...</a>';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl/history">Download history...</a>';
    txthtml += '</body></html>';

    res.send(txthtml);

    //var file = path.join(__dirname, info._filename)
    audio.pipe(fs.createWriteStream(ainfo._filename));
  });

  audio.on('error', (e) => {
    let vidd = dlsDB.get(db_doc_id);
    vidd.a_status = "error";
    vidd.failed_msg = e;
    vidd.m_status = "failed";
    vidd.epoch.end = Date.now();

    console.log('\nAudio Failed with error: ',e);
    
    let txthtml = "";
    txthtml += '<html>';
    txthtml += '<head>FAILED: Audio only download of:' + req.body.video_url + '</head>';
    txthtml += '<body>Error: ' + e;
    txthtml += '<br />';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl">Back to submit form...</a>';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl/history">Download history...</a>';
    txthtml += '</body></html>';
    res.send(txthtml);
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
      vidd.epoch.end = Date.now();
      vidd.failed_msg = 'Errr, audio download only ' + vidd.a_percent + '%  Try it again?';
      console.log('\Audio only download: ' + vidd.a_percent + '%');
      return;
    }
    // else
    vidd.a_status = "complete";
    vidd.m_status = "started";
    
    console.log('\nAudio dl Done');
    youtubedl.exec(req.body.video_url, options, {}, function(err, output) {
      if (err) {
        console.log(output.join('\n') + "\n Audio Exctract Failed !!!");
        let vidd = dlsDB.get(db_doc_id);
        vidd.m_status = "failed";
        vidd.epoch.end = Date.now();
        vidd.failed_msg = err;
        inMemDB.saveDatabase(); // Force a DB save

        throw err
      } else {
        console.log('\nAudio extract Done');
        vidd.m_status = "complete";

        // Correct filename to the mp3 one
        vidd._filename = vidd._filename.slice(0,-3) + "mp3";
        vidd.filename = vidd.filename.slice(0,-3) + "mp3";


        console.log("Download Complete!");
        vidd.epoch.end = Date.now();
        inMemDB.saveDatabase(); // Force a DB save

        // Sort out permissions
        fixPermissions(uploader_folder);     
      }
      });
  });
  
}

function fixPermissions(uploader_folder) {
  var chmodr = require('chmodr');
  var chownr = require('chownr');
  console.log('chmod-ing folder: ' + uploader_folder);
  chmodr(uploader_folder, 0o775, function (err) {
    if (err) { throw err; }
    console.log('chown-ing folder: ' + uploader_folder);
    chownr(uploader_folder, 1001, 1000, function (err) {
      if (err) { throw err; }
      console.log("\n Fixed Permissions");
    });
  });

}

function convertOutput( vidd ) {
  console.log( "convertOutput::" );

  inMemDB.saveDatabase(); // Force a DB save

  ffpmeg_cm = "ffmpeg -i" + vidd._filename + "-c:v libx265 -preset medium -crf 28 -vf scale=-1:720 -vtag hvc1 -c:a aac -b:a 128k" + vidd._filename + ".720p.mov";

  exec("", (error, stdout, stderr) => {

  });
}


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