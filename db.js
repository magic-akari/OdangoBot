"use strict";

const pg = require("pg");
const url = require("url");
const params = url.parse(process.env.DATABASE_URL);
const auth = params.auth.split(":");
// create a config to configure both pooling behavior
// and client options
// note: all config is optional and the environment variables
// will be read if the config is not present
const config = {
  user: auth[0],
  password: auth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split("/")[1],
  ssl: true
};

//this initializes a connection pool
//it will keep idle connections open for 30 seconds
//and set a limit of maximum 10 idle clients
const pool = new pg.Pool(config);

pool.on("error", (err, client) => {
  // if an error is encountered by a client while it sits idle in the pool
  // the pool itself will emit an error event with both the error and
  // the client which emitted the original error
  // this is a rare occurrence but can happen if there is a network partition
  // between your application and the database, the database restarts, etc.
  // and so you might want to handle it and at least log it out
  console.error("idle client error", err.message, err.stack);
});

pool.query(
  "CREATE TABLE IF NOT EXISTS stickers(file_id VARCHAR UNIQUE, emoji VARCHAR);"
);

pool.query(
  "CREATE TABLE IF NOT EXISTS music163(id BIGINT UNIQUE, file_id VARCHAR, duration INTEGER, performer VARCHAR, title VARCHAR, album VARCHAR);"
);

//export the query method for passing queries to the pool
module.exports.query = (text, values, callback) => {
  return pool.query(text, values, callback);
};

// the pool also supports checking out a client for
// multiple operations, such as a transaction
module.exports.connect = callback => {
  return pool.connect(callback);
};
