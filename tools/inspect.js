#!/bin/node

var chalk = require('chalk');
var pool = require('../harvest');
var db = require('../tweet-db');

var inspector = new pool.Pool();
var inspects = [];

db.getWorkingSet().then(function (q) {
    // Run all inspections
    var tweets = q.splice((Math.ceil(Math.random() * q.length)), 10);
    tweets.forEach(function (t) {
        inspects.push(inspector.inspect(t.tweet_text));
    });
    return tweets;
}).catch(function (error) {
    console.log('Failed:', error);
}).then(function (tweets) {
    // Output results
    Promise.all(inspects).then(function (guesses) {
        var in_len = tweets.length,
            out_len = guesses.length,
            i = 0, l = 0,
            show;

        if (in_len !== out_len) {
            console.log('Warning: tweet and probability counts do not match')
        }

        l = Math.max(in_len, out_len);

        for (; i < l; i++) {
            show = (guesses[i].label === '+') ? chalk.white.bgBlue : chalk.black.bgWhite;
            console.log(show(tweets[i].tweet_text));
            // console.log('Certainty:', (100 - (guesses[i].vs * 100) / guesses[i].likeliness), '%');
            // console.log(guesses[i].likeliness, 'vs', guesses[i].vs);
            console.log('');
        }
    }, function (error) {
        console.log(error);
    });
});
