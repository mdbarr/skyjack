'use strict';

const url = require('url');
const redis = require('redis');

function Redis(skyfall) {
  const connections = new Map();

  this.connect = (...args) => {
    const address = args.shift();
    const callback = args.pop();
    const connectOptions = args.pop();

    const id = skyfall.utils.id();
    const pubClient = redis.createClient(address, connectOptions);
    const subClient = redis.createClient(address, connectOptions);

    const parsed = url.parse(address);
    const name = parsed.hostname;

    const connection = {
      id,
      server: parsed.hostname,
      get subscriber() {
        return subClient.connected;
      },
      get publisher() {
        return pubClient.connected;
      }
    };

    connections.set(id, connection);

    const redisClientError = (error) => {
      if (error) {
        skyfall.events.emit({
          type: `redis:${ name }:error`,
          data: error.toString(),
          source: id
        });
      }
    };

    skyfall.utils.hidden(connection, 'subscribe', (topic) => {
      subClient.subscribe(topic);
    });

    skyfall.utils.hidden(connection, 'unsubscribe', (topic) => {
      subClient.unsubscribe(topic);
    });

    skyfall.utils.hidden(connection, 'publish', (topic, message) => {
      pubClient.publish(topic, message);
    });

    subClient.on('subscribe', (topic) => {
      skyfall.events.emit({
        type: `redis:${ topic }:subscribed`,
        data: topic.toString(),
        source: id
      });
    });

    subClient.on('message', (topic, payload) => {
      skyfall.events.emit({
        type: `redis:${ topic }:message`,
        data: payload.toString(),
        source: id
      });
    });

    pubClient.on('error', (error) => {
      redisClientError(error);
    });

    subClient.on('error', (error) => {
      redisClientError(error);
    });

    let callbackInvoked = false;
    const connected = () => {
      if (connection.publisher && connection.subscriber) {
        if (callback && !callbackInvoked) {
          callbackInvoked = true;
          return callback(connection);
        }
        return connection;
      }
      return false;
    };

    pubClient.on('connect', connected);
    subClient.on('connect', connected);

    return connection;
  };
}

module.exports = {
  name: 'redis',
  install: (skyfall, options) => {
    skyfall.redis = new Redis(skyfall, options);
  }
};
