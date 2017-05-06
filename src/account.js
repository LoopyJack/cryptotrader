var EventEmitter = require('events').EventEmitter;
var _ = require('lodash');


class Account extends EventEmitter {
  constructor(poloTrade) {
    super();

    this.poloTrade = poloTrade;

    this.lastUpdate = {
      fills: 1483228800, //initially start of 2017
      orders: 1483228800
    }

    this.fills = {};
    this.balances = {};
    this.orders = {};

  }

  update() {

    let endTime = Math.floor(new Date().getTime() / 1000);

    this.poloTrade.returnCompleteBalances('all', (err, res) => {
      if (err) {
        console.log(new Date(), 'balance request error:', err);
        return;
      }

      this.balances = res;

      this.emit('balances', res);
      this.lastUpdate.balances = endTime;

    });


    setTimeout(() => {
      let endTime = Math.floor(new Date().getTime() / 1000);

      this.poloTrade.returnOpenOrders('all', (err, res) => {
        if (err) {
          console.log(new Date(), 'order request error:', err);
          return;
        }


        if (!_.isEqual(this.orders, res)) {
          this.emit('order', res);
          this.orders = res;
        }
      });
    }, 1000);

    setTimeout(() => {
      let endTime = Math.floor(new Date().getTime() / 1000);

      this.poloTrade.returnTradeHistory('all', this.lastUpdate.fills, Math.floor(new Date().getTime() / 1000), (err, res) => {
        if (err) {
          console.log(new Date(), 'trade request error:', err);
          return;
        }

        if (!_.isEmpty(res)) {

          _.mergeWith(this.fills , res, (o,s) => {
            if (_.isArray(o)) {
              return o.concat(s);
            }
          });

          this.emit('fill', res);
          this.lastUpdate.fills = endTime;
        }
      });
    }, 2000);


  }

  startUpdating() {
    this.interval = setInterval( () => {
      this.update();

    }, 10000);
  }

}

module.exports = Account;
