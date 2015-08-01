// Librairies
var OAuth = require('oauth'),
    chalk = require('chalk'),
    fs = require('fs'),
    inspect = require('util').inspect;

// File count, i.e. where to start writing on nth call
var start_point = (function () {
    var pool_regex = /^pool/;
    return fs.readdirSync('.').reduce(function (counter, filename) {
        return pool_regex.test(filename) + counter;
    }, 1);
}());

// App modules
var credentials = require('./local-data').credentials;

// Work vars & constants
var base_url = 'https://api.twitter.com/1.1/search/tweets.json',
    initial_query = [
        '?q=',
        encodeURIComponent('#regionales2015 -filter:images -filter:links -filter:retweets'),
        '&result_type=recent',
        '&lang=fr',
        '&count=100'
    ].join(''),
    next_poll_start_file = 'next_set.txt',
    pool_file = function (f_nb) {
        return 'pool' + f_nb + '.json';
    },
    raw_file = function (f_nb) {
        return 'raw' + f_nb + '.json';
    },
    pool_nb = function (counter) {
        return ("0000" + (max - counter + start_point)).slice(-5)
    },
    // Desired run count
    max = 0;

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

/**
 * Retrieve tweets from the API and write them to file
 * Calls itself for a set run count
 * @param int run Number of runs left
 * @param str next_query Twitter-returned query to get previous tweets
 */
function getTweets(run, query) {
    var refresh_url = '';
    query = (query) ? query : initial_query;

    // On first run, set max requests
    if (max < 1) {
        max = run;
    }

    oauth.get(
        base_url + query,
        credentials.token,
        credentials.token_secret,
        function responseCallback(error, data, response) {
            var file_nb = pool_nb(run);
            if (error) {
                console.error(file_nb + ': ' + chalk.red.bgWhite(inspect(error)) + inspect(response));
            } else {
                // Store raw response
                writeTweets(data, raw_file(file_nb));
                data = JSON.parse(data);

                // Get next query (antechronological)
                query = data.search_metadata.next_results;

                // Get refresh URL if first request
                if (run === max) {
                    refresh_url = data.search_metadata.refresh_url;
                    fs.writeFile(next_poll_start_file, refresh_url, function (error) {
                        if (error) {
                            console.warn(chalk.black.bgYellow('Could not stor refresh URL ' + refresh_url));
                        } else {
                            console.log(chalk.green('Refresh URL ' + refresh_url + ' stored'));
                        }
                    });
                }

                data = filterData(data);

                // Store relevant data
                writeTweets(
                    JSON.stringify(data, null, 4),
                    pool_file(file_nb)
                );

                if (query === undefined) {
                    console.info(chalk.blue('Reached end of available tweets'));
                } else if (run === 1) {
                    console.info(chalk.blue('Reached end of requested runs'));
                } else {
                    getTweets(--run, query);
                }
            }
        }
    );
}

/**
 * Return only relevant info from tweet data
 * @param JSON data
 * @return JSON
 */
function filterData(data) {
    var tweets = [],
        tlen = 0,
        i = 0;
    tlen = data.statuses.length;

    for (; i < tlen; i++) {
        tweets.push({
            "id": data.statuses[i].id_str,
            "created_at": data.statuses[i].created_at,
            "text": data.statuses[i].text,
            "entities": data.statuses[i].entities
        });
    }

    return tweets;
}

/**
 * Write tweets to pool file
 * @param str tweets
 * @param str filename
 */
function writeTweets(tweets, filename) {
    fs.writeFile(filename, tweets, function (error) {
        if (error) {
            console.error(chalk.red.bgWhite('Could not write `' + filename + '`: ' + inspect(error)));
        } else {
            console.log(chalk.green('`' + filename + '` written'));
        }
    });
}

// Run
module.exports = getTweets;
