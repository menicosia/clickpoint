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
        util.log("Got access credentials to p-mysql: " + db_uri) ;
    } else if (vcap_services['cleardb']) {
        db_uri = vcap_services["cleardb"][0]["credentials"]["uri"] ;
        util.log("Got access credentials to ClearDB: " + db_uri) ;
    }
} else {
    db_uri = "mysql://clickpoint:password@127.0.0.1/clickpoint" ;
    util.log("Local mode, configuring myself to use local MySQL.") ;
}

if (process.env.VCAP_APP_PORT) { port = process.env.VCAP_APP_PORT ; }

// DB-related

var schema = {
    redirects : "(id int AUTO_INCREMENT primary key, redirectKey VARCHAR(50) NOT NULL, url VARCHAR(2048) NOT NULL, active BIT(1) DEFAULT b'1')",
    clicks : "(ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP, IP VARBINARY(16), value VARCHAR(50), active BIT(1) DEFAULT b'1')"
} ;

function createOnEmpty(err, results, fields, tableName, create_def) {
    var sql ;
    if (err) {
        console.error(err) ;
        process.exit(1) ;
    } else {
        if (0 == results.length) {
            util.log("Creating table: " + tableName) ;
            sql = util.format("create table %s %s", tableName, create_def) ;
            console.log(sql) ;
            dbClient.query(sql,
                           function (err, results, fields) {
                               if (err) {
                                   util.log("create table error: "
                                               + JSON.stringify(err))}
                           } ) ;
        } else {
            util.log("  [schema] " + tableName + " table already exists.") ;
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

function handleDBerror(err) {
    if (err) {
        console.warn("Issue with database, " + err.code
                     + ". Attempting to reconnect every 1 second.")
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
        util.log("Connected to database.") ;
        dbClient.on('error', handleDBerror) ;
        dbConnectState = true ;
        if (dbConnectTimer) {
            clearTimeout(dbConnectTimer) ;
            dbConnectTimer = undefined ;
        }
        setupSchema() ;
    }
}

// Callback functions

function handleClickRecord(response, url) {
    function cb(err, results, fields) {
        if (err) {
            util.log("SQL ERR: " + JSON.stringify(err)) ;
            // Do not error; issue the redirect instead.
        }
        console.info(util.format("DB response: %s", JSON.stringify(results))) ;
        response.writeHead(302, {'Location': url}) ;
        response.end() ;
    }
    return(cb) ;
}

function handleKeySearch(response, redirectKey, requestIP, value) {
    function cb(err, results, fields) {
        var url ;
        if (err) {
            response.writeHead(500) ;
            util.log("SQL ERR: " + JSON.stringify(err)) ;
            response.end("Internal Server Error: click redirect not found.") ;
        } else if (1 <= results.length) {
            url = results[0]["url"] ;
            sql = util.format("insert into clicks VALUES (%s, '%s', '%s')",
                              "null", requestIP, value) ;
            console.info("SQL: " + sql) ;
            dbClient.query(sql,
                           handleClickRecord(response, url)) ;
        } else {
            util.log("Invalid redirectKey request: " + redirectKey) ;
            response.writeHead(404) ;
            response.end("The link you've clicked hasn't got an active"
                         + " redirect associated.") ;
        }
    } ;
    return(cb) ;
}

// clickArgs are simply the results of url.parse["query"]
function dispatchApi(response, redirectKey, requestIP, clickArgs) {
    var sql ;
    var args, value ;
    
    args = Object.keys(clickArgs) ;
    if (0 >= args.length) {
        console.warn("Invalid redirect arguments: "
                     + JSON.stringify(clickArgs)) ;
        response.writeHead(400) ;
        response.end("The link you clicked on was not properly formed.") ;
    }
    value = args[0] ;
    util.log(util.format("Request key: %s, with argument: %s",
                         redirectKey, value)) ;

    // Do a lookup in MySQL for the redirect key Create a record for
    // that redirect key with the IP address and the clickArgs
    // Redirect the user to where they're headed

    sql = util.format("select id,url from redirects WHERE redirectKey = '%s' AND active = b'1'", redirectKey) ;
    console.info("SQL: " + sql) ;
    
    dbClient.query(sql,
                   handleKeySearch(response, redirectKey, requestIP, value)) ;
    
}

function requestHandler(request, response, done) {
    var requestIP ;
    requestParts = url.parse(request.url, true) ;
    requestPath = requestParts["pathname"].split('/') ;
    rootCall = requestParts["pathname"].split('/')[1] ;
    util.log("Recieved request for: " + rootCall) ;
    if (request.headers["x-forwarded-for"]) {
        requestIP = request.headers["x-forwarded-for"].split(',')[0] ;
    } else {
        // FIXME: This works when deployed to CF only, no local mode.
        requestIP = "127.0.0.1" ;
    }
    switch (rootCall) {
    case "info":
        response.end("Your originating IP: " + requestIP) ;
        break ;
    case "click":
        if (3 === requestPath.length) {
            redirectKey = requestParts["pathname"].split('/')[2] ;
            dispatchApi(response, redirectKey,
                        requestIP, requestParts["query"]) ;
        } else {
            console.warn("Invalid redirect request: " + request.url) ;
            response.writeHead(400) ;
            response.end("The link you clicked on was not properly formed") ;
        }
        break ;
    default:
        util.log("Unhandled request: " + request.url + ", falling through.") ;
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

util.log("Server up and listening on port: " + port) ;
