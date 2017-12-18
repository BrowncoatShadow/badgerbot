require('dotenv').config()
const Eris = require('eris')
const tmi = require('tmi.js')
const TwitchPS = require('twitchps')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

// Return a sanitized version of a list of channel names.
function sanitizeChannelList (arr) {
  var list = []

  // Proper format is lowercase with hash prefix.
  arr.forEach(c => {
    if (!c.match(/^#/)) c = '#' + c
    list.push(c.toLowerCase())
  })

  // Return list without duplicates.
  return list.filter((a, b) => list.indexOf(a) === b)
}

// Return the channel as a PubSub topic.
function channelTopic (chan) {
  return {topic: `video-playback.${chan.replace(/^#/g, '')}`}
}

const db = low(new FileSync('db.json'))
db.defaults({ channels: [] }).write()

// Main discord bot.
const bot = new Eris.CommandClient(process.env.DISCORD_TOKEN, {}, {
  description: 'I do things that make Sems happy.',
  name: '<Badgerbot>',
  owner: 'BrowncoatShadow',
  prefix: (process.env.NODE_ENV === 'production') ? '.' : ','
})

// Twitch chat client that watches chat channels.
const client = new tmi.client({ // eslint-disable-line new-cap
  options: {
    debug: (process.env.NODE_ENV !== 'production')
  },
  connection: {
    cluster: 'aws',
    reconnect: true
  },
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_TOKEN
  },
  channels: db.get('channels').value()
})

// Twich PubSub client to capture streaming start/end events.
// Twitch requires at least one topic to establish a connection, connect with a
// default topic then immedately remove it.
var defaultTopic = [channelTopic('twitch')]
const ps = new TwitchPS({
  init_topics: defaultTopic,
  reconnect: true,
  debug: (process.env.NODE_ENV !== 'production')
})
// Remove the default PubSub topic.
ps.removeTopic(defaultTopic)

ps.on('stream-up', (data) => {
  bot.createMessage(process.env.DISCORD_CHANNEL,
    `#${data.channel_name} has started streaming!`)
})

ps.on('stream-down', (data) => {
  bot.createMessage(process.env.DISCORD_CHANNEL,
    `#${data.channel_name} has stopped streaming.`)
})

client.on('join', (channel, user, self) => {
  if (self) bot.createMessage(process.env.DISCORD_CHANNEL, `Joined ${channel}.`)
})

client.on('part', (channel, user, self) => {
  if (self) bot.createMessage(process.env.DISCORD_CHANNEL, `Left ${channel}.`)
})

client.on('chat', (channel, user, message, self) => {
  bot.createMessage(process.env.DISCORD_CHANNEL,
    `[${channel}] <${user['display-name']}> ${message}`)
})

client.on('action', (channel, user, message, self) => {
  bot.createMessage(process.env.DISCORD_CHANNEL,
    `[${channel}] **${user['display-name']}** ${message}`)
})

bot.registerCommand('ping', (msg) => {
  bot.addMessageReaction(msg.channel.id, msg.id, 'tentacan:355091430093488128')
}, {
  description: 'Pong!'
})

bot.registerCommand('join', (msg, args) => {
  sanitizeChannelList(args).forEach(chan => {
    if (client.getChannels().includes(chan)) {
      bot.createMessage(process.env.DISCORD_CHANNEL, `I am already in ${chan}`)
      return
    }

    client.join(chan).then(data => {
      ps.addTopic([channelTopic(chan)])
      db.get('channels').push(chan).write()
    }).catch(err => {
      bot.createMessage(process.env.DISCORD_CHANNEL, `${err}`)
    })
  })
}, {
  description: 'Join a twitch channel\'s chat',
  fullDescription: 'Join a twitch channel\'s chat and relay it to discord',
  usage: '<channel>...',
  argsRequired: true,
  requirements: {
    permissions: {
      administrator: true
    }
  }
})

bot.registerCommand('part', (msg, args) => {
  sanitizeChannelList(args).forEach(chan => {
    if (!client.getChannels().includes(chan)) {
      bot.createMessage(process.env.DISCORD_CHANNEL, `I am not in ${chan}`)
      return
    }

    client.part(chan).then(data => {
      ps.removeTopic([channelTopic(chan)])
      db.get('channels').remove(chan).write()
    }).catch(err => {
      bot.createMessage(process.env.DISCORD_CHANNEL, `${err}`)
    })
  })
}, {
  description: 'Leave a twitch channel\'s chat',
  fullDescription: 'Leave a twitch channel\'s chat and stop relaying it to discord',
  usage: '<channel>...',
  argsRequired: true,
  requirements: {
    permissions: {
      administrator: true
    }
  }
})

bot.registerCommand('list', () => {
  var list = client.getChannels()
  if (list.length === 0) return 'I am not watching any twitch chats.'
  return 'Watching: ' + list.join(', ')
}, {
  description: 'List twitch channels being watched',
  fullDescription: 'List all the twitch channel chats being watched and relayed to discord'
})

bot.registerCommand('purge', (msg, args) => {
  bot.purgeChannel(process.env.DISCORD_CHANNEL, -1)
}, {
  description: 'Purge messages in channel',
  fullDescription: 'Purge 2 weeks worth of messages in the Discord channel that contains relayed twitch chat',
  requirements: {
    permissions: {
      administrator: true
    }
  }
})

bot.on('ready', () => {
  console.log('Ready!')
  client.connect()
  db.get('channels').value().forEach(c => { ps.addTopic([channelTopic(c)]) })
})

bot.connect()
