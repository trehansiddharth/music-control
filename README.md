music-control
============

This node.js package is a component of the Internet of Things network for the H32 suite lounge that controls the music library, the song queue, and the speaker system.

The Internet of Things architecture consists of a central Mongo database and several devices that can connect to the database to report their status, receive queries, and publish commands for other devices to process. This choice of highly centralized architecture makes it easy to add, remove, or update devices without worrying about which connections will have to be added or will be broken. This particular component, music-control, acts as an MPD client that receives commands from the central database and communicates them to an MPD service over an MPD socket on either the local or a remove device. It is meant to be used as a controller for a queue system that manages multiple people who want to play a song by queueing new songs to be played after every song currently on the queue has been played. It reports the current state of the music player, such as which song is currently playing and where in the song the player currently is.

To set up the Internet of Things architecture, create a Mongo database and set up an oplog at the local database. Create the `music_queries` and `device_status` collections for music-control to receive commands and queries and to report music player state, respectively. To install music-control on a device, clone this repository, install dependencies by running `npm install`, set the appropriate environmental variables (explained below), and then run with `node app.js`.

The environmental variables that music-control looks at are:

Name of Environmental Variable | Description
-------------------------------|------------
`$MONGO_HOSTNAME`              | Hostname or IP address (`address:port` format) of the server hosting the database
`$MONGO_DATABASE`              | Name of the database on the server to connect to
`$MONGO_USERNAME`              | Username to connect as (leave empty if there are no authorization details)
`$MONGO_PASSWORD`              | Password to provide when authorizing (leave empty if there is no password)
`$MPD_HOST`                    | Hostname or IP address of the device exposing the MPD socket
`$MPD_PORT`                    | Port on the device at which the MPD socket is exposed

For each device, the central database should contain a collection for sending queries or commands for the device to process. For music-control, that collection is called `music_queries`. To send a query or command to a component such as music-control, insert a new document into this collection, which should be an ordinary JSON value with the following schema:

Attribute      | Type                | Description
---------------|---------------------|------------
`.command`     | `String`            | Name of the command or query action to send to the component. Particular commands for music-control are detailed below.
`.arguments`   | `Array`             | Arguments to pass along with the command provided. Particular argument descriptions and types for different commands for music-control are described below.
`.waiting`     | `Bool`              | Whether the agent that sent the query or command is still waiting for a result or for it to be executed. This should initially be set to `true`, and once the action has been processed by the component, it will be set to `false` to indicate that the command has been executed or a result for the query is now available.
`.result`      | Depends on command  | When the component has processed a query, it will return the result of it in this field and set waiting to `false` to signal any listener to the database that a result for the query is now available.

music-control currently supports the following API:

Name of command   | Type and index of argument     | Description
------------------|--------------------------------|----------------------
`enqueue`         |                                | Puts a particular song on the queue to be played after all the currently queued songs have been played
                  | `String` [0]                   | Name of the song file to put on the queue
`search`          |                                | Searches for a musical item in the database
                  | `String` [0]                   | Type of musical item (`"song"`, `"album"`, `"artist"`, or `"any"`)
                  | `String` [1]                   | The search query
`raw_command`     |                                | Used when the API doesn't yet support the command you want but the MPD protocol does
                  | `String` [0]                   | Name of the MPD command
                  | `Array(String)` [1:]           | Arguments for the MPD command
`pause`           |                                | Pauses the music player
`play`            |                                | Tells the music player to continue playing
`status`          |                                | Returns the current status of the music player