#!/bin/node

var chalk = require('chalk');
var pool = require('../harvest');
var db = require('../tweet-db');

var inspector = new pool.Pool();
var inspects = [];

db.getWorkingSet().then(function (q) {
    // Run all inspections
    q.forEach(function (t) {
        inspects.push(inspector.inspect_trigrams(t.tweet_text));
    });
    return q;
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

        var k = 0
        for (; i < l; i++) {
            if (guesses[i].label === '+') {
                k++;
                show = chalk.white.bgBlue;
                console.log(show(tweets[i].tweet_text));
                console.log(guesses[i].likeliness, 'vs', guesses[i].vs);
            }
            console.log('total: ' + l, 'ironic: ' + k)
        }
    }, function (error) {
        console.log(error);
    });
});
