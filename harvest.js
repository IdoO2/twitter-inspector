var fs = require('fs');
var chalk = require('chalk');
var sqlt = require('sqlite3');
var Counts = require('./counts');

if (!Array.prototype.shuffle) {
    Array.prototype.shuffle = function () {
        var len = this.length;
        var rnd_idx = 0;
        var tmp = '';

        while (len) {
            rnd_idx = Math.floor(Math.random() * len);
            len--;
            // [this[len], this[rnd_idx]] = [this[rnd_idx], this[len]];
            tmp = this[len];
            this[len] = this[rnd_idx];
            this[rnd_idx] = tmp;
        }

        return this;
    }
}

function pipeAll() {
    /* Pipe out all tweets in pool, read from files
     * For now, synchronous version
     * @return array
     * */
    var pool_regex = /^pool/;
    var dataPool = [];

    fs.readdirSync('.').forEach(function (filename) {
        if (pool_regex.test(filename)) {
            dataPool = dataPool.concat(JSON.parse(fs.readFileSync(filename, {encoding: 'utf-8'})));
        }
    });

    return dataPool;

    /*
        return Promise.all([

        ]);

        (new Promise(function (resolve, reject) {
            fs.readdir('.', function (err, fileList) {
                if (err) {
                    reject(err);
                } else {
                    fileList.forEach(function (filename) {
                        if (pool_regex.test(filename)) {

                        }
                    });
                }
            });
        }));

        return new Promise(function (resolve, reject) {
            fs.readdir('.', function (err, fileList) {
                if (err) {
                    reject(err);
                } else {
                    fileList.forEach(function (filename) {
                        if (pool_regex.test(filename)) {
                            fs.readFile(filename, {encoding: 'utf-8'}, function (err, contents) {
                                dataPool.push(JSON.parse(contents));
                            });
                        }
                    });
                }
            });
        }
    */
}

function pipeTweets() {
    /* Return a list of all tweet texts in pool
     * For now, synchronous version
     * @return array
     * */
    var pool_regex = /^pool/;
    var dataPool = [];

    fs.readdirSync('.').forEach(function (filename) {
        var full_data;
        var dlen = 0;
        var i = 0;
        if (pool_regex.test(filename)) {
            full_data = JSON.parse(fs.readFileSync(filename, {encoding: 'utf-8'}));
            dlen = full_data.length;
            for (; i < dlen; i++) {
                dataPool.push(full_data[i].text);
            }
        }
    });

    return dataPool.shuffle();
}

function tokenise(tweet) {
    /* Split a tweet into tokens
     * @return array
     * */
    var separators = /[\s:!?.;,)(/']/g;
    return tweet.toLowerCase().replace(separators, ' ').split(/\s+/);
}

function trainingSet(pool, proportion) {
    /* Given a list of tweets, returns an object with a working set and a training set
     * @param array pool List of tweet texts
     * @param int proportion base ten proportion of tweets to assign to training set
     * @return {}
     * */
    var len = pool.length;
    var start_idx = len * proportion / 10;
    var extract = pool.splice(start_idx, len);

    return {test_set: pool, learn_set: extract};
}

function train(pool) {
    /* Ask user to train set
     * @param array pool List of tweet texts
     * @return array of {}
     * */
    var trained_set = {'+': [], '-': []};
    var prompt = require('prompt');
    var more = 5;
    var done = null;
    var schema = {
        properties: {
            polarity: {
                pattern: /^[-+]$/,
                message: 'Reply by “-” or “+”',
                required: true
            }
        }
    };

    prompt.start();

    return new Promise(function (resolve, reject) {
        done = resolve;
        trainNext(pool);
    });

    function trainNext(tweets) {
        var pol = null;
        var cur = tweets.pop();
        console.log('\n', chalk.black.bgWhite(cur));
        prompt.get(schema, function (err, reply) {
            reply = reply.polarity;
            if (reply === '+' || reply === '-') {
                trained_set[reply].push(cur);
            }
            // (tweets.length)
            more--;
            return (more) ? trainNext(tweets) : done(trained_set);
        });
    }
}

function Pool() {
    // Train only once
    var trained = false;

    // Subset of tweets trained upon
    var training_set;

    // Subset of tweets to auto-categorise
    var working_set;

    // Number of trained tweets, per category (+, -, all)
    var trained_cnt = {};

    // Keep track of all words, per category (+, -); Drop this
    var words = { '-': [], '+': [] };

    // Keep track of counts
    var probabilities = {
        minusdoc: 0, plusdoc: 0, // Probability a document has to be of such category
        perword: { // Key: a word, Value: the word count in category
            '-': {}, '+': {}, 'all': {}
        }
    };

    // Start with a full set
    var working_set = pipeTweets();

    // Open or create database file
    var db = new sqlt.Database('trained.sqlite');

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
        /* Let user train data; set training/working set
         * @return Promise, see `train`
         */
        if (!trained) {
            var len = working_set.length;
            var subset = (len * proportion / 10);
            training_set = working_set.splice(subset, len);
            trained = true;
        }

        var train_data = train(training_set);
        train_data.then(saveTrained);

        return train_data;

        function saveTrained(data) {
            /* Saves newly trained data to the database
             * @param {} data
             * */
            var sql_create = [
                'CREATE TABLE IF NOT EXISTS TRAINED',
                '(id INT PRIMARY KEY, tweet_id VARCHAR(255), tweet_text VARCHAR(255), polarity VARCHAR(1));'
            ].join('');
            var sql_insert = 'INSERT INTO TRAINED (tweet_id, tweet_text, polarity) VALUES (?, ?, ?)';
            var sql_rows = [];

            return new Promise(function (resolve, reject) {
                db.run(sql_create, function () {
                    var stmt = db.prepare(sql_insert);

                    ['+', '-'].forEach(function (pol) {
                        data[pol].forEach(function (tweet) {
                            stmt.run('0', tweet, pol);
                        });
                    });

                    stmt.finalize();
                    db.close();
                    resolve('ok');
                });
            });
        };
    };

    this.learn = function (trained) {
        /* Set all necessary elements to discriminate a new set
         * */

        // Document facts
        trained_cnt['-'] = trained['-'].length;
        trained_cnt['+'] = trained['+'].length;
        trained_cnt.all = trained_cnt['+'] + trained_cnt['-'];
        probabilities.minusdoc = (trained_cnt['-'] / trained_cnt.all);
        probabilities.plusdoc = (trained_cnt['+'] / trained_cnt.all);

        // Account for all words, see probabilities.perword
        ['-', '+'].forEach(function (pol) {
            trained[pol].forEach(function (tweet) {
                tokenise(tweet).forEach(function (word, idx, arr) {
                    addWord(word, pol);
                });
            });
        });

        return probabilities.perword;

        function addWord(word, pol) {
            /* Add a word to relevant categories in probabilities.perword
             * @see SomeThing
             * */
            words[pol].push(word);
            if (probabilities.perword.all[word]) {
                probabilities.perword.all[word] += 1;
            } else {
                probabilities.perword.all[word] = 1
            }
            if (probabilities.perword[pol][word]) {
                probabilities.perword[pol][word] += 1;
            } else {
                probabilities.perword[pol][word] = 1
            }
        }
    };

    this.inspect = function (wordList) {
        /* Determine tweet’s polarity
         * */

        // Public interface
        var resolve_all, reject_all,
            public_thenable = new Promise(function (resolve, reject) {
                resolve_all = resolve;
                reject_all = reject;
            });

        var best_match = {
            // Will hold the most probable polarity
            label: '',
            likeliness: 0
        };

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

                    Promise.all(word_checks_done).then(
                        function (word_checks) {
                            var relevant_words_count = 0;
                            var log_sum = word_checks.reduce(function (accumulator, cur_prob) {
                                // Ignoring words with no occurrence overall increases similarity with a bias:
                                // similarity is increased more in the case of neutral tweet recognition. Whether
                                // it is due to the dominance of neutral tweets or endemic isn’t sure. Choice is
                                // made here to favour stronger discrimination.
                                if (cur_prob > 0) {
                                    relevant_words_count += 1;
                                }
                                return accumulator + cur_prob;
                            }, 0);
                            var prob = log_sum / relevant_words_count;
                            resolve_pol(prob);
                        },
                        function (error) {
                            console.log(chalk.red('error:'), error);
                        }
                    );
                })
            );
        });

        return Promise.all(pol_checks_done).then(
            function (pol_probs) {
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
            },
            function (error) {
                console.log(chalk.red('error:'), error);
            }
        );

        function checkWord(word, pol) {
            /* <thenable> Determine wordicity of word for polarity
             * @param pol A polarity (+/-)
             * @return float
             * */

            // Word statistics
            return (new Counts(db, pol, word)).then(
                function (data) {
                    if (data === null) {
                        return 0;
                    }
                    // Bayes’s theorem according to Wikipedia (`p_` = 'probability of')
                    var p_pol = (data.pol_docs / data.all_docs);
                    var p_word_given_pol = (data.pol_docs_w_word / (data.pol_docs || 1));
                    var p_word = (data.all_docs_w_word / data.all_docs);

                    // Probability of word indicating polarity
                    return (p_pol * p_word_given_pol) / (p_word || 1);
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
