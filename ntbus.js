#!/usr/bin/env node

require('dotenv').config()
const eachSeries = require('async/eachSeries')
const fetch = require('node-fetch')
const MbusMaster = require('node-mbus')
const fs = require('fs')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')
const SegfaultHandler = require('segfault-handler')
SegfaultHandler.registerHandler('crash.log')

const adapter = new FileSync('db.json')
const db = low(adapter)

db.defaults({ convertors: [] }).write()

let DEBUG = false
const args = process.argv

const commands = ['scan', 'query', 'reset', 'help']

const usage = function () {
  const usageText = `
  ntbus Get MBus Electricity Values.

  usage:
    ntbus [options] <command>

		options:
		-d: 			debug

    commands can be:

    scan:     used to scan convertors in your inventory.json.
    query:    used to query secondary Ids found via scan.
    reset: 		used to clear DB and start over.
    help:     used to print the usage guide.
  `
  console.log(usageText)
  return
}

if (args[2] === '-d') {
  if (commands.indexOf(args[3]) == -1) {
    console.error('invalid command passed')
    usage()
  }
} else if (commands.indexOf(args[2]) == -1) {
  console.error('invalid command passed')
  usage()
}

const getInventory = () => {
  const rawdata = fs.readFileSync(`${__dirname}/inventory.json`)
  const mbus = JSON.parse(rawdata)
  return mbus
}

const mbusInit = (host, port = 1234) => {
  const mbusOptions = {
    host: host,
    port: port,
    timeout: 500,
    autoConnect: false,
  }
  let mbusMaster
  mbusMaster = new MbusMaster(mbusOptions)

  mbusMaster.connect()
  if (!mbusMaster.connect()) {
    mbusOptions.port = 1470
    mbusMaster = new MbusMaster(mbusOptions)
    mbusMaster.connect()
    if (!mbusMaster.connect()) {
      console.error('Connection failed.')
      return false
    }
  } else {
    // DEBUG && console.log(mbusMaster)
  }

  return mbusMaster
}

const mbusScan = async () => {
  const mbus = getInventory()
  mbus.convertors.map(async ip => {
    const master = mbusInit(ip, 1234)
    if (!db.get('convertors').find({ ip: ip }).value()) {
      master.scanSecondary(async (err, scanResult) => {
        if (err) {
          console.error('Scan Err: ' + err)
          return
        }

        DEBUG && console.log('Scan Result:', scanResult)

        db.get('convertors')
          .push({ ip: master.options.host, feeds: scanResult })
          .write()
      })
    }
  })
}

const mbusQuery = () => {
  const mbus = getInventory()
  mbus.convertors.map(conv => {
    const master = mbusInit(conv, 1234)
    const feeds = db.get('convertors').find({ ip: conv }).value()
    if (!feeds) return false
    // console.log('feeeeeds', feeds)

    eachSeries(
      feeds.feeds,
      function (feed, callback) {
        const feedNr = feed.substr(0, 8).replace(/^0+/g, '')
        DEBUG && console.log('Processing: ', feedNr)
        master.getData(feed, (err, data) => {
          if (err) {
            console.error('[X] ' + err)
          }
          fetch(
            `https://racks.newtelco.de/api/dcim/power-feeds/?name=${feedNr}`,
            {
              headers: {
                Accept: 'application/json',
                Authorization: `TOKEN ${process.env.NETBOX_TOKEN}`,
              },
            }
          )
            .then(data => data.json())
            .then(nbData => {
              if (nbData && nbData.results[0] && data && data.DataRecord) {
                const nbId = nbData.results[0].id
                let value = ''
                if (data.SlaveInformation.Version === 0) {
                  const record = data.DataRecord.find(record => {
                    if (record.Unit === 'Power (W)') {
                      return true
                    } else if (record.Unit === 'Power (1e-1 W)') {
                      return true
                    }
                  })
                  value = record.Value
                } else if (data.SlaveInformation.Version === 1) {
                  const record = data.DataRecord.find(
                    record => record.Unit === 'Power (W)'
                  )
                  value = record.Value
                } else if (data.SlaveInformation.Version === 2) {
                  value = data.DataRecord[2].Value
                }
                console.log(feedNr, nbId, value)
              }
              callback()
            })
            .catch(err => console.error(err))
        })
      },
      function (err) {
        if (err) console.error(err)
        console.log(`${conv} Completed`)
      }
    )
  })
}

switch (args[2]) {
  case '-d':
    DEBUG = true
    switch (args[3]) {
      case 'help':
        console.log(' help2')
        usage()
        break
      case 'scan':
        mbusScan()
        break
      case 'query':
        mbusQuery()
        break
      case 'reset':
        break
      default:
        console.error('invalid command passed')
        usage()
    }
    break
  case 'help':
    console.log(' help1')
    usage()
    break
  case 'scan':
    mbusScan()
    break
  case 'query':
    mbusQuery()
    break
  case 'reset':
    break
  default:
    console.error('invalid command passed')
    usage()
}
