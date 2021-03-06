/**
 * Main module for data analysis
 * Orchestrates other module functionality
 * Public object is Pool
 * - Train tweets
 * - Inspect unknown tweets
 */

var chalk = require('chalk');
var pool_db = require('./tweet-db');
var prompt = require('prompt');

if (!Array.prototype.shuffle) {
    Array.prototype.shuffle = function () {
        var len = this.length;
        var rnd_idx = 0;
        var tmp = '';

        while (len) {
            rnd_idx = Math.floor(Math.random() * len);
            len--;
            tmp = this[len];
            this[len] = this[rnd_idx];
            this[rnd_idx] = tmp;
        }

        return this;
    }
}

function tokenise(tweet) {
    /* Split a tweet into tokens
     * @return array
     * */
    return tweet.toLowerCase().match(/[:;.,?!\s]+|[^;:.,?!\s]+/g).map(function (tok) {
        return tok.replace(/[\s+#@]/, '');
    }).filter(Boolean);
}

function tokenise_trigrams(tweet) {
    /**
     * Split tweet into tokens: each token is a trigram where the central part is not taken into account
     * @param string tweet
     * @return [[], [], ..., []]
     */
    var units = tokenise(tweet).filter(cleanTweetElements),
        tgs = [],
        ulen = units.length,
        i = 0;

    for (; i < ulen - 1; i++) {
        if (i === ulen -2) {
            tgs.push([units[i], '[^ ]+', 1])
        } else if (i === 0) {
            tgs.push([0, '[^ ]+', units[1]])
            tgs.push([units[0], '[^ ]+', units[2]])
        } else {
            tgs.push([units[i], '[^ ]+', units[i + 2]])
        }
    }

    return tgs;
}

function train(pool) {
    /* Ask user to train set
     * @param array pool List of tweets
     * */
    var schema = {
        properties: {
            polarity: {
                pattern: /^[-+]$/,
                message: 'Reply by “-” or “+”',
                required: true
            }
        }
    };
    var done = null;
    var p = new Promise(function (resolve, reject) {
        done = resolve;
    });

    prompt.start();
    trainNext(pool);

    return p;

    function trainNext(tweets) {
        // Show a tweet, ask for a polarity, update db
        // Recursive; resolves
        var cur = tweets.pop();

        console.log('\n', chalk.black.bgWhite(cur.tweet_text));
        prompt.get(schema, function (error, reply) {
            if (!error) {
                reply = reply.polarity;
                pool_db.update(cur.tweet_id, reply);
            }

            return (tweets.length) ? trainNext(tweets) : done();
        });
    }
}

function isAcceptable(tweet) {
    /* Indicates if tweet should be taken into account
     * to filter out tweets that have mostly irrelevant content
     * */
    var mention = /@[^\s]+/g;
    var hashtag = /#[^\s]+/g;
    var tweet_length = tweet.length;
    var half_tweet = tweet_length / 2;
    var most_tweet = Math.ceil((tweet_length * 3) / 5);
    var mentions = tweet.match(mention);
    var hashtags = tweet.match(hashtag);

    // 5 or more mentions or mentions take over 50% of tweet length
    if (mentions && (mentions.length > 4 || mentions.join(' ').length > half_tweet)) {
        return false;
    }

    // 8 or more hashtags or hashtags take over 50% of tweet length
    if (hashtags && (hashtags.length > 7 || hashtags.join(' ').length > half_tweet)) {
        return false;
    }

    if (mentions && hashtags && mentions.concat(hashtags).join('').length > most_tweet) {
        return false;
    }

    return true;
}

function cleanTweetText(tweet) {
    return tweet
        .replace(/\\n/, ' ')
        .replace(/'/, '’')
        .toLowerCase();
}

function cleanTweetElements(current, index, array) {
    var seeked_hashtag = /r.gionales2015/gi;
    var mention = /@[^ ]+/g;
    if (current.match(seeked_hashtag)) {
        return false;
    }
    return true;
}

function Pool() {
    this.usage = function () {
        console.log('Usage:');
        console.log('var pool = new Pool()');
        console.log('pool.train(2)');
        console.log('\t.then(function (trained) {');
        console.log('\t\tpool.learn(trained)');
        console.log('\t\tpool.discriminate()');
        console.log('\t});');
    };

    this.train = function (proportion) {
        /* Let user train data
         * @param float (0 < proportion  < 1)
         * @depends `train`
         */
        pool_db.getUntrained().then(function (tweets) {
            var tlen = tweets.length;
            if (!tlen) {
                console.log('All tweets have been trained!');
                return;
            }

            proportion = Math.max((Math.round(tlen * proportion)), 10);
            tweets = proportion && tweets.splice(0, proportion) || tweets;

            train(tweets).then(function (cnt) {
                console.log('Tweets updated');
            }).catch(function (error) {
                console.log('Unable to update tweets', error);
            });
        }).catch(function (error) {
            console.log('Unable to retrieve untrained tweets:', error);
        });
    };

    this.inspect = function (tweet_text) {
        /* Determine tweet’s polarity
         * */
        // Public interface
        var resolve_all, reject_all, public_thenable = new Promise(function (resolve, reject) {
            resolve_all = resolve;
            reject_all = reject;
        });

        var best_match = {
            // Will hold the most probable polarity: label, likeliness, inverse likeliness
            label: '',
            likeliness: 0,
            vs: 0
        };

        if (!isAcceptable(tweet_text)) {
            console.log('Tweet irrelevant')
            reject_all();
        }

        tweet_text = cleanTweetText(tweet_text);
        var wordList = tokenise(tweet_text);
        wordList = wordList.filter(cleanTweetElements);

        var pol_checks_done = [];
        ['+', '-'].forEach(function (pol) {
            // Determine probability that tweet is from either polarity,
            // based on probability of individual words
            var word_checks_done = [];
            pol_checks_done.push(
                new Promise(function (resolve_pol, reject_pol) {
                    wordList.forEach(function (word) {
                        word_checks_done.push(checkWord(word, pol));
                    });

                    Promise.all(word_checks_done).then(function (word_checks) {
                        var relevant_words_count = 0;
                        var probability_sum = word_checks.reduce(function (accumulator, cur_prob) {
                            // Ignoring words with no occurrence overall increases similarity with a bias:
                            // similarity is increased more in the case of neutral tweet recognition. Whether
                            // it is due to the dominance of neutral tweets or endemic isn’t sure. Choice is
                            // made here to favour stronger discrimination.
                            if (cur_prob > 0) {
                                relevant_words_count += 1;
                            }
                            return accumulator + cur_prob;
                        }, 0);
                        var prob = probability_sum / relevant_words_count;
                        resolve_pol(prob);
                    }).catch(function (error) {
                        console.log(error);
                    });
                })
            );
        });

        return Promise.all(pol_checks_done).then(function (pol_probs) {
            var sorted_scores;
            // 0: '+', 1: '-'
            if (pol_probs[0] === pol_probs[1]) {
                console.log('Unable to decide');
            }
            best_match.label = (pol_probs[0] > pol_probs[1]) ? '+' : '-';
            sorted_scores = pol_probs.sort();
            best_match.likeliness = sorted_scores[1];
            best_match.vs = sorted_scores[0];
            return best_match;
        }).catch(function (error) {
            console.log(error);
        });

        function checkWord(word, pol) {
            /* <thenable> Determine wordicity of word for polarity
             * @param pol A polarity (+/-)
             * @return float
             * */

            // Word statistics
            return (pool_db.Counts(pol, word)).then(
                function (data) {
                    if (data === null) {
                        return 0;
                    }
                    // Bayes’s theorem according to Wikipedia (`p_` = 'probability of')
                    var p_pol = (data.pol_docs / data.all_docs);
                    var p_word_given_pol = (data.pol_docs_w_word / (data.pol_docs || 1));
                    var p_word = (data.all_docs_w_word / data.all_docs);

                    // Probability of word indicating polarity
                    var probability = (p_pol * p_word_given_pol) / (p_word || 1);
                    return probability;
                },
                function (error) {
                    console.log(chalk.red('error:'), error);
                    return null;
                }
            );
        }
    };

    this.inspect_trigrams = function (tweet_text) {
        /* Determine tweet’s polarity
         * */
        // Public interface
        var resolve_all, reject_all, public_thenable = new Promise(function (resolve, reject) {
            resolve_all = resolve;
            reject_all = reject;
        });

        var best_match = {
            // Will hold the most probable polarity: label, likeliness, inverse likeliness
            label: '',
            likeliness: 0,
            vs: 0
        };

        if (!isAcceptable(tweet_text)) {
            reject_all();
        }

        tweet_text = cleanTweetText(tweet_text);
        var wordList = tokenise_trigrams(tweet_text);

        var pol_checks_done = [];
        ['+', '-'].forEach(function (pol) {
            // Determine probability that tweet is from either polarity,
            // based on probability of individual words
            var word_checks_done = [];
            pol_checks_done.push(
                new Promise(function (resolve_pol, reject_pol) {
                    wordList.forEach(function (trigram) {
                        word_checks_done.push(checkWord(trigram, pol));
                    });

                    Promise.all(word_checks_done).then(function (word_checks) {
                        var relevant_words_count = 0;
                        var probability_sum = word_checks.reduce(function (accumulator, cur_prob) {
                            // Ignoring words with no occurrence overall increases similarity with a bias:
                            // similarity is increased more in the case of neutral tweet recognition. Whether
                            // it is due to the dominance of neutral tweets or endemic isn’t sure. Choice is
                            // made here to favour stronger discrimination.
                            if (cur_prob > 0) {
                                relevant_words_count += 1;
                            }
                            return accumulator + cur_prob;
                        }, 0);
                        var prob = probability_sum / (relevant_words_count || 1);
                        resolve_pol(prob);
                    }).catch(function (error) {
                        console.log(error);
                    });
                })
            );
        });

        return Promise.all(pol_checks_done).then(function (pol_probs) {
            var sorted_scores;
            // 0: '+', 1: '-'
            if (pol_probs[0] === pol_probs[1]) {
                console.log('Unable to decide');
            }
            best_match.label = (pol_probs[0] > pol_probs[1]) ? '+' : '-';
            sorted_scores = pol_probs.sort();
            best_match.likeliness = sorted_scores[1];
            best_match.vs = sorted_scores[0];
            return best_match;
        }).catch(function (error) {
            console.log(error);
        });

        function checkWord(trigram, pol) {
            /* <thenable> Determine wordicity of word for polarity
             * @param pol A polarity (+/-)
             * @return float
             * */

            // Word statistics
            return (pool_db.CountsTrigram(pol, trigram)).then(
                function (data) {
                    if (data === null) {
                        return 0;
                    }
                    console.log(data)
                    // Bayes’s theorem according to Wikipedia (`p_` = 'probability of')
                    var p_pol = (data.pol_docs / data.all_docs);
                    var p_word_given_pol = (data.pol_docs_w_word / (data.pol_docs || 1));
                    var p_word = (data.all_docs_w_word / data.all_docs);

                    // Probability of word indicating polarity
                    var probability = (p_pol * p_word_given_pol) / (p_word || 1);
                    return probability;
                },
                function (error) {
                    console.log(chalk.red('error:'), error);
                    return null;
                }
            );
        }
    };
}

exports.Pool = Pool
