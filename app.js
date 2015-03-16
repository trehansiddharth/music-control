var mongo = require("mongodb");
var sys = require('sys');
var exec = require('child_process').exec;

var MONGO_USERNAME = process.env.MONGO_USERNAME;
var MONGO_PASSWORD = process.env.MONGO_PASSWORD;
var MONGO_URL = process.env.MONGO_URL;

var mongodbUri = "mongodb://" + MONGO_USERNAME + ":" + MONGO_PASSWORD + "@" + MONGO_URL;

function listenOnDatabase(collectionName, timeout, callback) {
	mongo.MongoClient.connect(mongodbUri, function (err, db) {
		if (err) {
			console.log("Error while connecting:");
			console.log(err);
		} else {
			console.log("Connected successfully.");
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
	});
}

listenOnDatabase("music_queue", 1000, function (err, data) {
	if (err) {
		console.log("Error while getting next object of tailable cursor:");
		console.log(err);
	} else {
		console.log("Got data:");
		console.log(data);
		var track = data.track;
		console.log(track);
		exec("mpc add " + track);
	}
}