# ClickPoint - a checkpoint for clicks.

A small webservice designed to accept connections fom arbitrary sources, record as much as possible, and forward them on to their ultimate destination.

## Initial use case
   Collect immediate feedback by embedding two separate options (thumbs up / thumbs down) in an e-mail, both leading to a "further feedback" survey.

### Options considered, but discarded:
    - SurveyMonkey: Excellent survey service only collects data on submit, not open
    - bit.ly: Seemingly would be a perfect fit, but doesn't supply raw data (for free)?
        
## Usage

   This is distributed as a Cloud Foundry app, and depends on a MySQL-compatible (p-mysql, cleardb) service instance.

   Example:
     - cf create-service p-mysql 100mb clickpointDB
     - cf push

### Configuration

Since this is an inherently DB-backed service, each URL reflector configuration is stored in the database.

Initial configuration (ie, how to reach the Database) is provided by Cloud Foundry or environment variables.

