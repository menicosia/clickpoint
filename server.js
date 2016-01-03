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

// Schema definition
var schema = {
    redirects : "(id int AUTO_INCREMENT primary key, redirectKey VARCHAR(50), url VARCHAR(2048))",
    clicks : "(ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP, IP VARBINARY(16))"
} ;

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
    console.log("Local mode, configuring myself to use local MySQL.") ;
}

if (process.env.VCAP_APP_PORT) { port = process.env.VCAP_APP_PORT ; }

function createOnEmpty(err, results, fields, tableName, create_def) {
    if (err) {
        console.error(err) ;
        process.exit(1) ;
    } else {
        if (0 == results.length) {
            console.log("Creating table: " + tableName) ;
            dbClient.query(["create table ", tableName, create_def].join(" "),
                           function (err, results, fields) {
                               if (err) {
                                   console.log("create table error: "
                                               + JSON.stringify(err))}
                           } ) ;
        } else {
            console.log("  [schema] " + tableName + " table already exists.") ;
        }
    }
}

function setupSchema() {
    for (table in schema) {
        // Create a closure to handle re-using table for each in the array.
        (function (table) {
            dbClient.query("show tables LIKE '" + table + "'",
                           function (err, results, fields) {
                               createOnEmpty(err, results, fields,
                                             table, schema[table])
                           } ) ;
        })(table) ;
    }
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

function MySQLConnect() {
    dbClient = mysql.createConnection(db_uri, {debug: true}) ;
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

function handleKeySearch(response, redirectKey, clickArgs) {
    function cb(err, results, fields) {
        if (1 == results.length) {
            response.end("Thanks. Check the log.") ;
        } else {
            response.writeHead(404) ;
            console.log("SQL ERR: " + JSON.stringify(err)) ;
            response.end("Error: click redirect not found.") ;
        }
    } ;
    return(cb) ;
}

// clickArgs are simply the results of url.parse["query"]
function dispatchApi(response, redirectKey, clickArgs) {
    var sql ;
    console.log("Request key: " + JSON.stringify(redirectKey),
                " Query: " + JSON.stringify(clickArgs)) ;

    // Do a lookup in MySQL for the redirect key
    // Create a record for that redirect key with the IP address and the clickArgs
    // Redirect the user to where they're headed

    // Look up the redirect Key
    sql = "select id,url from redirects WHERE redirectKey = '" + redirectKey + "'" ;
    console.info("SQL: " + sql) ;
    
    dbClient.query(sql,
                   handleKeySearch(response, redirectKey, clickArgs)) ;
    
    // switch (redirectKey) {
    // case "v25survey":
    //     data += request.headers["x-forwarded-for"].split(',')[0] ;
    //     response.writeHead(302, {'Location': "http://www.pivotal.io/"}) ;
    //     response.end() ;
    //     break ;
    // default:
    //     console.log("Falling through to returning 404") ;
    //     response.writeHead(404) ;
    //     response.end("ERROR: Invalid redirect key") ;
    // }
}

function requestHandler(request, response, done) {
    data = "" ;
    requestParts = url.parse(request.url, true) ;
    requestPath = requestParts["pathname"].split('/') ;
    rootCall = requestParts["pathname"].split('/')[1] ;
    console.log("Recieved request for: " + rootCall) ;
    switch (rootCall) {
    case "info":
        if (request.headers["x-forwarded-for"]) {
            data += request.headers["x-forwarded-for"].split(',')[0] ;
        } else {
            // FIXME: This works when deployed to CF only, no local mode.
            data += "127.0.0.1" ;
        }
        response.end(data) ;
        break ;
    case "click":
        if (3 === requestPath.length) {
            redirectKey = requestParts["pathname"].split('/')[2] ;
            dispatchApi(response, redirectKey, requestParts["query"]) ;
        } else {
            console.warn("Invalid redirect request: " + request.url) ;
            response.writeHead(404) ;
            response.end("The link you clicked on was not properly formed, sorry!") ;
        }
        break ;
    default:
        console.log("Unhandled request: " + request.url + ", falling through.") ;
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
