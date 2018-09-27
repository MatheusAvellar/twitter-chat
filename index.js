const express = require("express");
const app = express();
const http = require("http").Server(app);

const PORT = 8080;

const io = require("socket.io")(http);
const port = process.env.PORT || PORT;

const keys = require("./keys");
const Twit = require("twit");

const T = new Twit(keys);

app.get("/", function (req, res) {
    res.sendFile(__dirname + "/index.html");
});
app.get("/socket.io.js", function (req, res) {
    res.sendFile(__dirname + "/public/socket.io-1.2.0.js");
});
app.get("/style.css", function (req, res) {
    res.sendFile(__dirname + "/public/style.css");
});

let online = [];

io.on("connection", function(socket) {
    const UID = socket.id;

    io.clients((error, clients) => {
        if(error) throw error;
        online = clients;
        console.log(UID + " connected — " + online.length + " online");
        io.emit("chat", {
            from: "system",
            msg: UID + " connected — " + online.length + " online",
            type: "text",
            uid: UID
        });
    });


    socket.on("chat", function(data) {
        console.log(data.from + " sent a " + data.type);
        io.emit("chat", data);
    });

    socket.on("disc", function(data) {
        io.clients((error, clients) => {
            if(error) throw error;
            online = clients;
            console.log(data.uid + " disconnected — " + online.length + " online");
            io.emit("chat", {
                from: "system",
                msg: data.uid + " disconnected — " + online.length + " online",
                type: "text"
            });
        });
    });
});

function getGET(query, name) {
   if(name=(new RegExp("[?&]"+encodeURIComponent(name)+"=([^&]*)")).exec(query))
      return decodeURIComponent(name[1]).trim();
}

app.get("/tweets", function(req, res) {
    if(!req._parsedUrl.search)
        return res.sendStatus(400);

    const UID = getGET(req._parsedUrl.search, "uid");
    const query = getGET(req._parsedUrl.search, "q");

    if(!UID || !query)
        return res.sendStatus(400);

    const v = searching(UID, query);
    v.then(k => {
        if(k === "" || !k)
            k = "<output>No tweets found :(</output>";
        res.send(`${k}`);
    });

});

async function searching(uid, query) {
    if(!query || query.length <= 0 || query.length > 20)
        return "";

    const _q = "\"" + query + "\" -filter:media -filter:retweets";
    console.log(uid + " is searching for " + _q);
    const ret = await getTweets(query);
    return ret;
}

function getTweets(query) {
    return new Promise(resolve => {
        // In theory, filter out all types of media (image/video/etc) and retweets
        const search = {
            tweet_mode: "extended", // Don't truncate results
            q: query,               // Query string
            count: 10               // How many results to display
        };

        let out = "";  // Output string

        T.get("search/tweets", search, function callback(err, data, response) {
            const tweets = data.statuses;
            const _l = tweets.length;
            for(var i = 0; i < _l; i++) {
                // Create a Date object of the tweet date
                const d = new Date(tweets[i].created_at);
                // Build a Month Day, Year string (e.g. June 3, 2018)
                const datestr = d.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                });

                // ".text" means it's truncated. It shouldn't ever appear,
                // but if it does (and ".full_text" doesn't), we'll use it
                let text = tweets[i].full_text || tweets[i].text;

                for(let j = 0, l = tweets[i].entities.user_mentions.length; j < l; j++) {
                    const mention = tweets[i].entities.user_mentions[j];
                    const username = xss(mention.screen_name);
                    text = text.split("@"+mention.screen_name)
                        // FIXME: This will present issues if there's multiple
                        //mentions for the same person!
                        .join(`<span class='mention' href='https://twitter.com/${username}' target='_blank'>@${username}</span>`);
                }

                for(let j = 0, l = tweets[i].entities.hashtags.length; j < l; j++) {
                    const hashtag = tweets[i].entities.hashtags[j];
                    const hashtag_text = xss(hashtag.text);
                    text = text.split("#"+hashtag.text)
                        // FIXME: This will present issues if there's multiple
                        // of the same hashtag!
                        .join(`<span class='hashtag' href='https://twitter.com/hashtag/${hashtag_text}' target='_blank'>#${hashtag_text}</span>`);
                }

                for(let j = 0, l = tweets[i].entities.urls.length; j < l; j++) {
                    const cur_url = tweets[i].entities.urls[j];
                    text = text.split(cur_url.url)
                        .join(`<span class='url' href='${xss(cur_url.expanded_url)}' target='_blank'>${xss(cur_url.display_url)}</span>`);
                }

                const tweet_html = `<blockquote class='twitter-tweet' onclick='send(this);'>
                    <div class='tweet-header'>
                        <img class='avatar' src='${tweets[i].user.profile_image_url}'/>
                        <span class='name'>${tweets[i].user.name}</span>
                        <span class='username'>${tweets[i].user.screen_name}</span>
                    </div>
                    <div class='tweet-body'>
                        <p class='tweet'>${text}</p>
                        <a target='_blank' href='https://twitter.com/${tweets[i].user.screen_name}/status/${tweets[i].id_str}'>
                            <time datetime='${d.toISOString()}'>
                                ${(""+d.getHours()).padStart(2,0)}:${(""+d.getMinutes()).padStart(2,0)}
                                - ${datestr}
                            </time>
                        </a>
                    </div>
                </blockquote>`;

                out += tweet_html;
            }
            resolve(out);
        });
    });
}

function replaceAt(pos,str,insert) {
    const new_str = (
        str.substring(0, Math.max(pos[0],0))
        + insert
        + str.substring(Math.min(pos[1], str.length), str.length)
    );
    return new_str;
}

function xss(str) {
    return str.replace(/&/g,"&amp;").replace(/>/g,"&gt;").replace(/</g,"&lt;");
}

http.listen(PORT, function() {
    console.clear();
    console.log("Listening on *:" + PORT + "\n");
});