"use strict";

const TOKEN = process.env.TELEGRAM_TOKEN || "YOUR_TELEGRAM_BOT_TOKEN";
const TelegramBot = require("node-telegram-bot-api");
const { fetchSong, fetchSongDetail } = require("./fetchfrom163.js");
const pool = require("./db");
const request = require("request");
const fetch = require("node-fetch");

const options = {
  webHook: {
    // Port to which you should bind is assigned to $PORT variable
    // See: https://devcenter.heroku.com/articles/dynos#local-environment-variables
    port: process.env.PORT,
    // you do NOT need to set up certificates since Heroku provides
    // the SSL certs already (https://<app-name>.herokuapp.com)
    // Also no need to pass IP because on Heroku you need to bind to 0.0.0.0
  },
  filepath: false,
};
// Heroku routes from port :443 to $PORT
// Add URL of your app to env variable or enable Dyno Metadata
// to get this automatically
// See: https://devcenter.heroku.com/articles/dyno-metadata
const url = process.env.APP_URL || "https://<app-name>.herokuapp.com:443";
const bot = new TelegramBot(TOKEN, options);

// This informs the Telegram servers of the new webhook.
// Note: we do not need to pass in the cert, as it already provided
bot.setWebHook(`${url}/bot${TOKEN}`);

const ownerID = process.env.ownerID || "your telegram ID";
const LOGCHATID = process.env.LOGCHATID;
const cool_down_time = 30;
const DONATIONRECORDURL = process.env.DONATIONRECORDURL;

const get_entities = ({ message, type }) => {
  if ("entities" in message) {
    const { text, entities } = message;
    return entities
      .filter(e => type === e.type)
      .map(({ offset, length }) => text.slice(offset, offset + length));
  }
  return [];
};

const welcome = `我是团子浮游炮 (๑>◡<๑)`;

const hello_string = [
  `新来的小伙伴你好呀 (｡･ω･｡)ﾉ`,
  `新来的小伙伴你好哟 ヾ(o◕∀◕)ﾉヾ`,
  `新来的小伙伴，爆个照啊 \\(≧▽≦)/`,
  "诶嘿嘿，新来的，你是大佬还是萌新啊 ( ´▽｀)",
  `哟！新来了一个小伙伴！ 你好哟 ~(≧▽≦)/~`,
  `又来了一个，管理员快出来接客啦 (⁎⁍̴̛ᴗ⁍̴̛⁎)`,
];

const help_markdown = [
  "Hi~我是团子浮游炮 (๑>◡<๑)",
  "我可以帮你:",
  "1. 下载网易云音乐的歌曲，只需要给我链接",
  "---",
  "2. /konachan",
  "3. /yandere",
  "---",
];

const getRandomFromArray = array =>
  array[Math.floor(Math.random() * array.length)];

const tryNtimes = async (fn, times = 5) =>
  await fn().catch(e => (times <= 1 ? fn() : tryNtimes(fn, times - 1)));

const send_music = async ({ song_id, chat_id, message_id }) => {
  bot.sendChatAction(chat_id, "upload_audio");

  let audio_metadata;

  const queryRes = await pool.query(
    "SELECT file_id, duration, performer, title, album FROM music163 where id=$1",
    [song_id],
  );
  if (queryRes.rows.length > 0) {
    console.info("从数据库中读取歌曲数据:", JSON.stringify(queryRes.rows[0]));

    audio_metadata = queryRes.rows[0];
  } else {
    bot.sendChatAction(chat_id, "upload_audio");

    do {
      const song_detail = await tryNtimes(async () =>
        (await fetchSongDetail(song_id)).json(),
      ).catch(e => console.error(e));

      if (song_detail === undefined || song_detail.songs.length === 0) {
        console.error("获取歌曲信息失败");
        break;
      }

      console.info("从网络获取歌曲信息:", JSON.stringify(song_detail));

      const {
        name: title,
        artists,
        album: { name: albumName },
      } = song_detail.songs[0];

      const duration = Math.floor(song_detail.songs[0].duration / 1000);
      const performer = artists.map(a => a.name).join("/");

      audio_metadata = {
        duration,
        performer,
        title,
        album: albumName,
      };

      audio_metadata.song_link = await tryNtimes(
        async () => (await fetchSong(song_id)).json(),
        20,
      ).catch(e => console.error(e));

      if (audio_metadata.song_link === undefined) {
        console.error("获取歌曲链接失败");
        break;
      }

      console.info(
        "从网络获取歌曲信息:",
        JSON.stringify(audio_metadata.song_link),
      );

      bot.sendChatAction(chat_id, "upload_audio");
    } while (false);
  }

  if (
    audio_metadata.file_id === undefined &&
    audio_metadata.song_link === undefined
  ) {
    bot.sendMessage(chat_id, "获取歌曲失败 (╥﹏╥)", {
      reply_to_message_id: message_id,
      disable_notification: true,
    });
  } else {
    const option = {
      caption: `专辑: ${audio_metadata.album}`,
      duration: audio_metadata.duration,
      performer: audio_metadata.performer,
      title: audio_metadata.title,
      reply_to_message_id: message_id,
      disable_notification: true,
    };

    const file_option = audio_metadata.song_link
      ? {
          filename: `${option.performer.replace(/\//g, "&")} - ${
            option.title
          }.${audio_metadata.song_link.data[0].type}`,
        }
      : undefined;

    const msg = await bot.sendAudio(
      chat_id,
      audio_metadata.file_id || request(audio_metadata.song_link.data[0].url),
      option,
      file_option,
    );

    if (msg !== undefined && audio_metadata.song_link) {
      const file_id = msg.audio.file_id;
      const { duration, performer, title, album } = audio_metadata;

      pool.query(
        "INSERT INTO music163(id, file_id, duration, performer, title, album) \
              VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING;",
        [song_id, file_id, duration, performer, title, album],
      );
    }
  }
};

(async () => {
  const { id: bot_id, username: bot_username } = await bot.getMe();

  let MUSIC_U = process.env.MUSIC_U;

  if (MUSIC_U) {
    MUSIC_U = ";MUSIC_U=" + MUSIC_U;
  } else {
    MUSIC_U = "";
  }

  const res = await fetch("http://music.163.com/api/vip/record", {
    headers: {
      Referer: "http://music.163.com",
      Cookie: "os=osx;appver=1.4.1" + MUSIC_U,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const { record } = await res.json();

  const donation = await (await fetch(DONATIONRECORDURL)).text();

  if (record) {
    [
      "关于云音乐下载",
      `为了确保合理使用，当前设置冷却时间为${cool_down_time}秒`,
      "团子使用了主人[@阿卡琳](http://music.163.com/user/home?id=45441555)的账号进行下载",
      "在会员期间，可以下载会员限定歌曲",
      `会员过期时间: ${new Date(record.expireTime).toDateString()}`,
      "---",
      `[捐助？点击这里赠送会员](http://music.163.com/store/vip?friendId=45441555&friendName=阿卡琳)`,
      "---",
      "捐助列表:",
      donation,
    ].map(i => help_markdown.push(i));
  }

  const command_match = ({ bot_commands, command }) =>
    bot_commands.some(
      bc => bc === command || bc === command + "@" + bot_username,
    );

  const start = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/start" })) {
      bot.sendMessage(chat_id, welcome, {
        reply_to_message_id: message_id,
        disable_notification: true,
      });
      return true;
    }
    return false;
  };

  const help = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/help" })) {
      bot.sendMessage(chat_id, help_markdown.join("\n"), {
        reply_to_message_id: message_id,
        disable_notification: true,
        disable_web_page_preview: true,
        parse_mode: "Markdown",
      });
      return true;
    }
    return false;
  };

  const ping = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/ping" })) {
      bot.sendMessage(chat_id, "pong~\n(´,,•ω•,,｀)♡", {
        reply_to_message_id: message_id,
        disable_notification: true,
      });
      return true;
    }
    return false;
  };

  const konachan = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/konachan" })) {
      send_pic({
        json_url: "http://konachan.com/post.json?limit=50&tags=-rating%3Ae",
        chat_id,
        message_id,
      });
      return true;
    }
    return false;
  };

  const yandere = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/yandere" })) {
      send_pic({
        json_url: "http://yande.re/post.json?limit=50&tags=-rating%3Ae",
        chat_id,
        message_id,
      });
      return true;
    }
    return false;
  };

  const delete_sticker = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/delete_sticker" })) {
      if (message.reply_to_message && message.reply_to_message.sticker) {
        const file_id = message.reply_to_message.sticker.file_id;
        pool.query("DELETE FROM stickers where file_id=$1", [file_id]);
      }
      if (message.reply_to_message.from.id === bot_id) {
        bot.deleteMessage(chat_id, message.reply_to_message.message_id);
      }
      return true;
    }
    return false;
  };

  const send_pic = async ({ json_url, chat_id, message_id }) => {
    bot.sendChatAction(chat_id, "upload_photo");

    const json = await tryNtimes(
      async () => (await fetch(json_url)).json(),
      3,
    ).catch(e => console.error(e));

    if (json) {
      let safe_pic = json.filter(
        p => !p.tags.includes("nipple") && !p.tags.includes("ass"),
      );

      const media_list = safe_pic.slice(0, 10).map(pic => {
        let {
          file_url,
          file_size,
          jpeg_url,
          jpeg_file_size,
          sample_url,
          sample_file_size,
          preview_url,
        } = pic;
        const LIMIT = 5242880;
        let url =
          file_size < LIMIT
            ? file_url
            : jpeg_file_size < LIMIT
              ? jpeg_url
              : sample_file_size < LIMIT
                ? sample_url
                : preview_url;

        if (url.startsWith("//")) {
          url = "http:" + url;
        }
        return { type: "photo", media: url };
      });

      bot.sendMediaGroup(chat_id, media_list, {
        reply_to_message_id: message_id,
        disable_notification: true,
      });
    }
  };

  const reply = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/reply" })) {
      const result = /\/reply\s+(\S+)\s+(\S+)\s+([\s\S]+)/.exec(message.text);
      if (result) {
        const reply_chat_id = result[1];
        const reply_message_id = result[2];
        const reply_text = result[3];
        bot.sendMessage(reply_chat_id, reply_text, {
          reply_to_message_id: reply_message_id,
        });
      }
    }
  };

  const exec_SQL = ({ chat_id, message, message_id, bot_commands }) => {
    if (command_match({ bot_commands, command: "/SQL" })) {
      const result = /\/\S+\s+([\s\S]+)/.exec(message.text);
      if (result) {
        const sql = result[1];
        pool.query(sql, (err, res) => {
          if (err) {
            bot.sendMessage(chat_id, "error:" + err, {
              reply_to_message_id: message_id,
              disable_notification: true,
            });
            console.error("error running query", err);
          }

          bot.sendMessage(chat_id, "success:" + JSON.stringify(res.rows), {
            reply_to_message_id: message_id,
            disable_notification: true,
          });
        });
      }
    }
  };

  bot.on("sticker", async message => {
    if (
      message.chat.type === "private" ||
      (message.reply_to_message &&
        message.reply_to_message.from.id === bot_id) ||
      Math.random() > 0.9
    ) {
      const { message_id, from, chat, sticker } = message;
      const { file_id, emoji } = sticker;
      const chat_id = chat.id;
      bot.sendChatAction(chat_id, "typing");

      await pool.query(
        "INSERT INTO stickers(file_id,emoji) VALUES ($1,$2) ON CONFLICT (file_id) DO NOTHING;",
        [file_id, emoji],
      );

      const q =
        Math.random() > 0.5
          ? "SELECT file_id FROM stickers where emoji=$1 ORDER BY RANDOM() LIMIT 1;"
          : "SELECT file_id FROM stickers where $1=$1 ORDER BY RANDOM() LIMIT 1;";

      const res = await pool.query(q, [emoji]);

      if (res.rows.length > 0) {
        setTimeout(
          () =>
            bot.sendSticker(chat_id, res.rows[0].file_id, {
              reply_to_message_id: message_id,
              disable_notification: true,
            }),
          2000 + Math.floor(Math.random() * 4000),
        );
      }
    }
  });

  bot.on("new_chat_members", async message => {
    const { message_id, from, chat, new_chat_members } = message;
    const chat_id = chat.id;
    if (new_chat_members.some(m => m.id === bot_id)) {
      bot.sendMessage(chat_id, welcome, {
        reply_to_message_id: message_id,
        disable_notification: true,
      });
      let invite_link;
      if ("username" in chat) {
        invite_link = "@" + chat.username;
      }
      if (
        "all_members_are_administrators" in message &&
        message.all_members_are_administrators === true
      ) {
        invite_link = await bot.exportChatInviteLink(chat_id);
      }
      bot.sendMessage(
        LOGCHATID,
        [
          `#invited\n团子被邀请加入了群组: ${chat.title}(群组id: ${chat.id})`,
          invite_link ? `链接: ${invite_link}` : "",
        ].join("\n"),
        {
          disable_notification: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "quit group",
                  callback_data: JSON.stringify(["quit_group", chat_id]),
                },
              ],
            ],
          },
        },
      );
    } else {
      if (Math.random() < 0.9) {
        bot.sendMessage(chat_id, getRandomFromArray(hello_string), {
          reply_to_message_id: message_id,
          disable_notification: true,
        });
      } else {
        const res = await pool.query(
          "SELECT file_id FROM stickers ORDER BY RANDOM() LIMIT 1;",
        );

        bot.sendSticker(chat_id, res.rows[0].file_id, {
          reply_to_message_id: message_id,
          disable_notification: true,
        });
      }
    }
  });

  const cool_down = new Map();

  bot.on("text", message => {
    const { message_id, from, chat } = message;
    const chat_id = chat.id;
    const bot_commands = get_entities({ message, type: "bot_command" });
    const task = [start, help, konachan, yandere, delete_sticker, ping];
    const admin_task = [reply, exec_SQL];

    let done = false;
    if (bot_commands.length > 0) {
      done = task.some(t => t({ chat_id, message, message_id, bot_commands }));

      if (!done && from.id == ownerID) {
        done = admin_task.some(t =>
          t({ chat_id, message, message_id, bot_commands }),
        );
      }
    }

    if (!done) {
      const url = get_entities({ message, type: "url" });
      if (url.length > 0) {
        let song_id;
        url.some(u => {
          const capture = /^https?:\/\/music\.163\.com(?:\/#)?(?:\/m)?\/song(?:\/|\?id=)(\d{5,15})/.exec(
            u,
          );
          if (capture) {
            song_id = capture[1];
            return true;
          }
          return false;
        });
        if (song_id !== undefined) {
          if (cool_down.get(chat_id)) {
            bot.sendMessage(chat_id, "技能冷却中...", {
              reply_to_message_id: message_id,
              disable_notification: true,
            });
          } else {
            cool_down.set(chat_id, true);
            setTimeout(() => {
              cool_down.delete(chat_id);
            }, cool_down_time * 1000);
            send_music({ song_id, chat_id, message_id });
          }
        }
      }
    }
  });

  bot.on("message", (message, metadata) => {
    console.log(JSON.stringify(message));
    const { message_id, chat } = message;
    const chat_id = chat.id;

    if (metadata.type === "text" && chat_id != LOGCHATID) {
      bot.sendMessage(
        LOGCHATID,
        `user:@${message.from.username}${
          "username" in chat ? "(@" + chat.username + ")" : ""
        }\n${message.text}`,
        {
          disable_notification: true,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "reply",
                  switch_inline_query_current_chat: `/reply ${chat_id} ${message_id}\n`,
                },
                {
                  text: "reply with sticker",
                  callback_data: JSON.stringify([
                    "reply_sticker",
                    chat_id,
                    message_id,
                  ]),
                },
                {
                  text: "forward",
                  callback_data: JSON.stringify([
                    "forward",
                    chat_id,
                    message_id,
                  ]),
                },
              ],
            ],
          },
        },
      );
    }
  });

  bot.on("callback_query", async ({ id, from, data }) => {
    const from_id = from.id;
    if (from_id == ownerID) {
      const parsed = JSON.parse(data);
      switch (parsed[0]) {
        case "forward":
          {
            const [_, chat_id, message_id] = parsed;
            bot.forwardMessage(chat_id, chat_id, message_id, {
              disable_notification: true,
            });
            bot.answerCallbackQuery(id, {
              text: "forward",
            });
          }

          break;

        case "reply_sticker":
          {
            const [_, chat_id, message_id] = parsed;

            const res = await pool.query(
              "SELECT file_id FROM stickers ORDER BY RANDOM() LIMIT 1;",
            );

            bot.sendSticker(chat_id, res.rows[0].file_id, {
              reply_to_message_id: message_id,
              disable_notification: true,
            });

            bot.sendSticker(LOGCHATID, res.rows[0].file_id, {
              disable_notification: true,
            });
          }

          break;

        case "quit_group":
          {
            const chat_id = parsed[1];
            const leave = await bot.leaveChat(chat_id);
            bot.answerCallbackQuery(id, {
              text: `${leave}`,
            });
          }
          break;
        default:
      }
    }
  });
})();
