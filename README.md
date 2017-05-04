# ClickPoint - a checkpoint for clicks.

We need feedback from users, but that's very hard to get. Many users are too lazy or passive to bother filling out a survey. In fact, many are reticent to do so for a variety of reasons, including fear of 'going on the record.'

One solution is to implement the lower-bound of data gathering: by supplying a simple choice of images ([:thumbsup:](http://clickpoint.cfapps.io/click/clickpoint-readme?thumbsup) / [:thumbsdown:](http://clickpoint.cfapps.io/click/clickpoint-readme?thumbsdown), we can anonymously collect data from users by simply having them click an image.

Clickpoint, then, is a small webservice designed to accept connections from arbitrary sources, record as much as possible, and forward them on to an ultimate destination.

By using the simple URLs provided by clickpoint, you can embed 'voting' in web pages, e-mail, QR codes, etc.

Clickpoint's support of arbitrary tags emable it to be used for other use-cases as well, such as version tracking of downloads, etc. This quickly eats into [Bitly](http://bit.ly/) functionality. If you are finding yourselve limited by what Clickpoint can do, you should probably be looking at switching to or additionally leveraging Bitly.

## Initial use case
   Collect immediate feedback by embedding two separate options (:thumbsup: / :thumbsdown:) in an e-mail, both leading to a "further feedback" survey.

### Options considered, but discarded
   1. SurveyMonkey: Excellent survey service only collects data on submit, not open
      - I am mostly using SurveyMonkey as a destination URL for redirect targets.
   1. bit.ly: Seemingly would be a perfect fit, but doesn't supply raw data (for free)?

## Usage

   This is distributed as a Cloud Foundry app, and depends on a MySQL-compatible (p-mysql, cleardb) service instance.

### Example
   1. cf create-service p-mysql 100mb clickpointDB
   1. cf push --no-start
   1. cf bind-service clickpoint clickpointDB
   1. cf restart

#### To create a campaign
   1. Visit clickpoint.APP-DOMAIN/new-redirect.html
      Note: there is zero security on this endpoint
   1. You can now create URLs of the form: `clickpoint.APP-DOMAIN/click/name?tag`
      - You can specify anything you like as the tag. I use two different styles:
         1. Sentiment analysis: I give anonymous users three choices: up/down/meh
         1. Response tracking: I generate a unique URL+tag combination for every e-mail address I intend to send to. In the results, I can join against the clicks table to find who has not clicked, who has, and for those that have, what their corresponding IP address is.

#### To view campaign results
   - There is no UI component to view results. Instead, I use [Sequel Pro](http://www.sequelpro.com/)
   - Open up an SSH tunnel via your clickpoint App, using these [instructions](https://docs.google.com/document/d/1iUXPM8ssQv3nDP9BXQs7oEymTL7HUqjgAC7Yw2W16jk).
   - Run Sequel Pro, select the 'clicks' table.
   - I use this SQL to view click responses:
      `select TS,IP,value from clicks where rID=4 and active=b'1' and IP != '209.234.137.222';`
   - I exclude the IP of my own office. I could issue a query to change any click with that IP to inactive (b'0') but I haven't bothered yet.

### Configuration

Since this is an inherently DB-backed service, each URL reflector configuration is stored in the database.

Initial configuration (ie, how to reach the Database) is provided by Cloud Foundry or environment variables.
