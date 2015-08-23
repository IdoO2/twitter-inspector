// Module to interact with a pool in databsae

var readFile = require('fs').readFile;
var readdirSync = require('fs').readdirSync;
var sqlt = require('sqlite3');

var Counts = require('./counts');
var CountsTrigram = require('./counts-trigram');

var db = {
    // Connection, table names dict
    con: (new sqlt.Database('pool.sqlite')),
    tbls: {
        training: 'training_set',
        working: 'working_set'
    }
};

function saveAll() {
    /* <thenable> Get tweets from all pool files and save to databases
     * Assigns 33% to training set
     * */
    var working_set_length = 0;
    var training_set_length = 0;
    var files_read = [];

    // Get all pool files
    getFiles().forEach(function (filename) {
        // Read each into a promise
        files_read.push(new Promise(function (resolve, reject) {
            readFile(filename, {encoding: 'UTF-8'}, function (error, content) {
                if (error) {
                    console.log(filename + ' couldn’t be read:', error);
                    reject(0);
                }

                var saved = [];
                var tweets = JSON.parse(content);

                tweets.forEach(function (tweet, idx) {
                    // Push each db insert into a promise
                    if (!(idx % 3)) {
                        training_set_length += 1;
                        saved.push(saveTweet(db.tbls.training, [tweet.id, tweet.text]));
                    } else {
                        working_set_length += 1;
                        saved.push(saveTweet(db.tbls.working, [tweet.id, tweet.text]));
                    }
                });

                // Resolve file read when all inserted
                Promise.all(saved).then(function () {
                    cleanDb().then(function () {
                        resolve();
                    }, function () {
                        console.log('Unable to clean database')
                        resolve();
                    });
                }).catch(function (error) {
                    console.log('Error while saving tweets from ' + filename, error);
                });
            });
        }));
    });

    // With all done commit to db
    return Promise.all(files_read).then(function () {
        stmt.finalize();
    }).catch(function (error) {
        console.log('Error reading files');
    });
}

function cleanDb() {
    sql_drop = 'DELETE FROM working_set WHERE tweet_id in (SELECT tweet_id FROM working_set WHERE EXISTS (SELECT 1 FROM training_set WHERE working_set.tweet_id = training_set.tweet_id));';

    return new Promise(function (resolve, reject) {
        db.con.run(sql_drop, function (error) {
            if (error) {
                console.log('Couldn’t drop elements', error);
                reject();
            } else {
                resolve();
            }
        });
    });
}

function getFiles() {
    /* <[]> Return a list of all files holding pool tweets
     * */
    var pool_regex = /^pool\d+/;
    var filePool = [];

    readdirSync('.').forEach(function (filename) {
        if (pool_regex.test(filename)) {
            filePool = filePool.concat(filename);
        }
    });

    return filePool;
}

function createTable(table_name) {
    /* <thenable> Create table in database
     * */
    // Create a field polarity even if unused
    var sql_create = [
        "CREATE TABLE IF NOT EXISTS " + table_name,
        "(id INT PRIMARY KEY, tweet_id VARCHAR(255) UNIQUE, ",
        "tweet_text VARCHAR(255), polarity VARCHAR(1));"
    ].join('');

    return new Promise(function (resolve, reject) {
        db.con.run(sql_create, function (error) {
            if (error) {
                console.log('Table could not be created: ', error);
                reject();
            } else {
                resolve();
            }
        });
    });
}

function saveTweet(table, tweet) {
    /* <thenable> Saves a tweet to a table
     * @param string table Name of the table
     * @param [] tweet with ID, text
     * */
    return new Promise(function (resolve, reject) {
        var sql_insert = "INSERT INTO " + table + " (tweet_id, tweet_text) VALUES (?, ?)";

        createTable(table).then(function () {
            db.con.run(sql_insert, tweet, function (error) {
                if (error) {
                    console.log('Tweet could not be inserted', error);
                }
                // Do not propagate error
                resolve();
            });
        }).catch(function (error) {
            console.log('Tweet could not be inserted', error);
        });
    });
}

function getSet(set, polarity) {
    /* <thenable> Return all tweets from working set [text, polarity]
     * */
    var query = "SELECT tweet_id, tweet_text, polarity FROM " + db.tbls[set];

    if (polarity === '') {
        query += (polarity === '') ? " WHERE polarity IS NULL" : "";
    } else if (polarity) {
        query += " WHERE polarity = '" + polarity + "'";
    }

    return new Promise(function (resolve, reject) {
        createTable(db.tbls[set]).then(function (error) {
            if (error) {
                console.log('Could not provide training set:', error);
                reject();
            }
            db.con.all(query, function (error, data) {
                if (error) {
                    console.log('Could not provide training set:', error);
                    reject();
                } else {
                    resolve(data);
                }
            });
        }).catch(function (error) {
            console.log('Could not provide training set:', error);
        });
    });
}

function update(tweet_id, polarity) {
    /* <thenable> Update tweet in training table
     * @param str tweet_id
     * @param str polarity in (+, -)
     * */
    var query = "UPDATE " + db.tbls.training + " SET polarity = ? WHERE tweet_id = ?;";

    return new Promise(function (resolve, reject) {
        createTable('training').then(function () {
            db.con.run(query, [polarity, tweet_id], function (error) {
                if (error) {
                    console.log('(1) Unable to update tweet', error);
                    reject();
                } else {
                    resolve();
                }
            });
        }).catch(function (error) {
            console.log('(2) Unable to update tweet', error);
            reject();
        });
    });
}

module.exports = {
    saveAll: saveAll,
    Counts: function (polarity, word) {
        return new Counts(db.con, db.tbls.training, polarity, word);
    },
    CountsTrigram: function (polarity, trigram) {
        return new CountsTrigram(db.con, db.tbls.training, polarity, trigram);
    },
    getUntrained: function () {
        return getSet('training', '');
    },
    getTrainingSet: function (polarity) {
        return getSet('training', polarity);
    },
    getWorkingSet: function () {
        return getSet('working');
    },
    update: update
};
