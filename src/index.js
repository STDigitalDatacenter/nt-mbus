require('dotenv').config()
const util = require('util')
const snmp = require('net-snmp')
const fetch = require('node-fetch')
const MbusMaster = require('node-mbus')
const fs = require('fs')
const low = require('lowdb')
const FileSync = require('lowdb/adapters/FileSync')

const adapter = new FileSync('db.json')
const db = low(adapter)

const DEBUG = process.argv[2] === '-d' || false
DEBUG && console.log(process.env.NETBOX_TOKEN)

db.defaults({ convertors: [] }).write()

const createSnmpServer = () => {
  const options = {
    port: 161,
    retries: 1,
    timeout: 5000,
    backoff: 1.0,
    transport: 'udp4',
    trapPort: 162,
    version: snmp.Version1,
    backwardsGetNexts: true,
    idBitsSize: 32,
  }

  const session = snmp.createSession('127.0.0.1', 'public', options)
}

const getInventory = () => {
  const rawdata = fs.readFileSync(`${__dirname}/../inventory.json`)
  const mbus = JSON.parse(rawdata)
  return mbus
}

const mbusInit = (host, port = 1234) => {
  const mbusOptions = {
    host: host,
    port: port,
    timeout: 200,
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
    DEBUG && console.log(mbusMaster)
  }

  return mbusMaster
}

const mbusScan = async master => {
  return new Promise((resolve, reject) => {
    master.scanSecondary(async (err, scanResult) => {
      if (err) {
        console.log('err: ' + err)
        reject(err)
      }

      db.get('convertors')
        .push({ ip: master.options.host, feeds: scanResult })
        .write()

      DEBUG && console.log('result:', master.options.host)
      DEBUG && console.log('result1:', scanResult)

      fetch(
        `https://racks.newtelco.de/api/dcim/power-feeds/?name=${scanResult[0]}`,
        {
          headers: {
            Accept: 'application/json',
            Authorization: `TOKEN ${process.env.NETBOX_TOKEN}`,
          },
        }
      )
        .then(r => {
          DEBUG && console.log('NB:', r)
          return r.json()
        })
        .catch(e => {
          console.log('fetch error:', e)
          return e
        })

      const netboxIds = await Promise.all(
        scanResult.map(async feed => {
          DEBUG && console.log('feed:', feed)
          const feedNr = feed.substr(0, 8)
          const res = await fetch(
            `https://racks.newtelco.de/api/dcim/power-feeds/?name=${feedNr}`,
            {
              headers: {
                Accept: 'application/json',
                Authorization: `TOKEN ${process.env.NETBOX_TOKEN}`,
              },
            }
          )
          const rackRes = await res.json()
          const id = rackRes.results[0].id
          DEBUG && console.log('rackId:', id)
          return id
          // .then(r => {
          //   DEBUG && console.log('NB:', r)
          //   return r.json()
          // })
          // .catch(e => {
          //   console.log('fetch error:', e)
          //   return e
          // })
        })
      )
        .then(data => {
          DEBUG && console.log('data:', data)
          return data
        })
        .catch(e => console.error(e))

      console.log('nbId', netboxIds)
      for (let result of netboxIds) {
        console.log(result)
      }

      // DEBUG && console.log('scan:', scanResult)
      DEBUG && console.log('scan:', netboxIds)
      resolve(netboxIds)
    })
  })
}

const mbusQuery = (master, id, callback) => {
  master.getData(id, (err, data) => {
    if (err) {
      console.log('err: ' + err)
      return false
    }
    // console.log('data: ' + JSON.stringify(data, null, 2))
    callback(data)
    return data
  })
}

// createSnmpServer()
const mbus = getInventory()

mbus.convertors.map(async (ip, i) => {
  const master = mbusInit(ip, 1234)
  if (!db.get('convertors').find({ ip: ip }).value()) {
    const data = await mbusScan(master)

    DEBUG && console.log('scan2:', data)

    db.get('convertors')
      .find({ ip: master.options.host })
      .get('feeds')
      .push({ nr: data, netboxId: data })
      .write()
  }
  // const conv = db.get('convertors').find({ ip: ip }).value()

  // DEBUG QUERY
  // if (ip === '172.16.60.58') {
  //   mbusQuery(master, '08781934523B0002', function (data, err) {
  //     if (data) {
  //       DEBUG && console.log(data.DataRecord[0].Value)
  //     }
  //   })
  //   master.close()
  // }
})
