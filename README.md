# ClickPoint - a checkpoint for clicks.

We need feedback from users, but that's very hard to get. Many users are too lazy or passive to bother filling out a survey. In fact, many are reticent to do so for a variety of reasons, including fear of 'going on the record.'

Unlike web-based surveys, Clickpoint implements the lower-bound of data gathering: by supplying a simple choice of images ([:thumbsup:](http://clickpoint.cfapps.io/click/clickpoint-readme?thumbsup) / [:thumbsdown:](http://clickpoint.cfapps.io/click/clickpoint-readme?thumbsdown)), users can easily and anonymously give feedback directly from their browser, email client, or messaging app. They just click an image. Even if they immediately close the subsequent browser window, they've contributed.

Clickpoint, then, is a small webservice designed to accept connections from arbitrary sources, record as much as possible, and forward them on to an ultimate destination.

By using the simple URLs provided by clickpoint, you can embed 'voting' in web pages, e-mail, QR codes, etc.


## Initial use case
   Collect immediate feedback by embedding two separate options (:thumbsup: / :thumbsdown:) in an e-mail, both leading to a "further feedback" survey.

### Options considered, but discarded
   1. SurveyMonkey: Excellent survey service only collects data on submit, not open
      - I am mostly using SurveyMonkey as a destination URL for redirect targets.
   1. bit.ly: Seemingly would be a perfect fit, but doesn't supply raw data (for free)?
   
      [Bitly](http://bit.ly/) isn't focused on recording specific IP addresses. The goal of Clickpoint is, "One IP, one vote" regardless of how many duplicates are recorded. Bitly is more about understanding your mass audience demographics.

      Finally, Clickpoint's support of arbitrary tags enables it to be used for other use cases as well, such as version tracking of downloads, etc. Creating arbitrary links for Clickpoint aggregates them all under one "redirect" campaign, making the data easier to analyze than distinct Bitly links.

## Usage

   This is distributed as a Cloud Foundry app, and depends on a MySQL-compatible (p-mysql, cleardb) service instance.

   If you don't have access to a Cloud Foundry, you can use [PCF Dev](https://pivotal.io/pcf-dev) on your workstation or hosted Cloud Foundry via [Pivotal Web Services](http://run.pivotal.io/).

### Example

If you use the included [manifest.yml](manifest.yml), pushing the app is as simple as:

   1. cf create-service p-mysql 100mb clickpointDB
   1. cf push

#### To create a campaign
   1. Visit clickpoint.APP-DOMAIN/new-redirect.html
      Note: there is zero security on this endpoint
   1. You can now create URLs of the form: `clickpoint.APP-DOMAIN/click/name?tag`
      - You can specify anything you like as the tag. I use two different styles:
         1. Sentiment analysis: I give anonymous users three choices: up/down/meh
         1. Response tracking: I generate a unique URL+tag combination for every e-mail address I intend to send to. In the results, I can join against the clicks table to find who has not clicked, who has, and for those that have, what their corresponding IP address is.

#### To view campaign results
   - There is no UI component to view results. Instead, I use [Sequel Pro](http://www.sequelpro.com/).
   - Open up an SSH tunnel via your clickpoint App, using these [instructions](https://docs.cloudfoundry.org/devguide/deploy-apps/ssh-services.html).
   - Run Sequel Pro, select the 'clicks' table.
   - I use this SQL to view click responses:
      `select TS,IP,value from clicks where rID=4 and active=b'1' and IP != '192.0.12.222';`
   - I exclude the IP of my own office. I could issue a query to change any click with that IP to inactive (b'0') but I haven't bothered yet.

### Configuration

Since this is an inherently DB-backed service, each URL reflector configuration is stored in the database.

Initial configuration (ie, how to reach the Database) is provided by Cloud Foundry or environment variables.
