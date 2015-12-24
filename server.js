// ClickPoint - A checkpoint server for URL redirects
//   Think bit.ly with full access to click data.
//   See README.md for details.

// NOTE: If deployed locally, this will detect that it's not
// configured by Cloud Foundry, and instead will use the default:
//     User: clickpoint Password: password 
//     Server IP: 127.0.0.1 Database: clickpoint
//   To set up your local database, these two SQL queries may help:
//     create user 'clickpoint'@'localhost' IDENTIFIED BY 'password';
//     grant all privileges on clickpoint.* to 'clickpoint'@'localhost';
// If you don't like this, please submit a PR.

var http = require('http') ;
var finalhandler = require('finalhandler') ;
var serveStatic = require('serve-static') ;
var strftime = require('strftime') ;
var time = require('time') ;
var url = require('url') ;
var util = require('util') ;
var mysql = require('mysql') ;

// Variables
var port = 8080 ;
var data = "" ;
var done = undefined ;
var db_uri = undefined ;
var vcap_services = undefined ;
var dbClient = undefined ;
var dbConnectState = Boolean(false) ;
var dbConnectTimer = undefined ;

// Setup based on Environment Variables
if (process.env.VCAP_SERVICES) {
    vcap_services = JSON.parse(process.env.VCAP_SERVICES) ;
    if (vcap_services['p-mysql']) {
        db_uri = vcap_services["p-mysql"][0]["credentials"]["uri"] ;
        console.log("Got access credentials to p-mysql: " + db_uri) ;
    } else if (vcap_services['cleardb']) {
        db_uri = vcap_services["cleardb"][0]["credentials"]["uri"] ;
        console.log("Got access credentials to ClearDB: " + db_uri) ;
    }
} else {
    db_uri = "mysql://clickpoint:password@127.0.0.1/clickpoint" ;
    console.log("Local mode set to true, configuring myself to use local MySQL.") ;
}

if (process.env.VCAP_APP_PORT) { port = process.env.VCAP_APP_PORT ; }

function setupSchema() {
    dbClient.query("show tables LIKE 'SampleData'", function(err, results, fields) {
        if (err) {
            console.error(err) ;
            process.exit(1) ;
        } else {
            if (0 == results.length) {
                console.log("Setting up schema.") ;
                dbClient.query("create table SampleData (K VARCHAR(20), V VARCHAR(20))",
                               function (err, results, fields) {})
            } else {
                console.log("SampleData table already exists.") ;
            }
        }
    }) ;
}
    
// Callback functions

function handleDBerror(err) {
    if (err) {
        console.warn("Issue with database, " + err.code + ". Attempting to reconnect every 1 second.")
        setTimeout(MySQLConnect, 1000) ;
    }
}

function handleDBConnect(err) {
    if (err) {
        dbConnectState = false ;
        console.error("ERROR: problem connecting to DB: " + err.code +
                      ", will try again every 1 second.") ;
        dbConnectTimer = setTimeout(MySQLConnect, 1000) ;
    } else {
        console.log("Connected to database.") ;
        dbClient.on('error', handleDBerror) ;
        dbConnectState = true ;
        if (dbConnectTimer) {
            clearTimeout(dbConnectTimer) ;
            dbConnectTimer = undefined ;
        }
        setupSchema() ;
    }
}

function handleDBping(request, response, err) {
    if (err) {
        console.log("MySQL Connection error: " + err) ;
        response.end("MySQL connection error: " + err) ;
        dbClient.destroy() ;
        MySQLConnect() ;
    } else {
        response.end("MySQL ping successful.") ;
    }
}

// Helper functions

function doPing(request, response) {
    dbClient.ping(function (err) {
        handleDBping(request, response, err) ;
    }) ;
}

function MySQLConnect() {
    dbClient = mysql.createConnection(db_uri)
    dbClient.connect(handleDBConnect) ;
}


function dbError(response, error) {
    console.error("ERROR getting values: " + error) ;
    response.end("ERROR getting values: " + error) ;
}
    
function errorDbNotReady(request, response) {
    console.error("ERROR: Database is Not Ready") ;
    errHTML = "<title>Error</title><H1>Error</H1>\n"
    errHTML += "<p>Database info is not set or DB is not ready<br>\n" ;
    errHTML += "<hr><A HREF=\"" + url.resolve(request.url, "/dbstatus") + "\">/dbstatus</A>\n" ;
    response.end(errHTML) ;
}


function dispatchApi(response, redirectKey, query) {
    console.log("Request key: " + redirectKey, " Query: " + JSON.stringify(query)) ;
    switch (redirectKey) {
    case "v25survey":
        response.writeHead(302, {'Location': "http://www.pivotal.io/"}) ;
        response.end() ;
        break ;
    default:
        console.log("Falling through to returning 404") ;
        response.writeHead(404) ;
        response.end("ERROR: Invalid redirect key") ;
    }
}

function requestHandler(request, response, done) {
    data = "" ;
    requestParts = url.parse(request.url, true) ;
    rootCall = requestParts["pathname"].split('/')[1] ;
    console.log("Recieved request for: " + rootCall) ;
    switch (rootCall) {
    case "env":
	      if (process.env) {
	          data += "<p>" ;
		        for (v in process.env) {
		            data += v + "=" + process.env[v] + "<br>\n" ;
		        }
		        data += "<br>\n" ;
	      } else {
		        data += "<p> No process env? <br>\n" ;
	      }
        response.end(data) ;
        break ;
    case "dbstatus":
        data += dbConnectState ;
        response.end(data) ;
        break ;
    case "ping":
        if (dbConnectState) {
            doPing(request, response) ;
        } else {
            data += "I'm sorry, Dave, I can't do that. No connection to database." ;
            response.end(data) ;
        }
        break ;
    case "info":
        // FIXME: This works when deployed to CF only, no local mode.
        data += request.headers["x-forwarded-for"].split(',')[0] ;
        response.end(data)
        break ;
    case "click":
        redirectKey = requestParts["pathname"].split('/')[2] ;
        dispatchApi(response, redirectKey, requestParts["query"]) ;
        break ;
    default:
        console.log("Unhandled request, falling through.") ;
        done() ;
    }
}

// MAIN

MySQLConnect() ;
    
var staticServer = serveStatic("static") ;
clickPointServer = http.createServer(function(req, res) {
    done = finalhandler(req, res) ;
    staticServer(req, res, function () {requestHandler(req, res, done)}) ;
}) ;

clickPointServer.listen(port) ;

console.log("Server up and listening on port: " + port) ;
