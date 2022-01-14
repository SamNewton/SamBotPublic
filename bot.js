'use strict';
const Discord = require('discord.js');
const client = new Discord.Client();
const fs = require("fs");
var cron = require('node-cron');
const Entities = require('html-entities').AllHtmlEntities;
const entities = new Entities();
const bodyParser = require('body-parser');
const request = require('request');
var express = require('express');
var cors = require('cors');
const https = require('https');
var path = require('path');
var app = express();

var money = require("./db/money.json");
var daily = require("./db/daily.json");
var trivia = require("./db/trivia.json");
var level = require("./db/level.json");
var auth = require("./db/auth.json");
var names = require("./db/names.json");

var cooldowns = {
    trivia: new Set(),
    coinflip: new Set()
};

var cfgImages = {
    prestiges: ["https://i.imgur.com/MH7RfLC.png", "https://i.imgur.com/X48ZOn8.png", "https://i.imgur.com/l1RjApV.png", "https://i.imgur.com/T0iX2Oa.png", "https://i.imgur.com/HGVxJ1V.png", "https://i.imgur.com/cjEd156.png", "https://i.imgur.com/Yn0VBuB.png", "https://i.imgur.com/jt1EmuS.png", "https://i.imgur.com/oVWZofR.png", "https://i.imgur.com/luiYQNc.png", "https://i.imgur.com/eKFcHba.png", "https://i.imgur.com/Vs3nZ6Q.png", "https://i.imgur.com/bFqIkiP.png", "https://i.imgur.com/4tAJ0f6.png", "https://i.imgur.com/lWbUX1T.png", "https://i.imgur.com/PSbMPkf.png"]
}

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

app.use('/dashboard/', express.static('dashboard'));
app.use('/', express.static('home'));

app.post('/api/verify/', function(req, res) {
    const hook = new Discord.WebhookClient('x', 'x');
    hook.send('**API CALL:** /api/verify/');
    var data = req.body;
    var uid = data["auth"].split("_")[0];
    var token = data["auth"].split("_")[1];
    var amt = Number(data["amt"]);
    if(verifyAuth(uid, token)) {
        res.json({success: true});
    } else {
        res.json({success: false});
    }
});

app.post('/api/coinflip/', function(req, res) {
    const hook = new Discord.WebhookClient('x', 'x');
    hook.send('**API CALL:** /api/coinflip/');
    var data = req.body;
    var uid = data["auth"].split("_")[0];
    var token = data["auth"].split("_")[1];
    var amt = Number(data["amt"]);
    if(verifyAuth(uid, token)) {
        if(amt > 0) {
            if(money[uid] >= amt) {
                // Remove money beforehand                    
                updateJsons();
                var flip = Math.round(Math.random());
                if(flip == 0) {
                    money[uid] -= amt;
                    updateJsons();
                    res.json({cfStatus: "lost", amt: amt, balance: money[uid], formattedBalance: moneyWithCommas(money[uid])});    
                } else {
                    money[uid] += amt;
                    updateJsons();
                    res.json({cfStatus: "won", amt: amt, balance: money[uid], formattedBalance: moneyWithCommas(money[uid])}); 
                }
            } else {
                res.json({error: true, message: "Insufficient funds"});
            } 
        } else {
            res.json({error: true, message: "Gambled amount must be greater than $0"});
        }
        res.json({test: true});
    } else {
        res.json({error: true, message: "Authentication failed"});
    }
});

app.post('/api/daily/', function(req, res) {
    const hook = new Discord.WebhookClient('x', 'x');
    hook.send('**API CALL:** /api/daily/');
    var data = req.body;
    var uid = data["auth"].split("_")[0];
    var token = data["auth"].split("_")[1];
    if(verifyAuth(uid, token)) {
        if(daily[uid] == 0) {
            var rand = Math.floor(Math.random() * 100) + 1;
            var winningReward = 0;
            if(rand > 0 && rand <= 50) {
                winningReward = 500;
            } else if(rand > 50 && rand <= 75) {
                winningReward = 1000;
            } else if(rand > 75 && rand <= 90) {
                winningReward = 2000;
            } else if(rand > 90 && rand <= 95) {
                winningReward = 5000;
            } else if(rand > 95 && rand <= 97) {
                winningReward = 10000;
            } else if(rand > 97 && rand <= 99) {
                winningReward = 25000;
            } else if(rand >= 100) {
                winningReward = 50000;
            }

            winningReward *= (1 + level[uid]["resets"]);
            
            money[uid] += winningReward;
            daily[uid] = 1;
            updateJsons();
            res.json({
                amtWon: winningReward,
                formattedAmtWon: "$" + moneyWithCommas(winningReward)
            });
        } else {
            res.json({
                error: true,
                message: "Daily rewards already claimed."
            });
        }
        
    } else {
        res.json({error: true, message: "Authentication failed"});
    }
});

app.get('/api/user/:uid/', function(req, res) {
    const hook = new Discord.WebhookClient('x', 'x');
    hook.send('**API CALL:** /api/user/:uid');
    if(money[req.params.uid] != null) {
        res.json({
            rawBalance: money[req.params.uid], 
            formattedBalance: "$" + moneyWithCommas(money[req.params.uid]),
            level: level[req.params.uid]["rank"],
            prestige: level[req.params.uid]["prestige"],
            resets: level[req.params.uid]["resets"],
            name: names[req.params.uid]
        });
    } else {
        res.json({
            error: true,
            message: "user not found"
        });
    }
    
    
});

const httpsServer = https.createServer({
    key: fs.readFileSync(''),
    cert: fs.readFileSync(''),
  }, app);

  httpsServer.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    
});

client.on("guildMemberAdd", function(member) {   
    checkUser(member.id);
});

client.on('message', message => {
    if (!message.channel.name) return;

    if(message.author.bot) return;

    checkUser(message.author.id);

    if(names[message.author.id] != message.author.tag) {
        names[message.author.id] = message.author.tag;
    }

    updateJsons();

    var messageWorth = level[message.author.id]["rank"] * 10;

    messageWorth *= (1 + level[message.author.id]["resets"]);

    money[message.author.id] += messageWorth;
    updateJsons();
    
    var msg = message.content.toLowerCase().split(" ");

    if(trivia[message.author.id] != null) {
        if(message.content.toLowerCase() == "a") {
            if(trivia[message.author.id]["answer"] == "A") {
                message.channel.send("<@" + message.author.id + "> That was correct, $" + trivia[message.author.id]["reward"] + " has been added to your account");
                
                money[message.author.id] += trivia[message.author.id]["reward"];
                delete trivia[message.author.id];
                updateJsons();
            } else {
                message.channel.send("<@" + message.author.id + "> That was incorrect sorry... The correct answer was " + trivia[message.author.id]["answer"]);
                
                delete trivia[message.author.id];
                updateJsons();
            }
        } else if(message.content.toLowerCase() == "b") {
            if(trivia[message.author.id]["answer"] == "B") {
                message.channel.send("<@" + message.author.id + "> That was correct, $" + trivia[message.author.id]["reward"] + " has been added to your account");
                
                money[message.author.id] += trivia[message.author.id]["reward"];
                
                delete trivia[message.author.id];
                updateJsons();
            } else {
                message.channel.send("<@" + message.author.id + "> That was incorrect sorry... The correct answer was " + trivia[message.author.id]["answer"]);
                
                delete trivia[message.author.id];
                updateJsons();
            }
        } else if(message.content.toLowerCase() == "c") {
            if(trivia[message.author.id]["answer"] == "C") {
                message.channel.send("<@" + message.author.id + "> That was correct, $" + trivia[message.author.id]["reward"] + " has been added to your account");
                
                money[message.author.id] += trivia[message.author.id]["reward"];
                
                
                delete trivia[message.author.id];
                updateJsons();
            } else {
                message.channel.send("<@" + message.author.id + "> That was incorrect sorry... The correct answer was " + trivia[message.author.id]["answer"]);
                delete trivia[message.author.id];
                updateJsons();
            }
        } else if(message.content.toLowerCase() == "d") {
            if(trivia[message.author.id]["answer"] == "D") {
                message.channel.send("<@" + message.author.id + "> That was correct, $" + trivia[message.author.id]["reward"] + " has been added to your account");
                
                money[message.author.id] += trivia[message.author.id]["reward"];
                
                delete trivia[message.author.id];
                updateJsons();
            } else {
                message.channel.send("<@" + message.author.id + "> That was incorrect sorry... The correct answer was " + trivia[message.author.id]["answer"]);
                
                
                delete trivia[message.author.id];
                updateJsons();
            }
        }
    }
    
    /*
        USER COMMANDS
    */
    if(msg[0] == "!money" || msg[0] == "!bank" || msg[0] == "!balance") {
        const embed = new Discord.MessageEmbed()
            .setColor('#00AF05')
            .setAuthor("Bank Account")
            .setDescription(message.author.tag)
            .setThumbnail("https://i.imgur.com/KtXHn0L.png")
            .addField('Total Balance', "$" + moneyWithCommas(money[message.author.id]));

        message.channel.send(embed);
    } else if(msg[0] == "!coinflip" || msg[0] == "!cf") {
        if(cooldowns.coinflip.has(message.author.id)) {
            return;
        }

        cooldowns.coinflip.add(message.author.id);
        setTimeout(function() {
            cooldowns.coinflip.delete(message.author.id);
        }, 2000);

        if(msg[1] != null) {
            var flip = Math.round(Math.random());
            var amt = 0;
            if(msg[1] == "all") {
                amt = money[message.author.id];
            } else {
                amt = Math.floor(Number(msg[1]));
            }
            if(amt > 0) {
                if(money[message.author.id] >= amt) {
                    // Remove money beforehand
                    
                    updateJsons();
                    message.channel.send("[<@" + message.author.id + ">] Flipping a coin.... :red_circle::green_circle::red_circle::green_circle::red_circle::green_circle:").then((msg)=> {
                        if(flip == 0) {
                            money[message.author.id] -= amt;
                            
                            
                            updateJsons();
                            
                            
                        } else {
                            money[message.author.id] += amt;
                            updateJsons();
                        }
                        setTimeout(function(){
                            if(flip == 0) {
                                msg.edit("[<@" + message.author.id + ">] You flipped a :red_circle: -$" + moneyWithCommas(amt));
                                
                            } else {
                                msg.edit("[<@" + message.author.id + ">] You flipped a :green_circle: +$" + moneyWithCommas(amt));
                                
                            }
                        }, 2000);
                    });
                } else {
                    message.channel.send("<@" + message.author.id + "> seems like you don't have that much money to spend...");
                } 
            } else {
                message.channel.send("<@" + message.author.id + "> you need to spend more than $0.");
            }
        }
    } else if(msg[0] == "!daily") {
        if(daily[message.author.id] == 0) {
            var rand = Math.floor(Math.random() * 100) + 1;
            var winningReward = 0;
            if(rand > 0 && rand <= 50) {
                winningReward = 500;
            } else if(rand > 50 && rand <= 75) {
                winningReward = 1000;
            } else if(rand > 75 && rand <= 90) {
                winningReward = 2000;
            } else if(rand > 90 && rand <= 95) {
                winningReward = 5000;
            } else if(rand > 95 && rand <= 97) {
                winningReward = 10000;
            } else if(rand > 97 && rand <= 99) {
                winningReward = 25000;
            } else if(rand >= 100) {
                winningReward = 50000;
            }

            winningReward *= (1 + level[message.author.id]["resets"]);


            message.channel.send("[<@" + message.author.id + ">] Opening your daily case.... :key:").then((msg)=> {
                setTimeout(function(){
                    msg.edit("[<@" + message.author.id + ">] Your daily reward is +$" + moneyWithCommas(winningReward));
                }, 2000)
            });
            money[message.author.id] += winningReward;
            daily[message.author.id] = 1;
            updateJsons();
        } else {
            message.channel.send("<@" + message.author.id + "> you have already claimed your daily rewards");
        }
    } else if(msg[0] == "!trivia") {
        if(cooldowns.trivia.has(message.author.id)) {
            return;
        }

        if(trivia[message.author.id] != null) {
            message.channel.send("<@" + message.author.id + "> you already have an active trivia game.");
            return;
        }

        cooldowns.trivia.add(message.author.id);
        setTimeout(function() {
            cooldowns.trivia.delete(message.author.id);
        }, 2000);

        var difficultyRand = Math.floor(Math.random() * 3) + 1;
        var reward = 0;
            var difficulty = "hard";
            if(difficultyRand = 1) {
                difficulty = "easy";
            } else if(difficultyRand = 2) {
                difficulty = "medium";
            }
            
            var triviaMult = 1
            if(level[message.author.id]["rank"] >= 10) {
                triviaMult = Math.floor(level[message.author.id]["rank"] / 10);
            }
            
            reward = (1000 * triviaMult) + (level[message.author.id]["prestige"] * 2000);

            reward *= (1 + level[message.author.id]["resets"]);
                        
            request('https://opentdb.com/api.php?amount=1&difficulty=' + difficulty + '&type=multiple', function (error, response, body) {
                if(response.statusCode == 200) {
                    var randAnswer = Math.floor(Math.random() * 4);
                    var triviaRes = JSON.parse(response.body);
                    var question = triviaRes.results[0];
                    var questionStr = "[<@" + message.author.id + ">]\n**Category:** " + question.category + "\n**Question:** " + entities.decode(question.question) + "\n";
                    var incorrectAnswerCount = 0;
                    if(randAnswer == 0) {
                        trivia[message.author.id] = {
                            "answer": "A",
                            "reward": reward
                        };
                        updateJsons();
                        questionStr += "**A. **" + entities.decode(question.correct_answer) + "\n";
                    } else {
                        questionStr += "**A. **" + entities.decode(question.incorrect_answers[incorrectAnswerCount]) + "\n";
                        incorrectAnswerCount++;
                    }
                    
                    if(randAnswer == 1) {
                        trivia[message.author.id] = {
                            "answer": "B",
                            "reward": reward
                        };
                        updateJsons();
                        questionStr += "**B. **" + entities.decode(question.correct_answer) + "\n";
                    } else {
                        questionStr += "**B. **" + entities.decode(question.incorrect_answers[incorrectAnswerCount]) + "\n";
                        incorrectAnswerCount++;
                    }
                    
                    if(randAnswer == 2) {
                        trivia[message.author.id] = {
                            "answer": "C",
                            "reward": reward
                        };
                        updateJsons();
                        questionStr += "**C. **" + entities.decode(question.correct_answer) + "\n";
                    } else {
                        questionStr += "**C. **" + entities.decode(question.incorrect_answers[incorrectAnswerCount]) + "\n";
                        incorrectAnswerCount++;
                    }
                    
                    if(randAnswer == 3) {
                        trivia[message.author.id] = {
                            "answer": "D",
                            "reward": reward
                        };
                        updateJsons();
                        questionStr += "**D. **" + entities.decode(question.correct_answer) + "\n";
                    } else {
                        questionStr += "**D. **" + entities.decode(question.incorrect_answers[incorrectAnswerCount]) + "\n";
                        incorrectAnswerCount++;
                    }

                    message.channel.send(questionStr);
                    
                } else {
                    message.channel.send("There was an issue getting a trivia question.");
                }
            });     
    } else if(msg[0] == "!top") {
        var sortable = [];
        for (var tmpUser in  money) {
            if(tmpUser != "258747846218481664") {
                sortable.push([tmpUser, money[tmpUser]]);
            }
        }

        sortable.sort(function(a, b) {
            return b[1] - a[1];
        });

        var richestUsers = [];
        for(var i = 0; i <= 10; i++) {
            richestUsers.push("\t" + names[sortable[i][0]] + " $" + moneyWithCommas(money[sortable[i][0]]) + "");
            
        }
            const embed = new Discord.MessageEmbed()
                    .setColor('#00AF05')
                    .setAuthor("Top 10 Richest")
                    .setThumbnail("https://i.imgur.com/KtXHn0L.png")
                    .addField("\u200b", "**#1**" + richestUsers[0])
                    .addField("\u200b", "**#2**" + richestUsers[1])
                    .addField("\u200b", "**#3**" + richestUsers[2])
                    .addField("\u200b", "**#4**" + richestUsers[3])
                    .addField("\u200b", "**#5**" + richestUsers[4])
                    .addField("\u200b", "**#6**" + richestUsers[5])
                    .addField("\u200b", "**#7**" + richestUsers[6])
                    .addField("\u200b", "**#8**" + richestUsers[7])
                    .addField("\u200b", "**#9**" + richestUsers[8])
                    .addField("\u200b", "**#10**" + richestUsers[9]);

            message.channel.send(embed);
    
    } else if(msg[0] == "!help") {
        const embed = new Discord.MessageEmbed()
            .setColor('#00AF05')
            .setAuthor("Commands")
            .setThumbnail("https://i.imgur.com/Vq9N4sS.png")
            .addField("Money Commands", "!bank\n!top")
            .addField("Level Commands", "!leaderboard\n!level\n!levelup\n!buylevel\n!prestige\n!reset")
            .addField("Gambling Commands", "!coinflip\n")
            .addField("Earn Money", "!trivia\n!daily")
            .addField("Website", "!login");

        message.channel.send(embed);        
    } else if(msg[0] == "!level") {
        const embed = new Discord.MessageEmbed()
            .setColor('#00AF05')
            .setAuthor(message.author.tag)
            .setThumbnail(cfgImages.prestiges[level[message.author.id]["prestige"]])
            .addField("Level", level[message.author.id]["rank"], true)
            .addField("Prestige", level[message.author.id]["prestige"], true);

        message.channel.send(embed);
    } else if(msg[0] == "!buylevel") {
        if(msg[1] != null) {
            var desiredLevel = Number(msg[1]);
            if(desiredLevel > 1 && desiredLevel < 51) {
                if(desiredLevel > level[message.author.id]["rank"]) {
                    if(msg[2] != null) {
                        if(msg[2] == "confirm") {
                            var currLevel = level[message.author.id]["rank"];
                        
                            var costToFifty = 0;
                            for(var i = currLevel; i <= desiredLevel; i++) {
                                costToFifty += Math.floor((i / 0.14) * (i / 0.14));
                            }

                            if(money[message.author.id] >= costToFifty) {
                                money[message.author.id] -= costToFifty;
                                level[message.author.id]["rank"] = desiredLevel;
                                updateJsons();
                                message.channel.send("[<@" + message.author.id + ">] You bought level " + desiredLevel + ".");
                            } else {
                                message.channel.send("[<@" + message.author.id + ">] You don't have enough money for that");
                            }

                            
                        }
                    } else {
                        var currLevel = level[message.author.id]["rank"];
                        
                        var costToFifty = 0;
                        for(var i = currLevel; i <= desiredLevel; i++) {
                            costToFifty += Math.floor((i / 0.14) * (i / 0.14));
                        } 

                        message.channel.send("[<@" + message.author.id + ">] It will cost you $" + moneyWithCommas(costToFifty) + " to level up. Please type **!buylevel <level> confirm**");
                        
                    }
                } else {
                    message.channel.send("[<@" + message.author.id + ">] You must pick a level higher than your current level");
                }
            } else {
                message.channel.send("[<@" + message.author.id + ">] You must pick a level between 2 and 50");
            }
        } else if(msg[1] != null && msg[2] != null) {
            if(msg[1] == "confirm") {
                var nextLevel = level[message.author.id]["rank"] + 1;
                if(nextLevel == 51) {
                    message.channel.send("[<@" + message.author.id + ">] You are already at level 50. You can choose to !prestige to continue leveling up.");
                } else {
                    var lvlCost = Math.floor((nextLevel / 0.14) * (nextLevel / 0.14));
                    if(money[message.author.id] >= lvlCost) {
                        level[message.author.id]["rank"]++;
                        money[message.author.id] -= lvlCost;
                        updateJsons();
                        message.channel.send("[<@" + message.author.id + ">] You have just been promoted to Level " + level[message.author.id]["rank"]);
                    } else {
                        message.channel.send("[<@" + message.author.id + ">] You don't have enough money to do this.");
                    }
                    
                }
            } 
        } else {
            message.channel.send("[<@" + message.author.id + ">] Correct format: !buylevel **<desired level>**");
        }
        
    
    } else if(msg[0] == "!levelup") {
        if(msg[1] != null) {
            if(msg[1] == "confirm") {
                var nextLevel = level[message.author.id]["rank"] + 1;
                if(nextLevel >= 51) {
                    message.channel.send("[<@" + message.author.id + ">] You are already at level 50. You can choose to !prestige to continue leveling up.");
                } else {
                    var lvlCost = Math.floor((nextLevel / 0.14) * (nextLevel / 0.14));
                    if(money[message.author.id] >= lvlCost) {
                        level[message.author.id]["rank"]++;
                        money[message.author.id] -= lvlCost;
                        updateJsons();
                        message.channel.send("[<@" + message.author.id + ">] You have just been promoted to Level " + level[message.author.id]["rank"]);
                    } else {
                        message.channel.send("[<@" + message.author.id + ">] You don't have enough money to do this.");
                    }
                    
                }
            }
        } else {
            var nextLevel = level[message.author.id]["rank"] + 1;
            if(nextLevel == 51) {
                message.channel.send("[<@" + message.author.id + ">] You are already at level 50. You can choose to !prestige to continue leveling up.");
            } else {
                var lvlCost = (nextLevel / 0.1) * (nextLevel / 0.1);
                message.channel.send("[<@" + message.author.id + ">] It will cost you $" + moneyWithCommas(lvlCost) + " to level up. Please type **!levelup confirm**");
            }
        }
        
        
    } else if(msg[0] == "!prestige") {
        if(level[message.author.id]["prestige"] < 15) {
            if(msg[1] != null) {
                if(msg[1] == "confirm") {
                    if(level[message.author.id]["rank"] == 50) {
                        level[message.author.id]["prestige"]++;
                        level[message.author.id]["rank"] = 1;
                        updateJsons();
                        message.channel.send("[<@" + message.author.id + ">] You have just prestiged to Prestige " + level[message.author.id]["prestige"]);
                    } else {
                        message.channel.send("[<@" + message.author.id + ">] You must be level 50 to prestige.");
                    }
                }
            } else {
                if(level[message.author.id]["rank"] == 50) {
                    message.channel.send("[<@" + message.author.id + ">] To confirm you want to prestige and reset your level to 1, type **!prestige confirm**");
                } else {
                    message.channel.send("[<@" + message.author.id + ">] You must be level 50 to prestige.");
                }
            }
        } else {
            message.channel.send("[<@" + message.author.id + ">] You are already max prestige. If you want to reset type !reset");
        }
    } else if(msg[0] == "!leaderboard") {
        var sortable = [];
        for (var user in level) {
            checkUser(user);
            var totalLevel = ((level[user]["prestige"] * 50) + level[user]["rank"]) + (level[user]["resets"] * 800);
            
                totalLevel += (level[user]["resets"] * 800);
            
            if(user != "258747846218481664") {
                sortable.push([user, totalLevel]);
            }
            
        }

        sortable.sort(function(a, b) {
            return b[1] - a[1];
        });

        var richestUsers = [];
        for(var i = 0; i < 10; i++) {
            var userid = sortable[i][0];
            var totalLevelStr = ((level[userid]["prestige"] * 50) + level[userid]["rank"]) + (level[userid]["resets"] * 800);
            richestUsers.push("\t" + names[sortable[i][0]] + " Level " + totalLevelStr);
            
        }
            const embed = new Discord.MessageEmbed()
                    .setColor('#00AF05')
                    .setAuthor("Highest Levels")
                    .setThumbnail("https://i.imgur.com/KtXHn0L.png")
                    .addField("\u200b", "**#1**" + richestUsers[0])
                    .addField("\u200b", "**#2**" + richestUsers[1])
                    .addField("\u200b", "**#3**" + richestUsers[2])
                    .addField("\u200b", "**#4**" + richestUsers[3])
                    .addField("\u200b", "**#5**" + richestUsers[4])
                    .addField("\u200b", "**#6**" + richestUsers[5])
                    .addField("\u200b", "**#7**" + richestUsers[6])
                    .addField("\u200b", "**#8**" + richestUsers[7])
                    .addField("\u200b", "**#9**" + richestUsers[8])
                    .addField("\u200b", "**#10**" + richestUsers[9]);

            message.channel.send(embed);
    } else if(msg[0] == "!reset") {
        if(msg[1] == null) {
            message.channel.send("[<@" + message.author.id + ">] You have reset " + level[message.author.id]["resets"] + " times. Type **!reset confirm**  to reset your prestige to 0 and level to 1. This will also reset your money to $0.");
        } else {
            if(msg[1] == "confirm") {
                if(level[message.author.id]["prestige"] == 15 && level[message.author.id]["rank"] == 50) {
                    if(level[message.author.id]["resets"] <= 9) {
                        level[message.author.id]["rank"] = 1;
                        level[message.author.id]["prestige"] = 0;
                        money[message.author.id] = 0;
                        level[message.author.id]["resets"]++;
                        updateJsons();
                        message.channel.send("[<@" + message.author.id + ">] Your level has been reset. ");
                    } else {
                        message.channel.send("[<@" + message.author.id + ">] You have reset the max amount of times.");
                    }
                    
                } else {
                    message.channel.send("[<@" + message.author.id + ">] You must be Prestige 15 Level 50 in order to reset.");
                }
            } else {
                message.channel.send("[<@" + message.author.id + ">] You have reset " + level[message.author.id]["resets"] + " times. Type **!reset confirm**  to reset your prestige to 0 and level to 1. This will also reset your money to $0.");
            }
        }
    } else if(msg[0] == "!resets") {
        message.channel.send("[<@" + message.author.id + ">] You have reset " + level[message.author.id]["resets"] + " times");
    } else if(msg[0] == "!login") {
        var rand=()=>Math.random(0).toString(36).substr(2);
        var token=(length)=>(rand()+rand()+rand()+rand()).substr(0,length);
        var myToken = token(100);
        auth[message.author.id] = myToken;
        message.author.send("https://sambot.dev/dashboard/?auth=" + message.author.id + "_" + myToken);
        message.delete();
    } else if(msg[0] == "!auth") {
        var rand=()=>Math.random(0).toString(36).substr(2);
        var token=(length)=>(rand()+rand()+rand()+rand()).substr(0,length);
        var myToken = token(100);
        auth[message.author.id] = myToken;
        message.author.send("Your auth token is: `" + message.author.id + "_" + myToken + "`");
        message.delete();
    } else if(msg[0] == "!invite") {
        message.channel.send("Add SamBot to your discord: https://sambot.dev");
    }

    // Admin Only Commands
    if(message.author.id == "x" || message.author.id == "x") {
        if(msg[0] == "!restart") {
            message.react("✅");
            setTimeout(function() {
                process.exit(1);
            }, 2000);
        } else if(msg[0] == "!avatar") {
            if(msg[1] != null) {
                client.user.setAvatar(msg[1])
                    .then(function() {
                        message.reply("Avatar set.")
                    })
                    .catch(function() {
                        message.reply("There was an issue setting that avatar.")
                    });
            }
        } else if(msg[0] == "!generate") {
            if(msg[1] != null) {
                var amt = Math.floor(Number(msg[1]));
                if(amt > 0) {
                    money[message.author.id] += amt;
                    updateJsons();
                    message.channel.send("[<@" + message.author.id + ">] You have generated $" + moneyWithCommas(amt));
                }
            }
        } else if(msg[0] == "!give") {
            if(msg[1] != null && msg[2] != null) {
                var user = message.mentions.users.first();
                if(user != null) {
                    checkUser(user.id);
                    var amt = Math.floor(Number(msg[2]));
                    if(amt > 0) {
                        if(money[message.author.id] >= amt) {
                            money[message.author.id] -= amt;
                            money[user.id] += amt;
                            updateJsons();
                            message.channel.send("<@" + message.author.id + "> you have given $" + amt + " to <@" + user.id + ">");
                        } else {
                            message.channel.send("<@" + message.author.id + "> seems like you don't have that much money to give...");
                        } 
                    } else {
                        message.channel.send("<@" + message.author.id + "> you have to give more than $0...");
                    }
                } else {
                    message.reply("There was an error using that command...")
                }
            } else {
                message.channel.send("<@" + message.author.id + "> Correct format: !give <@user> <amount>");
            }
        } else if(msg[0] == "!setlevel") {
            if(msg[1] != null) {
                var amt = Math.floor(Number(msg[1]));
                if(amt > 0 && amt < 51) {
                    level[message.author.id]["rank"] = amt;
                    updateJsons();
                    message.channel.send("[<@" + message.author.id + ">] You have been set to level " + amt);
                }
            }
        } else if(msg[0] == "!setprestige") {
            if(msg[1] != null) {
                var amt = Math.floor(Number(msg[1]));
                if(amt >= 0 && amt <= 15) {
                    level[message.author.id]["prestige"] = amt;
                    updateJsons();
                    message.channel.send("[<@" + message.author.id + ">] You have been set to prestige " + amt);
                }
            }
        } else if(msg[0] == "!setresets") {
            if(msg[1] != null) {
                var amt = Math.floor(Number(msg[1]));
                if(amt >= 0 && amt <= 10) {
                    level[message.author.id]["resets"] = amt;
                    updateJsons();
                    message.channel.send("[<@" + message.author.id + ">] You have set your resets to " + amt);
                }
            }
        } else if(msg[0] == "!backup") {
            message.delete();
            message.channel.send({
                files: [
                {
                  attachment: './db/money.json',
                  name: 'money.json'
                },
                {
                    attachment: './db/level.json',
                    name: 'level.json'
                }
                ]
              })
                .then(console.log)
                .catch(console.error);
        } else if(msg[0] == "!servers") {
            message.channel.send("SamBot is currently in " + client.guilds.cache.array().length + " servers.")
        }
    }
});

client.login("x");

cron.schedule('0 0 * * *', () => {
    daily = {};
    auth = {};

    updateJsons(); 
});

function checkUser(id) {
    if(money[id] == null) {
        money[id] = 0;
    }

    if(daily[id] == null) {
        daily[id] = 0;
    }

    if(level[id] == null) {
        level[id] = {
            rank: 1,
            prestige: 0,
            resets: 0
        }
    }

    if(level[id]["resets"] == null) {
        level[id]["resets"] = 0;
    }

    if(level[id]["prestige"] == null) {
        level[id]["prestige"] = 0;
    }

    if(names[id] == null) {
        names[id] = "user#0001";
    }
    
    updateJsons();
}

function updateJsons() {
    fs.writeFileSync("./db/money.json", JSON.stringify(money));
    fs.writeFileSync("./db/daily.json", JSON.stringify(daily));
    fs.writeFileSync("./db/trivia.json", JSON.stringify(trivia));
    fs.writeFileSync("./db/level.json", JSON.stringify(level));
    fs.writeFileSync("./db/auth.json", JSON.stringify(auth));
    fs.writeFileSync("./db/names.json", JSON.stringify(names));
}

function moneyWithCommas(x) {
    return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function verifyAuth(uid, token) {
    if(auth[uid] != null) {
        if(auth[uid] == token) {
            return true;
        }
    }

    return false;
}
