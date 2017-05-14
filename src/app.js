var _ = require('lodash');

const User = require('./user');
const MarketData = require('./marketdata');
const symbols = require('../data/symbols');

var userlist = require('../data/users');

var server = require('http').createServer();
var express = require('express');
var app = express();
var url = require('url');
var path = require('path');

var port = 8888;

process.on('uncaughtException', function (err) {
  console.error(err.stack);
  console.log("Node NOT Exiting...");
});


app.use(express.static('./../dist'));
app.use(express.static('./../node_modules/chartist-plugin-tooltips/dist'));
app.use('/highcharts/', express.static('./../node_modules/highcharts/'));

app.get('/:user', (req, res, next) => {
  res.sendFile(path.join(__dirname + './../dist/index.html'));

});



server.on('request', app);
server.on('error', function(err) {
  console.log(err);
});
server.listen(port, function () {
  console.log('Listening on port:' + port);
});


var users = {};
var marketData = new MarketData();
var history = [];

var clients = {}


/* create users from file */
Object.keys(userlist).forEach( (u) => {
  users[u] = new User(userlist[u], marketData)
});


const WebSocket = require('ws');
const wss = new WebSocket.Server({
  perMessageDeflate: false,
  server: server
});

wss.broadcast = function(data) {
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

wss.on('connection', function connection(ws) {
  console.log(Date(), ' - Websocket connected:', ws.upgradeReq.headers['sec-websocket-key']);

  clients[ws.upgradeReq.headers['sec-websocket-key']] = {
    ws: ws
  };

  ws.on('close', function() {
    console.log(Date(), ' - Websocket Disconnected:', ws.upgradeReq.headers['sec-websocket-key']);
    delete clients[ws.upgradeReq.headers['sec-websocket-key']];
    console.log(Object.keys(clients).length, 'clients connected');
  });


  ws.on('message', function incoming(data) {
    console.log('Incoming msg: ', data);
    let msg;
    try {
      msg = JSON.parse(data);
    } catch(e) {
      console.log('Unparsable msg:', data)
    }

    /* map websocket request to existing client if possible */
    if (msg.request == 'initialize') {
      if(Object.keys(users).indexOf(msg.user) > -1) {
        clients[ws.upgradeReq.headers['sec-websocket-key']]['user'] = msg.user
      }
    }

    /* send history when requested */
    else if (msg.request == 'history') {
      let response;
      try {
        response = history.map( (row) => {
          return {
            timestamp: row.timestamp,
            marketData: row.marketData,
            balances: row.users[msg.user].balances,
            orders:   row.users[msg.user].orders
          };
        });

        ws.send(JSON.stringify({
          msgType: 'history',
          response: response
        }));
      } catch(e) {
        console.log(new Date(), '- History not sent');
      }
    }

  });
});


/* send updates to connected websockets */
setInterval( () => {
  Object.keys(clients).forEach( (c) => {
    if (clients[c]['user']) {
      clients[c].ws.send(JSON.stringify(formatUserData(clients[c]['user'])));
    }
  });

}, 500)


/* record history */
setInterval( () => {
  let tempUsers = {}
  Object.keys(users).forEach( (u) => {
    tempUsers[u] = {
      balances: _.cloneDeep(users[u].account.data.balances),
      orders: _.cloneDeep(users[u].account.data.orders)
    }
  });
  let row = {
    timestamp: new Date().getTime(),
    marketData: _.cloneDeep(marketData.marketData),
    users: tempUsers
  }
  if (history.length > 60 * 12) {
    history.shift();
  }
  history.push(row);
  console.log('History added.. rows:', history.length);

}, 60000);


var formatUserData = function(user) {
  let data = users[user];
  let strategies = {};
  Object.keys(data.strategies).forEach( (val) => {
    strategies[val] = data.strategies[val].data;
  });

  let res = {
    timestamp: new Date().getTime(),
    msgType:    'user_update',
    strategies: strategies,
    trades:     data.account.data.trades,
    balances:   data.account.data.balances,
    orders:     data.account.data.orders,
    marketData: marketData.marketData
  }
  return res;
}
