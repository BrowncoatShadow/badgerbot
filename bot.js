require('dotenv').config()
const Eris = require('eris')
const tmi = require('tmi.js')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

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

const db = low(new FileSync('db.json'))
db.defaults({ channels: [] }).write()

const bot = new Eris.CommandClient(process.env.DISCORD_TOKEN, {}, {
  description: 'I do things that make Sems happy.',
  name: '<Badgerbot>',
  owner: 'BrowncoatShadow',
  prefix: (process.env.NODE_ENV === 'production') ? '.' : ','
})

// eslint-disable-next-line new-cap
const client = new tmi.client({
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

client.on('join', (channel, user, self) => {
  if (self) bot.createMessage(process.env.DISCORD_CHANNEL, `Joined ${channel}`)
})

client.on('part', (channel, user, self) => {
  if (self) bot.createMessage(process.env.DISCORD_CHANNEL, `Left ${channel}`)
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
})

bot.connect()
