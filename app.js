var mongo = require("mongodb");
var sys = require('sys');
var exec = require('child_process').exec;

var MONGO_USERNAME = process.env.MONGO_USERNAME;
var MONGO_PASSWORD = process.env.MONGO_PASSWORD;
var MONGO_URL = process.env.MONGO_URL;

var mongodbUri = "mongodb://" + MONGO_USERNAME + ":" + MONGO_PASSWORD + "@" + MONGO_URL;

function listenOnDatabase(db, collectionName, timeout, callback) {
	db.collection(collectionName, function (err, collection) {
		if (err) {
			console.log("Error while getting collection:");
			console.log(err);
		} else {
			console.log("Collection opened successfully.");
			var conditions = {};
			var latestCursor = collection.find(conditions).sort({ $natural : -1 }).limit(1);
			latestCursor.nextObject(function (err, latest) {
				if (err) {
					console.log("Error while getting next object of latest cursor:");
					console.log(err);
				} else {
					console.log("Got latest document successfully.");
					conditions._id = {$gt: latest._id};
					var options = { tailable : true, awaitData : true, numberOfRetries : 0 };
					var cursor = collection.find(conditions, options);
					(function next() {
						cursor.nextObject(function (err, data) {
							callback(err, data);
							setTimeout(function () {
								next();
							}, timeout);
						});
					})();
				}
			});
		}
	});
}


mongo.MongoClient.connect(mongodbUri, function (err, db) {
	if (err) {
		console.log("Error while connecting:");
		console.log(err);
	} else {
		console.log("Connected successfully.");
		listenOnDatabase(db, "music_queue", 1000, function (err, data) {
			if (err) {
				console.log("Error while getting next object of tailable cursor of music_queue:");
				console.log(err);
			} else {
				console.log("Got data from music_queue:");
				console.log(data);
				var track = data.track;
				console.log(track);
				exec("mpc add " + track);
			}
		});

		listenOnDatabase(db, "music_actions", 1000, function (err, data) {
			if (err) {
				console.log("Error while getting next object of tailable cursor of music_actions:");
				console.log(err);
			} else {
				console.log("Got data from music_actions:");
				console.log(data);
				var id = data._id;
				var command = data.command;
				console.log(command);
				exec("mpc " + command, function (err, stdout, stderr) {
					if (err) {
						console.log("Error while running command on mpc:");
						console.log(err);
					} else {
						db.collection("music_actions", function (err, collection) {
							if (err) {
								console.log("Error finding music_actions to update:");
								console.log(err);
							} else {
								console.log("Successfully found music_actions to update.");
								collection.update({ _id : id }, { $set : { result : stdout } }, function (err, doc) {
									if (err) {
										console.log("Error updating music_action:");
										console.log(err);
									} else {
										console.log("Successfully updated music_action.");
									}
								});
							}
						});
					}
				});
			}
		});
	}
});
