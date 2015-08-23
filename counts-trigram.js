function Counts(db, tbl_name, polarity, word) {
    /* Handles relevant db querying for numbers relevant to probabilities
     */

    // Public thenable state handlers
    var resolve_all;
    var reject_all;

    var public_thenable = new Promise(function (res, rej) {
        // Pass promise state handlers to instance level
        resolve_all = res;
        reject_all = rej;
    });

    var like_query = '';
    var regexp = null;
    if (word[0] === 0) {
        // [0, null, '...'] -> tweet starts with '\w ...'
        regexp = ['^' + word[1], word[2]].join(' ');
        like_query = '% ' + word[2] + ' %';
    } else if (word[2] === 1) {
        // ['...', null, 1] -> tweet ends with '... \w'
        regexp = [word[0], word[1] + '$'].join(' ');
        like_query = '% ' + word[0] + ' %';
    } else {
        regexp = [word[0], word[1], word[2]].join(' ');
        like_query = '% ' + word[0] + ' % ' + word[2] + ' %';
    }

    // Ugly escape
    regexp = regexp.split('').map(function (char) {
        if (char === '?') {
            return '¿';
        } else if (char === '(' || char === ')') {
            return '';
        }
        return char;
    }).join('').replace(')(', '');

    // If this i 0, do not continue, hence separation, but publicly needed
    var all_docs_w_word = 0;

    var relevant = new Promise(function (resolve, reject) {
        // Determine if word ever appears in any document
        db.get(
            "SELECT tweet_text FROM " + tbl_name + " WHERE tweet_text LIKE ?",
            like_query,
            function (err, res) {
                if (err || !res || !res.tweet_text) {
                    reject('Query unsuccessful (no ' + word + ' found or error: ' + err);
                } else if (res.tweet_text && res.tweet_text.match(regexp)) {
                    all_docs_w_word = 1;
                    console.log('---------TRIGRAM FOUND---------')
                    resolve(1);
                } else if (res.filter) {
                    res = res.filter(function (tweet) {
                        return !!tweet.match(regexp);
                    });
                    all_docs_w_word = res.length;
                    resolve(all_docs_w_word);
                } else {
                    console.log('No tweets with trigram');
                    reject(0);
                }
            }
        );
    });

    relevant.then(
        // Queries are relevant: query on
        // Return of relevant not relevant (bool state)
        function () {
            // Ok
            Promise.all([getAllDocs(), getPolarityDocs(polarity), getPolarityDocsWithWord(polarity, word)])
                .then(
                    function (stats) {
                        // Ok: return stats to caller
                        resolve_all({
                            all_docs: stats[0],
                            all_docs_w_word: all_docs_w_word,
                            pol_docs: stats[1],
                            non_pol_docs: stats[0] - stats[1],
                            pol_docs_w_word: stats[2]
                        });
                    },
                    function (err) {
                        // Error: Return error to caller
                        reject_all(err);
                    }
                );
        },
        function (reason) {
            // Queries not relevant (or error)
            resolve_all(null);
        }
    );

    return public_thenable;

    function getAllDocs() {
        /* <thenable> Get total number of documents
         */
        return new Promise(function (resolve, reject) {
            db.get(
                "SELECT count(*) as total FROM " + tbl_name + ";",
                function (err, ret) {
                    if (err) {
                        console.log('All docs rejected');
                        reject(err);
                    } else {
                        resolve(ret.total);
                    }
                }
            );
        });
    }

    function getPolarityDocs(polarity) {
        /* <thenable> Get number of docs of polarity P
         */
        return new Promise(function (resolve, reject) {
            db.get(
                "SELECT count(*) as total FROM " + tbl_name + " WHERE polarity = ?",
                polarity,
                function (err, ret) {
                    if (err) {
                        console.log('Polarity docs rejected');
                        reject(err);
                    } else {
                        resolve(ret.total);
                    }
                }
            );
        });
    }

    function getPolarityDocsWithWord(polarity, word) {
        /* <thenable> Get number of documents of polarity P where word W appears
         */
        return new Promise(function (resolve, reject) {
            db.get(
                "SELECT tweet_text FROM " + tbl_name + " WHERE polarity = ? AND tweet_text LIKE ?",
                [polarity, like_query],
                function (err, ret) {
                    if (err || !ret) {
                        console.log('Polarity docs with word rejected', err, ret);
                        reject(err);
                    } else if (ret.filter) {
                        ret = ret.filter(function (tweet) {
                            return !!tweet.match(regexp);
                        });
                        resolve(ret.length);
                    } else if (ret.tweet_text && !ret.tweet_text.match(regexp)) {
                        console.log('No matching tweets for polarity');
                        reject(0);
                    } else {
                        resolve(1);
                    }
                }
            );
        });
    }
}

module.exports = Counts;
