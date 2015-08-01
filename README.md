Command line tool (nodejs) to fetch tweets given a preset query.

## Description

    # Fetch up to 1500 tweets for preset query
    $ ./run 15

Gathers tweets from the Twitter API for use in language processing. The query is hard coded in `gather.js`. On initial call, `run` loads the gather module and fetches tweets backwards in time until Twitter yields no more results (generally 7 to 10 days history). Subsequent calls will update the tweet pool with updates to the timeline.

Tweets are stored in json format files. Two sets are saved: `pool*` files that hold a subset of the tweet information (namely `id`, `text`, `created_at` and `entites` — hashtags and mentions) and `raw*` files with the full information returned by the API.

Note that the default query filters tweets with links or image out and limits response to tweets in French.

## Install

    $ git clone ...
    $ npm install # npm ~v0.12

You will also need connection credentials. These can be obtained by logging into a [Twitter apps account](https://apps.twitter.com/) and following the steps described [here](https://dev.twitter.com/oauth/overview/application-owner-access-tokens).

The credentials should be saved in a file named `local-data.js`. This is a node module which makes public a credentials object:

    var creds = {
        "consumer_key": "...",
        "consumer_secret": "...",
        "token": "...-...",
        "token_secret": "..."
    };

    exports.credentials = creds;

You should hence be able to run the gather script.
