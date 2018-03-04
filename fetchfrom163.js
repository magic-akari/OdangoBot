"use strict";

const fetch = require("node-fetch");
const encrypt = require("./encrypt.js");

const formToSend = body => {
  let { params, encSecKey } = encrypt(body);
  return `params=${params}&encSecKey=${encSecKey}`;
};

let MUSIC_U = process.env.MUSIC_U;

if (MUSIC_U) {
  MUSIC_U = ";MUSIC_U=" + MUSIC_U;
} else {
  MUSIC_U = "";
}

const fetchData = (url, payload) =>
  fetch(url, {
    method: "POST",
    body: formToSend(payload),
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept-Language": "zh-CN,zh;q=0.8,gl;q=0.6,zh-TW;q=0.4",
      Connection: "keep-alive",
      Referer: "http://music.163.com/",
      Host: "music.163.com",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/33.0.1750.152 Safari/537.36",
      Origin: "http://music.163.com",
      Cookie: "os=osx;appver=1.4.1" + MUSIC_U,
      "X-Real-IP": "211.161.244.70"
    }
  });

const fetchSong = id =>
  fetchData("http://music.163.com/weapi/song/enhance/player/url", {
    ids: [id],
    br: 999000,
    csrf_token: ""
  });

const fetchSongDetail = (id, callback) =>
  fetch(`http://music.163.com/api/song/detail?ids=%5B${id}%5D`, {
    headers: {
      Referer: "http://music.163.com",
      Cookie: "appver=2.0.2",
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

module.exports = { fetchSong, fetchSongDetail, fetchData };
