require('dotenv').config()
const Eris = require('eris');
const tmi = require("tmi.js");
const low = require('lowdb');
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
  description: "I do things that make Sems happy.",
  name: '<Badgerbot>',
  owner: 'BrowncoatShadow',
  prefix: (process.env.NODE_ENV === 'production') ? '.' : ','
})

const twitch = new tmi.client({
  options: {
    debug: (process.env.NODE_ENV === 'production') ? false : true
  },
  connection: {
    cluster: "aws",
    reconnect: true
  },
  identity: {
    username: process.env.TWITCH_USERNAME,
    password: process.env.TWITCH_TOKEN
  },
  channels: db.get('channels').value()
})

twitch.on('join', (channel, user, self) => {
  if (self) bot.createMessage(process.env.DISCORD_CHANNEL, `Joined ${channel}`)
})

twitch.on('part', (channel, user, self) => {
  if (self) bot.createMessage(process.env.DISCORD_CHANNEL, `Left ${channel}`)
})

twitch.on('chat', (channel, user, message, self) => {
  bot.createMessage(process.env.DISCORD_CHANNEL,
    `[${channel}] <${user['display-name']}> ${message}`)
})

twitch.on('action', (channel, user, message, self) => {
  bot.createMessage(process.env.DISCORD_CHANNEL,
    `[${channel}] **${user['display-name']}** ${message}`)
})

bot.registerCommand('ping', 'Pong!', {
  description: 'Pong!'
})

bot.registerCommand('list', () => {
  var list = twitch.getChannels()
  if (list.length === 0) return 'Not connected to any channels.'
  return 'Connected to: ' + list.join(', ')
}, {
  description: "List connected twitch channels",
})

bot.registerCommand('join', (msg, args) => {
  if (args.length === 0) return 'Please specify at least one channel.'

  sanitizeChannelList(args).forEach(chan => {
    if (twitch.getChannels().includes(chan)) {
      bot.createMessage(process.env.DISCORD_CHANNEL, `I am already in ${chan}`)
      return
    }

    twitch.join(chan).then(data => {
      db.get('channels').push(chan).write()
    }).catch(err => {
      bot.createMessage(process.env.DISCORD_CHANNEL, `${err}`)
    })
  })
}, {
  description: "Join a twitch channel's chat",
})

bot.registerCommand('part', (msg, args) => {
  if (args.length === 0) return 'Please specify at least one channel.'

  sanitizeChannelList(args).forEach(chan => {
    if (!twitch.getChannels().includes(chan)) {
      bot.createMessage(process.env.DISCORD_CHANNEL, `I am not in ${chan}`)
      return
    }

    twitch.part(chan).then(data => {
      db.get('channels').remove(chan).write()
    }).catch(err => {
      bot.createMessage(process.env.DISCORD_CHANNEL, `${err}`)
    })
  })
}, {
  description: "Leave a twitch channel's chat",
})

bot.on('ready', () => {
  console.log('Ready!')
  twitch.connect()
})

bot.connect()
