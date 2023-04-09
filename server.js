'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const stringifyObject = require('stringify-object');
const path = require('path', 'sep')
const fs = require('fs');
const youtubedl = require('youtube-dl-exec');
const exec = require('child_process');

// Create a local in memory database (loki)
var loki = require('lokijs');
const { url } = require('inspector');
var inMemDB = new loki('ytdl/downloads_db.json', {
  autoload: true,
  autoloadCallback: loadHandler,
  autosave: true,
  autosaveInterval: 1000,
});

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
  <br /><input type="checkbox" id="cdaudioExtract" name="audioExtract" value="yes"> \
  <label for="cdaudioExtract"> Extract audio file.</label> \
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

  let inprogressdls = dlsDB.find({ 'm_status': { '$nin': ['complete', 'failed'] } }).reverse();
  if (inprogressdls === null | inprogressdls.length === 0) {
    rowhtml = "<td>All done :-)</td>"
  } else {
    for (var i in inprogressdls) {
      rowhtml += "<td>" + inprogressdls[i].$loki + "</td>"
      rowhtml += "<td>" + inprogressdls[i].uploader + "</td>"
      rowhtml += "<td>" + inprogressdls[i].title + "</td>"
      rowhtml += "<td>" + inprogressdls[i].v_percent + "</td>"
      rowhtml += "<td>" + inprogressdls[i].a_percent + "</td>"
      rowhtml += "<td>" + Math.floor((timeIs - inprogressdls[i].epoch.start) / 1000) + "</td>"
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

app.post('/download', function (req, res) {
  console.log('\nDownload req: ' + JSON.stringify(req.body));

  // check to make sure something selected
  if (req.body.id) {
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

  let completedls = dlsDB.find({ 'm_status': { '$in': ['complete'] } }).reverse();
  if (completedls === null | completedls.length === 0) {
    rowhtml = "<td>Empty :-(</td><td>so unused and unloved</td><td>:'(</td><td>0MB</td>"
  } else {
    completedls.solokijs
    for (var i in completedls) {
      //console.log('Data dump: ' + JSON.stringify(completedls[i], null, 4) );
      if (typeof completedls[i].epoch !== 'undefined' && completedls[i].epoch) {
        let when = new Date(completedls[i].epoch.end).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        rowhtml += "<td>" + when + "</td>"
      } else {
        rowhtml += "<td>n/a</td>"
      }
      rowhtml += '<td><input type="radio" id="a' + i + '" name="id" value="' + completedls[i]._filename + '">'
      rowhtml += '<label for="a' + i + '">' + i + '</label>'
      rowhtml += '<input type="submit" value="DL"></td>'
      rowhtml += "<td>" + completedls[i].uploader + "</td>"
      rowhtml += "<td>" + completedls[i].title + "</td>"
      rowhtml += '<td>' + completedls[i].filename + '</td>'
      rowhtml += "<td>" + ((completedls[i].v_size + completedls[i].a_size) / (1024 * 1024)).toFixed(2) + "MB</td>"
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

  let faileddls = dlsDB.find({ 'm_status': { '$in': ['failed', 'waiting', 'started'] } }).reverse();
  if (faileddls === null | faileddls.length === 0) {
    rowhtml = "<td>Empty :-(</td><td>so unused and unloved</td><td>:'(</td><td>0MB</td>"
  } else {
    for (var i in faileddls) {
      //console.log('Data dump: ' + JSON.stringify(faileddls[i], null, 4) );
      if (typeof faileddls[i].epoch !== 'undefined' && faileddls[i].epoch) {
        let when = "oops!"
        if (typeof faileddls[i].epoch.end !== 'undefined') {
          when = new Date(faileddls[i].epoch.end).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        } else if (typeof faileddls[i].epoch.start !== 'undefined') {
          when = new Date(faileddls[i].epoch.start).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        } else {
          when = new Date(faileddls[i].epoch.requested).toISOString().replace(/T/, ' ').replace(/\..+/, '')
        }
        frowhtml += "<td>" + when + "</td>"
      } else {
        frowhtml += "<td>n/a</td>"
      }
      frowhtml += "<td>" + faileddls[i].uploader + "</td>"
      frowhtml += "<td>" + faileddls[i].title + "</td>"
      frowhtml += "<td>" + faileddls[i].req_url + "</td>"
      frowhtml += "<td>" + faileddls[i].m_status + "</td>"
      frowhtml += "<td>" + faileddls[i].$loki + "</td>"
      frowhtml += "</tr><tr>";
      frowhtml += "<td colspan=6>" + JSON.stringify(faileddls[i].failed_msg, null, 2) + "</td>"
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

  if (!vidd) {
    return res.status(422).send("Error: Couldn't find that ID: " + doomed_id + "<br /><br /><a href='/ytdl/history'>Try again...</a>");
  }
  console.log('Data dump: ' + JSON.stringify(vidd, null, 4));
  dlsDB.remove(vidd);

  console.log('Deleted: ' + doomed_id + ', from the download DB.')
  res.send('Deleted: ' + doomed_id + '<br /><a href="/ytdl">Back to form...</a>');
});

app.post('/ytdl/update', (req, res) => {
  // const downloader = require('youtube-dl/lib/downloader');

  // let ytdl_apath = youtubedl.getYtdlBinary();
  // console.log( "youtube-dl apath: " + ytdl_apath );
  // let ytdl_path = ytdl_apath.substring(0, ytdl_apath.lastIndexOf("/"));
  // if ( ytdl_path.length < 1) { 
  //   ytdl_path = ytdl_apath.substring(0, ytdl_apath.lastIndexOf("\\"));
  // }
  // console.log( "youtube-dl  path: " + ytdl_path );


  // //downloader(youtubedl.getYtdlBinary(), function error(err, done) {
  // downloader(ytdl_path, function error(err, done) {
  //   'use strict'
  //   if (err) throw err

  //   console.log(done)
  //   res.send('Updated to: ' + done + '<br /><a href="/ytdl">Back to form...</a>' );
  // })
  res.send('Sorry not implemeted!<br /><a href="/ytdl">Back to form...</a>');
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
  const ytdl_folder = "ytdl";

  if (!fs.existsSync(ytdl_folder)) {
    fs.mkdirSync(ytdl_folder);
  }

  const newdbEntry = {};
  newdbEntry.req_url = req.body.video_url;
  newdbEntry.req_pip720 = req.body.pip720;
  newdbEntry.req_audioExtract = req.body.audioExtract;
  newdbEntry.epoch = {};
  newdbEntry.epoch.requested = Date.now();
  newdbEntry.v_pos = 0;
  newdbEntry.v_percent = 0;
  newdbEntry.v_status = "waiting";
  newdbEntry.a_size = -1;
  newdbEntry.a_pos = 0;
  newdbEntry.a_percent = 0;
  newdbEntry.a_status = "waiting";
  newdbEntry.m_status = "waiting";
  const db_doc_id = dlsDB.insert(newdbEntry).$loki;

  youtubedl(req.body.video_url, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
      'referer:youtube.com',
      'user-agent:googlebot'
    ],
    output: 'ytdl/%(uploader)s/%(title)s-%(id)s.%(ext)s',
    format: 'bestvideo',
    windowsFilenames: true

  }).then(vinfo => {
    // console.log('vinfo: ' + JSON.stringify(vinfo))

    var uploader_folder = ""

    //   console.log('Got video info: ' + vinfo.title + "<br />info._filename: " + vinfo._filename);
    console.log('Got video info: ' + vinfo.title + "<br />filename: " + vinfo.requested_downloads[0]._filename);
    // Create json obj of the video meta data we want
    const dbEntry = dlsDB.get(db_doc_id);
    dbEntry.video_url = req.body.video_url
    dbEntry.epoch.start = Date.now();
    dbEntry.vid_id = vinfo.id;
    dbEntry.title = vinfo.title;
    dbEntry.uploader = vinfo.uploader;
    dbEntry.thumbnail = vinfo.thumbnail;
    dbEntry.description = vinfo.description;
    dbEntry._filename = vinfo.requested_downloads[0]._filename;
    dbEntry.v_format_id = vinfo.format_id;
    dbEntry.v_size = vinfo.requested_downloads[0].filesize_approx;

    // sort out folder
    const path_split = dbEntry._filename.split(path.sep);
    uploader_folder = path.join(path_split[0], path_split[1]);
    if (!fs.existsSync(uploader_folder)) {
      console.log('Creating folder: ' + uploader_folder);
      fs.mkdirSync(uploader_folder);
    }

    let txthtml = "";
    txthtml += '<html>';
    txthtml += '<head>Starting download of:' + dbEntry.title + '</head>';
    txthtml += '<body>info._filename: ' + dbEntry._filename;
    txthtml += '<br />';
    txthtml += 'Creating 720p PIP version: ';
    if (!dbEntry.req_pip720) {
      txthtml += 'No';
    } else {
      txthtml += dbEntry.req_pip720;
    }
    txthtml += '<br />';
    txthtml += 'Dowloading audio only: ';
    if (!dbEntry.req_audioExtract) {
      txthtml += 'No';
    } else {
      txthtml += dbEntry.req_audioExtract;
    }
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl">Back to submit form...</a>';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl/status">Download status...</a>';
    txthtml += '<br />';
    txthtml += '<br /><a href="/ytdl/history">Download history...</a>';
    txthtml += '</body></html>';

    res.send(txthtml);

    // Start the actual downloads

    runYTDL('video', db_doc_id, (success) => {
      // Called when dl complete
      if (success) {

        console.log('\nStart Audio');
        runYTDL('audio', db_doc_id, (success) => {
          // Called when dl complete
          if (success) {

            console.log('\nStart Merge');
            runYTDL('merge', db_doc_id, (success) => {
              // Called when merge complete
              if (success) {

                // Do we want audio extract?
                if (dbEntry.req_audioExtract) {
                  runYTDL('audio_extract', db_doc_id, (success) => {
                    // Called when merge complete
                    if (success) {
                      // Sort out permissions
                      fixPermissions(uploader_folder);
                      console.log('Video and Audio extract done')
                    } else {
                      // something bad happened 
                      dbEntry.a_status = "failed"
                    }
                  })
                } else {
                  // Sort out permissions
                  fixPermissions(uploader_folder);
                  console.log('Video DL done')
                }
              } else {
                // something bad happened 
                dbEntry.m_status = "failed"
              }

            })
          } else {
            // something bad happened 
            dbEntry.a_status = "failed"
          }

        })
      } else {
        // something bad happened 
        dbEntry.v_status = "failed"
      }
    })
  })
});

function runYTDL(oppo, db_doc_id, finishedCallBack) {
  console.log(`->runYTDL oppo:${oppo}, db_doc_id:${db_doc_id}`)
  const dbEntry = dlsDB.get(db_doc_id)

  const options = {
    // youtubedl(req.body.video_url, {
    noCheckCertificates: true,
    noWarnings: true,
    preferFreeFormats: true,
    addHeader: [
      'referer:youtube.com',
      'user-agent:googlebot'
    ],
    output: 'ytdl/%(uploader)s/%(title)s-%(id)s.f%(format_id)s.%(ext)s',
    windowsFilenames: true
  }
  if (oppo === 'video') {
    if (dbEntry.req_pip720) {
      options.formatSort = 'res:720'
      options.output = 'ytdl/%(uploader)s/%(title)s-%(id)s.720p.%(ext)s'
    } else {
      options.format = 'bestvideo'
    }
  } else if (oppo === 'audio') {
    options.format = 'bestaudio'
  } else if (oppo === 'merge') {
    if (dbEntry.req_pip720) {
      options.formatSort = 'res:720'
      options.mergeOutputormat = 'mov'
      options.output = 'ytdl/%(uploader)s/%(title)s-%(id)s.720p.%(ext)s'
    } else {
      options.format = 'bestvideo+bestaudio'
      options.mergeOutputormat = 'mp4/mkv'
      options.output = 'ytdl/%(uploader)s/%(title)s-%(id)s.%(ext)s'
    }
  } else if (oppo === 'audio_extract') {
    options.format = 'bestaudio'
    options.extractAudio = true
    options.audioFormat = 'falc'
    options.audioQuality = 0
    options.output = 'ytdl/%(uploader)s/%(title)s-%(id)s-Audio.%(ext)s'
  } else {
    console.log(`Invalid Download opperation: ${oppo}`)
    finishedCallBack(false)
    return
  }

  const subprocess = youtubedl.exec(dbEntry.video_url, options)

  subprocess.stdout.on('data', (data) => {
    const dataStr = `${data}`
    const dataSplitSP = dataStr.split(/\s+/)
    if (dataSplitSP[1] && dataSplitSP[1] === '[dashsegments]') {
      if (dataSplitSP[2] && dataSplitSP[2].includes('Destination:')) {
        console.log(`data${data}`)
      }
    } else if (dataSplitSP[1] && dataSplitSP[1] === '[download]') {
      if (dataSplitSP[2] && dataSplitSP[2].includes('%')) {

        var percent = parseFloat(dataSplitSP[2])
        //const dbEntry = dlsDB.get(db_doc_id)
        if (Math.floor(percent / 10.0) - Math.floor(dbEntry.v_percent / 10.0) > 0) console.log(' ' + percent + '%')

        if (oppo === 'video') {
          dbEntry.v_status = "downloading Video"
          dbEntry.v_percent = percent
          // dbEntry.v_pos = vpos
        } else if (oppo === 'audio') {
          dbEntry.a_status = "downloading Audio"
          dbEntry.a_percent = percent
          // dbEntry.a_pos = vpos
        } else { // merge
          dbEntry.m_status = "Merging Video & Audio"
          dbEntry.m_percent = percent
        }
      }
    } else {
      console.log(`data${data}`)
    }
  })


  subprocess.stdout.on('error', (data) => {
    console.log(`ERROR: ${data}`)
  });
  subprocess.stderr.on('data', (data) => {
    console.log(`ERROR: ${data}`)
  });
  subprocess.stderr.on('error', (data) => {
    console.log(`ERROR: ${data}`)
  });

  // 1 hour time-out
  setTimeout(subprocess.cancel, 3600000)
  subprocess.on('exit', (code) => {
    console.log(`yt-dlp exit code: ${code}`)
    if (code !== 0) {

      if (oppo === 'video') {
        console.log('\nVideo dl error.')
        dbEntry.v_status = "failed"
      } else if (oppo === 'audio') {
        console.log('\nAudio dl error.')
        dbEntry.a_status = "failed"
      } else { // merge
        console.log('\nMerge dl error.')
        dbEntry.m_status = "failed"
      }
      finishedCallBack(false)
    }

    if (oppo === 'video') {
      console.log('\nVideo Done')
      dbEntry.v_status = "complete"
    } else if (oppo === 'audio') {
      console.log('\nAudio Done')
      dbEntry.a_status = "complete"
    } else { // merge
      console.log('\nMerge Done')
      dbEntry.m_status = "complete"
      dbEntry.epoch.end = Date.now()
    }
    dbEntry.filename = dbEntry._filename
    inMemDB.saveDatabase() // Force a DB save

    finishedCallBack(true)
  })
};


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

function convertOutput(dbEntry) {
  console.log("convertOutput::");

  inMemDB.saveDatabase(); // Force a DB save

  ffpmeg_cm = "ffmpeg -i" + dbEntry._filename + "-c:v libx265 -preset medium -crf 28 -vf scale=-1:720 -vtag hvc1 -c:a aac -b:a 128k" + dbEntry._filename + ".720p.mov";

  exec("", (error, stdout, stderr) => {

  });
}


app.listen(PORT, HOST);
console.log(`Running on http://${HOST}:${PORT}`);




function exitHandler(options, err) {
  console.log("exitHandler:: options: ", options);

  inMemDB.saveDatabase(); // Force a DB save

  if (err) {
    console.log('Caught Exception:', err.stack)
    process.exit();
  }
  if (options.exit) {
    console.log("ytdl - Closing Down !");
  }
}
//do something when app is closing
process.on('exit', exitHandler.bind(null, {
  exit: true,
  source: 'exit'
}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {
  source: 'SIGINT'
}));
process.on('SIGTERM', exitHandler.bind(null, {
  exit: true,
  source: 'SIGTERM'
}));
//catches uncaught exceptions
process.on('uncaughtException', exitHandler.bind(null, {
  exit: true,
  source: 'uncaughtException'
}));
//generated on Windows when the console window is closed
process.on('SIGHUP', exitHandler.bind(null, {
  exit: true,
  source: 'SIGHUP'
}));
// delivered on Windows when <Ctrl>+<Break> is pressed
process.on('SIGBREAK', exitHandler.bind(null, {
  exit: true,
  source: 'SIGBREAK'
}));