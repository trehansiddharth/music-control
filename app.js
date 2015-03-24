var mongo = require("mongodb");
var sys = require('sys');
var exec = require('child_process').exec;
var MongoOplog = require("mongo-oplog");
var mpd = require("mpd");
var cmd = mpd.cmd;

var MONGO_USERNAME = process.env.MONGO_USERNAME;
var MONGO_PASSWORD = process.env.MONGO_PASSWORD;
var MONGO_HOSTNAME = process.env.MONGO_HOSTNAME;
var MONGO_DATABASE = process.env.MONGO_DATABASE;

var mongodbAuth = "";
if (!(MONGO_USERNAME == "" || MONGO_PASSWORD == "")) {
	mongodbAuth = MONGO_USERNAME + ":" + MONGO_PASSWORD + "@";
}
var mongodbUri = "mongodb://" + mongodbAuth + MONGO_HOSTNAME + "/" + MONGO_DATABASE;
var mongodbUriLocal = "mongodb://" + mongodbAuth + MONGO_HOSTNAME + "/local";

console.log("Connecting to database at:");
console.log(mongodbUri);

music_queries = undefined;

function resolve(id, result) {
	music_queries.update({ _id : id }, { $set : { waiting : false, result : result } });
}

function handleQuery(query) {
	console.log("Query is:");
	console.log(query);
	if (query.waiting) {
		var id = query._id;
		var command = query.command;
		var arguments = query.arguments;
		switch (command) {
			case "enqueue":
				var track = arguments[0];
				client.sendCommand(cmd("add", [track]), function (err, msg) {
					if (err) {
						console.log("Error when enqueueing:");
						console.log(err);
					} else {
						console.log("Enqueueing successful:");
						console.log(msg);
						resolve(id, []);
					}
				});
				break;
			case "raw_command":
				var raw_command = arguments[0];
				var raw_arguments = arguments.slice(1);
				client.sendCommand(cmd(raw_command, raw_arguments), function (err, msg) {
					if (err) {
						console.log("Error when executing raw command:");
						console.log(err);
					} else {
						console.log("Executing raw command successful.");
						resolve(id, msg);
					}
				});
				break;
			case "search":
				var type = arguments[0];
				var search_query = arguments[1];
				client.sendCommand(cmd("search", [type, search_query]), function (err, msg) {
					if (err) {
						console.log("Error when searching music database:");
						console.log(err);
					} else {
						var lines = msg.replace("\r\n", "\n").split("\n");
						var results = [];
						var file = {};
						for (i = 0; i < lines.length; i++) {
							var line = lines[i];
							var pair = line.split(": ");
							if (pair[0] == "file") {
								results.push(file);
								file = {};
							}
							var attrib = pair[0].toLowerCase().replace("-", "_");
							var value = pair[1];
							file[attrib] = value;
						}
						if (file != {}) {
							results.push(file);
						}
						results = results.splice(1);
						resolve(id, results);
					}
				});
				break;
		}
	}
}

function node(db, tmp_music_queries) {
	music_queries = tmp_music_queries;
	console.log("Fetched music_queries successfully.");
	var oplog = MongoOplog(mongodbUriLocal, MONGO_DATABASE + ".music_queries").tail();
	oplog.on("insert", function (data) {
		console.log("Got insert.")
		handleQuery(data.o);
	});
	oplog.on("update", function (data) {
		console.log("Got update.")
		var id = data.o2._id;
		music_queries.findOne({ _id : id }, function (err, query) {
			if (err) {
				console.log("Error while fetching object of update:");
				console.log(err);
			} else {
				console.log("Successfully fetched object of query.");
				handleQuery(query);
			}
		});
	});
}

var MPD_HOST = process.env.MPD_HOST;
var MPD_PORT = process.env.MPD_PORT;

console.log("Connecting to MPD socket at:");
console.log(MPD_HOST + ":" + MPD_PORT);

var client = mpd.connect({
	port: MPD_PORT,
	host: MPD_HOST,
});

client.on("ready", function () {
	console.log("Successfully connected to MPD.");
		mongo.MongoClient.connect(mongodbUri, function (err, db) {
		if (err) {
			console.log("Error while connecting:");
			console.log(err);
		} else {
			console.log("Connected successfully.");
			db.collection("music_queries", function (err, tmp_music_queries) {
				if (err) {
					console.log("Error while fetching music_queries collection:");
					console.log(err);
				} else {
					node(db, tmp_music_queries);
				}
			});
		}
	});
});
