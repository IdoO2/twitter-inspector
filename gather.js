// Librairies
var OAuth = require('oauth'),
    chalk = require('chalk');

// App modules
var credentials = require('./local-data').credentials;

// Constants
var search_url = 'https://api.twitter.com/1.1/search/tweets.json?q=',
    search_string = '%23Regionales2015';

// Initialise authorised connection
var oauth = new OAuth.OAuth(
    'https://api.twitter.com/oauth/request_token',
    'https://api.twitter.com/oauth/access_token',
    credentials.consumer_key,
    credentials.consumer_secret,
    '1.0A',
    null,
    'HMAC-SHA1'
);

// Perform request
oauth.get(
    search_url + search_string,
    credentials.token,
    credentials.token_secret,
    function (error, data, response){
        if (error) {
            console.error(chalk.red.bgWhite(error));
        } else {
            console.log(chalk.inverse(require('util').inspect(data)));
        }
    }
);
