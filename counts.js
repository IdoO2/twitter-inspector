function Counts(db, polarity, word) {
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

    var relevant = new Promise(function (resolve, reject) {
        // Determine if word ever appears in any document
        db.get(
            "SELECT count(*) as total FROM trained WHERE tweet_text LIKE ?",
            '% ' + word + ' %',
            function (err, res) {
                if (err || res.total === 0) {
                    reject('Query unsuccessful (no ' + word + ' found or error: ' + err);
                } else {
                    resolve(res.total);
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
                "SELECT count(*) as total FROM trained;",
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
                "SELECT count(*) as total FROM trained WHERE polarity = ?",
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
                "SELECT count(*) as total FROM trained WHERE polarity = ? AND tweet_text LIKE ?",
                [polarity, '% ' + word + ' %'],
                function (err, ret) {
                    if (err) {
                        console.log('Polarity docs with word rejected');
                        reject(err);
                    } else {
                        resolve(ret.total);
                    }
                }
            );
        });
    }
}

module.exports = Counts;
