var mongo = require("mongodb");
var sys = require('sys');
var exec = require('child_process').exec;
var MongoOplog = require("mongo-oplog");
var mpd = require("mpd");
var cmd = mpd.cmd;

var DEVICE_NAME = process.env.DEVICE_NAME;

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
device_status = undefined;

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
			case "pause":
				client.sendCommand(cmd("pause", []), function (err, msg) {
					if (err) {
						console.log("Error when pausing:");
						console.log(err);
					} else {
						console.log("Pausing successful.");
						resolve(id, []);
					}
				});
				break;
			case "play":
				client.sendCommand(cmd("play", []), function (err, msg) {
					if (err) {
						console.log("Error when playing:");
						console.log(err);
					} else {
						console.log("Playing successful.");
						resolve(id, []);
					}
				});
				break;
			case "status":
				client.sendCommand(cmd("status", []), function (err, msg) {
					update_status(err, msg, function(status) {
						resolve(id, status);
					});
				})
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
								results.push(processSongInfo(file));
								file = {};
							}
							var attrib = pair[0].toLowerCase().replace("-", "_");
							var value = pair[1];
							file[attrib] = value;
						}
						if (file != {}) {
							results.push(processSongInfo(file));
						}
						results = results.splice(1);
						resolve(id, results);
					}
				});
				break;
		}
	}
}

function getJSON(data) {
	var lines = data.replace("\r\n", "\n").split("\n");
	var info = {}
	for (i = 0; i < lines.length; i++) {
		var line = lines[i];
		var pair = line.split(": ");
		var attrib = pair[0].toLowerCase().replace("-", "_");
		var value = pair[1];
		if (attrib && value) {
			info[attrib] = value;
		}
	}
	return info;	
}

function processSongInfo(songInfo) {
	var newSongInfo = songInfo;
	newSongInfo.time = parseInt(songInfo.time);
	newSongInfo.track = parseInt(songInfo.track);
	newSongInfo.pos = parseInt(songInfo.pos);
	newSongInfo.id = parseInt(songInfo.id);
	return newSongInfo;
}

function node(db, tmp_music_queries, tmp_device_status) {
	music_queries = tmp_music_queries;
	device_status = tmp_device_status;
	var oplog = MongoOplog(mongodbUriLocal, MONGO_DATABASE + "." + DEVICE_NAME + "_queries").tail();
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
	client.on("system-player", function (data) {
		console.log("Got status update.")
		client.sendCommand(cmd("status", []), update_status);
	});
	client.sendCommand(cmd("status", []), update_status);
	setInterval(function () {
		client.sendCommand(cmd("status", []), update_status);
	}, 1000);
}

function update_status(err, msg, cb) {
	if (err) {
    	console.log("Errow while fetching state.");
    	console.log(err);
    } else {
    	console.log("State fetched successfully");
    	var info = getJSON(msg);
		var status = {};
		status.volume = parseInt(info.volume);
		status.state = info.state;
		if (status.state == "stop") {
			status.elapsed = null;
			status.song = null;
			console.log(status);
			if (cb) {
				cb(status);
			} else {
	    		device_status.update({ device_name : DEVICE_NAME }, { $set : status } );
			}
		} else {
			status.elapsed = parseInt(info.elapsed);
			client.sendCommand(cmd("currentsong", []), function (err, msg) {
				if (err) {
					console.log("Error getting info about current song:");
					console.log(err);
				} else {
					var currentSongInfo = processSongInfo(getJSON(msg));
					status.song = currentSongInfo;
					console.log(status);
					if (cb) {
						cb(status);
					} else {
			    		device_status.update({ device_name : DEVICE_NAME }, { $set : status }, { upsert : true } );
					}
				}
			});
		}
    }
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
			db.collection(DEVICE_NAME + "_queries", function (err, tmp_music_queries) {
				if (err) {
					console.log("Error while fetching music_queries collection:");
					console.log(err);
				} else {
					console.log("music_queries fetched successfully.");
					db.collection("device_status", function (err, tmp_device_status) {
						if (err) {
							console.log("Error while fetching device_status collection:");
							console.log(err);
						} else {
							console.log("device_status fetched successfully.");
							node(db, tmp_music_queries, tmp_device_status);
						}
					});
				}
			});
		}
	});
});
