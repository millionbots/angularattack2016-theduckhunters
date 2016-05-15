'use strict';

var express = require('express');

var app = express();
app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, Content-Type");
    res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
    next();
});
app.use(express.static('public'));

var server = require('http').createServer(app);

var socket = require('socket.io')(server);
var randomColor = require('randomcolor');
var Firebase = require('firebase');
var port = process.env.PORT || 3000;

server.listen(port, function () {
    console.log('Server listening at port %d', port);
});

var payloadGrid = [];
var players = {};
var myFirebaseRef = new Firebase("https://duckhunters.firebaseio.com/");
var usedColors = [];
var playerPopulation = 0;

var appConfig = {
    gridSize: {
        x: 100,
        y: 150
    },
    distance: 2,
    maxPlayers: 5
};

for (var i = 0; i < appConfig.gridSize.x; i++) {
    payloadGrid[i] = [];
    for (var j = 0; j < appConfig.gridSize.y; j++) {
        payloadGrid[i][j] = 0;
    }
}
//{ Ka: '116975921536142760840',
//wc: 'Suraj Acharya',
//Za: 'Suraj',
//Na: 'Acharya',
//hg: 'suraz.acharya09@gmail.com' }


var playerRankings = [];

socket.on('connection', function (client) {

    console.log("Yay ! new client has connected");

    client.emit('connectionSuccess', appConfig);

    client.on('login', function (userInfo, callback) {
        console.log("login");
        userInfo = userInfo.user.wc;
        client.googleId = userInfo.Ka;

        var user = userInfo;

        function pushdata(user) {
            var randomReference = myFirebaseRef.push();
            user.id = client.googleId;
            //user.usercode = 'DH' + randomReference.key();
            user.score = 1212;
            randomReference.set(user);
            return user;
        }

        function userExistsCallback(id, exists) {
            if (exists) {
                id.on("value", function (snapshot) {
                    user = snapshot.val();
                })
            }
            else {
                pushdata(user);
            }

            //TODO: Validate room population

            players[client.googleId] = {
                id: client.googleId,
                userInfo: user,
                angle: 0,
                position: {
                    x: 0,
                    y: 0
                },
                isInGame: false
            };

            var data = {
                userInfo: players[client.googleId]
            };
            callback ? callback(data) : '';
            client.emit('loginSuccess', data);
        }

        myFirebaseRef.once("value", function (allMessagesSnapshot, cb) {
            var exists = false;
            var ref;
            allMessagesSnapshot.forEach(function (messageSnapshot) {

                // Will be called with a messageSnapshot for each child under the /messages/ node
                var key = messageSnapshot.key();  // e.g. "-JqpIO567aKezufthrn8"
                var uid = messageSnapshot.child("Ka").val();  // e.g. "barney"
                if (uid === userInfo.Ka) {
                    exists = true;
                    ref = new Firebase("https://duckhunters.firebaseio.com/" + key);
                }
            });
            userExistsCallback(ref, exists);
        });
    });

    var validateColorUniqueness = function (color) {
        if (usedColors.indexOf(color) === -1) {
            return true;
        }
        return false;
    };

    client.on('getColors', function (callback) {
        console.log("getColors");
        var randomColorsArray = [];
        while (randomColorsArray.length < 5) {
            var color = randomColor.randomColor();
            if (validateColorUniqueness(color)) {
                randomColorsArray.push(color);
            }
        }
        callback(randomColorsArray);
    });

    client.on('joinGame', function (data, callback) {
        console.log("joinGame");
        var player = players[client.googleId];
        //TODO: Handle rare case when color given from getColors is already taken by someone
        if (!player || !data.color || !validateColorUniqueness || playerPopulation >= appConfig.maxPlayers) {
            return false;
        } else {
            player.color = data.color;
            usedColors.push(player.color);
            player.isInGame = true;
            var data = {
                userInfo: player,
                payloadGrid: payloadGrid,
                players: players
            };
            playerPopulation++;
            socket.to('global').emit('playerConnected', players);
            socket.to('global').emit('messageBroadcast', player.userInfo.wc + " has joined the game.");
            callback ? callback(data) : '';
            client.emit('joinGameSuccess', data);
            client.join('global');
        }
    });

    client.on('clientStateUpdate', function (data) {
        console.log('clientStateUpdate', data);
        if (!players[client.googleId]) {
            return false;
        }
        players[client.googleId].angle = data.angle;
    });

    client.on('disconnect', function () {
        var player = players[client.googleId];
        if (player) {
            if (player.isInGame) {
                playerPopulation--;
            }
            player.isInGame = false;
        }
        console.log('Phew !! Someone just disconnnect..');
        socket.to('global').emit('playerDisconnected', players);
        socket.to('global').emit('messageBroadcast', player.userInfo.wc + " has disconnected from the game.");
    });

});

setInterval(function () {

    var changesPayload = [];

    // Calculate the changes
    for (var playerId in players) {
        if (players.hasOwnProperty(playerId) && players[playerId].isInGame) {

            var player = players[playerId];
            var position1 = player.position;
            var newX = position1.x;
            var newY = position1.y;
            switch (player.angle) {
                case 0:
                    newX = player.position.x - appConfig.distance;
                    break;
                case 1:
                    newY = player.position.y + appConfig.distance;
                    break;
                case 2:
                    newX = player.position.x + appConfig.distance;
                    break;
                case 3:
                    newY = player.position.y - appConfig.distance;
                    break;
                default:
                    break;
            }
            newX = newX <= (appConfig.gridSize.x - 1) ? newX : (appConfig.gridSize.x - 1)
            newX = newX >= 0 ? newX : 0
            newY = newY >= 0 ? newY : 0;
            newY = newY <= (appConfig.gridSize.y - 1) ? newY : (appConfig.gridSize.y - 1)
            var position2 = {
                x: newX,
                y: newY
            };

            var startX = (position1.x < position2.x) ? position1.x : position2.x;
            var startY = (position1.y < position2.y) ? position1.y : position2.y;
            var endX = (position1.x > position2.x) ? position1.x : position2.x;
            var endY = (position1.y > position2.y) ? position1.y : position2.y;
            while (!(startX === endX && startY === endY)) {
                if (startX < endX) {
                    startX++;
                }
                if (startY < endY) {
                    startY++;
                }
                payloadGrid[startX][startY] = playerId;
                var gridChange = {
                    playerId: playerId,
                    gridCoordinates: [startX, startY]
                };
                changesPayload.push(gridChange);
            }
            player.position = position2;

        }
    }

    //Calculate rankings
    var playerScoreMap = {}
    for (var i = 0; i < appConfig.gridSize.x; i++) {
        for (var j = 0; j < appConfig.gridSize.y; j++) {
            // payloadGrid[i][j] = '';
            var gridUser = payloadGrid[i][j];
            if (playerScoreMap[gridUser]) {
                playerScoreMap[gridUser]++;
            } else {
                playerScoreMap[gridUser] = 1;
            }
        }
    }

    playerRankings = [];
    for (var playerId in playerScoreMap) {
        //TODO: Without playerID
        if (playerScoreMap.hasOwnProperty(playerId) && playerId != 0 && players[playerId]) {
            var player = players[playerId];
            var score = playerScoreMap[playerId];
            if (score == 0 && !player.isInGame) {
                usedColors.splice(usedColors.indexOf(player.color), 1);
                delete players[playerId];
            } else {
                playerRankings.push({
                    score: score,
                    player: players[playerId]
                })
            }
        }
    }

    playerRankings = playerRankings.sort(function (a, b) {
        return a.score - b.score
    });

    //TODO: Very bad ! need to refactor later
    var playersArray = [];
    // Calculate the changes
    for (var playerId in players) {
        if (players.hasOwnProperty(playerId) && players[playerId].isInGame) {
            playersArray.push(players[playerId]);
        }
    }

    socket.to('global').emit('gameStateUpdate', {
        playerRankings: playerRankings,
        changesPayload: changesPayload,
        playersArray: playersArray
    });

}, 200);

setInterval(function () {
    //var ref = new Firebase("https://duckhunters.firebaseio.com/")
    //ref.remove();
    console.log('updating database');
}, 10000);
